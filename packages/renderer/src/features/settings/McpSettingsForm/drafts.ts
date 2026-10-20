/**
 * MCP 设置表单：草稿类型与纯映射。
 */
import type {
  CustomizeScope,
  McpImportConflict,
  McpServerConfig,
  McpServerRuntimeStatus,
  McpServerUpsertInput,
  McpTransport,
} from "@thinker-workbench/shared";

/** 去掉 mcp_ / mcp__ 服务前缀，卡片上只留工具短名。*/
export function shortToolLabel(toolName: string, serverId: string): string {
  const id = serverId.trim();
  if (id) {
    for (const prefixed of [`mcp__${id}__`, `mcp_${id}_`, `${id}__`, `${id}_`]) {
      if (toolName.startsWith(prefixed)) return toolName.slice(prefixed.length);
    }
  }
  const m = /^mcp_{1,2}[^_]+_{1,2}(.+)$/.exec(toolName);
  return m?.[1] || toolName;
}

export type ToolInfo = NonNullable<McpServerRuntimeStatus["tools"]>[number];

export type Draft = {
  id: string;
  name: string;
  transport: McpTransport;
  command: string;
  argsText: string;
  envText: string;
  cwd: string;
  url: string;
  headersText: string;
  enabled: boolean;
};

export function emptyDraft(): Draft {
  return {
    id: "",
    name: "",
    transport: "stdio",
    command: "",
    argsText: "",
    envText: "",
    cwd: "",
    url: "",
    headersText: "",
    enabled: true,
  };
}

export function draftFromConfig(c: McpServerConfig): Draft {
  if (c.transport === "http") {
    return {
      id: c.id,
      name: c.name,
      transport: "http",
      command: "",
      argsText: "",
      envText: "",
      cwd: "",
      url: c.url,
      headersText: Object.entries(c.headers ?? {})
        .map(([k, v]) => `${k}=${v}`)
        .join("\n"),
      enabled: c.enabled,
    };
  }
  return {
    id: c.id,
    name: c.name,
    transport: "stdio",
    command: c.command,
    argsText: c.args.join("\n"),
    envText: Object.entries(c.env)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n"),
    cwd: c.cwd ?? "",
    url: "",
    headersText: "",
    enabled: c.enabled,
  };
}

/** 解析 `K=V` 多行文本；空行与 # 注释跳过。 */
export function parseKv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1);
  }
  return env;
}

export function toUpsert(d: Draft, scope: CustomizeScope): McpServerUpsertInput {
  const base = {
    id: d.id.trim() || "server",
    name: d.name.trim() || d.id.trim() || "server",
    enabled: d.enabled,
    scope,
  };
  if (d.transport === "http") {
    return {
      ...base,
      transport: "http",
      url: d.url.trim(),
      headers: parseKv(d.headersText),
    };
  }
  return {
    ...base,
    transport: "stdio",
    command: d.command.trim(),
    args: d.argsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean),
    env: parseKv(d.envText),
    cwd: d.cwd.trim() || null,
  };
}

export function statusVariant(
  state: McpServerRuntimeStatus["state"] | undefined,
): "neutral" | "success" | "danger" | "accent" {
  if (state === "ready") return "success";
  if (state === "error") return "danger";
  if (state === "starting") return "accent";
  return "neutral";
}

export function sameScope(a: CustomizeScope | undefined, b: CustomizeScope): boolean {
  if (!a) return b.kind === "user";
  if (a.kind !== b.kind) return false;
  if (a.kind === "user") return true;
  return a.workspaceId === (b as { workspaceId: string }).workspaceId;
}

export type { McpImportConflict };
