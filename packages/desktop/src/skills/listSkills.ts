/**
 * 扫描 skills 目录，返回 Composer `/` 菜单用的摘要。
 * 根目录与解析规则与 engine loadSkills 相同：customize/skills → .thinker/skills。
 * 索引在首次列出时建立，目录变化或设置页写入后作废。
 */
import fs from "node:fs";
import path from "node:path";
import { dataPath, isSkillFileName, parseSkillDocument, type SkillListItem } from "@thinker-workbench/shared";
import { getDataDir } from "../config/paths";

type Root = { source: string; root: string };

const watchers = new Set<string>();
let cached: { stamp: string; items: SkillListItem[] } | null = null;

/** 设置页写入 / 删除 skill 后调用，让菜单下次重读。 */
export function invalidateSkillIndex(): void {
  cached = null;
}

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
      else if (ent.isFile() && isSkillFileName(ent.name)) out.push(abs);
    }
  };
  walk(root);
  return out;
}

function watchRoot(root: string): void {
  if (watchers.has(root) || !fs.existsSync(root)) return;
  watchers.add(root);
  try {
    fs.watch(root, { recursive: true }, () => {
      cached = null;
    });
  } catch {
    watchers.delete(root);
  }
}

function rootsFor(workspaceRoot?: string | null): Root[] {
  const roots: Root[] = [];
  const dataDir = getDataDir();
  if (dataDir?.trim()) {
    roots.push({ source: "global", root: dataPath(dataDir.trim(), "customSkills") });
  }
  if (workspaceRoot?.trim()) {
    roots.push({ source: "thinker", root: path.join(workspaceRoot.trim(), ".thinker", "skills") });
  }
  return roots;
}

function stampOf(files: string[]): string {
  return files
    .map((file) => {
      try {
        return `${file}:${fs.statSync(file).mtimeMs}`;
      } catch {
        return `${file}:missing`;
      }
    })
    .join("|");
}

function readSummary(absPath: string, source: string): SkillListItem | null {
  let raw: string;
  try {
    raw = fs.readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
  const folderName = path.basename(path.dirname(absPath));
  const doc = parseSkillDocument(raw, folderName);
  if (!doc) return null;
  return {
    name: doc.name,
    description: doc.description.slice(0, 200),
    source,
  };
}

/** 列出可见 skills；后者覆盖同名。没有 description 的文件不出现。 */
export function listSkillSummaries(workspaceRoot?: string | null): SkillListItem[] {
  const roots = rootsFor(workspaceRoot);
  for (const root of roots) watchRoot(root.root);
  const files = roots.flatMap((root) => walkSkillMd(root.root).map((file) => ({ file, source: root.source })));
  const stamp = stampOf(files.map((file) => file.file));
  if (cached && cached.stamp === stamp) return cached.items;

  const byName = new Map<string, SkillListItem>();
  for (const { file, source } of files) {
    const item = readSummary(file, source);
    if (!item) continue;
    byName.set(item.name, item);
  }
  const items = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  cached = { stamp, items };
  return items;
}
