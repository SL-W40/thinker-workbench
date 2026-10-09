/**
 * 把 ToolSpec 转成模型 API 需要的 ChatToolDefinition。
 * agent 节点通过 listChatTools() 把当前可用工具 schema 塞进请求。
 */
import type { ChatToolDefinition } from "../model/types";
import {
  getAllowAiBrowser,
  getAllowAiDeleteFiles,
  getAllowAiShell,
} from "../workspace";
import { getMcpManager } from "../mcp/McpManager";
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

const BROWSER_TOOL_NAMES = new Set([
  "browser_navigate",
  "browser_lock",
  "browser_snapshot",
  "browser_click",
  "browser_type",
  "browser_fill",
  "browser_press_key",
  "browser_scroll",
  "browser_evaluate",
  "browser_resize",
  "browser_get_styles",
  "browser_screenshot",
]);

/** 当前应对模型暴露的工具（按设置过滤 delete_file / shell / browser）。 */
export function listChatTools(): ChatToolDefinition[] {
  const allowDelete = getAllowAiDeleteFiles();
  const allowShell = getAllowAiShell();
  const allowBrowser = getAllowAiBrowser();
  const builtin = listTools()
    .filter((spec) => {
      if (spec.name === "delete_file") return allowDelete;
      if (spec.name === "shell" || spec.name === "shell_await") return allowShell;
      if (BROWSER_TOOL_NAMES.has(spec.name)) return allowBrowser;
      return true;
    })
    .map(toChatTool);
  return [...builtin, ...getMcpManager().listChatTools()];
}
