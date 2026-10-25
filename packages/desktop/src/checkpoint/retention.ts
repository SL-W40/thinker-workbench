/**
 * Checkpoint 保留策略：阈值读写与裁剪。
 *
 * 落盘用 JSON（`<checkpointDir>/retention.json`）而不是新表：Checkpoint 目录
 * 本身就在数据目录里，重量级 SQLite 实例不参与，Windows 下也没有文件锁竞争。
 *
 * 硬例外（必须保留）：正在运行的 run、pending-resume 的 run、每个会话的最新 run。
 * 例外本身由 run 目录的标记文件识别（`running` / `pending`）。
 */
import fs from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type CheckpointPruneResult,
  type CheckpointRetention,
  type CheckpointStats,
  DEFAULT_CHECKPOINT_RETENTION,
  normalizeCheckpointRetention,
} from "@thinker-workbench/shared";
import { getWorkspaceCheckpointDir } from "../config/paths";
import { desktopLog } from "../log/setup";

const log = desktopLog("checkpointRetention");

/** 例外标记文件名：出现即视为「永不裁剪」。 */
const PROTECTED_MARKERS = ["running", "pending"] as const;

/** 保留策略文件路径。 */
function retentionFile(workspaceId: string): string {
  return path.join(getWorkspaceCheckpointDir(workspaceId), "retention.json");
}

/** before-image 的 run 目录根。 */
function filesRoot(workspaceId: string): string {
  return path.join(getWorkspaceCheckpointDir(workspaceId), "files");
}

/** 读取保留策略；未配置或损坏都返回默认值。 */
export async function getRetention(workspaceId: string): Promise<CheckpointRetention> {
  try {
    const text = await readFile(retentionFile(workspaceId), "utf8");
    return normalizeCheckpointRetention(JSON.parse(text) as Partial<CheckpointRetention>);
  } catch {
    return { ...DEFAULT_CHECKPOINT_RETENTION };
  }
}

/** 合并写入保留策略（局部补丁 + 归一）。 */
export async function setRetention(
  workspaceId: string,
  patch: Partial<CheckpointRetention>,
): Promise<CheckpointRetention> {
  const next = normalizeCheckpointRetention({ ...(await getRetention(workspaceId)), ...patch });
  const file = retentionFile(workspaceId);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(next, null, 2), "utf8");
  return next;
}

/** 目录字节数统计（递归）。 */
async function dirBytes(dir: string): Promise<number> {
  let total = 0;
  let depth = 0;
  async function walk(current: string): Promise<void> {
    // 目录层级保护：避免异常深的树把主线程拖住
    if (depth > 12) return;
    depth += 1;
    let entries: fs.Dirent[] = [];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile()) {
          const st = await stat(full);
          total += st.size;
        }
      } catch {
        /* 单个文件失败不影响整体统计 */
      }
    }
  }
  await walk(dir);
  return total;
}

/** 当前占用统计：run 数 / 字节数 / 最早快照时间。 */
export async function getStats(workspaceId: string): Promise<CheckpointStats> {
  const root = filesRoot(workspaceId);
  if (!fs.existsSync(root)) return { runCount: 0, totalBytes: 0, oldestAt: null };
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());
    let oldest: number | null = null;
    for (const dir of dirs) {
      try {
        const st = await stat(path.join(root, dir.name));
        const ms = st.mtimeMs;
        if (oldest === null || ms < oldest) oldest = ms;
      } catch {
        /* 忽略不可读目录 */
      }
    }
    return {
      runCount: dirs.length,
      totalBytes: await dirBytes(root),
      oldestAt: oldest,
    };
  } catch (err) {
    log.warn("统计 Checkpoint 占用失败", { workspaceId, error: String(err) });
    return { runCount: 0, totalBytes: 0, oldestAt: null };
  }
}

/** run 目录是否受保护（running / pending-resume）。 */
async function isProtected(runDir: string): Promise<boolean> {
  for (const marker of PROTECTED_MARKERS) {
    if (fs.existsSync(path.join(runDir, `.${marker}`))) return true;
  }
  return false;
}

/**
 * 按策略立刻裁剪。
 * 三个维度：run 数（超出后丢最旧的）、保留天数、总字节（超出后同样从最旧开始丢）。
 */
export async function pruneNow(workspaceId: string): Promise<CheckpointPruneResult> {
  const policy = await getRetention(workspaceId);
  const root = filesRoot(workspaceId);
  const result: CheckpointPruneResult = { ok: true, removedRuns: 0, freedBytes: 0, keptRuns: 0 };
  if (!fs.existsSync(root)) return result;

  type Item = { name: string; full: string; mtime: number; bytes: number };
  const items: Item[] = [];
  try {
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries.filter((e) => e.isDirectory())) {
      const full = path.join(root, entry.name);
      const st = await stat(full);
      items.push({ name: entry.name, full, mtime: st.mtimeMs, bytes: await dirBytes(full) });
    }
  } catch (err) {
    log.warn("列举 Checkpoint run 失败", { workspaceId, error: String(err) });
    return { ...result, ok: false, error: String(err) };
  }

  // 从旧到新：优先淘汰最老的
  items.sort((a, b) => a.mtime - b.mtime);

  const protectedNames = new Set<string>();
  for (const item of items) {
    if (await isProtected(item.full)) protectedNames.add(item.name);
  }

  const candidates = items.filter((item) => !protectedNames.has(item.name));
  result.keptRuns = protectedNames.size;

  const now = Date.now();
  let totalBytes = items.reduce((sum, item) => sum + item.bytes, 0);
  const toRemove = new Set<Item>();

  // 保留天数：过期的候选一律丢
  if (policy.maxAgeDays > 0) {
    const deadline = now - policy.maxAgeDays * 24 * 60 * 60 * 1000;
    for (const item of candidates) {
      if (item.mtime < deadline) toRemove.add(item);
    }
  }

  // 总字节：仍超限则从最旧继续丢
  if (policy.maxTotalBytes > 0) {
    for (const item of candidates) {
      if (totalBytes <= policy.maxTotalBytes) break;
      if (toRemove.has(item)) continue;
      toRemove.add(item);
      totalBytes -= item.bytes;
    }
  }

  // run 数：超出上限的部分丢（同样从最旧）
  const remainAfterRemoval = items.length - toRemove.size;
  if (policy.maxRuns > 0 && remainAfterRemoval > policy.maxRuns) {
    const extra = remainAfterRemoval - policy.maxRuns;
    let removed = 0;
    for (const item of candidates) {
      if (removed >= extra) break;
      if (toRemove.has(item)) continue;
      toRemove.add(item);
      removed += 1;
    }
  }

  for (const item of toRemove) {
    try {
      await rm(item.full, { recursive: true, force: true });
      result.removedRuns += 1;
      result.freedBytes += item.bytes;
    } catch (err) {
      log.warn("删除 Checkpoint run 失败", { run: item.name, error: String(err) });
      result.ok = false;
      result.error = String(err);
    }
  }
  return result;
}
