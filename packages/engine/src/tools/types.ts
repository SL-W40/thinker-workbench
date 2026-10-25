/**
 * 工具规格与执行结果类型。
 * ToolSpec 是注册表里的完整条目；DefineToolInput 是 defineTool 的友好入参。
 */

import type {
  ChatPlanUpdateHint,
  ChatTimelineResultPathKind,
  ChatTodo,
} from "@thinker-workbench/shared";

/** 给 C 端时间线用的结构化附件（不替代 output 进模型上下文）。 */
export type ToolUiPayload = {
  taskId?: string;
  path?: string;
  /** unified diff 文本 */
  diff?: string;
  /** `delete_file` 删前缓存的正文，供 UI 恢复（不进模型 output）。 */
  restoreContent?: string;
  /** shell 会话 id。 */
  sessionId?: string;
  /** shell 命令。 */
  command?: string;
  exitCode?: number | null;
  /** 兼容：outcome === still_running。 */
  backgrounded?: boolean;
  outcome?: "complete" | "still_running";
  wakeReason?: "exit" | "timeout" | "pattern" | "background";
  outputPath?: string;
  execMode?: "login" | "direct";
  resultPaths?: string[];
  resultPathKinds?: ChatTimelineResultPathKind[];
  /** 以 image_ref 进入模型上下文的图片（视觉模型可见；如 computer_screenshot）。 */
  modelImages?: string[];
  /** `todo`：本次调用后的待办快照（供时间线卡片定格展示）。 */
  todos?: ChatTodo[];
  /** `todo`：相对调用前新增的条目 id。 */
  todoAdded?: string[];
  /** `todo`：相对调用前被删除的条目 id。 */
  todoRemoved?: string[];
  /** `update_plan`：这次更新改了哪几步（时间线一行展示）。 */
  planUpdate?: ChatPlanUpdateHint;
};

/** 工具执行结果：ok 表示业务成功，output 始终是给模型看的文本。 */
export type ToolResult = {
  ok: boolean;
  output: string;
  ui?: ToolUiPayload;
};

/** execute 可只返回字符串，或附带 UI 载荷；`ok: false` 表示业务失败（仍可带 ui）。 */
export type ToolExecuteResult = string | { output: string; ui?: ToolUiPayload; ok?: boolean };

/** 执行时注入的上下文（工作区根 + 取消信号）。 */
export type ToolContext = {
  workspaceRoot: string;
  signal: AbortSignal;
  /** 与模型 tool_call.id 对齐（Task 预告等）。 */
  callId?: string;
};

export type ToolParamType = "string" | "number" | "boolean";

/** 单个参数属性（轻量 JSON Schema 子集）。 */
export type ToolParamProperty = {
  type: ToolParamType;
  description: string;
  default?: string | number | boolean;
};

/**
 * 发给模型的 tools[].function.parameters 形状。
 * 刻意保持简单，避免完整 JSON Schema 复杂度。
 */
export type ToolParameters = {
  type: "object";
  properties: Record<string, ToolParamProperty>;
  required?: string[];
};

/** 解析后的工具参数对象。 */
export type ToolArgs = Record<string, unknown>;

/**
 * 发给模型的 parameters。
 * 内置工具多用轻量 ToolParameters；需要数组 / 嵌套对象时可用完整 JSON Schema。
 */
export type ToolParametersSchema = ToolParameters | Record<string, unknown>;

/** 工具分组；MCP 工具统一归入 "mcp"。 */
export type ToolGroup = "file" | "shell" | "browser" | "task" | "plan" | "meta" | "git" | "mcp";

/** 注册表中的工具规格。 */
export type ToolSpec = {
  name: string;
  description: string;
  parameters: ToolParametersSchema;
  run: (args: ToolArgs, ctx: ToolContext) => Promise<ToolResult>;
  /**
   * 分组标签。当前只用于延迟层的诊断与统计，
   * 不参与过滤（过滤仍走 chatMode.ts 的名单，避免两处规则不同步）。
   */
  group?: ToolGroup;
  /**
   * 是否允许延迟加载：延迟模式下只暴露索引，命中后才展开完整 parameters。
   * 缺省 false —— 内置工具一律常驻；仅 MCP 工具置 true。
   */
  deferrable?: boolean;
};

/** defineTool 入参：execute 只返回成功字符串，异常由包装层变成 ok:false。 */
export type DefineToolInput = {
  name: string;
  description: string;
  parameters: ToolParametersSchema;
  execute: (args: ToolArgs, ctx: ToolContext) => Promise<ToolExecuteResult>;
};
