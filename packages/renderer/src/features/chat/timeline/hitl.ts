/**
 * 人工介入：澄清提问与审批卡片的下发，以及答复回填。
 */
import {
  type ChatTimelineStep,
  createId,
  type HitlRequest,
  normalizeChatMode,
} from "@thinker-workbench/shared";
import { dropTrailingEphemeralThoughts } from "./planning";
import { deactivateStatuses } from "./status";

/** 这些 HITL 挂在时间线卡片上，不进 Modal。 */
export function isTimelineHitlKind(kind: string): boolean {
  return (
    kind === "shell_approval" ||
    kind === "shell_write_approval" ||
    kind === "clarify" ||
    kind === "mode_switch"
  );
}

/** HITL 请求 → 时间线步骤上的通用审批块（按钮与标题）。 */
export function hitlBlockOf(request: HitlRequest) {
  return {
    hitlId: request.hitlId,
    title: request.title,
    body: request.body,
    actions: request.actions.map((a) => ({ id: a.id, label: a.label, style: a.style })),
  };
}

export function parseClarifyQuestions(
  payload: Record<string, unknown> | undefined,
): NonNullable<Extract<ChatTimelineStep, { kind: "tool" }>["clarify"]>["questions"] {
  const raw = payload?.questions;
  if (!Array.isArray(raw)) return [];
  const questions: NonNullable<
    Extract<ChatTimelineStep, { kind: "tool" }>["clarify"]
  >["questions"] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as { id?: unknown; prompt?: unknown; options?: unknown; required?: unknown };
    const prompt = typeof row.prompt === "string" ? row.prompt.trim() : "";
    if (!prompt) continue;
    // 缺省必答；只有显式 false 才是可跳过的选答题
    const required = row.required !== false;
    const id =
      typeof row.id === "string" && row.id.trim() ? row.id.trim() : `q${questions.length + 1}`;
    const options: Array<{ id: string; label: string }> = [];
    if (Array.isArray(row.options)) {
      for (const opt of row.options) {
        if (!opt || typeof opt !== "object") continue;
        const option = opt as { id?: unknown; label?: unknown };
        const label = typeof option.label === "string" ? option.label.trim() : "";
        if (!label) continue;
        const optionId =
          typeof option.id === "string" && option.id.trim()
            ? option.id.trim()
            : `opt_${options.length + 1}`;
        options.push({ id: optionId, label });
      }
    }
    questions.push({ id, prompt, options, required });
  }
  return questions;
}

export function parseClarifyAnswers(values: Record<string, unknown> | undefined) {
  const raw = values?.answers;
  if (!Array.isArray(raw)) return [];
  const answers: NonNullable<
    NonNullable<Extract<ChatTimelineStep, { kind: "tool" }>["clarify"]>["answers"]
  > = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as { id?: unknown; optionId?: unknown; text?: unknown };
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id) continue;
    const optionId = typeof row.optionId === "string" ? row.optionId.trim() : "";
    const text = typeof row.text === "string" ? row.text.trim() : "";
    answers.push({
      id,
      ...(optionId ? { optionId } : {}),
      ...(text ? { text } : {}),
    });
  }
  return answers;
}

/**
 * HITL 请求：shell 审批与 clarify 挂时间线卡片；其它 kind 走 Modal。
 */
export function applyHitlRequest(
  steps: ChatTimelineStep[],
  request: HitlRequest,
): ChatTimelineStep[] {
  if (request.kind === "clarify") {
    const questions = parseClarifyQuestions(request.payload);
    const next = dropTrailingEphemeralThoughts(deactivateStatuses(steps));
    const clarify = { hitlId: request.hitlId, questions };
    const existing = next.findIndex(
      (s) =>
        s.kind === "tool" &&
        (s.hitl?.hitlId === request.hitlId || s.clarify?.hitlId === request.hitlId),
    );
    if (existing >= 0) {
      const prev = next[existing];
      if (prev.kind !== "tool") return next;
      const copy = [...next];
      // 已在的卡片保留原名（可能是 create_plan 发起的旧账处置询问）
      copy[existing] = { ...prev, clarify, phase: "start", active: true };
      return copy;
    }
    // 挂在正在跑的 ask_user / create_plan 卡上：后者会在旧账未清时就地发问
    for (let i = next.length - 1; i >= 0; i--) {
      const s = next[i];
      if (
        s.kind === "tool" &&
        (s.name === "ask_user" || s.name === "create_plan") &&
        s.phase === "start" &&
        s.active &&
        !s.clarify
      ) {
        const copy = [...next];
        copy[i] = { ...s, clarify, phase: "start", active: true };
        return copy;
      }
    }
    return [
      ...next,
      {
        id: createId("tl"),
        kind: "tool",
        name: "ask_user",
        summary: questions[0]?.prompt,
        clarify,
        phase: "start",
        active: true,
      },
    ];
  }
  // 模式切换：模型请求把会话切到另一个 ChatMode，卡片给「切换 / 保持」两个按钮
  if (request.kind === "mode_switch") {
    const targetMode = normalizeChatMode(request.payload?.targetMode);
    const currentMode = normalizeChatMode(request.payload?.currentMode);
    const reasonRaw = request.payload?.reason;
    const reason = typeof reasonRaw === "string" && reasonRaw.trim() ? reasonRaw.trim() : undefined;
    const next = dropTrailingEphemeralThoughts(deactivateStatuses(steps));
    const modeSwitch = { hitlId: request.hitlId, targetMode, currentMode, reason };
    const hitl = hitlBlockOf(request);
    // 先挂到正在跑的 request_mode_switch 卡上，避免多出一张空行
    for (let i = next.length - 1; i >= 0; i--) {
      const s = next[i];
      if (
        s.kind === "tool" &&
        s.name === "request_mode_switch" &&
        s.phase === "start" &&
        s.active &&
        !s.modeSwitch
      ) {
        const copy = [...next];
        copy[i] = { ...s, modeSwitch, hitl, phase: "start", active: true };
        return copy;
      }
    }
    return [
      ...next,
      {
        id: createId("tl"),
        kind: "tool",
        name: "request_mode_switch",
        summary: request.body,
        modeSwitch,
        hitl,
        phase: "start",
        active: true,
      },
    ];
  }
  if (request.kind !== "shell_approval" && request.kind !== "shell_write_approval") {
    return steps;
  }
  const parentCommand =
    typeof request.payload?.parentCommand === "string" ? request.payload.parentCommand.trim() : "";
  const dataPreview =
    typeof request.payload?.dataPreview === "string" ? request.payload.dataPreview : "";
  const command =
    typeof request.payload?.command === "string"
      ? request.payload.command.trim()
      : request.kind === "shell_write_approval"
        ? parentCommand
          ? `${parentCommand} ← ${dataPreview || "…"}`
          : dataPreview
            ? `← ${dataPreview}`
            : ""
        : "";
  const toolName = request.kind === "shell_write_approval" ? "shell_write" : "shell";
  const next = dropTrailingEphemeralThoughts(deactivateStatuses(steps));
  // 已有同 hitlId 则刷新
  const existing = next.findIndex((s) => s.kind === "tool" && s.hitl?.hitlId === request.hitlId);
  const reviewReason =
    typeof request.payload?.reviewReason === "string" ? request.payload.reviewReason.trim() : "";
  const hitl = {
    hitlId: request.hitlId,
    title: request.title,
    body: request.body,
    actions: request.actions.map((a) => ({
      id: a.id,
      label: a.label,
      style: a.style,
    })),
    parentCommand: parentCommand || undefined,
    dataPreview: dataPreview || undefined,
    purpose: reviewReason || undefined,
  };
  const sessionId = typeof request.payload?.sessionId === "string" ? request.payload.sessionId : "";

  // 时间线里同 session 的 shell 命令，补全 parentCommand（引擎缓存未命中时）
  let resolvedHitl = hitl;
  if (request.kind === "shell_write_approval" && !resolvedHitl.parentCommand && sessionId) {
    for (let i = next.length - 1; i >= 0; i--) {
      const s = next[i];
      if (
        s.kind === "tool" &&
        s.name === "shell" &&
        s.sessionId === sessionId &&
        s.command?.trim()
      ) {
        resolvedHitl = { ...resolvedHitl, parentCommand: s.command.trim() };
        break;
      }
    }
  }
  const cardCommand =
    request.kind === "shell_write_approval" && resolvedHitl.parentCommand
      ? `${resolvedHitl.parentCommand} ← ${resolvedHitl.dataPreview || "…"}`
      : command;

  if (existing >= 0) {
    const prev = next[existing];
    if (prev.kind !== "tool") return next;
    const copy = [...next];
    copy[existing] = {
      ...prev,
      command: cardCommand || prev.command,
      hitl: resolvedHitl,
      phase: "start",
      active: true,
    };
    return copy;
  }

  // 挂到已有 Running 的同名工具卡，避免「Running」+「待确认」两张
  for (let i = next.length - 1; i >= 0; i--) {
    const s = next[i];
    if (s.kind === "tool" && s.name === toolName && s.phase === "start" && s.active) {
      const copy = [...next];
      copy[i] = {
        ...s,
        command: cardCommand || s.command,
        summary: cardCommand || s.summary,
        sessionId: s.sessionId || sessionId || undefined,
        hitl: resolvedHitl,
        phase: "start",
        active: true,
      };
      return copy;
    }
  }

  return [
    ...next,
    {
      id: createId("tl"),
      kind: "tool",
      name: toolName,
      command: cardCommand || undefined,
      summary: cardCommand || undefined,
      sessionId: sessionId || undefined,
      hitl: resolvedHitl,
      phase: "start",
      active: true,
    },
  ];
}

/**
 * HITL 已解决：允许则清 hitl 等 tool；拒绝则卡片失败结束。
 */
export function applyHitlResolved(
  steps: ChatTimelineStep[],
  hitlId: string,
  actionId?: string,
  values?: Record<string, unknown>,
): ChatTimelineStep[] {
  const idx = steps.findIndex(
    (s) =>
      s.kind === "tool" &&
      (s.hitl?.hitlId === hitlId ||
        s.clarify?.hitlId === hitlId ||
        s.modeSwitch?.hitlId === hitlId),
  );
  if (idx < 0) return steps;
  const prev = steps[idx];
  if (prev.kind !== "tool") return steps;
  const denied = actionId === "deny";
  const copy = [...steps];
  // 模式切换：记下用户的选择，卡片转只读（不跟着本轮后续状态变）
  if (prev.modeSwitch && actionId) {
    copy[idx] = {
      ...prev,
      hitl: undefined,
      modeSwitch: { ...prev.modeSwitch, resolvedAction: actionId },
      phase: "end",
      active: false,
      ok: true,
    };
    return copy;
  }
  if (prev.clarify && !denied) {
    copy[idx] = {
      ...prev,
      hitl: undefined,
      clarify: { ...prev.clarify, answers: parseClarifyAnswers(values) },
      phase: "end",
      active: false,
      ok: true,
    };
    return copy;
  }
  copy[idx] = {
    ...prev,
    hitl: undefined,
    phase: denied ? "end" : "start",
    active: !denied,
    ok: denied ? false : prev.ok,
  };
  return copy;
}
