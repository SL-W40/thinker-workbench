/**
 * 扫描 skills 目录，返回 Composer `/` 菜单用的摘要（不读正文）。
 * 路径顺序与 engine loadSkills 一致：dataDir → .thinker → .cursor。
 */
import fs from "node:fs";
import path from "node:path";
import type { SkillListItem } from "@thinker-workbench/shared";
import { getDataDir } from "../config/paths";

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

function stripQuotes(s: string): string {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

function normalizeSkillName(name: string, folderName: string): string {
  const raw = (name || folderName).trim().toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || folderName.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
}

/** 只解析 name / description。 */
function parseSkillSummary(absPath: string, source: string): SkillListItem | null {
  let raw: string;
  try {
    raw = fs.readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
  const folderName = path.basename(path.dirname(absPath));
  let name = folderName;
  let description = "";
  const trimmed = raw.replace(/^\uFEFF/, "");
  if (trimmed.startsWith("---")) {
    const end = trimmed.indexOf("\n---", 3);
    if (end >= 0) {
      const fm = trimmed.slice(3, end).replace(/^\r?\n/, "");
      for (const line of fm.split(/\r?\n/)) {
        const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        if (!m) continue;
        const key = m[1]!;
        const value = stripQuotes(m[2]!.trim());
        if (key === "name" && value) name = value;
        if (key === "description" && value) description = value;
      }
    }
  }
  return {
    name: normalizeSkillName(name, folderName),
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
    roots.push({ source: "cursor", root: path.join(ws, ".cursor", "skills") });
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
