/**
 * 扫描 skills 目录，返回 Composer `/` 菜单用的摘要（不读正文）。
 * 路径顺序与 engine loadSkills 一致：dataDir → .thinker。
 */
import fs from "node:fs";
import path from "node:path";
import type { SkillListItem } from "@thinker-workbench/shared";
import { getDataDir } from "../config/paths";
import { metaString, parseFrontmatter, sanitizeKebabName } from "../customize/frontmatter";

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

/** 只解析 name / description（支持 `>-` 等块标量）。 */
function parseSkillSummary(absPath: string, source: string): SkillListItem | null {
  let raw: string;
  try {
    raw = fs.readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
  const folderName = path.basename(path.dirname(absPath));
  const { meta } = parseFrontmatter(raw);
  const name = sanitizeKebabName(metaString(meta, "name", folderName), folderName);
  const description = metaString(meta, "description");
  return {
    name,
    description: description.slice(0, 200),
    source,
  };
}

/** 列出可见 skills；后者覆盖同名。 */
export function listSkillSummaries(workspaceRoot?: string | null): SkillListItem[] {
  const byName = new Map<string, SkillListItem>();
  const roots: Array<{ source: string; root: string }> = [];
  const dataDir = getDataDir();
  if (dataDir?.trim()) {
    roots.push({ source: "global", root: path.join(dataDir.trim(), "skills") });
  }
  if (workspaceRoot?.trim()) {
    const ws = workspaceRoot.trim();
    roots.push({ source: "thinker", root: path.join(ws, ".thinker", "skills") });
  }
  for (const { source, root } of roots) {
    for (const file of walkSkillMd(root)) {
      const item = parseSkillSummary(file, source);
      if (!item) continue;
      byName.set(item.name, item);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
