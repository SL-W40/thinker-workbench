/**
 * 把 ToolSpec 转成模型 API 需要的 ChatToolDefinition。
 * agent 节点通过 listChatTools() 把当前可用工具 schema 塞进请求。
 */
import type { ChatToolDefinition } from "../model/types";
import { getAllowAiDeleteFiles } from "../workspace";
import { listTools } from "./registry";
import type { ToolSpec } from "./types";

/** 单个 ToolSpec → OpenAI 兼容 tools[] 条目。 */
export function toChatTool(spec: ToolSpec): ChatToolDefinition {
  return {
    type: "function",
    function: {
      name: spec.name,
      description: spec.description,
      parameters: spec.parameters,
    },
  };
}

/** 当前应对模型暴露的工具（关闭「允许删除」时不含 delete_file）。 */
export function listChatTools(): ChatToolDefinition[] {
  const allowDelete = getAllowAiDeleteFiles();
  return listTools()
    .filter((spec) => spec.name !== "delete_file" || allowDelete)
    .map(toChatTool);
}
