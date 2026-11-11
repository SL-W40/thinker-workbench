/**
 * 前台会话的运行阶段。busy 与可恢复是同一份状态的两个投影，不能各写各的。
 * 排队仍由队列 hook 持有：排队还没占槽，不是 live。
 */
export type SessionPhase =
  | { kind: "idle" }
  | { kind: "live" }
  | { kind: "resumable"; reason: "cancelled" | "crashed" };

export function sessionBusy(phase: SessionPhase): boolean {
  return phase.kind === "live";
}

export function sessionResumeKind(phase: SessionPhase): null | "cancelled" | "crashed" {
  return phase.kind === "resumable" ? phase.reason : null;
}

/** setBusy 的转移：进入 live；离开时保留已经记下的可恢复原因。 */
export function phaseAfterBusy(phase: SessionPhase, busy: boolean): SessionPhase {
  if (busy) return { kind: "live" };
  if (phase.kind === "resumable") return phase;
  return { kind: "idle" };
}

/**
 * setCanResume 的转移。
 * live 期间清掉 resume 标记仍保持 live；已经 idle / resumable 时 false 回到 idle。
 */
export function phaseAfterResume(
  phase: SessionPhase,
  value: boolean | "cancelled" | "crashed",
): SessionPhase {
  if (value === false) {
    if (phase.kind === "live") return phase;
    return { kind: "idle" };
  }
  return { kind: "resumable", reason: value === true ? "cancelled" : value };
}
