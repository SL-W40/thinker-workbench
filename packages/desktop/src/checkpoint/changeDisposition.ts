/**
 * Changes 面板的行级处置：单文件回滚 / 采纳。
 *
 * 回滚优先级：
 * 1. before-image 快照（`<dataDir>/workspaces/<id>/checkpoints/files/<runId>/`）—— capa 覆盖
 *    「文件原本不存在」与「原本存在」两种情况；
 * 2. 无快照且是 Git 仓库时用 `git checkout -- <path>` 兜底；
 * 3. 都没有则返回 none，由 UI 明确告知「没有可回滚的来源」，而不是假装成功。
 *
 * 「采纳」= 丢弃该文件的快照记录：此后再也不能回滚到改动前。
 */
import fs from "node:fs";
import { copyFile, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ChangeDispositionInput,
  ChangeDispositionResult,
  ChangeItemResult,
} from "@thinker-workbench/shared";
import { getWorkspaceCheckpointDir } from "../config/paths";
import { getWorkspace } from "../db/workspacesStore";
import { desktopLog } from "../log/setup";
import { gitDiscard } from "../workspace/gitWrite";

const log = desktopLog("checkpointDisposition");

/** run 目录按 mtime 倒序排列（最新改动优先命中）。 */
async function listRunDirs(filesRoot: string): Promise<string[]> {
  try {
    const entries = await readdir(filesRoot, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const withTime = await Promise.all(
      dirs.map(async (name) => {
        const full = path.join(filesRoot, name);
        try {
          const st = await fs.promises.stat(full);
          return { name, full, mtime: st.mtimeMs };
        } catch {
          return { name, full, mtime: 0 };
        }
      }),
    );
    return withTime.sort((a, b) => b.mtime - a.mtime).map((item) => item.full);
  } catch {
    return [];
  }
}

/** 找最近一次包含该路径快照的 run 目录。 */
async function findSnapshot(
  filesRoot: string,
  relPath: string,
  preferredRunId?: string,
): Promise<{ runDir: string; entry: { kind: string; skipReason?: string } } | null> {
  const roots = preferredRunId
    ? [path.join(filesRoot, preferredRunId), ...(await listRunDirs(filesRoot))]
    : await listRunDirs(filesRoot);
  for (const runDir of roots) {
    if (!fs.existsSync(runDir)) continue;
    try {
      const text = await fs.promises.readFile(path.join(runDir, "manifest.json"), "utf8");
      const manifest = JSON.parse(text) as {
        entries?: Array<{ path: string; kind: string; skipReason?: string }>;
      };
      const entry = (manifest.entries ?? []).find((item) => item.path === relPath);
      if (entry) return { runDir, entry };
    } catch {
      /* manifest 损坏时继续找下一个 run */
    }
  }
  return null;
}

/**
 * 批量处置入口。
 * 任一文件失败不影响其它文件；结果逐条回传给 UI。
 */
export async function applyChangeDisposition(
  input: ChangeDispositionInput,
): Promise<ChangeDispositionResult> {
  const paths = Array.isArray(input?.paths) ? input.paths.filter(Boolean) : [];
  if (!input?.workspaceId || paths.length === 0) {
    return { ok: false, items: [], error: "缺少工作空间或文件路径" };
  }
  const ws = getWorkspace(input.workspaceId);
  if (!ws) return { ok: false, items: [], error: "工作空间不存在" };

  const kind = input.kind === "keep" ? "keep" : "revert";
  const filesRoot = path.join(getWorkspaceCheckpointDir(ws.id), "files");
  const items: ChangeItemResult[] = [];

  for (const raw of paths) {
    const rel = String(raw).replace(/\\/g, "/").replace(/^\/+/, "");
    if (rel.startsWith("..") || /^[a-zA-Z]:/.test(rel)) {
      items.push({ path: rel, ok: false, strategy: "none", error: "路径越界" });
      continue;
    }
    items.push(
      kind === "keep"
        ? await keepFile(filesRoot, rel, input.runId)
        : await revertFile(ws.rootPath, filesRoot, rel, input.runId),
    );
  }

  return { ok: items.some((item) => item.ok), items };
}

/** 回滚单个文件。 */
async function revertFile(
  workspaceRoot: string,
  filesRoot: string,
  relPath: string,
  runId?: string,
): Promise<ChangeItemResult> {
  try {
    const found = await findSnapshot(filesRoot, relPath, runId);
    if (found) {
      if (found.entry.kind === "skipped") {
        return {
          path: relPath,
          ok: false,
          strategy: "none",
          error: `该文件没有可用快照（${found.entry.skipReason ?? "已跳过"}），请在 Git 终端自行回滚`,
        };
      }
      const target = path.resolve(workspaceRoot, relPath);
      if (found.entry.kind === "create") {
        // 原本不存在 → 回滚就是删掉这个新建文件
        await rm(target, { force: true });
        return { path: relPath, ok: true, strategy: "before-image" };
      }
      const snapshot = path.join(found.runDir, flatten(relPath));
      if (!fs.existsSync(snapshot)) {
        return { path: relPath, ok: false, strategy: "none", error: "快照文件已丢失" };
      }
      await restoreAtomic(snapshot, target);
      return { path: relPath, ok: true, strategy: "before-image" };
    }
    // 兜底：Git 仓库里已被跟踪的文件走 checkout
    const gitRes = await gitDiscard(workspaceRoot, [relPath]);
    if (gitRes.ok) return { path: relPath, ok: true, strategy: "git" };
    return {
      path: relPath,
      ok: false,
      strategy: "none",
      error: gitRes.error ?? "没有可回滚的来源",
    };
  } catch (err) {
    log.warn("回滚失败", { relPath, error: String(err) });
    return { path: relPath, ok: false, strategy: "none", error: String(err) };
  }
}

/** 采纳：丢弃 before-image（不可逆）。 */
async function keepFile(
  filesRoot: string,
  relPath: string,
  runId?: string,
): Promise<ChangeItemResult> {
  try {
    const found = await findSnapshot(filesRoot, relPath, runId);
    if (!found) return { path: relPath, ok: true, strategy: "none" };
    await rm(path.join(found.runDir, flatten(relPath)), { force: true });
    const manifestPath = path.join(found.runDir, "manifest.json");
    try {
      const manifest = JSON.parse(await fs.promises.readFile(manifestPath, "utf8")) as {
        entries?: Array<{ path: string }>;
      };
      const rest = (manifest.entries ?? []).filter((item) => item.path !== relPath);
      await writeFile(
        manifestPath,
        JSON.stringify({ ...manifest, entries: rest }, null, 2),
        "utf8",
      );
    } catch {
      /* manifest 损坏时只删快照也算采纳 */
    }
    return { path: relPath, ok: true, strategy: "none" };
  } catch (err) {
    log.warn("采纳失败", { relPath, error: String(err) });
    return { path: relPath, ok: false, strategy: "none", error: String(err) };
  }
}

/** 与 engine 侧一致的路径压扁规则（两边必须同步）。 */
function flatten(relPath: string): string {
  const flat = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const safe = flat.replace(/[:*?"<>|]/g, "_").replace(/\//g, "__");
  if (safe.length <= 180) return safe;
  let h = 2166136261;
  for (let i = 0; i < flat.length; i += 1) h = (h ^ flat.charCodeAt(i)) * 16777619;
  return `${safe.slice(0, 120)}-${(h >>> 0).toString(36)}`;
}

/**
 * 原子还原：临时文件 + rename。
 * Windows 上目标被占用时 rename 会失败，错误直接回传 UI。
 */
async function restoreAtomic(snapshot: string, target: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.thinker-restore.tmp`;
  await copyFile(snapshot, tmp);
  try {
    await rename(tmp, target);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

/** 处置失败时的统一文案：优先 IPC 错误，其次第一条失败项的原因。 */
export function dispositionError(result: ChangeDispositionResult): string | undefined {
  if (result.ok) return undefined;
  return result.error ?? result.items.find((item) => !item.ok)?.error ?? "处置失败";
}
