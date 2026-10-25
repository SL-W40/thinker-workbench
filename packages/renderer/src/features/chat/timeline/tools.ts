/**
 * 工具事件：一次工具调用的各阶段归并为单个 step，并处理删除文件的恢复缓存。
 */
import { type AgentEvent, type ChatTimelineStep, createId } from "@thinker-workbench/shared";
import { dropTrailingEphemeralThoughts } from "./planning";
import { deactivateStatuses } from "./status";

/** 应用 tool start/end，按 callId（或 name+path）合并。 */
export function applyToolEvent(
  steps: ChatTimelineStep[],
  event: Extract<AgentEvent, { type: "tool" }>,
): ChatTimelineStep[] {
  const next = dropTrailingEphemeralThoughts(deactivateStatuses(steps));

  const isShellTool =
    event.name === "shell" || event.name === "shell_await" || event.name === "shell_write";
  let matchIndex = -1;
  if (event.callId) {
    matchIndex = next.findIndex(
      (s) => s.kind === "tool" && Boolean(s.callId) && s.callId === event.callId,
    );
  }
  // create_plan 的草稿卡可能还没拿到 callId（首包 id 迟到）：按同名兜底合并
  if (matchIndex < 0 && event.name === "create_plan") {
    matchIndex = next.findIndex(
      (s) => s.kind === "tool" && s.name === "create_plan" && !s.callId && s.phase === "start",
    );
  }
  // HITL 预插入的 shell 卡片优先合并，避免再开一张卡
  if (matchIndex < 0 && isShellTool) {
    matchIndex = next.findIndex(
      (s) =>
        s.kind === "tool" &&
        Boolean(s.hitl) &&
        (s.name === "shell" || s.name === "shell_await" || s.name === "shell_write") &&
        s.phase === "start" &&
        s.active,
    );
  }
  // HITL 预插入的模式切换卡片：HITL 请求可能先于 tool start 到达，
  // 这里按「有 modeSwitch 且没 callId」兜底认领，别在卡片下面再开一行。
  if (matchIndex < 0 && event.name === "request_mode_switch") {
    matchIndex = next.findIndex((s) => s.kind === "tool" && Boolean(s.modeSwitch) && !s.callId);
  }
  // 事件必须按 callId 精确匹配：同名的并行工具调用是两次独立调用，
  // 同名兜底合并会并掉一张卡并覆盖 callId，导致 end 错乱、思考轮被误判为同一轮。

  if (event.phase === "start") {
    if (matchIndex >= 0) {
      const prev = next[matchIndex];
      if (prev.kind !== "tool") return next;
      const copy = [...next];
      copy[matchIndex] = {
        ...prev,
        callId: event.callId ?? prev.callId,
        path: event.path ?? prev.path,
        summary: event.summary ?? prev.summary,
        diff: event.diff ?? prev.diff,
        sessionId: event.sessionId ?? prev.sessionId,
        command: event.command ?? prev.command,
        resultPaths: event.resultPaths ?? prev.resultPaths,
        resultPathKinds: event.resultPathKinds ?? prev.resultPathKinds,
        todo: event.todo ?? prev.todo,
        ...mergeRestoreCache(prev, event),
        // 审批卡片先于真正执行出现。迟到的 tool start 不能把选择按钮抹掉。
        hitl: prev.hitl,
        phase: "start",
        active: true,
        startedAt: event.ts ?? prev.startedAt ?? Date.now(),
      };
      return copy;
    }
    return [
      ...next,
      {
        id: createId("tl"),
        kind: "tool",
        name: event.name,
        callId: event.callId,
        path: event.path,
        summary: event.summary,
        diff: event.diff,
        sessionId: event.sessionId,
        command: event.command,
        todo: event.todo,
        ...mergeRestoreCache(undefined, event),
        phase: "start",
        active: true,
        startedAt: event.ts ?? Date.now(),
      },
    ];
  }

  // end：带上 diff / restoreContent / shell 会话（即使此前 start 行没有）
  if (matchIndex >= 0) {
    const prev = next[matchIndex];
    if (prev.kind !== "tool") return next;
    const copy = [...next];
    copy[matchIndex] = {
      ...prev,
      phase: "end",
      active: false,
      path: event.path ?? prev.path,
      summary: event.summary ?? prev.summary,
      ok: event.ok,
      diff: event.diff ?? prev.diff,
      sessionId: event.sessionId ?? prev.sessionId,
      command: event.command ?? prev.command,
      exitCode: event.exitCode ?? prev.exitCode,
      backgrounded: event.backgrounded ?? prev.backgrounded,
      resultPaths: event.resultPaths ?? prev.resultPaths,
      resultPathKinds: event.resultPathKinds ?? prev.resultPathKinds,
      // todo：start 带动作，end 补上快照与增删 id；合并而非整体覆盖，避免丢掉任一侧
      todo: event.todo ? { ...prev.todo, ...event.todo } : prev.todo,
      // update_plan：start 没有 diff，end 才带「改了哪几步」
      planUpdate: event.planUpdate ?? prev.planUpdate,
      ...mergeRestoreCache(prev, event),
      endedAt: event.ts ?? Date.now(),
    };
    return copy;
  }

  return [
    ...next,
    {
      id: createId("tl"),
      kind: "tool",
      name: event.name,
      callId: event.callId,
      path: event.path,
      summary: event.summary,
      phase: "end",
      ok: event.ok,
      diff: event.diff,
      sessionId: event.sessionId,
      command: event.command,
      exitCode: event.exitCode,
      backgrounded: event.backgrounded,
      resultPaths: event.resultPaths,
      resultPathKinds: event.resultPathKinds,
      todo: event.todo,
      ...mergeRestoreCache(undefined, event),
      active: false,
    },
  ];
}

/** 合并删除恢复缓存；新带上 restoreContent 时打戳。 */
export function mergeRestoreCache(
  prev: Extract<ChatTimelineStep, { kind: "tool" }> | undefined,
  event: Extract<AgentEvent, { type: "tool" }>,
): { restoreContent?: string; restoreCachedAt?: number; restored?: boolean } {
  if (prev?.restored) return { restored: true };
  const content =
    typeof event.restoreContent === "string"
      ? event.restoreContent
      : prev && typeof prev.restoreContent === "string"
        ? prev.restoreContent
        : undefined;
  if (content === undefined) return {};
  const cachedAt =
    typeof event.restoreCachedAt === "number"
      ? event.restoreCachedAt
      : typeof prev?.restoreCachedAt === "number"
        ? prev.restoreCachedAt
        : Date.now();
  return { restoreContent: content, restoreCachedAt: cachedAt };
}
