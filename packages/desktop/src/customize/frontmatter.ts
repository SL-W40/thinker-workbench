/**
 * Customize 资源的 YAML frontmatter 序列化与字段读取。
 * 解析走 shared 的 parseYamlFrontmatter。
 */

/** 把标量写成安全的 YAML 行值。 */
function yamlScalar(value: string | boolean | number): string {
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  const s = String(value);
  if (s === "") return '""';
  if (/[:#{}[\],&*?|>!%@`'"]/.test(s) || /^\s|\s$/.test(s) || /\n/.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}

/** 序列化 frontmatter + 正文。 */
export function serializeFrontmatter(
  meta: Record<string, string | boolean | number | undefined | null>,
  body: string,
): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined || value === null) continue;
    lines.push(`${key}: ${yamlScalar(value)}`);
  }
  lines.push("---", "");
  const trimmedBody = body.replace(/^\uFEFF/, "").replace(/^\r?\n/, "");
  return `${lines.join("\n")}${trimmedBody.endsWith("\n") ? trimmedBody : `${trimmedBody}\n`}`;
}

/** 规范化 kebab 名称。 */
export function sanitizeKebabName(raw: string, fallback = "item"): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

/** meta 中读字符串。 */
export function metaString(meta: Record<string, unknown>, key: string, fallback = ""): string {
  const v = meta[key];
  return typeof v === "string" ? v.trim() : fallback;
}

/** meta 中读布尔。 */
export function metaBool(meta: Record<string, unknown>, key: string, fallback = false): boolean {
  const v = meta[key];
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}
