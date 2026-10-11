/**
 * Customize 资源用的极简 YAML frontmatter 解析 / 序列化。
 */

export type FrontmatterParseResult = {
  meta: Record<string, unknown>;
  body: string;
};

function stripQuotes(s: string): string {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

function isBlockScalarIndicator(value: string): boolean {
  return /^[|>][+-]?$/.test(value);
}

function coerceScalar(value: string): string | boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  return stripQuotes(value);
}

/** 解析开头的 `---` 围栏 frontmatter。 */
export function parseFrontmatter(raw: string): FrontmatterParseResult {
  const trimmed = raw.replace(/^\uFEFF/, "");
  if (!trimmed.startsWith("---")) {
    return { meta: {}, body: trimmed };
  }
  const end = trimmed.indexOf("\n---", 3);
  if (end < 0) return { meta: {}, body: trimmed };
  const fm = trimmed.slice(3, end).replace(/^\r?\n/, "");
  const body = trimmed.slice(end + 4).replace(/^\r?\n/, "");
  const meta: Record<string, unknown> = {};
  let blockKey: string | null = null;
  let blockFolded = true;
  const blockLines: string[] = [];

  const flushBlock = () => {
    if (!blockKey) return;
    const parts = blockLines.map((l) => l.replace(/^\s+/, ""));
    const text = (blockFolded ? parts.join(" ") : parts.join("\n"))
      .replace(/\s+/g, blockFolded ? " " : "\n")
      .trim();
    meta[blockKey] = text;
    blockKey = null;
    blockLines.length = 0;
  };

  for (const line of fm.split(/\r?\n/)) {
    if (blockKey) {
      if (/^\s+\S/.test(line) || line.trim() === "") {
        if (line.trim()) blockLines.push(line);
        continue;
      }
      flushBlock();
    }
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    const value = m[2]!.trim();
    if (isBlockScalarIndicator(value)) {
      blockKey = key;
      blockFolded = value.startsWith(">");
      blockLines.length = 0;
      continue;
    }
    if (!value) continue;
    meta[key] = coerceScalar(value);
  }
  flushBlock();
  return { meta, body };
}

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
