/**
 * 把应用内置 skills（resources/skills）同步到 `<dataDir>/customize/skills`。
 * 内置同名目录每次启动覆盖，保证产品文案与发现路径约定一致。
 */
import fs from "node:fs";
import path from "node:path";
import { getBundledSkillsDir, getCustomizeDir } from "../config/paths";

/** 递归复制目录。 */
function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) continue;
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(from, to);
    else if (ent.isFile()) fs.copyFileSync(from, to);
  }
}

/**
 * 确保内置 skills 出现在当前 dataDir（同名覆盖）。
 * @returns 本次写入的 skill 文件夹名列表
 */
export function ensureBundledSkills(): string[] {
  const bundled = getBundledSkillsDir();
  if (!bundled || !fs.existsSync(bundled)) return [];

  const destRoot = getCustomizeDir("skills");
  fs.mkdirSync(destRoot, { recursive: true });

  const installed: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(bundled, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const ent of entries) {
    if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
    const from = path.join(bundled, ent.name);
    const skillMd = path.join(from, "SKILL.md");
    const skillMdLower = path.join(from, "skill.md");
    if (!fs.existsSync(skillMd) && !fs.existsSync(skillMdLower)) continue;

    const to = path.join(destRoot, ent.name);
    try {
      if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
      copyDir(from, to);
      installed.push(ent.name);
    } catch {
      /* 单 skill 失败不阻断启动 */
    }
  }
  return installed;
}
