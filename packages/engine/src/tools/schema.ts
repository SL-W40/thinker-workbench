/**
 * 把 ToolSpec 转成模型 API 需要的 ChatToolDefinition。
 * agent 节点通过 listChatTools() 把当前可用工具 schema 塞进请求。
 *
 * MCP 工具在超阈值时切换为延迟加载：只把索引文本放进 system 段，
 * 完整 parameters 等模型调 tool_search 命中后再展开（见 ./deferral）。
 */

import type { ChatMode } from "@thinker-workbench/shared";
import { getChatMode, isToolAllowedForChatMode } from "../chatMode";
import { getMcpManager } from "../mcp/McpManager";
import type { ChatToolDefinition } from "../model/types";
import { getAllowAiBrowser, getAllowAiDeleteFiles, getAllowAiShell } from "../workspace";
import { getOrBuildToolsBundle } from "./cache";
import { buildMcpCatalog, expandMcpTools, shouldDeferMcpTools } from "./deferral";
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

/** 一次请求的工具装配结果（含序列化副本，供用量统计与请求体共用）。 */
export type ChatToolsBundle = {
  /** 实际进 body.tools 的工具定义。 */
  tools: ChatToolDefinition[];
  /** 延迟模式下的 MCP 索引文本；非延迟模式为空串（调用方据此决定是否生成 system section）。 */
  catalog: string;
  /** 本次是否走了延迟加载。 */
  deferred: boolean;
  /** tools 的序列化副本；由 ./cache 填充，避免每轮重复 stringify。 */
  json: string;
};

/**
 * 当前应对模型暴露的工具（按设置与 ChatMode 过滤）。
 *
 * 内置工具始终全量；MCP 工具在超阈值时只回索引，命中项由 `loadedToolNames` 展开。
 * 结果按「ChatMode / 只读 / Task / MCP 指纹 / 已装载集合」缓存（见 ./cache）。
 * @param options.loadedToolNames 本 run 已通过 tool_search 装载的 MCP 工具名
 * @param options.contextWindow 上下文窗口，用于按比例收紧延迟阈值
 */
export function listChatTools(options?: {
  childReadonly?: boolean;
  allowTask?: boolean;
  chatMode?: ChatMode;
  loadedToolNames?: readonly string[];
  contextWindow?: number;
}): ChatToolsBundle {
  const mode = options?.chatMode ?? getChatMode();
  const loadedToolNames = options?.loadedToolNames ?? [];
  return getOrBuildToolsBundle(
    {
      chatMode: mode,
      childReadonly: Boolean(options?.childReadonly),
      allowTask: options?.allowTask !== false,
      allowShell: getAllowAiShell(),
      allowDelete: getAllowAiDeleteFiles(),
      allowBrowser: getAllowAiBrowser(),
      mcpFingerprint: getMcpManager().toolsFingerprint(),
      loadedToolNames,
    },
    () => buildToolsBundle({ ...options, chatMode: mode, loadedToolNames }),
  );
}

/** 实际拼装工具数组（无缓存；供 getOrBuildToolsBundle 调用）。 */
function buildToolsBundle(options?: {
  childReadonly?: boolean;
  allowTask?: boolean;
  chatMode?: ChatMode;
  loadedToolNames?: readonly string[];
  contextWindow?: number;
}): Omit<ChatToolsBundle, "json"> {
  const allowDelete = getAllowAiDeleteFiles();
  const allowShell = getAllowAiShell();
  const allowBrowser = getAllowAiBrowser();
  const modeOpts = {
    childReadonly: options?.childReadonly,
    allowTask: options?.allowTask,
    chatMode: options?.chatMode,
  };
  const builtin = listTools()
    .filter((spec) => {
      if (!isToolAllowedForChatMode(spec.name, modeOpts)) return false;
      if (spec.name === "delete_file") return allowDelete;
      if (spec.name === "shell" || spec.name === "shell_await" || spec.name === "shell_write") {
        return allowShell;
      }
      if (BROWSER_TOOL_NAMES.has(spec.name)) return allowBrowser;
      return true;
    })
    .map(toChatTool);
  const mcp = getMcpManager()
    .listChatTools()
    .filter((t) => isToolAllowedForChatMode(t.function.name, modeOpts));

  // 延迟模式：MCP 只留索引，已装载的才带完整 schema（tool_search 始终常驻）
  if (shouldDeferMcpTools(mcp, options?.contextWindow)) {
    return {
      tools: [...builtin, ...expandMcpTools(mcp, options?.loadedToolNames)],
      catalog: buildMcpCatalog(mcp),
      deferred: true,
    };
  }

  return { tools: [...builtin, ...mcp], catalog: "", deferred: false };
}
