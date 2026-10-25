/**
 * tools 节点：执行上一轮 agent 留下的 pendingToolCalls，结果写回消息历史。
 * Resume：已有结果则跳过；已开工无结果则注入分类中断说明（不重放）。
 */
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { getLimit } from "../../../config/runtimeLimits";
import { sleep } from "../../../model/retry";
import type { ChatMessage, ChatToolCall } from "../../../model/types";
import { getLoadedToolNames, markToolCallStarted } from "../../../runtime/runContext";
import { seedFailedBackgroundTask } from "../../../tools/task/execute";
import type { AgentGraphState, AgentGraphUpdate } from "../../annotation";
import {
  appendStartedToolCallId,
  interruptedToolMessage,
  resolvePendingToolAction,
} from "../toolsResume";
import { parseToolArgs } from "./args";
import { emitToolEndFromMessage, resolveOne, runOne, takeBackgroundTaskBatch } from "./runner";

/**
 * 本 run 里尚未同步进图状态的已装载工具名。
 * 工具执行（含 tool_search）把命中名写进 run 上下文，这里摘出来交给 state，
 * 使 agent 节点下一轮能把它们的完整 schema 展开进 body.tools。
 */
function newlyLoadedToolNames(state: AgentGraphState): string[] {
  const loaded = getLoadedToolNames();
  if (loaded.length === 0) return [];
  const known = new Set(state.loadedToolNames ?? []);
  return loaded.filter((name) => !known.has(name));
}

/**
 * 默认每次只执行一个 pending tool，便于节点结束后落 checkpoint。
 * 例外：连续多个后台 Task 并行启动，避免「先说并行、卡片却一个个冒」。
 * 串行工具间保证最小间隔（getLimit("toolCallMinGapMs")）：上一个结束到下一个
 * 开始至少这么久，让时间线尾卡先收组、planning/thinking 抑制释放后再发下一个。
 */
export async function tools(
  state: AgentGraphState,
  config: LangGraphRunnableConfig,
): Promise<AgentGraphUpdate> {
  const signal = config.signal ?? AbortSignal.timeout(3_600_000);
  const startedToolCallIds = Array.isArray(state.startedToolCallIds)
    ? state.startedToolCallIds
    : [];
  const base: AgentGraphState = { ...state, startedToolCallIds };

  if (base.pendingToolCalls.length === 0) {
    return { pendingToolCalls: [], startedToolCallIds };
  }
  if (signal.aborted) {
    throw new Error("Run cancelled.");
  }

  const batch = takeBackgroundTaskBatch(base.pendingToolCalls);
  if (batch.length >= 2) {
    // 并行前先逐个 mark（串行落盘），再 Promise.all 执行/中断
    const prepared: Array<{
      call: ChatToolCall;
      action: ReturnType<typeof resolvePendingToolAction>;
    }> = [];
    let started = [...startedToolCallIds];
    const newlyStarted: string[] = [];
    let working: AgentGraphState = { ...base, startedToolCallIds: started };
    for (const call of batch) {
      const action = resolvePendingToolAction(working, call);
      if (action === "run") {
        await markToolCallStarted(call.id);
        const before = started.length;
        started = appendStartedToolCallId(started, call.id);
        if (started.length > before) newlyStarted.push(call.id);
        working = { ...working, startedToolCallIds: started };
      }
      prepared.push({ call, action });
    }

    const toolMessages: ChatMessage[] = [];
    await Promise.all(
      prepared.map(async ({ call, action }) => {
        if (action === "reuse") {
          const existing = working.messages.find(
            (m) => m.role === "tool" && m.tool_call_id === call.id,
          );
          if (existing) {
            emitToolEndFromMessage(
              call,
              existing,
              !/\[tool:[^\]]+ error\]/.test(
                typeof existing.content === "string" ? existing.content : "",
              ),
            );
          }
          return;
        }
        if (action === "interrupt") {
          const message = interruptedToolMessage(call);
          emitToolEndFromMessage(call, message, false);
          const parsed = parseToolArgs(call.function.arguments);
          const subagent =
            parsed.ok && typeof parsed.args.subagent === "string"
              ? parsed.args.subagent.trim()
              : "";
          seedFailedBackgroundTask(call.id, {
            reason:
              "Interrupted by process crash while this Task was in progress; outcome is uncertain.",
            subagent: subagent || "unknown",
          });
          toolMessages.push(message);
          return;
        }
        const message = await runOne(call, signal);
        toolMessages.push(message);
      }),
    );
    if (signal.aborted) {
      throw new Error("Run cancelled.");
    }
    // 保持与 batch 顺序一致；messages 只返回本轮新增（由 reducer 追加）
    const ordered: ChatMessage[] = [];
    for (const { call, action } of prepared) {
      if (action === "reuse") continue;
      const msg = toolMessages.find((m) => m.tool_call_id === call.id);
      if (msg) ordered.push(msg);
    }
    const usingOverride = (base.messagesOverride?.length ?? 0) > 0;
    const newLoaded = newlyLoadedToolNames(base);
    return {
      ...(ordered.length ? { messages: ordered } : {}),
      ...(usingOverride
        ? { messagesOverride: [...(base.messagesOverride ?? []), ...ordered] }
        : {}),
      pendingToolCalls: base.pendingToolCalls.slice(batch.length),
      ...(newlyStarted.length ? { startedToolCallIds: newlyStarted } : {}),
      ...(newLoaded.length ? { loadedToolNames: newLoaded } : {}),
      lastToolEndedAt: Date.now(),
    };
  }

  const [call, ...rest] = base.pendingToolCalls;
  if (!call) {
    return { pendingToolCalls: [] };
  }

  // 串行工具最小间隔：上一个工具结束到现在不足阈值则补足，再发起本调用。
  // 「上一个结束」以 lastToolEndedAt 为准；缺省（首调 / 跨轮）不等待。
  const minGap = getLimit("toolCallMinGapMs");
  const lastEnd = base.lastToolEndedAt;
  if (typeof lastEnd === "number" && minGap > 0) {
    const wait = minGap - (Date.now() - lastEnd);
    if (wait > 0) await sleep(wait, signal);
    if (signal.aborted) {
      throw new Error("Run cancelled.");
    }
  }

  const prevStarted = new Set(startedToolCallIds);
  const { message, startedIds } = await resolveOne(base, call, signal);
  if (signal.aborted) {
    throw new Error("Run cancelled.");
  }
  const newlyStarted = startedIds.filter((id) => !prevStarted.has(id));

  const usingOverride = (base.messagesOverride?.length ?? 0) > 0;
  const newLoaded = newlyLoadedToolNames(base);
  return {
    ...(message ? { messages: [message] } : {}),
    ...(usingOverride && message
      ? { messagesOverride: [...(base.messagesOverride ?? []), message] }
      : {}),
    pendingToolCalls: rest,
    ...(newlyStarted.length ? { startedToolCallIds: newlyStarted } : {}),
    ...(newLoaded.length ? { loadedToolNames: newLoaded } : {}),
    lastToolEndedAt: Date.now(),
  };
}
