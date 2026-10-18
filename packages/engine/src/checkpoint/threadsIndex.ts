/**
 * LangGraph 线程键登记表（`<checkpointDir>/threads.json`）。
 *
 * 背景：AgentRuntime 把线程键改为 run 级（`threadId::run:runId`，见 AgentRuntime），
 * 跨 run 不再复用 checkpoint；resume 需要按 threadId 找回"最近一次保留 checkpoint 的 run"。
 * desktop 侧 `chat_sessions.active_run_id` 在结算时即被清空，无法兜底，
 * 故在 run 开工时先落盘登记（覆盖进程崩溃场景），结算清理/保留时同步增删。
 *
 * 结构：`{ [threadId]: runKey }`，每线程只保留最近一次可恢复 run。
 */
import fs from "node:fs";
import path from "node:path";

/** 由会话线程 id 与 run id 派生 LangGraph 线程键。 */
export function runKeyFor(threadId: string, runId: string): string {
  return `${threadId}::run:${runId}`;
}

function indexFile(dir: string | undefined): string {
  if (!dir?.trim()) return "";
  return path.join(dir, "threads.json");
}

/** 读取登记表；文件缺失/损坏时返回空表（best-effort，不抛错）。 */
function loadIndex(dir: string | undefined): Record<string, string> {
  try {
    const raw = fs.readFileSync(indexFile(dir), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k === "string" && k.trim() && typeof v === "string" && v.trim()) {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** 原子写盘（tmp + rename）；失败仅记日志，不抛错。 */
function saveIndex(dir: string | undefined, index: Record<string, string>): void {
  try {
    const file = indexFile(dir);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(index, null, 2), "utf8");
    fs.renameSync(tmp, file);
  } catch (err) {
    console.warn("[engine] threads index save failed:", err instanceof Error ? err.message : err);
  }
}

/** run 开工时登记 threadId → runKey（先于执行落盘，覆盖崩溃后 resume）。 */
export function registerRunKey(dir: string | undefined, threadId: string, runKey: string): void {
  if (!dir?.trim() || !threadId.trim() || !runKey.trim()) return;
  const index = loadIndex(dir);
  index[threadId] = runKey;
  saveIndex(dir, index);
}

/** run 正常结算后清除登记（checkpoint 随之 deleteThread，不再可恢复）。 */
export function clearRunKey(dir: string | undefined, threadId: string, runKey: string): void {
  if (!dir?.trim() || !threadId.trim()) return;
  const index = loadIndex(dir);
  if (index[threadId] !== runKey) return; // 已被更新的 run 覆盖，勿误删
  delete index[threadId];
  saveIndex(dir, index);
}

/** resume / 窥探用：查该 thread 最近一次可恢复的 runKey；无则 null。 */
export function lookupRunKey(dir: string | undefined, threadId: string): string | null {
  if (!dir?.trim() || !threadId.trim()) return null;
  return loadIndex(dir)[threadId] ?? null;
}

/** 删除会话时按 threadId 清登记；返回被清掉的 runKey（供调用方删 checkpoint）。 */
export function clearThreadKeys(dir: string | undefined, threadId: string): string[] {
  if (!dir?.trim() || !threadId.trim()) return [];
  const index = loadIndex(dir);
  const runKey = index[threadId];
  if (!runKey) return [];
  delete index[threadId];
  saveIndex(dir, index);
  return [runKey];
}
