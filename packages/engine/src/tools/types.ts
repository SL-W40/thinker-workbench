/**
 * 工具规格与执行结果类型。
 * ToolSpec 是注册表里的完整条目；DefineToolInput 是 defineTool 的友好入参。
 */

/** 给 C 端时间线用的结构化附件（不替代 output 进模型上下文）。 */
export type ToolUiPayload = {
  path?: string;
  /** unified diff 文本 */
  diff?: string;
  /** `delete_file` 删前缓存的正文，供 UI 恢复（不进模型 output）。 */
  restoreContent?: string;
};

/** 工具执行结果：ok 表示业务成功，output 始终是给模型看的文本。 */
export type ToolResult = {
  ok: boolean;
  output: string;
  ui?: ToolUiPayload;
};

/** execute 可只返回字符串，或附带 UI 载荷。 */
export type ToolExecuteResult = string | { output: string; ui?: ToolUiPayload };

/** 执行时注入的上下文（工作区根 + 取消信号）。 */
export type ToolContext = {
  workspaceRoot: string;
  signal: AbortSignal;
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

/** 注册表中的工具规格。 */
export type ToolSpec = {
  name: string;
  description: string;
  parameters: ToolParameters;
  run: (args: ToolArgs, ctx: ToolContext) => Promise<ToolResult>;
};

/** defineTool 入参：execute 只返回成功字符串，异常由包装层变成 ok:false。 */
export type DefineToolInput = {
  name: string;
  description: string;
  parameters: ToolParameters;
  execute: (args: ToolArgs, ctx: ToolContext) => Promise<ToolExecuteResult>;
};
