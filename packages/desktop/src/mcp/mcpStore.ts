/**
 * MCP 配置落盘：user 在 `{dataDir}/mcps`，workspace 在 `<root>/.thinker/mcps`。
 */
import fs from "node:fs";
import path from "node:path";
import type {
  CustomizeScope,
  McpImportConflict,
  McpServerConfig,
  McpServerUpsertInput,
} from "@thinker-workbench/shared";
import { customizeScopeKey, normalizeCustomizeScope } from "@thinker-workbench/shared";
import { ensureDir, resolveWritableRoot } from "../customize/paths";
import { listWorkspaces } from "../db/workspacesStore";

function sanitizeId(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "server";
}

function scopeOf(raw?: CustomizeScope | null): CustomizeScope {
  return normalizeCustomizeScope(raw ?? { kind: "user" });
}

function dirFor(scope: CustomizeScope): string {
  return resolveWritableRoot(scope, "mcps");
}

function filePath(scope: CustomizeScope, id: string): string {
  return path.join(dirFor(scope), `${sanitizeId(id)}.json`);
}

function readStringMap(raw: unknown): Record<string, string> {
  const env: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return env;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") env[k] = v;
    else if (v != null) env[k] = String(v);
  }
  return env;
}

function normalizeConfig(
  raw: unknown,
  fallbackId: string,
  scope: CustomizeScope,
): McpServerConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = sanitizeId(typeof o.id === "string" ? o.id : fallbackId);
  const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : id;
  const enabled = o.enabled !== false;
  const base = { id, name, enabled, scope, writable: true as const };
  if (o.transport === "http" || (typeof o.url === "string" && o.url.trim() && !o.command)) {
    const url = typeof o.url === "string" ? o.url.trim() : "";
    if (!url) return null;
    return { ...base, transport: "http", url, headers: readStringMap(o.headers) };
  }
  const command = typeof o.command === "string" ? o.command.trim() : "";
  if (!command) return null;
  const args = Array.isArray(o.args) ? o.args.map((a) => String(a)) : [];
  return {
    ...base,
    transport: "stdio",
    command,
    args,
    env: readStringMap(o.env),
    cwd: typeof o.cwd === "string" && o.cwd.trim() ? o.cwd.trim() : null,
  };
}

function readScope(scope: CustomizeScope): McpServerConfig[] {
  const dir = dirFor(scope);
  // 只读：目录不存在时不要 mkdir，否则启动 list 会污染每个工作区根
  if (!fs.existsSync(dir)) return [];
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: McpServerConfig[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as unknown;
      const cfg = normalizeConfig(raw, path.basename(name, ".json"), scope);
      if (cfg) out.push(cfg);
    } catch {
      /* 跳过坏文件 */
    }
  }
  return out;
}

function workspaceScopeForRoot(workspaceRoot?: string | null): CustomizeScope | null {
  if (!workspaceRoot?.trim()) return null;
  const resolved = path.resolve(workspaceRoot);
  const ws = listWorkspaces().find((item) => path.resolve(item.rootPath) === resolved);
  return ws ? { kind: "workspace", workspaceId: ws.id } : null;
}

/** 列出 user，以及指定工作区（省略则全部工作区）下的配置。 */
export function listMcpConfigs(workspaceRoot?: string | null): McpServerConfig[] {
  const out = readScope({ kind: "user" });
  if (workspaceRoot === undefined) {
    for (const ws of listWorkspaces()) {
      out.push(...readScope({ kind: "workspace", workspaceId: ws.id }));
    }
  } else {
    const scope = workspaceScopeForRoot(workspaceRoot);
    if (scope) out.push(...readScope(scope));
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** 启用中的配置（stdio 与 http），供 engine 重载。 */
export function listEnabledMcpConfigs(): McpServerConfig[] {
  return listMcpConfigs().filter((c) => c.enabled);
}

function persist(scope: CustomizeScope, cfg: McpServerConfig): void {
  const stored = { ...cfg };
  delete stored.scope;
  delete stored.writable;
  ensureDir(dirFor(scope));
  fs.writeFileSync(filePath(scope, cfg.id), `${JSON.stringify(stored, null, 2)}\n`, "utf8");
}

/** 写入 / 更新。stdio 要 command，http 要 url。 */
export function upsertMcpConfig(input: McpServerUpsertInput): McpServerConfig {
  const scope = scopeOf(input.scope);
  const id = sanitizeId(input.id);
  const existing = readScope(scope).find((c) => c.id === id);
  const name = (input.name?.trim() || existing?.name || id).trim();
  const enabled = input.enabled ?? existing?.enabled ?? true;
  let next: McpServerConfig;
  if (input.transport === "http") {
    const url = input.url.trim();
    if (!url) throw new Error("MCP url is required.");
    next = {
      id,
      name,
      enabled,
      scope,
      writable: true,
      transport: "http",
      url,
      headers: input.headers ?? (existing?.transport === "http" ? existing.headers : {}) ?? {},
    };
  } else {
    const command = input.command.trim();
    if (!command) throw new Error("MCP command is required.");
    const prev = existing?.transport === "stdio" ? existing : null;
    next = {
      id,
      name,
      enabled,
      scope,
      writable: true,
      transport: "stdio",
      command,
      args: input.args ?? prev?.args ?? [],
      env: input.env ?? prev?.env ?? {},
      cwd: input.cwd !== undefined ? input.cwd?.trim() || null : (prev?.cwd ?? null),
    };
  }
  persist(scope, next);
  return next;
}

/** 删除配置文件。 */
export function removeMcpConfig(id: string, scope?: CustomizeScope): void {
  const abs = filePath(scopeOf(scope), id);
  try {
    fs.unlinkSync(abs);
  } catch {
    /* ignore */
  }
}

/** 切换启用。 */
export function setMcpEnabled(
  id: string,
  enabled: boolean,
  scope?: CustomizeScope,
): McpServerConfig {
  const resolved = scopeOf(scope);
  const cur = readScope(resolved).find((c) => c.id === sanitizeId(id));
  if (!cur) throw new Error(`MCP server not found: ${id}`);
  if (cur.transport === "http") {
    return upsertMcpConfig({ ...cur, enabled, scope: resolved, transport: "http" });
  }
  return upsertMcpConfig({ ...cur, enabled, scope: resolved, transport: "stdio" });
}

function importOne(
  id: string,
  value: Record<string, unknown>,
  scope: CustomizeScope,
): McpServerUpsertInput | null {
  if (value.transport === "http" || (typeof value.url === "string" && value.url.trim())) {
    const url = typeof value.url === "string" ? value.url.trim() : "";
    if (!url) return null;
    return {
      id,
      name: id,
      enabled: true,
      transport: "http",
      url,
      headers: readStringMap(value.headers),
      scope,
    };
  }
  const command = typeof value.command === "string" ? value.command.trim() : "";
  if (!command) return null;
  return {
    id,
    name: id,
    enabled: true,
    transport: "stdio",
    command,
    args: Array.isArray(value.args) ? value.args.map((a) => String(a)) : [],
    env: readStringMap(value.env),
    cwd: typeof value.cwd === "string" ? value.cwd : null,
    scope,
  };
}

/**
 * 从 `mcp.json`（`{ mcpServers: { id: config } }`）导入到指定作用域。
 */
export function importMcpJsonFile(
  filePath: string,
  conflict: McpImportConflict = "skip",
  scope?: CustomizeScope,
): { imported: string[]; skipped: string[] } {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  if (!raw || typeof raw !== "object") throw new Error("Invalid mcp.json");
  const map = (raw as { mcpServers?: unknown }).mcpServers;
  if (!map || typeof map !== "object") throw new Error("mcp.json missing mcpServers");
  const resolved = scopeOf(scope);
  const existing = new Set(readScope(resolved).map((c) => c.id));
  const imported: string[] = [];
  const skipped: string[] = [];
  for (const [key, value] of Object.entries(map as Record<string, unknown>)) {
    const id = sanitizeId(key);
    if (existing.has(id) && conflict !== "overwrite") {
      skipped.push(id);
      continue;
    }
    if (!value || typeof value !== "object") {
      skipped.push(id);
      continue;
    }
    const input = importOne(id, value as Record<string, unknown>, resolved);
    if (!input) {
      skipped.push(id);
      continue;
    }
    upsertMcpConfig(input);
    imported.push(id);
    existing.add(id);
  }
  return { imported, skipped };
}

/** 把一个作用域导出成 mcp.json 对象。 */
export function exportMcpServers(scope?: CustomizeScope): Record<string, unknown> {
  const resolved = scopeOf(scope);
  const servers: Record<string, unknown> = {};
  for (const cfg of readScope(resolved)) {
    if (cfg.transport === "http") {
      servers[cfg.id] = { transport: "http", url: cfg.url, headers: cfg.headers ?? {} };
    } else {
      servers[cfg.id] = {
        transport: "stdio",
        command: cfg.command,
        args: cfg.args,
        env: cfg.env,
        cwd: cfg.cwd ?? null,
      };
    }
  }
  return { mcpServers: servers };
}

/** 作用域稳定键，供测试断言。 */
export function mcpScopeKey(scope?: CustomizeScope): string {
  return customizeScopeKey(scopeOf(scope));
}
