/**
 * 主进程侧线程 checkpoint 清理 / 窥探。
 *
 * 真实 checkpoint 由 engine 子进程内的 SqliteSaver 持有（`<工作区>/checkpoints/langgraph.sqlite`），
 * 线程键为 run 级 `threadId::run:runId`，登记表落盘在 `<checkpointDir>/threads.json`
 * （engine 侧 tmp+rename 原子写，主进程可安全读取）。
 *
 * - 窥探（healRunningSessions 崩溃恢复判定）：同步读登记表，退化为读遗留 `.json`；
 * - 清理（删会话）：同步清登记项与遗留文件，并向 engine 发 host 请求删真实存储
 *   （经 setCheckpointClearTransport 注入，避免 db 层直接依赖 bridge）；
 *   agent 进程不可用时 best-effort 跳过，孤儿 checkpoint 不影响功能。
 */
import fs from "node:fs";
import path from "node:path";
import { getWorkspaceCheckpointDir } from "../config/paths";

/** checkpoint 清理通道（engine 子进程执行真实删除）；由 AgentBridge 启动时注入。 */
export type CheckpointClearTransport = (threadId: string) => Promise<boolean>;

let clearTransport: CheckpointClearTransport | null = null;

/** 注入清理通道（AgentBridge 就绪后调用；重复注入以最后一次为准）。 */
export function setCheckpointClearTransport(transport: CheckpointClearTransport): void {
  clearTransport = transport;
}

function threadsIndexFile(workspaceId: string): string {
  return path.join(getWorkspaceCheckpointDir(workspaceId), "threads.json");
}

/** 遗留 FileCheckpointer 产物路径（改版前约定）。 */
function legacyCheckpointFile(workspaceId: string, threadId: string): string {
  const safe = threadId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(getWorkspaceCheckpointDir(workspaceId), `${safe}.json`);
}

/** 读取 engine 侧线程登记表；缺失/损坏返回空表。 */
function readThreadsIndex(workspaceId: string): Record<string, string> {
  try {
    const parsed = JSON.parse(fs.readFileSync(threadsIndexFile(workspaceId), "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * 主进程窥探 checkpoint：有则可 Resume。
 * 优先看登记表（run 级键），再看遗留 `.json`（改版前产物）。
 */
export function peekThreadCheckpoint(
  workspaceId: string,
  threadId: string,
): { threadId: string; nodeId: string } | null {
  const index = readThreadsIndex(workspaceId);
  if (typeof index[threadId] === "string" && index[threadId]) {
    return { threadId, nodeId: "resume" };
  }
  // 遗留文件兜底（改版前 FileCheckpointer 产物）
  try {
    const raw = fs.readFileSync(legacyCheckpointFile(workspaceId, threadId), "utf8");
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
  } catch {
    return null;
  }
}

/** 从登记表摘除该线程（直接改写 threads.json；engine 侧随后也会清理同一项）。 */
function removeFromThreadsIndex(workspaceId: string, threadId: string): void {
  const index = readThreadsIndex(workspaceId);
  if (!(threadId in index)) return;
  delete index[threadId];
  try {
    const file = threadsIndexFile(workspaceId);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(index, null, 2), "utf8");
    fs.renameSync(tmp, file);
  } catch {
    /* 写回失败不影响主流程：engine 侧清理会兜底 */
  }
}

/** 删除指定 thread 的遗留 checkpoint JSON（若不存在则忽略）。 */
export function clearThreadCheckpoint(workspaceId: string, threadId: string): void {
  // 1) 同步清本地可见产物：遗留 .json + 登记表项
  const legacy = legacyCheckpointFile(workspaceId, threadId);
  try {
    fs.unlinkSync(legacy);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") throw err;
  }
  removeFromThreadsIndex(workspaceId, threadId);
  // 2) 异步请 engine 删真实存储（SqliteSaver 内的 run 级键）；不可用则留孤儿，无碍功能
  const transport = clearTransport;
  if (transport) {
    void transport(threadId).catch(() => {
      /* best-effort：清理失败仅留孤儿 checkpoint */
    });
  }
}
