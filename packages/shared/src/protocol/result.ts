/**
 * Agent 单次运行的同步返回结果。
 * IPC `agent:run` / preload `ThinkerApi.run` 在账本提交后立刻解析；
 * 流式过程与终态另走 `AgentEvent`（done / error）。
 */

/**
 * 运行结果联合类型。
 * - `ok: true`：已准入并分配 runId（accepted）；正文与终态只经事件
 * - `queued`：已入队，尚未占并行槽，也不要当成正在跑
 * - `ok: false`：准入 / 派发前失败；id 在部分路径上可能缺失
 */
export type RunResult =
  | {
      ok: true;
      accepted: true;
      runId: string;
      threadId: string;
      /** 已入队、尚未派发。缺省表示已直接进入 running。 */
      queued?: true;
      /** FIFO 名次，从 1 起。 */
      queuePosition?: number;
    }
  | { ok: false; error: string; runId?: string; threadId?: string };
