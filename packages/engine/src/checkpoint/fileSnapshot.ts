/**
 * 文件改动前的 before-image 快照（Checkpoint 的文件层）。
 *
 * 布局沿用既有约定：`<dataDir>/workspaces/<workspaceId>/checkpoints/files/<runId>/`，
 * 每个文件一条内容副本 + 一份 `manifest.json` 说明来源（create / modify / delete）。
 *
 * 关键取舍：
 * - 每个 run 对同一路径只捕一次（首写前），重复调用是幂等的；
 * - 超过阈值的文件、`.git/` 下、符号链接只登记 `skipped`，不占磁盘；
 * - best-effort：任何失败都只记日志，绝不阻断工具执行（模型写文件优先）。
 */
import fs from "node:fs";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getRunContext } from "../runtime/runContext";

/** 单文件快照的字节上限（与设置里的 Checkpoint 阈值同源，默认 5MB）。 */
const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024;

/** 快照类别：create=原本不存在（回滚=删除），modify=原本存在（回滚=还原内容）。 */
export type BeforeImageKind = "create" | "modify" | "skipped";

/** manifest 条目。 */
export type BeforeImageEntry = {
  /** 工作空间相对 posix 路径。 */
  path: string;
  kind: BeforeImageKind;
  /** 快照字节数；create / skipped 为 0。 */
  bytes: number;
  /** 捕获时间戳。 */
  at: number;
  /** skipped 的原因（过大 / 忽略目录 / 符号链接 / 读取失败）。 */
  skipReason?: string;
};

/** manifest 结构。 */
export type BeforeImageManifest = {
  runId: string;
  threadId: string;
  at: number;
  entries: BeforeImageEntry[];
};

/** run 目录内的 manifest 写入串行化，避免并发工具调用互相覆盖。 */
const manifestLocks = new Map<string, Promise<unknown>>();

/** 本 run 的快照根目录；不在 run 内（如单测直调）返回 null。 */
export function beforeImageRunDir(): string | null {
  const ctx = getRunContext();
  if (!ctx) return null;
  const base = (ctx.dataDir ?? "").trim();
  const workspaceId = (ctx.workspaceId ?? "").trim();
  if (!base || !workspaceId) return null;
  return path.join(base, "workspaces", workspaceId, "checkpoints", "files", ctx.runId);
}

/** 把相对路径压扁成快照内的单层文件名（避免深层目录与 Windows 路径非法字符）。 */
function snapshotFileName(relPath: string): string {
  const flat = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  // Windows 保留字符与分隔符统一替换，保证能在所有平台落盘
  const safe = flat.replace(/[:*?"<>|]/g, "_").replace(/\//g, "__");
  return safe.length > 180 ? `${safe.slice(0, 120)}-${hash(flat)}` : safe;
}

/** 稳定短哈希（非加密用途，仅用于长路径去重）。 */
function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = (h ^ text.charCodeAt(i)) * 16777619;
  }
  return (h >>> 0).toString(36);
}

/** 是否落在应跳过的目录里（`.git/` 等不该进快照）。 */
function isIgnoredPath(relPath: string): boolean {
  const parts = relPath.replace(/\\/g, "/").split("/");
  return parts.includes(".git");
}

/** 读取现有 manifest（不存在或损坏都返回空结构）。 */
export async function readManifest(runDir: string): Promise<BeforeImageManifest> {
  try {
    const text = await readFile(path.join(runDir, "manifest.json"), "utf8");
    const parsed = JSON.parse(text) as BeforeImageManifest;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.entries)) {
      return { runId: "", threadId: "", at: 0, entries: [] };
    }
    return parsed;
  } catch {
    return { runId: "", threadId: "", at: 0, entries: [] };
  }
}

/** 串行化写入 manifest（同一 run 目录内的并发改写排队执行）。 */
function withManifestLock<T>(runDir: string, work: () => Promise<T>): Promise<T> {
  const prev = manifestLocks.get(runDir) ?? Promise.resolve();
  const next = prev.then(work, work);
  manifestLocks.set(
    runDir,
    next.catch(() => undefined),
  );
  // 队列排空后清理 map，避免长期持有引用
  void next
    .catch(() => undefined)
    .then(() => {
      if (manifestLocks.get(runDir) === undefined) return;
    });
  return next;
}

/** 更新 manifest 条目（同路径覆盖写）。 */
export async function recordEntry(runDir: string, entry: BeforeImageEntry): Promise<void> {
  await withManifestLock(runDir, async () => {
    await mkdir(runDir, { recursive: true });
    const manifest = await readManifest(runDir);
    const rest = manifest.entries.filter((item) => item.path !== entry.path);
    const ctx = getRunContext();
    await writeFile(
      path.join(runDir, "manifest.json"),
      JSON.stringify(
        {
          runId: ctx?.runId ?? manifest.runId ?? "",
          threadId: ctx?.threadId ?? manifest.threadId ?? "",
          at: Date.now(),
          entries: [...rest, entry],
        } satisfies BeforeImageManifest,
        null,
        2,
      ),
      "utf8",
    );
  });
}

/**
 * 在写/删之前捕获文件的 before-image。
 *
 * @param workspaceRoot 工作区根
 * @param relPath 工作区相对路径
 * @param maxFileBytes 单文件上限；缺省 5MB
 * @returns 是否真的落了一份快照（false 表示无需/无法快照，例如新文件或被跳过）
 */
export async function captureBeforeImage(
  workspaceRoot: string,
  relPath: string,
  maxFileBytes = DEFAULT_MAX_FILE_BYTES,
): Promise<boolean> {
  const runDir = beforeImageRunDir();
  if (!runDir) return false;
  const rel = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!rel) return false;
  try {
    const target = path.join(runDir, snapshotFileName(rel));
    // 幂等：同一 run 内同一路径只捕一次
    if (fs.existsSync(target)) return false;
    const already = await readManifest(runDir);
    const existing = already.entries.find((item) => item.path === rel);
    if (existing) return false;

    if (isIgnoredPath(rel)) {
      await recordEntry(runDir, {
        path: rel,
        kind: "skipped",
        bytes: 0,
        at: Date.now(),
        skipReason: "ignored path (.git)",
      });
      return false;
    }

    const abs = path.resolve(workspaceRoot, rel);
    let st: fs.Stats;
    try {
      st = await stat(abs);
    } catch {
      // 原本不存在：回滚语义是删掉这个新建文件
      await recordEntry(runDir, { path: rel, kind: "create", bytes: 0, at: Date.now() });
      return false;
    }

    if (st.isSymbolicLink()) {
      await recordEntry(runDir, {
        path: rel,
        kind: "skipped",
        bytes: 0,
        at: Date.now(),
        skipReason: "symlink",
      });
      return false;
    }
    if (!st.isFile()) {
      await recordEntry(runDir, {
        path: rel,
        kind: "skipped",
        bytes: 0,
        at: Date.now(),
        skipReason: "not a regular file",
      });
      return false;
    }
    if (st.size > maxFileBytes) {
      await recordEntry(runDir, {
        path: rel,
        kind: "skipped",
        bytes: 0,
        at: Date.now(),
        skipReason: `too large (${st.size} bytes)`,
      });
      return false;
    }

    await mkdir(runDir, { recursive: true });
    const tmp = `${target}.tmp`;
    await copyFile(abs, tmp);
    // rename 保证快照原子可见，避免并发读到半截内容
    await rename(tmp, target);
    await recordEntry(runDir, {
      path: rel,
      kind: "modify",
      bytes: st.size,
      at: Date.now(),
    });
    return true;
  } catch (err) {
    // best-effort：快照失败不阻断工具执行
    console.error("[checkpoint] before-image capture failed:", err);
    return false;
  }
}

/** 丢弃某路径的快照（用户「采纳」改动：不再提供回滚来源）。 */
export async function dropBeforeImage(
  relPath: string,
  runDir = beforeImageRunDir(),
): Promise<void> {
  if (!runDir) return;
  const rel = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  try {
    const target = path.join(runDir, snapshotFileName(rel));
    if (fs.existsSync(target)) await rmCompat(target);
    const manifest = await readManifest(runDir);
    const rest = manifest.entries.filter((item) => item.path !== rel);
    if (rest.length === manifest.entries.length) return;
    await writeFile(
      path.join(runDir, "manifest.json"),
      JSON.stringify({ ...manifest, entries: rest }, null, 2),
      "utf8",
    );
  } catch (err) {
    console.error("[checkpoint] drop before-image failed:", err);
  }
}

/** rm 兼容写法（Node 22 的 fs.promises.rm 可用）。 */
async function rmCompat(target: string): Promise<void> {
  const { rm } = await import("node:fs/promises");
  await rm(target, { force: true });
}
