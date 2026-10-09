/**
 * 会话上下文占用（Context Usage）类型。
 * 与 engine `assembleContext` 分段对齐，供 IPC / UI 展示。
 */

/** 上下文分段 id（与组装顺序一致）。 */
export type ContextUsageSegmentId =
  | "system"
  | "tools"
  | "rules"
  | "skills"
  | "contextFiles"
  | "conversation";

/** 单个分段的估算用量。 */
export type ContextUsageSegment = {
  id: ContextUsageSegmentId;
  /** 估算 token 数（chars/4）。 */
  tokens: number;
};

/** 一次组装的上下文占用快照。 */
export type ContextUsageSnapshot = {
  /** 上下文窗口上限（token）。 */
  limit: number;
  /** 各分段之和。 */
  used: number;
  segments: ContextUsageSegment[];
};

/** 默认上下文窗口（未配置 model.contextWindow 时）。 */
export const DEFAULT_CONTEXT_WINDOW = 128_000;

/** renderer → main：估算当前会话上下文占用。 */
export type ContextUsageRequest = {
  /**
   * 即将 / 已经发给模型的对话轮次（user / assistant / tool 正文）。
   * 可含输入框草稿作为最后一条 user，便于预览。
   */
  messages?: Array<{
    role: "user" | "assistant" | "tool" | "system";
    content: string;
  }>;
  /** 工作区根；省略则用 agent 当前已配置根。 */
  workspaceRoot?: string;
  /** `@` 选中的工作区相对路径（与 AgentRunCommand.contextPaths 同源）。 */
  contextPaths?: string[];
};

/** 空快照（utility 未就绪等）。 */
export function emptyContextUsageSnapshot(
  limit: number = DEFAULT_CONTEXT_WINDOW,
): ContextUsageSnapshot {
  return {
    limit,
    used: 0,
    segments: [
      { id: "system", tokens: 0 },
      { id: "tools", tokens: 0 },
      { id: "rules", tokens: 0 },
      { id: "skills", tokens: 0 },
      { id: "contextFiles", tokens: 0 },
      { id: "conversation", tokens: 0 },
    ],
  };
}
