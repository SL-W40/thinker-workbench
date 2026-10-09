/**
 * 工作区文件遍历与取消辅助。
 * 跳过常见大目录（node_modules、.git 等），避免工具扫爆磁盘。
 */
import { readdir } from "node:fs/promises";
import path from "node:path";

/** 遍历时跳过的目录名。 */
export const SKIP_DIR_NAMES = new Set([
  ".git",
  ".turbo",
  "node_modules",
  "dist",
  "coverage",
  "artifacts",
]);

/** signal 已取消时抛错，label 用于错误文案前缀。 */
export function throwIfAborted(signal: AbortSignal, label: string): void {
  if (signal.aborted) {
    throw new Error(`${label} cancelled.`);
  }
}

/**
 * 深度优先遍历 root 下所有普通文件（异步生成器）。
 * 读目录失败则跳过该目录；不跟随特殊文件类型以外的入口。
 */
export async function* walkFiles(root: string, signal: AbortSignal): AsyncGenerator<string> {
  const stack = [root];
  while (stack.length > 0) {
    throwIfAborted(signal, "Walk");
    const dir = stack.pop()!;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name)) continue;
        stack.push(full);
      } else if (entry.isFile()) {
        yield full;
      }
    }
  }
}
