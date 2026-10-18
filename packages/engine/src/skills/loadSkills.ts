/**
 * Skills 发现与激活。
 *
 * 路径（后者覆盖同名）：
 * 1. dataDir/skills 下递归 SKILL.md
 * 2. workspace/.thinker/skills 下递归 SKILL.md
 *
 * Frontmatter：name / description / paths|globs / disable-model-invocation。
 */
import fs from "node:fs";
import path from "node:path";
import { parseYamlFrontmatter } from "@thinker-workbench/shared";

/** 单个已解析 skill。 */
export type SkillDefinition = {
  name: string;
  description: string;
  /** 正文（含 frontmatter 之后的 markdown）。 */
  body: string;
  paths: string[];
  disableModelInvocation: boolean;
  /** 来源目录标签，调试用。 */
  source: string;
};

export type LoadedSkills = {
  /** 写入 system 的索引 + 已激活正文。 */
  text: string;
  /** 仅索引部分（用量可拆，当前整块计入 skills）。 */
  catalogText: string;
  /** 已激活正文块。 */
  activatedText: string;
  skills: SkillDefinition[];
  activatedNames: string[];
};

/** 递归找 SKILL.md。 */
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
      if (ent.isDirectory()) {
        walk(abs);
        continue;
      }
      if (ent.isFile() && ent.name === "SKILL.md") out.push(abs);
    }
  };
  walk(root);
  return out;
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeSkillName(name: string, folderName: string): string {
  const raw = (name || folderName).trim().toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || folderName.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
}

/** 从单个 SKILL.md 解析定义。 */
function parseSkillFile(absPath: string, source: string): SkillDefinition | null {
  let raw: string;
  try {
    raw = fs.readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
  const folderName = path.basename(path.dirname(absPath));
  const { data: meta, body } = parseYamlFrontmatter(raw);
  const name = normalizeSkillName(
    typeof meta.name === "string" ? meta.name : folderName,
    folderName,
  );
  const description = typeof meta.description === "string" ? meta.description.trim() : "";
  if (!description) return null;
  const paths = [...asStringList(meta.paths), ...asStringList(meta.globs)];
  const disableModelInvocation = meta["disable-model-invocation"] === true;
  return {
    name,
    description,
    body: body.trim(),
    paths,
    disableModelInvocation,
    source,
  };
}

/** glob 语义下需要转义的正则元字符。 */
const GLOB_SPECIAL = new Set([".", "+", "^", "$", "{", "}", "(", ")", "|", "\\"]);

/** 路径 glob：`*`、`**`、`?`、`[]`。 */
export function globMatch(pattern: string, text: string): boolean {
  const norm = pattern.replace(/\\/g, "/");
  const target = text.replace(/\\/g, "/").replace(/^\.\//, "");
  let re = "^";
  for (let i = 0; i < norm.length; i += 1) {
    const c = norm[i];
    if (c === "*" && norm[i + 1] === "*") {
      re += ".*";
      i += 1;
      if (norm[i + 1] === "/") i += 1;
      continue;
    }
    if (c === "*") {
      re += "[^/]*";
      continue;
    }
    if (c === "?") {
      re += "[^/]";
      continue;
    }
    if (c === "[") {
      const end = norm.indexOf("]", i + 1);
      if (end > i + 1) {
        re += `[${norm.slice(i + 1, end)}]`;
        i = end;
        continue;
      }
    }
    re += GLOB_SPECIAL.has(c) ? `\\${c}` : c;
  }
  re += "$";
  try {
    return new RegExp(re, "i").test(target);
  } catch {
    return false;
  }
}

/** 从用户文里抽出像路径的片段（含斜杠或扩展名）。 */
function pathsFromText(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\s+/)) {
    const token = raw.replace(/^[`'"(]+|[`'"),.:;]+$/g, "").replace(/\\/g, "/");
    if (!token || /^https?:/i.test(token)) continue;
    if (token.includes("/") || /\.[a-z0-9]{1,8}$/i.test(token)) {
      out.push(token.replace(/^\.\//, ""));
    }
  }
  return out;
}

/** 从用户文抽取 `/skill-name` 显式调用。 */
export function extractSlashSkillNames(userText: string): string[] {
  const names: string[] = [];
  const re = /(?:^|[\s`])\/([a-z0-9]+(?:-[a-z0-9]+)*)\b/gi;
  for (const m of userText.matchAll(re)) {
    const name = m[1];
    if (name) names.push(name.toLowerCase());
  }
  return [...new Set(names)];
}

function pathsHit(skill: SkillDefinition, candidates: string[]): boolean {
  if (skill.paths.length === 0) return true;
  return skill.paths.some((pattern) => candidates.some((text) => globMatch(pattern, text)));
}

/**
 * 发现并按策略激活 skills。
 * @param latestUserText 最新用户文（slash / 文中路径片段）
 * @param contextPaths 本轮附带的工作区相对路径
 */
export function loadSkills(
  dataDir: string | null | undefined,
  workspaceRoot: string | null | undefined,
  latestUserText = "",
  contextPaths: readonly string[] = [],
): LoadedSkills {
  const byName = new Map<string, SkillDefinition>();

  const roots: Array<{ source: string; root: string }> = [];
  if (dataDir?.trim()) {
    roots.push({ source: "global", root: path.join(dataDir.trim(), "skills") });
  }
  if (workspaceRoot?.trim()) {
    const ws = workspaceRoot.trim();
    roots.push({ source: "thinker", root: path.join(ws, ".thinker", "skills") });
  }

  for (const { source, root } of roots) {
    for (const file of walkSkillMd(root)) {
      const skill = parseSkillFile(file, source);
      if (!skill) continue;
      byName.set(skill.name, skill);
    }
  }

  const skills = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  const slash = new Set(extractSlashSkillNames(latestUserText));
  const candidates = [
    ...contextPaths.map((p) => p.replace(/\\/g, "/").replace(/^\.\//, "")),
    ...pathsFromText(latestUserText),
  ];

  const activated: SkillDefinition[] = [];
  for (const skill of skills) {
    if (slash.has(skill.name)) {
      activated.push(skill);
      continue;
    }
    if (skill.disableModelInvocation) continue;
    if (!pathsHit(skill, candidates)) continue;
    activated.push(skill);
  }

  const catalogLines = skills.map(
    (s) => `- ${s.name}: ${s.description}${s.disableModelInvocation ? " (slash-only)" : ""}`,
  );
  const catalogText =
    skills.length === 0
      ? ""
      : [
          "<available_skills>",
          "Skills you may follow when relevant. Slash `/name` forces a skill.",
          ...catalogLines,
          "</available_skills>",
        ].join("\n");

  const activatedBlocks = activated.map((s) =>
    [`<skill name="${s.name}">`, s.body || s.description, `</skill>`].join("\n"),
  );
  const activatedText = activatedBlocks.join("\n\n");

  const parts = [catalogText, activatedText].filter(Boolean);
  return {
    text: parts.join("\n\n"),
    catalogText,
    activatedText,
    skills,
    activatedNames: activated.map((s) => s.name),
  };
}
