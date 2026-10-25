/**
 * 单个 tool_call 的执行与 resume 判定（start/end 事件 + span）。
 */
import type { ChatContentPart, ChatMessage, ChatToolCall } from "../../../model/types";
import { getRunTurn, markToolCallStarted } from "../../../runtime/runContext";
import { getRunEmitter } from "../../../runtime/runEmit";
import { runTool } from "../../../tools/runTool";
import {
  peekTaskLaunchesInBackground,
  seedFailedBackgroundTask,
} from "../../../tools/task/execute";
import { deriveTaskTitle } from "../../../tools/task/title";
import { agentEndSpan, agentStartSpan } from "../../../trace/emit";
import type { AgentGraphState } from "../../annotation";
import {
  appendStartedToolCallId,
  interruptedToolMessage,
  resolvePendingToolAction,
} from "../toolsResume";
import { fallbackDiff, parseToolArgs, toolUiHints } from "./args";

/** interrupt / reuse 时补发 tool end，避免 UI 悬空。 */
export function emitToolEndFromMessage(
  call: ChatToolCall,
  message: ChatMessage,
  ok: boolean,
): void {
  const emit = getRunEmitter();
  if (!emit) return;
  const name = call.function.name;
  const parsed = parseToolArgs(call.function.arguments);
  const hints = parsed.ok ? toolUiHints(name, parsed.args) : {};
  const commandHint =
    parsed.ok && typeof parsed.args.command === "string" ? parsed.args.command : undefined;
  emit({
    type: "tool",
    phase: "end",
    name,
    callId: call.id,
    path: hints.path,
    summary: hints.summary,
    detail: ok ? "ok" : "interrupted",
    ok,
    command: commandHint,
    todo: hints.todo,
  });
  void message;
}

/** 执行单个 tool_call，并发出 tool start/end 事件。 */
export async function runOne(call: ChatToolCall, signal: AbortSignal): Promise<ChatMessage> {
  const emit = getRunEmitter();
  const name = call.function.name;
  const callId = call.id;
  const parsed = parseToolArgs(call.function.arguments);
  const hints = parsed.ok ? toolUiHints(name, parsed.args) : {};

  const commandHint =
    parsed.ok && typeof parsed.args.command === "string" ? parsed.args.command : undefined;
  // Task：用 callId 作 taskId，便于 subagent 挂到本 span，且 par 框住 tool:Task 子树
  const isTaskTool = name === "Task";
  const taskId = isTaskTool ? callId : undefined;
  const taskTitle =
    isTaskTool && parsed.ok
      ? deriveTaskTitle(
          typeof parsed.args.title === "string" ? parsed.args.title : undefined,
          typeof parsed.args.prompt === "string" ? parsed.args.prompt : "",
        )
      : "";
  const taskBackground =
    isTaskTool && parsed.ok ? peekTaskLaunchesInBackground(parsed.args) : false;
  const turn = getRunTurn();
  const toolSpanId = agentStartSpan({
    name: `tool:${name}`,
    runType: "tool",
    taskId,
    summary: isTaskTool && taskTitle ? `Task · ${taskTitle}` : hints.summary || name,
    input: parsed.ok ? parsed.args : { raw: call.function.arguments },
    attrs: {
      callId,
      path: hints.path,
      ...(turn != null ? { turn } : {}),
      ...(isTaskTool
        ? {
            background: taskBackground,
            ...(taskTitle ? { title: taskTitle } : {}),
          }
        : {}),
    },
  });
  emit?.({
    type: "tool",
    phase: "start",
    name,
    callId,
    path: hints.path,
    summary: hints.summary,
    command: commandHint,
    // todo：动作与受影响条目只在 start 带（入参即事实），end 由时间线沿用
    todo: hints.todo,
  });
  let content: string | ChatContentPart[];
  if (!parsed.ok) {
    content = `[tool:${name} error]\n${parsed.error}`;
    emit?.({
      type: "tool",
      phase: "end",
      name,
      callId,
      path: hints.path,
      summary: hints.summary,
      detail: "error",
      ok: false,
    });
    agentEndSpan(toolSpanId, { status: "error", error: parsed.error });
  } else {
    try {
      const result = await runTool(name, parsed.args, signal, callId);
      const header = result.ok ? `[tool:${name} ok]` : `[tool:${name} error]`;
      const modelImages = (result.ui?.modelImages ?? []).filter((p) => p.trim());
      content =
        modelImages.length > 0
          ? ([
              { type: "text", text: `${header}\n${result.output}` },
              ...modelImages.map((p, i) => ({
                type: "image_ref" as const,
                id: `${name}-${i}`,
                path: p,
                mime: "image/png",
              })),
            ] satisfies ChatContentPart[])
          : `${header}\n${result.output}`;
      const diff =
        (result.ui?.diff && result.ui.diff.length > 0 ? result.ui.diff : undefined) ??
        (result.ok ? fallbackDiff(name, parsed.args) : undefined);
      // todo：把调用后的待办快照与增删 id 并进结构化提示（卡片定格展示）
      const todo = hints.todo
        ? {
            ...hints.todo,
            ...(result.ui?.todos?.length ? { items: result.ui.todos } : {}),
            ...(result.ui?.todoAdded?.length ? { added: result.ui.todoAdded } : {}),
            ...(result.ui?.todoRemoved?.length ? { removed: result.ui.todoRemoved } : {}),
          }
        : undefined;
      emit?.({
        type: "tool",
        phase: "end",
        name,
        callId,
        path: result.ui?.path ?? hints.path,
        summary: hints.summary,
        detail: result.ok ? "ok" : "error",
        ok: result.ok,
        todo,
        // update_plan：这次改了哪几步（start 只有入参，end 才有 diff）
        ...(result.ui?.planUpdate ? { planUpdate: result.ui.planUpdate } : {}),
        diff,
        sessionId: result.ui?.sessionId,
        command: result.ui?.command ?? commandHint,
        exitCode: result.ui?.exitCode,
        backgrounded: result.ui?.backgrounded,
        ...(typeof result.ui?.restoreContent === "string"
          ? { restoreContent: result.ui.restoreContent }
          : {}),
        ...(result.ui?.resultPaths?.length ? { resultPaths: result.ui.resultPaths } : {}),
        ...(result.ui?.resultPathKinds?.length
          ? { resultPathKinds: result.ui.resultPathKinds }
          : {}),
      });
      agentEndSpan(toolSpanId, {
        status: result.ok ? "ok" : "error",
        output: { ok: result.ok, preview: result.output.slice(0, 400) },
        error: result.ok ? undefined : result.output,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      agentEndSpan(toolSpanId, { status: "error", error });
      throw err;
    }
  }

  return {
    role: "tool",
    tool_call_id: call.id,
    content,
  };
}

/**
 * 取出队首连续「后台 Task」批次（≥2 才并行；阻塞型 / 其它工具仍一次一个）。
 * 保持 checkpoint 语义：一批结果一起落盘，Resume 不会半截重跑。
 */
export function takeBackgroundTaskBatch(pending: ChatToolCall[]): ChatToolCall[] {
  const batch: ChatToolCall[] = [];
  for (const call of pending) {
    if (call.function.name !== "Task") break;
    const parsed = parseToolArgs(call.function.arguments);
    if (!parsed.ok || !peekTaskLaunchesInBackground(parsed.args)) break;
    batch.push(call);
  }
  return batch.length >= 2 ? batch : [];
}

/** 对单个 call 按 resume 策略产出 tool 消息（可能跳过写入）。 */
export async function resolveOne(
  state: AgentGraphState,
  call: ChatToolCall,
  signal: AbortSignal,
): Promise<{ message: ChatMessage | null; startedIds: string[] }> {
  const action = resolvePendingToolAction(state, call);
  const startedIds = state.startedToolCallIds;

  if (action === "reuse") {
    const existing = state.messages.find((m) => m.role === "tool" && m.tool_call_id === call.id);
    if (existing)
      emitToolEndFromMessage(
        call,
        existing,
        !/\[tool:[^\]]+ error\]/.test(typeof existing.content === "string" ? existing.content : ""),
      );
    return { message: null, startedIds };
  }

  if (action === "interrupt") {
    const message = interruptedToolMessage(call);
    emitToolEndFromMessage(call, message, false);
    if (call.function.name === "Task") {
      const parsed = parseToolArgs(call.function.arguments);
      const subagent =
        parsed.ok && typeof parsed.args.subagent === "string" ? parsed.args.subagent.trim() : "";
      seedFailedBackgroundTask(call.id, {
        reason:
          "Interrupted by process crash while this Task was in progress; outcome is uncertain.",
        subagent: subagent || "unknown",
      });
    }
    return { message, startedIds };
  }

  await markToolCallStarted(call.id);
  const nextStarted = appendStartedToolCallId(startedIds, call.id);
  const message = await runOne(call, signal);
  return { message, startedIds: nextStarted };
}
