/**
 * MCP stdio 客户端管理：连接、列工具、调用、热重载。
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import type {
  McpServerConfig,
  McpServerRuntimeStatus,
  McpToolSummary,
} from "@thinker-workbench/shared";
import { agentLog } from "../log/setup";
import type { ChatToolDefinition } from "../model/types";
import type { ToolArgs, ToolResult } from "../tools/types";
import { mcpToolName, parseMcpToolName, sanitizeMcpPart } from "./names";
import { normalizeMcpParameters } from "./schemaMap";

const CONNECT_TIMEOUT_MS = 15_000;
const CALL_TIMEOUT_MS = 60_000;
const MAX_TOOLS_PER_SERVER = 64;
const MAX_TOOLS_TOTAL = 128;

type ServerSession = {
  config: McpServerConfig;
  client: Client;
  transport: StdioClientTransport;
  tools: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    remoteName: string;
  }>;
};

type StatusListener = (status: McpServerRuntimeStatus) => void;

/** 解析 Windows 下 npx 可执行名。 */
function resolveCommand(command: string): string {
  const c = command.trim();
  if (process.platform === "win32" && (c === "npx" || c === "npm" || c === "node")) {
    return `${c}.cmd`;
  }
  return c;
}

function configKey(c: McpServerConfig): string {
  return JSON.stringify({
    id: c.id,
    command: c.command,
    args: c.args,
    env: c.env,
    cwd: c.cwd ?? null,
  });
}

/** 全局单例 MCP 管理器。 */
export class McpManager {
  private sessions = new Map<string, ServerSession>();
  private lastKeys = new Map<string, string>();
  private listener: StatusListener | null = null;

  setStatusListener(listener: StatusListener | null): void {
    this.listener = listener;
  }

  private emitStatus(status: McpServerRuntimeStatus): void {
    this.listener?.(status);
  }

  /** 按快照重载（仅 enabled + stdio）。 */
  async reload(configs: McpServerConfig[]): Promise<void> {
    const enabled = configs.filter((c) => c.enabled && c.transport === "stdio");
    const wantIds = new Set(enabled.map((c) => sanitizeMcpPart(c.id)));

    for (const id of [...this.sessions.keys()]) {
      if (!wantIds.has(id)) {
        await this.stopOne(id);
      }
    }

    for (const cfg of enabled) {
      const id = sanitizeMcpPart(cfg.id);
      const key = configKey({ ...cfg, id });
      const prev = this.lastKeys.get(id);
      if (prev === key && this.sessions.has(id)) continue;
      await this.stopOne(id);
      await this.startOne({ ...cfg, id });
    }
  }

  async stopAll(): Promise<void> {
    for (const id of [...this.sessions.keys()]) {
      await this.stopOne(id);
    }
  }

  private async stopOne(id: string): Promise<void> {
    const s = this.sessions.get(id);
    this.sessions.delete(id);
    this.lastKeys.delete(id);
    if (!s) {
      this.emitStatus({ id, state: "stopped" });
      return;
    }
    try {
      await s.client.close();
    } catch {
      /* ignore */
    }
    try {
      await s.transport.close();
    } catch {
      /* ignore */
    }
    this.emitStatus({ id, state: "stopped" });
  }

  private async startOne(cfg: McpServerConfig): Promise<void> {
    const id = sanitizeMcpPart(cfg.id);
    this.emitStatus({ id, state: "starting" });
    const log = agentLog("mcp");
    const command = resolveCommand(cfg.command);
    const env = { ...getDefaultEnvironment(), ...cfg.env };
    const transport = new StdioClientTransport({
      command,
      args: cfg.args ?? [],
      env,
      cwd: cfg.cwd?.trim() || undefined,
      stderr: "pipe",
    });
    const client = new Client({ name: "thinker-workbench", version: "0.1.0" });

    try {
      await Promise.race([
        client.connect(transport),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("MCP connect timeout")), CONNECT_TIMEOUT_MS),
        ),
      ]);
      const listed = await client.listTools();
      const remoteTools = (listed.tools ?? []).slice(0, MAX_TOOLS_PER_SERVER);
      const tools = remoteTools.map((t) => ({
        name: mcpToolName(id, t.name),
        description: t.description || t.name,
        parameters: normalizeMcpParameters(t.inputSchema),
        remoteName: t.name,
      }));
      this.sessions.set(id, { config: cfg, client, transport, tools });
      this.lastKeys.set(id, configKey(cfg));
      const summaries: McpToolSummary[] = tools.map((t) => ({
        name: t.name,
        description: t.description,
      }));
      this.emitStatus({
        id,
        state: "ready",
        toolCount: tools.length,
        tools: summaries,
      });
      log.info("connected", {
        meta: { id, tools: tools.length, command },
      });
    } catch (err) {
      try {
        await client.close();
      } catch {
        /* ignore */
      }
      try {
        await transport.close();
      } catch {
        /* ignore */
      }
      const error = err instanceof Error ? err.message : String(err);
      this.emitStatus({ id, state: "error", error });
      log.warn("connect failed", { meta: { id, error, command } });
    }
  }

  /** 合并进模型 tools[]（总量封顶）。 */
  listChatTools(): ChatToolDefinition[] {
    const out: ChatToolDefinition[] = [];
    for (const s of this.sessions.values()) {
      for (const t of s.tools) {
        if (out.length >= MAX_TOOLS_TOTAL) return out;
        out.push({
          type: "function",
          function: {
            name: t.name,
            description: `[MCP:${s.config.id}] ${t.description}`,
            parameters: t.parameters as ChatToolDefinition["function"]["parameters"],
          },
        });
      }
    }
    return out;
  }

  /** 调用 MCP 工具。 */
  async callTool(
    name: string,
    args: ToolArgs,
    signal?: AbortSignal,
  ): Promise<ToolResult | null> {
    const parsed = parseMcpToolName(name);
    if (!parsed) return null;
    const session = this.sessions.get(parsed.serverId);
    if (!session) {
      return { ok: false, output: `MCP server not connected: ${parsed.serverId}` };
    }
    const tool = session.tools.find(
      (t) => t.name === name || t.remoteName === parsed.toolName,
    );
    const remoteName = tool?.remoteName ?? parsed.toolName;
    if (signal?.aborted) {
      return { ok: false, output: "Cancelled." };
    }
    try {
      const result = await Promise.race([
        session.client.callTool(
          { name: remoteName, arguments: args },
          undefined,
          { signal },
        ),
        new Promise<never>((_, reject) => {
          const timer = setTimeout(
            () => reject(new Error("MCP call timeout")),
            CALL_TIMEOUT_MS,
          );
          signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new Error("Cancelled."));
            },
            { once: true },
          );
        }),
      ]);
      const content = (result as { content?: unknown }).content;
      const isError = Boolean((result as { isError?: boolean }).isError);
      const text = formatMcpContent(content);
      return { ok: !isError, output: text || "(empty MCP result)" };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { ok: false, output: `MCP error: ${error}` };
    }
  }
}

function formatMcpContent(content: unknown): string {
  if (!Array.isArray(content)) {
    if (typeof content === "string") return content;
    try {
      return JSON.stringify(content);
    } catch {
      return String(content ?? "");
    }
  }
  const parts: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const o = item as { type?: string; text?: string };
    if (o.type === "text" && typeof o.text === "string") parts.push(o.text);
    else if (o.type === "image") parts.push("[binary omitted: image]");
    else if (o.type === "resource") parts.push("[resource omitted]");
    else {
      try {
        parts.push(JSON.stringify(item));
      } catch {
        /* skip */
      }
    }
  }
  return parts.join("\n");
}

let singleton: McpManager | null = null;

/** 进程内单例。 */
export function getMcpManager(): McpManager {
  if (!singleton) singleton = new McpManager();
  return singleton;
}
