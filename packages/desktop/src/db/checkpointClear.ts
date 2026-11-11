/**
 * 主进程侧线程 checkpoint 窥探，以及向 engine 提交清理。
 *
 * 真实 checkpoint 与 threads.json 只由 engine 写（SqliteSaver + threadsIndex）。
 * 主进程可以读登记表来判断能否 Resume，但不能改它。
 * 删会话时把清理请求交给 engine；子进程还没起来就先记着，起来后再交。
 */
import fs from "node:fs";
import path from "node:path";
import { getWorkspaceCheckpointDir } from "../config/paths";

/** checkpoint 清理通道（engine 子进程执行真实删除）；由 AgentBridge 启动时注入。 */
export type CheckpointClearTransport = (workspaceId: string, threadId: string) => Promise<boolean>;

let clearTransport: CheckpointClearTransport | null = null;

/** 子进程尚未接上时积压的清理。键是 workspaceId，值是 threadId。 */
const pendingClears = new Map<string, Set<string>>();

function rememberClear(workspaceId: string, threadId: string): void {
  const ws = workspaceId.trim();
  const tid = threadId.trim();
  if (!ws || !tid) return;
  const set = pendingClears.get(ws) ?? new Set<string>();
  set.add(tid);
  pendingClears.set(ws, set);
}

function forgetClear(workspaceId: string, threadId: string): void {
  const set = pendingClears.get(workspaceId);
  if (!set) return;
  set.delete(threadId);
  if (set.size === 0) pendingClears.delete(workspaceId);
}

function dispatchClear(workspaceId: string, threadId: string): void {
  const transport = clearTransport;
  if (!transport) return;
  void transport(workspaceId, threadId)
    .then((ok) => {
      if (ok) forgetClear(workspaceId, threadId);
    })
    .catch(() => {
      /* 仍留在 pending，下次注入通道或再次清理时重试 */
    });
}

/** 注入清理通道（AgentBridge 就绪后调用；重复注入以最后一次为准）。 */
export function setCheckpointClearTransport(transport: CheckpointClearTransport): void {
  clearTransport = transport;
  for (const [workspaceId, threadIds] of pendingClears) {
    for (const threadId of threadIds) dispatchClear(workspaceId, threadId);
  }
}

function threadsIndexFile(workspaceId: string): string {
  return path.join(getWorkspaceCheckpointDir(workspaceId), "threads.json");
}

/** 读取 engine 侧线程登记表；缺失/损坏返回空表。只读。 */
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
 * 主进程窥探 checkpoint：登记表里有该线程的 run 键则可 Resume。
 */
export function peekThreadCheckpoint(workspaceId: string, threadId: string): boolean {
  const index = readThreadsIndex(workspaceId);
  return typeof index[threadId] === "string" && Boolean(index[threadId]);
}

/**
 * 请求 engine 删除指定 thread 的 checkpoint（登记表 + SqliteSaver）。
 * 不在主进程改 threads.json。
 */
export function clearThreadCheckpoint(workspaceId: string, threadId: string): void {
  rememberClear(workspaceId, threadId);
  dispatchClear(workspaceId, threadId);
}
