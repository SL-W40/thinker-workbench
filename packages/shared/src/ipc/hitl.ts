/**
 * HITL（Human-in-the-Loop）协议：agent 挂起等人决策 / 输入。
 * 与 SessionRunStatus 的 cancelled / crashed 无关；等人期间 run 保持 running。
 */

/** HITL 种类；首期实现 shell_approval，预留澄清与选择。 */
export type HitlKind = "shell_approval" | "clarify" | "choice";

/** 介入卡上的操作按钮。 */
export type HitlAction = {
  id: string;
  label: string;
  style?: "primary" | "danger" | "ghost";
};

/** Engine → UI：请求用户介入。 */
export type HitlRequest = {
  hitlId: string;
  kind: HitlKind;
  threadId: string;
  runId: string;
  title: string;
  body?: string;
  /** kind 专属载荷（如 command、options）。 */
  payload: Record<string, unknown>;
  actions: HitlAction[];
};

/** UI / 系统通知 → Engine：用户答复。 */
export type HitlResponse = {
  hitlId: string;
  /** 对应 HitlAction.id，如 allow / deny / allow_and_whitelist。 */
  actionId: string;
  /** 澄清文本、多选结果等。 */
  values?: Record<string, unknown>;
};
