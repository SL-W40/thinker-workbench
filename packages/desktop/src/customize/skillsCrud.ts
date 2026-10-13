/**
 * Skills CRUD：在 listSkills 摘要之上提供详情列表 / 写入 / 删除 / 复制。
 */
import fs from "node:fs";
import path from "node:path";
import type {
  CustomizeScope,
  CustomizeSource,
  SkillListItem,
  SkillListResult,
  SkillUpsertInput,
} from "@thinker-workbench/shared";
import { listWorkspaces } from "../db/workspacesStore";
import { listSkillSummaries } from "../skills/listSkills";
import {
  metaBool,
  metaString,
  parseFrontmatter,
  sanitizeKebabName,
  serializeFrontmatter,
} from "./frontmatter";
import { ensureDir, resolveWritableRoot } from "./paths";

type ScanRoot = {
  root: string;
  scope: CustomizeScope;
  source: CustomizeSource;
  writable: boolean;
  legacySource: string;
};

function walkSkillMd(root: string): string[] {
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
      else if (ent.isFile() && ent.name.toLowerCase() === "skill.md") out.push(abs);
    }
  };
  walk(root);
  return out;
}

function parseDetailed(
  absPath: string,
  scope: CustomizeScope,
  customizeSource: CustomizeSource,
  writable: boolean,
  legacySource: string,
): SkillListItem | null {
  let raw: string;
  try {
    raw = fs.readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
  const folderName = path.basename(path.dirname(absPath));
  const { meta, body } = parseFrontmatter(raw);
  const name = sanitizeKebabName(metaString(meta, "name", folderName), folderName);
  const description = metaString(meta, "description");
  return {
    name,
    description: description.slice(0, 200),
    source: legacySource,
    body: body.trim(),
    filePath: absPath,
    scope,
    customizeSource,
    writable,
    disableModelInvocation: metaBool(meta, "disable-model-invocation", false),
  };
}

function collectRoots(workspaceRoot?: string | null): ScanRoot[] {
  const roots: ScanRoot[] = [
    {
      root: resolveWritableRoot({ kind: "user" }, "skills"),
      scope: { kind: "user" },
      source: "thinker-user",
      writable: true,
      legacySource: "global",
    },
  ];
  const wsRoot = workspaceRoot?.trim() || null;
  if (wsRoot) {
    const ws = listWorkspaces().find(
      (w) => path.resolve(w.rootPath).toLowerCase() === path.resolve(wsRoot).toLowerCase(),
    );
    const scope: CustomizeScope = ws ? { kind: "workspace", workspaceId: ws.id } : { kind: "user" };
    roots.push({
      root: path.join(wsRoot, ".thinker", "skills"),
      scope,
      source: "thinker-workspace",
      writable: Boolean(ws),
      legacySource: "thinker",
    });
  }
  return roots;
}

/** Composer `/` 仍用摘要列表。 */
export function listSkillsSummary(workspaceRoot?: string | null): SkillListItem[] {
  return listSkillSummaries(workspaceRoot);
}

/** Customize 用完整列表（含正文与可写标记）。 */
export function listSkillsDetailed(workspaceRoot?: string | null): SkillListResult {
  const byName = new Map<string, SkillListItem>();
  for (const { root, scope, source, writable, legacySource } of collectRoots(workspaceRoot)) {
    for (const file of walkSkillMd(root)) {
      const item = parseDetailed(file, scope, source, writable, legacySource);
      if (item) byName.set(item.name, item);
    }
  }
  return {
    skills: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function skillDir(scope: CustomizeScope, name: string): string {
  return path.join(resolveWritableRoot(scope, "skills"), sanitizeKebabName(name));
}

function skillMdPath(scope: CustomizeScope, name: string): string {
  return path.join(skillDir(scope, name), "SKILL.md");
}

/** 写入 / 更新 skill 目录。 */
export function upsertSkill(input: SkillUpsertInput): SkillListItem {
  const name = sanitizeKebabName(input.name);
  if (!name) throw new Error("Skill name is required.");
  const dir = ensureDir(skillDir(input.scope, name));
  const abs = path.join(dir, "SKILL.md");
  const existing = fs.existsSync(abs)
    ? parseDetailed(
        abs,
        input.scope,
        input.scope.kind === "user" ? "thinker-user" : "thinker-workspace",
        true,
        input.scope.kind === "user" ? "global" : "thinker",
      )
    : null;
  const description = (input.description ?? existing?.description ?? "").trim();
  if (!description) throw new Error("Skill description is required.");
  const body = input.body ?? existing?.body ?? "";
  const disableModelInvocation =
    input.disableModelInvocation ?? existing?.disableModelInvocation ?? false;
  fs.writeFileSync(
    abs,
    serializeFrontmatter(
      {
        name,
        description,
        "disable-model-invocation": disableModelInvocation,
      },
      body,
    ),
    "utf8",
  );
  return {
    name,
    description: description.slice(0, 200),
    source: input.scope.kind === "user" ? "global" : "thinker",
    body: body.trim(),
    filePath: abs,
    scope: input.scope,
    customizeSource: input.scope.kind === "user" ? "thinker-user" : "thinker-workspace",
    writable: true,
    disableModelInvocation,
  };
}

/** 删除 skill 目录。 */
export function removeSkill(scope: CustomizeScope, name: string): void {
  const dir = skillDir(scope, sanitizeKebabName(name));
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

/** 从任意 SKILL.md 复制到目标作用域。 */
export function copySkillToScope(
  name: string,
  fromPath: string,
  scope: CustomizeScope,
): SkillListItem {
  if (!fs.existsSync(fromPath) || !fs.statSync(fromPath).isFile()) {
    throw new Error(`Source skill not found: ${fromPath}`);
  }
  const parsed = parseDetailed(fromPath, scope, "thinker-user", true, "global");
  if (!parsed) throw new Error("Invalid skill file.");
  // 若源目录含其它文件，一并复制
  const srcDir = path.dirname(fromPath);
  const destDir = ensureDir(skillDir(scope, sanitizeKebabName(name || parsed.name)));
  if (path.resolve(srcDir) !== path.resolve(destDir) && fs.existsSync(srcDir)) {
    for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
      if (ent.name.startsWith(".")) continue;
      const from = path.join(srcDir, ent.name);
      const to = path.join(destDir, ent.name);
      if (ent.isDirectory()) {
        fs.cpSync(from, to, { recursive: true });
      } else if (ent.isFile()) {
        fs.copyFileSync(from, to);
      }
    }
  }
  return upsertSkill({
    scope,
    name: sanitizeKebabName(name || parsed.name),
    description: parsed.description,
    body: parsed.body ?? "",
    disableModelInvocation: parsed.disableModelInvocation,
  });
}

/** 供路径探测。 */
export function resolveSkillMdPath(scope: CustomizeScope, name: string): string {
  return skillMdPath(scope, name);
}
