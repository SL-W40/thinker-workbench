/**
 * 大输出落盘：`<dataDir>/workspaces/<id>/shell-output`。
 *
 * 不再写进用户工作区（会把大文件塞进他的 git 仓库），
 * 因此回传给模型的路径是绝对路径（agent 用绝对路径 read_file 不受影响）。
 */
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_WORKSPACE_ID, dataPath } from "@thinker-workbench/shared";
import { getDataDir } from "../config/paths";

/** 内存尾部窗口（与历史 MAX_BUFFER 同量级）。 */
export const SHELL_MEMORY_TAIL = 400_000;

/** spill 文件默认保留时长（完成后续读）。 */
export const SHELL_SPILL_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** spill 目录：`<dataDir>/workspaces/<id>/shell-output`。 */
export function shellOutputDir(workspaceId: string, dataDir = getDataDir()): string {
  return dataPath(dataDir, "wsShellOutput", { workspaceId });
}

/** 单会话 log 绝对路径。 */
export function shellOutputFilePath(
  workspaceId: string,
  sessionId: string,
  dataDir = getDataDir(),
): string {
  return path.join(shellOutputDir(workspaceId, dataDir), `${sessionId}.log`);
}

export type SpillLocation = {
  /** 主进程写入用绝对路径。 */
  absolutePath: string;
  /** 回传模型 / read_file：与写入路径一致的绝对路径。 */
  reportPath: string;
};

/**
 * 解析落盘位置。
 * 有 workspaceId 时落到该工作区的数据目录；无归属时落到默认工作区目录。
 */
export function resolveSpillLocation(options: {
  workspaceId?: string | null;
  sessionId: string;
  dataDir?: string;
}): SpillLocation {
  const workspaceId = options.workspaceId?.trim() || DEFAULT_WORKSPACE_ID;
  const absolutePath = shellOutputFilePath(workspaceId, options.sessionId, options.dataDir);
  return { absolutePath, reportPath: absolutePath };
}

/** 确保文件父目录存在。 */
export function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

/**
 * 追加写入 spill 文件；失败时静默（不打断 PTY）。
 * @returns 是否写入成功
 */
export function appendShellSpill(filePath: string, chunk: string): boolean {
  try {
    ensureParentDir(filePath);
    fs.appendFileSync(filePath, chunk, "utf8");
    return true;
  } catch {
    return false;
  }
}

/**
 * 删除单个 spill 文件。
 * 会话输出不再需要落盘时（如会话被彻底删除）调用；路径为空或不存在都静默返回。
 */
export function removeShellSpill(filePath: string | null | undefined): void {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

/**
 * 清理目录内过期的 `.log`（默认 24h）。
 * 不抛错；排除 excludeAbsolute 正在写入的文件。
 */
export function pruneShellSpillDir(
  dir: string,
  options?: { maxAgeMs?: number; excludeAbsolute?: string | null },
): void {
  const maxAgeMs = options?.maxAgeMs ?? SHELL_SPILL_MAX_AGE_MS;
  const exclude = options?.excludeAbsolute ? path.resolve(options.excludeAbsolute) : null;
  try {
    if (!fs.existsSync(dir)) return;
    const now = Date.now();
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".log")) continue;
      const full = path.join(dir, name);
      if (exclude && path.resolve(full) === exclude) continue;
      try {
        const st = fs.statSync(full);
        if (now - st.mtimeMs >= maxAgeMs) fs.unlinkSync(full);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * 截断内存缓冲为尾部窗口，返回被丢掉的前缀长度（用于校正 outputCursor）。
 */
export function trimMemoryTail(
  output: string,
  maxChars: number = SHELL_MEMORY_TAIL,
): { output: string; dropped: number } {
  if (output.length <= maxChars) return { output, dropped: 0 };
  const dropped = output.length - maxChars;
  return { output: output.slice(dropped), dropped };
}
