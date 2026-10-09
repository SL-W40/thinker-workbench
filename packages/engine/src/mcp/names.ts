/**
 * MCP 工具命名：mcp__{serverId}__{toolName}
 */

const SAFE = /[^a-zA-Z0-9_-]+/g;

/** 清洗 server / tool 标识。 */
export function sanitizeMcpPart(raw: string): string {
  const cleaned = String(raw ?? "")
    .trim()
    .replace(SAFE, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "x";
}

/** 组装模型可见工具名。 */
export function mcpToolName(serverId: string, toolName: string): string {
  return `mcp__${sanitizeMcpPart(serverId)}__${sanitizeMcpPart(toolName)}`;
}

/** 解析模型工具名；非 MCP 返回 null。 */
export function parseMcpToolName(
  name: string,
): { serverId: string; toolName: string } | null {
  const m = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(name);
  // 更稳妥：按前缀拆两段
  if (!name.startsWith("mcp__")) return null;
  const rest = name.slice("mcp__".length);
  const sep = rest.indexOf("__");
  if (sep <= 0) return null;
  return {
    serverId: rest.slice(0, sep),
    toolName: rest.slice(sep + 2),
  };
}

/** 是否 MCP 工具名。 */
export function isMcpToolName(name: string): boolean {
  return parseMcpToolName(name) != null;
}
