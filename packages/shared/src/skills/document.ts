/**
 * SKILL.md 的唯一解析：菜单、设置页和 engine 激活必须接受同一份文档。
 * 没有 description 的文件不是 skill（engine 不会装载，列表也不展示）。
 */
import { parseYamlFrontmatter } from "../frontmatter";

/** 磁盘上的一份 skill，与来源目录无关。 */
export type SkillDocument = {
  name: string;
  description: string;
  /** frontmatter 之后的正文。 */
  body: string;
  paths: string[];
  disableModelInvocation: boolean;
};

/** 文件名是否为 SKILL.md（大小写不敏感，三处扫描共用）。 */
export function isSkillFileName(name: string): boolean {
  return name.toLowerCase() === "skill.md";
}

/** 规范化 skill 名：小写 kebab，空则回落到目录名。 */
export function normalizeSkillName(name: string, folderName: string): string {
  const raw = (name || folderName).trim().toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || folderName.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
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

/**
 * 解析 SKILL.md 文本。
 * 缺少非空 description 时返回 null：调用方应当作「没有这份 skill」。
 */
export function parseSkillDocument(raw: string, folderName: string): SkillDocument | null {
  const { data: meta, body } = parseYamlFrontmatter(raw);
  const name = normalizeSkillName(
    typeof meta.name === "string" ? meta.name : folderName,
    folderName,
  );
  const description = typeof meta.description === "string" ? meta.description.trim() : "";
  if (!description) return null;
  return {
    name,
    description,
    body: body.trim(),
    paths: [...asStringList(meta.paths), ...asStringList(meta.globs)],
    disableModelInvocation: meta["disable-model-invocation"] === true,
  };
}
