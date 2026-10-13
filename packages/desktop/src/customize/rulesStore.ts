/**
 * Rules：rules 目录下 markdown 的列表 / 写入 / 删除 / 复制。
 */
import fs from "node:fs";
import path from "node:path";
import type {
  CustomizeScope,
  CustomizeSource,
  RuleListItem,
  RuleListResult,
  RuleUpsertInput,
} from "@thinker-workbench/shared";
import { listWorkspaces } from "../db/workspacesStore";
import { ensureDir, resolveWritableRoot } from "./paths";

type ScanRoot = {
  root: string;
  scope: CustomizeScope;
  source: CustomizeSource;
  writable: boolean;
};

function toPosix(rel: string): string {
  return rel.split(path.sep).join("/");
}

function sanitizeRelPath(relPath: string): string {
  const cleaned = relPath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\.\./g, "").trim();
  if (!cleaned || cleaned.includes("\0")) throw new Error("Invalid rule path.");
  const withExt = cleaned.toLowerCase().endsWith(".md") ? cleaned : `${cleaned}.md`;
  return withExt;
}

function walkMd(root: string): string[] {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile() && ent.name.toLowerCase().endsWith(".md")) out.push(abs);
    }
  };
  walk(root);
  return out;
}

function collectRoots(workspaceRoot?: string | null): ScanRoot[] {
  const roots: ScanRoot[] = [
    {
      root: resolveWritableRoot({ kind: "user" }, "rules"),
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
      root: path.join(wsRoot, ".thinker", "rules"),
      scope,
      source: "thinker-workspace",
      writable: Boolean(ws),
    });
  }
  return roots;
}

function itemFromFile(
  absPath: string,
  root: string,
  scope: CustomizeScope,
  source: CustomizeSource,
  writable: boolean,
): RuleListItem | null {
  let body: string;
  try {
    body = fs.readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
  const relPath = toPosix(path.relative(root, absPath));
  const name = path.basename(absPath, path.extname(absPath));
  return {
    relPath,
    name,
    body,
    filePath: absPath,
    scope,
    source,
    writable,
  };
}

/** 列出可见 rules；同 relPath 后者覆盖。 */
export function listRules(workspaceRoot?: string | null): RuleListResult {
  const byKey = new Map<string, RuleListItem>();
  for (const { root, scope, source, writable } of collectRoots(workspaceRoot)) {
    for (const file of walkMd(root)) {
      const item = itemFromFile(file, root, scope, source, writable);
      if (item) byKey.set(item.relPath, item);
    }
  }
  return {
    rules: [...byKey.values()].sort((a, b) => a.relPath.localeCompare(b.relPath)),
  };
}

/** 写入 / 更新。 */
export function upsertRule(input: RuleUpsertInput): RuleListItem {
  const relPath = sanitizeRelPath(input.relPath);
  const root = ensureDir(resolveWritableRoot(input.scope, "rules"));
  const abs = path.join(root, ...relPath.split("/"));
  ensureDir(path.dirname(abs));
  fs.writeFileSync(abs, input.body.endsWith("\n") ? input.body : `${input.body}\n`, "utf8");
  return {
    relPath,
    name: path.basename(relPath, path.extname(relPath)),
    body: input.body,
    filePath: abs,
    scope: input.scope,
    source: input.scope.kind === "user" ? "thinker-user" : "thinker-workspace",
    writable: true,
  };
}

/** 删除。 */
export function removeRule(scope: CustomizeScope, relPath: string): void {
  const safe = sanitizeRelPath(relPath);
  const abs = path.join(resolveWritableRoot(scope, "rules"), ...safe.split("/"));
  try {
    fs.unlinkSync(abs);
  } catch {
    /* ignore */
  }
}

/** 复制到目标作用域。 */
export function copyRuleToScope(
  relPath: string,
  fromPath: string,
  scope: CustomizeScope,
): RuleListItem {
  if (!fs.existsSync(fromPath) || !fs.statSync(fromPath).isFile()) {
    throw new Error(`Source rule not found: ${fromPath}`);
  }
  const body = fs.readFileSync(fromPath, "utf8");
  return upsertRule({
    scope,
    relPath: sanitizeRelPath(relPath || path.basename(fromPath)),
    body,
  });
}
