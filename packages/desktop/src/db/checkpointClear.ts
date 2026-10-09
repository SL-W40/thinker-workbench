/**
 * 主进程侧读写线程 checkpoint 文件（cancel 清理 / 崩溃恢复判定）。
 */
import fs from "node:fs";
import path from "node:path";
import { getCheckpointDir } from "../config/paths";

function checkpointFile(threadId: string): string {
  const safe = threadId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(getCheckpointDir(), `${safe}.json`);
}

/** 删除指定 thread 的 checkpoint JSON（若不存在则忽略）。 */
export function clearThreadCheckpoint(threadId: string): void {
  const file = checkpointFile(threadId);
  try {
    fs.unlinkSync(file);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") throw err;
  }
}

/** 主进程窥视 checkpoint：有则可 Resume。 */
export function peekThreadCheckpoint(
  threadId: string,
): { threadId: string; nodeId: string } | null {
  const file = checkpointFile(threadId);
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as {
      threadId?: string;
      nodeId?: string;
    };
    if (!parsed || parsed.threadId !== threadId || typeof parsed.nodeId !== "string") {
      return null;
    }
    return {
      threadId,
      nodeId: parsed.nodeId,
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return null;
    return null;
  }
}
