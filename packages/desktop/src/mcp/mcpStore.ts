/**
 * MCP 配置落盘：`{dataDir}/mcps/{id}.json`。
 */
import fs from "node:fs";
import path from "node:path";
import type {
  McpServerConfig,
  McpServerUpsertInput,
  McpTransport,
} from "@thinker-workbench/shared";
import { getDataDir } from "../config/paths";

function sanitizeId(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "server";
}

/** MCP 配置目录。 */
export function getMcpsDir(): string {
  return path.join(getDataDir(), "mcps");
}

/** 确保目录存在。 */
export function ensureMcpsDir(): string {
  const dir = getMcpsDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function filePathForId(id: string): string {
  return path.join(getMcpsDir(), `${sanitizeId(id)}.json`);
}

function normalizeConfig(raw: unknown, fallbackId: string): McpServerConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = sanitizeId(typeof o.id === "string" ? o.id : fallbackId);
  const command = typeof o.command === "string" ? o.command.trim() : "";
  if (!command) return null;
  const transport: McpTransport =
    o.transport === "stdio" || !o.transport ? "stdio" : "stdio";
  const args = Array.isArray(o.args)
    ? o.args.map((a) => String(a))
    : [];
  const env: Record<string, string> = {};
  if (o.env && typeof o.env === "object" && !Array.isArray(o.env)) {
    for (const [k, v] of Object.entries(o.env as Record<string, unknown>)) {
      if (typeof v === "string") env[k] = v;
      else if (v != null) env[k] = String(v);
    }
  }
  return {
    id,
    name: typeof o.name === "string" && o.name.trim() ? o.name.trim() : id,
    enabled: o.enabled !== false,
    transport,
    command,
    args,
    env,
    cwd: typeof o.cwd === "string" && o.cwd.trim() ? o.cwd.trim() : null,
  };
}

/** 列出全部已保存配置。 */
export function listMcpConfigs(): McpServerConfig[] {
  const dir = ensureMcpsDir();
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: McpServerConfig[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const abs = path.join(dir, name);
    try {
      const raw = JSON.parse(fs.readFileSync(abs, "utf8")) as unknown;
      const cfg = normalizeConfig(raw, path.basename(name, ".json"));
      if (cfg) out.push(cfg);
    } catch {
      /* skip bad file */
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** 仅启用且 transport=stdio 的快照（下发给 engine）。 */
export function listEnabledMcpConfigs(): McpServerConfig[] {
  return listMcpConfigs().filter((c) => c.enabled && c.transport === "stdio");
}

/** 写入 / 更新。 */
export function upsertMcpConfig(input: McpServerUpsertInput): McpServerConfig {
  ensureMcpsDir();
  const id = sanitizeId(input.id);
  const existing = listMcpConfigs().find((c) => c.id === id);
  const next: McpServerConfig = {
    id,
    name: (input.name?.trim() || existing?.name || id).trim(),
    enabled: input.enabled ?? existing?.enabled ?? true,
    transport: "stdio",
    command: input.command.trim(),
    args: input.args ?? existing?.args ?? [],
    env: input.env ?? existing?.env ?? {},
    cwd:
      input.cwd !== undefined
        ? input.cwd?.trim() || null
        : (existing?.cwd ?? null),
  };
  if (!next.command) throw new Error("MCP command is required.");
  fs.writeFileSync(filePathForId(id), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

/** 删除配置文件。 */
export function removeMcpConfig(id: string): void {
  const abs = filePathForId(id);
  try {
    fs.unlinkSync(abs);
  } catch {
    /* ignore */
  }
}

/** 切换启用。 */
export function setMcpEnabled(id: string, enabled: boolean): McpServerConfig {
  const cur = listMcpConfigs().find((c) => c.id === sanitizeId(id));
  if (!cur) throw new Error(`MCP server not found: ${id}`);
  return upsertMcpConfig({ ...cur, enabled });
}

/**
 * 从 Cursor `mcp.json`（`{ mcpServers: { id: { command, args, env } } }`）导入。
 * 冲突跳过（不覆盖）。
 */
export function importCursorMcpJson(filePath: string): {
  imported: string[];
  skipped: string[];
} {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid mcp.json");
  }
  const map = (raw as { mcpServers?: unknown }).mcpServers;
  if (!map || typeof map !== "object") {
    throw new Error("mcp.json missing mcpServers");
  }
  const existing = new Set(listMcpConfigs().map((c) => c.id));
  const imported: string[] = [];
  const skipped: string[] = [];
  for (const [key, value] of Object.entries(map as Record<string, unknown>)) {
    const id = sanitizeId(key);
    if (existing.has(id)) {
      skipped.push(id);
      continue;
    }
    if (!value || typeof value !== "object") {
      skipped.push(id);
      continue;
    }
    const v = value as Record<string, unknown>;
    const command = typeof v.command === "string" ? v.command.trim() : "";
    if (!command) {
      skipped.push(id);
      continue;
    }
    upsertMcpConfig({
      id,
      name: id,
      enabled: true,
      command,
      args: Array.isArray(v.args) ? v.args.map((a) => String(a)) : [],
      env:
        v.env && typeof v.env === "object" && !Array.isArray(v.env)
          ? Object.fromEntries(
              Object.entries(v.env as Record<string, unknown>).map(([k, val]) => [
                k,
                String(val ?? ""),
              ]),
            )
          : {},
      cwd: typeof v.cwd === "string" ? v.cwd : null,
    });
    imported.push(id);
    existing.add(id);
  }
  return { imported, skipped };
}
