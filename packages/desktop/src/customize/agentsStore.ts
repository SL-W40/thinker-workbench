/**
 * Subagents：`agents/*.md` 的列表 / 写入 / 删除 / 复制。
 */
import fs from "node:fs";
import path from "node:path";
import {
  type CustomizeScope,
  type CustomizeSource,
  parseYamlFrontmatter,
  type SubagentDefinition,
  type SubagentListResult,
  type SubagentUpsertInput,
} from "@thinker-workbench/shared";
import { listWorkspaces } from "../db/workspacesStore";
import { metaBool, metaString, sanitizeKebabName, serializeFrontmatter } from "./frontmatter";
import { ensureDir, resolveWritableRoot } from "./paths";

type ScanRoot = {
  root: string;
  scope: CustomizeScope;
  source: CustomizeSource;
  writable: boolean;
};

function filePathFor(scope: CustomizeScope, name: string): string {
  return path.join(resolveWritableRoot(scope, "agents"), `${sanitizeKebabName(name)}.md`);
}

function parseAgentFile(
  absPath: string,
  scope: CustomizeScope,
  source: CustomizeSource,
  writable: boolean,
): SubagentDefinition | null {
  let raw: string;
  try {
    raw = fs.readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
  const base = path.basename(absPath, path.extname(absPath));
  const { data: meta, body } = parseYamlFrontmatter(raw);
  const name = sanitizeKebabName(metaString(meta, "name", base), base);
  return {
    name,
    description: metaString(meta, "description"),
    model: metaString(meta, "model", "inherit") || "inherit",
    /** 子代理运行时是否禁止写文件（与定义文件是否可编辑无关）。 */
    readonly: metaBool(meta, "readonly", false),
    isBackground: metaBool(meta, "is_background", false),
    body: body.trim(),
    filePath: absPath,
    scope,
    source,
    writable,
  };
}

function listMdFiles(root: string): string[] {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];
  try {
    return fs
      .readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md") && !e.name.startsWith("."))
      .map((e) => path.join(root, e.name));
  } catch {
    return [];
  }
}

function collectRoots(workspaceRoot?: string | null): ScanRoot[] {
  const roots: ScanRoot[] = [
    {
      root: resolveWritableRoot({ kind: "user" }, "agents"),
      scope: { kind: "user" },
      source: "thinker-user",
      writable: true,
    },
  ];
  const wsRoot = workspaceRoot?.trim() || null;
  if (wsRoot) {
    const ws = listWorkspaces().find(
      (w) => path.resolve(w.rootPath).toLowerCase() === path.resolve(wsRoot).toLowerCase(),
    );
    const scope: CustomizeScope = ws ? { kind: "workspace", workspaceId: ws.id } : { kind: "user" };
    roots.push({
      root: path.join(wsRoot, ".thinker", "agents"),
      scope,
      source: "thinker-workspace",
      writable: Boolean(ws),
    });
  }
  return roots;
}

/** 列出可见 subagents；同名后者覆盖。 */
export function listAgents(workspaceRoot?: string | null): SubagentListResult {
  const byName = new Map<string, SubagentDefinition>();
  for (const { root, scope, source, writable } of collectRoots(workspaceRoot)) {
    for (const file of listMdFiles(root)) {
      const item = parseAgentFile(file, scope, source, writable);
      if (item) byName.set(item.name, item);
    }
  }
  return {
    agents: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** 写入 / 更新。 */
export function upsertAgent(input: SubagentUpsertInput): SubagentDefinition {
  const name = sanitizeKebabName(input.name);
  if (!name) throw new Error("Agent name is required.");
  const dir = ensureDir(resolveWritableRoot(input.scope, "agents"));
  const abs = path.join(dir, `${name}.md`);
  const existing = fs.existsSync(abs)
    ? parseAgentFile(abs, input.scope, "thinker-user", true)
    : null;
  const readonly = input.readonly ?? existing?.readonly ?? false;
  const isBackground = input.isBackground ?? existing?.isBackground ?? false;
  const description = input.description ?? existing?.description ?? "";
  const model = (input.model ?? existing?.model ?? "inherit").trim() || "inherit";
  const body = input.body ?? existing?.body ?? "";
  const content = serializeFrontmatter(
    {
      name,
      description,
      model,
      readonly,
      is_background: isBackground,
    },
    body,
  );
  fs.writeFileSync(abs, content, "utf8");
  return {
    name,
    description,
    model,
    readonly,
    isBackground,
    body: body.trim(),
    filePath: abs,
    scope: input.scope,
    source: input.scope.kind === "user" ? "thinker-user" : "thinker-workspace",
    writable: true,
  };
}

/** 删除可写作用域下的 agent 定义文件。 */
export function removeAgent(scope: CustomizeScope, name: string): void {
  const abs = filePathFor(scope, name);
  try {
    fs.unlinkSync(abs);
  } catch {
    /* 不存在则忽略 */
  }
}

/** 从任意路径复制到目标作用域（覆盖同名）。 */
export function copyAgentToScope(
  name: string,
  fromPath: string,
  scope: CustomizeScope,
): SubagentDefinition {
  if (!fs.existsSync(fromPath) || !fs.statSync(fromPath).isFile()) {
    throw new Error(`Source agent not found: ${fromPath}`);
  }
  const parsed = parseAgentFile(fromPath, scope, "thinker-user", true);
  if (!parsed) throw new Error("Invalid agent file.");
  return upsertAgent({
    scope,
    name: sanitizeKebabName(name || parsed.name),
    description: parsed.description,
    model: parsed.model,
    readonly: false,
    isBackground: parsed.isBackground,
    body: parsed.body,
  });
}
