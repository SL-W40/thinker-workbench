/**
 * 模型层类型：OpenAI 风格的消息 / 工具定义 / ChatModel 接口。
 * 图节点只依赖 ChatModel.chat，不关心具体 HTTP 实现。
 */
import type { ToolParameters } from "../tools/types";

/** Agent 循环用到的聊天角色。 */
export type ChatRole = "system" | "user" | "assistant" | "tool";

/** 模型请求的一次函数工具调用（arguments 为 JSON 字符串）。 */
export type ChatToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

/** 单条对话消息；assistant 可带 tool_calls，tool 须带 tool_call_id。 */
export type ChatMessage = {
  role: ChatRole;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ChatToolCall[];
};

/** 发给 `/chat/completions` 的 tools[] 条目。 */
export type ChatToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    /** 内置工具用轻量 ToolParameters；MCP 可透传完整 JSON Schema object。 */
    parameters: ToolParameters | Record<string, unknown>;
  };
};

/** 一次 chat 请求。 */
export type ChatRequest = {
  /** 对话轮次（system 单独通过 system / 默认提示词施加）。 */
  messages: ChatMessage[];
  tools?: ChatToolDefinition[];
  /** 覆盖默认对话 system prompt。 */
  system?: string;
  /**
   * 若设置，则请求使用 stream: true，并对每个文本 delta 回调。
   * `channel: thinking` 为推理字段；默认 `reply` 为助手正文。
   * tool_call 增量在客户端静默拼装，工具执行时再整段展示 diff。
   */
  onToken?: (text: string, channel?: "reply" | "thinking") => void;
};

/** 单次补全的 token 用量（与 shared ModelUsage 对齐）。 */
export type ChatUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
};

/** chat 完成后的汇总结果。 */
export type ChatCompletionResult = {
  content: string;
  toolCalls: ChatToolCall[];
  /** 网关返回的用量；部分流式端点可能缺失。 */
  usage?: ChatUsage;
};

/** 可注入的模型抽象。 */
export type ChatModel = {
  chat(request: ChatRequest, signal: AbortSignal): Promise<ChatCompletionResult>;
};

/** createOpenAIModel 的配置。 */
export type OpenAIModelOptions = {
  apiKey: string;
  /** OpenAI 兼容 API 根路径，默认 `https://api.openai.com/v1`。 */
  baseUrl?: string;
  /** 聊天模型 id，默认 `gpt-4o-mini`。 */
  model?: string;
};
