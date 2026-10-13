/**
 * 大输出落盘：优先工作区 `.thinker/shell-output`（便于 read_file），否则 dataDir。
 */
import fs from "node:fs";
import path from "node:path";

/** 内存尾部窗口（与历史 MAX_BUFFER 同量级）。 */
export const SHELL_MEMORY_TAIL = 400_000;

/** spill 文件默认保留时长（完成后续读）。 */
export const SHELL_SPILL_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** spill 目录：`<dataDir>/shell-output`（无工作区时回落）。 */
export function shellOutputDir(dataDir: string): string {
  return path.join(dataDir, "shell-output");
}

/** 单会话 log 绝对路径（dataDir 回落）。 */
export function shellOutputFilePath(dataDir: string, sessionId: string): string {
  return path.join(shellOutputDir(dataDir), `${sessionId}.log`);
}

export type SpillLocation = {
  /** 主进程写入用绝对路径。 */
  absolutePath: string;
  /** 回传模型 / read_file：优先工作区相对路径。 */
  reportPath: string;
};

/**
 * 解析落盘位置：有 workspace 时写到 `<workspace>/.thinker/shell-output/`，
 * 否则 `<dataDir>/shell-output/`。
 */
export function resolveSpillLocation(options: {
  workspaceRoot?: string | null;
  dataDir: string;
  sessionId: string;
}): SpillLocation {
  const ws = options.workspaceRoot?.trim();
  const fileName = `${options.sessionId}.log`;
  if (ws) {
    const absolutePath = path.join(ws, ".thinker", "shell-output", fileName);
    return {
      absolutePath,
      reportPath: `.thinker/shell-output/${fileName}`,
    };
  }
  const absolutePath = shellOutputFilePath(options.dataDir, options.sessionId);
  return { absolutePath, reportPath: absolutePath };
}

/** 确保文件父目录存在。 */
export function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

/** @deprecated 使用 ensureParentDir(resolveSpillLocation(...).absolutePath) */
export function ensureShellOutputDir(dataDir: string): void {
  fs.mkdirSync(shellOutputDir(dataDir), { recursive: true });
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

/** 删除单个 spill 文件。 */
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
