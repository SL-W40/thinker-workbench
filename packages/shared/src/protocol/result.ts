/**
 * Agent 单次运行的同步返回结果。
 * IPC `agent:run` / preload `ThinkerApi.run` 的 Promise 解析值；流式过程另走 `AgentEvent`。
 */

/**
 * 运行结果联合类型。
 * - `ok: true`：成功，携带最终文本与关联 id
 * - `ok: false`：失败，携带错误说明；id 在部分失败路径上可能缺失
 */
export type RunResult =
  | { ok: true; text: string; runId: string; threadId: string }
  | { ok: false; error: string; runId?: string; threadId?: string };
