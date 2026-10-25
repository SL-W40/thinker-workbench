/**
 * tools schema 跨轮缓存。
 *
 * assembleContext 每个 superstep 都会调 listChatTools，而工具集合只随
 * ChatMode / 子代理只读 / Task 开关 / MCP 配置 / 已装载工具名变化。
 * 这里按这些维度做键，命中则复用同一份数组与序列化副本，省掉重复拼装
 * 以及「用量统计一次 + 请求体一次」的双重 stringify。
 *
 * MCP 热重载会改变指纹，因此自动失效，无需外部干预。
 */
import type { ChatMode } from "@thinker-workbench/shared";
import type { ChatToolDefinition } from "../model/types";

/** 缓存条目上限；超出整体清空，避免长会话下键无限累积。 */
const MAX_CACHE_ENTRIES = 64;

/** 一次请求的工具装配结果。 */
export type ToolsBundle = {
  tools: ChatToolDefinition[];
  /** 延迟模式下的 MCP 索引文本；非延迟模式为空串（调用方据此决定是否生成 system section）。 */
  catalog: string;
  deferred: boolean;
  /** tools 的序列化副本，用量统计与调用方共用。 */
  json: string;
};

/** 缓存键的全部输入维度。 */
export type ToolsCacheKeyInput = {
  chatMode: ChatMode;
  childReadonly: boolean;
  allowTask: boolean;
  allowShell: boolean;
  allowDelete: boolean;
  allowBrowser: boolean;
  /** MCP 工具集合指纹（见 McpManager.toolsFingerprint）。 */
  mcpFingerprint: string;
  loadedToolNames: readonly string[];
};

const cache = new Map<string, ToolsBundle>();

/** 键覆盖全部影响工具集合的维度，避免不同配置互相串味。 */
function cacheKey(input: ToolsCacheKeyInput): string {
  const loaded = [
    ...new Set(input.loadedToolNames.map((name) => name.trim()).filter(Boolean)),
  ].sort();
  return [
    input.chatMode,
    input.childReadonly ? "ro" : "rw",
    input.allowTask ? "task" : "notask",
    input.allowShell ? "sh" : "nosh",
    input.allowDelete ? "del" : "nodel",
    input.allowBrowser ? "br" : "nobr",
    input.mcpFingerprint,
    loaded.join(","),
  ].join("::");
}

/**
 * 取缓存或构建工具装配结果。
 * 返回的是缓存里的同一份数组引用，调用方请勿原地修改。
 */
export function getOrBuildToolsBundle(
  input: ToolsCacheKeyInput,
  build: () => Omit<ToolsBundle, "json">,
): ToolsBundle {
  const key = cacheKey(input);
  const hit = cache.get(key);
  if (hit) return hit;

  // 键随「MCP 配置 × 已装载集合」增长，超上限直接整体清空（最简且无淘汰歧义）
  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();

  const built = build();
  const bundle: ToolsBundle = { ...built, json: JSON.stringify(built.tools) };
  cache.set(key, bundle);
  return bundle;
}

/** 清空缓存（设置变更 / MCP 热重载后调用）。 */
export function invalidateToolsCache(): void {
  cache.clear();
}
