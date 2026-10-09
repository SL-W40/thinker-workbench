/**
 * 文档前置元数据（frontmatter）解析：YAML / JSON / TOML 子集。
 */

export type FrontmatterFormat = "yaml" | "json" | "toml";

export type FrontmatterResult = {
  /** 解析后的元数据对象（缺失或无效时为空对象）。 */
  data: Record<string, unknown>;
  /** 去掉 frontmatter 块后的 Markdown 正文。 */
  body: string;
  /** 检测到的格式；无 frontmatter 时为 null。 */
  format: FrontmatterFormat | null;
  /** 原始 frontmatter 文本（不含围栏）；无则 null。 */
  raw: string | null;
};

type FenceMatch = {
  format: FrontmatterFormat;
  raw: string;
  body: string;
};

const OPEN_YAML = /^(?:\uFEFF)?---(?:\s*(?:yaml|yml))?\s*\r?\n/;
const OPEN_JSON = /^(?:\uFEFF)?---\s*json\s*\r?\n/i;
const OPEN_TOML_TAG = /^(?:\uFEFF)?---\s*toml\s*\r?\n/i;
const OPEN_TOML_PLUS = /^(?:\uFEFF)?\+\+\+\s*\r?\n/;

function splitFence(
  source: string,
  open: RegExp,
  close: RegExp,
  format: FrontmatterFormat,
): FenceMatch | null {
  const start = open.exec(source);
  if (!start || start.index !== 0) return null;
  const afterOpen = source.slice(start[0].length);
  const end = close.exec(afterOpen);
  if (!end) return null;
  return {
    format,
    raw: afterOpen.slice(0, end.index).replace(/\r\n/g, "\n"),
    body: afterOpen.slice(end.index + end[0].length).replace(/^\r?\n/, ""),
  };
}

function detectFence(source: string): FenceMatch | null {
  return (
    splitFence(source, OPEN_JSON, /\r?\n---\s*(?:\r?\n|$)/, "json") ||
    splitFence(source, OPEN_TOML_TAG, /\r?\n---\s*(?:\r?\n|$)/, "toml") ||
    splitFence(source, OPEN_TOML_PLUS, /\r?\n\+\+\+\s*(?:\r?\n|$)/, "toml") ||
    splitFence(source, OPEN_YAML, /\r?\n---\s*(?:\r?\n|$)/, "yaml")
  );
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseScalar(raw: string): unknown {
  const value = raw.trim();
  if (!value || value === "~" || value === "null" || value === "Null" || value === "NULL")
    return null;
  if (value === "true" || value === "True" || value === "TRUE") return true;
  if (value === "false" || value === "False" || value === "FALSE") return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (/^-?\d+\.\d+$/.test(value)) return Number(value);
  return stripQuotes(value);
}

/** 最小 YAML 子集：映射、嵌套缩进、列表、标量。 */
function parseYaml(raw: string): Record<string, unknown> {
  const lines = raw.replace(/\t/g, "  ").split("\n");
  const root: Record<string, unknown> = {};
  const stack: Array<{ indent: number; container: Record<string, unknown> | unknown[] }> = [
    { indent: -1, container: root },
  ];

  const top = () => stack[stack.length - 1];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const indent = line.match(/^ */)?.[0].length ?? 0;
    const trimmed = line.trim();

    while (stack.length > 1 && indent <= top().indent) stack.pop();
    const parent = top().container;

    if (trimmed.startsWith("- ")) {
      if (!Array.isArray(parent)) continue;
      const itemRaw = trimmed.slice(2).trim();
      if (!itemRaw) {
        const obj: Record<string, unknown> = {};
        parent.push(obj);
        stack.push({ indent, container: obj });
        continue;
      }
      if (itemRaw.includes(":") && !/^['"].*['"]$/.test(itemRaw)) {
        const obj: Record<string, unknown> = {};
        const colon = itemRaw.indexOf(":");
        const key = itemRaw.slice(0, colon).trim();
        const rest = itemRaw.slice(colon + 1).trim();
        if (rest) obj[key] = parseScalar(rest);
        parent.push(obj);
        stack.push({ indent, container: obj });
      } else {
        parent.push(parseScalar(itemRaw));
      }
      continue;
    }

    if (typeof parent !== "object" || parent === null || Array.isArray(parent)) continue;

    const colon = trimmed.indexOf(":");
    if (colon < 0) continue;
    const key = trimmed.slice(0, colon).trim();
    const rest = trimmed.slice(colon + 1).trim();

    if (!rest) {
      const next = lines[i + 1];
      const nextIndent = next ? (next.match(/^ */)?.[0].length ?? 0) : 0;
      const nextTrim = next?.trim() ?? "";
      if (next && nextIndent > indent && nextTrim.startsWith("- ")) {
        const arr: unknown[] = [];
        parent[key] = arr;
        stack.push({ indent, container: arr });
      } else {
        const obj: Record<string, unknown> = {};
        parent[key] = obj;
        stack.push({ indent, container: obj });
      }
      continue;
    }

    parent[key] = parseScalar(rest);
  }

  return root;
}

/** 最小 TOML 子集：key = value、[tables]、点分键。 */
function parseToml(raw: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let current: Record<string, unknown> = root;

  const ensureTable = (path: string[]): Record<string, unknown> => {
    let cursor: Record<string, unknown> = root;
    for (const part of path) {
      const next = cursor[part];
      if (!next || typeof next !== "object" || Array.isArray(next)) {
        cursor[part] = {};
      }
      cursor = cursor[part] as Record<string, unknown>;
    }
    return cursor;
  };

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const table = /^\[([^\]]+)\]$/.exec(trimmed);
    if (table) {
      current = ensureTable(
        table[1]
          .split(".")
          .map((p) => p.trim())
          .filter(Boolean),
      );
      continue;
    }

    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const keyPath = trimmed
      .slice(0, eq)
      .trim()
      .split(".")
      .map((p) => p.trim())
      .filter(Boolean);
    const value = parseScalar(trimmed.slice(eq + 1));
    if (!keyPath.length) continue;

    if (keyPath.length === 1) {
      current[keyPath[0]] = value;
      continue;
    }

    const leaf = keyPath[keyPath.length - 1];
    const parent = ensureTable(keyPath.slice(0, -1));
    parent[leaf] = value;
  }

  return root;
}

function parsePayload(format: FrontmatterFormat, raw: string): Record<string, unknown> {
  const text = raw.trim();
  if (!text) return {};
  try {
    if (format === "json") {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    }
    if (format === "toml") return parseToml(text);
    return parseYaml(text);
  } catch {
    return {};
  }
}

/**
 * 抽取文档开头的元数据围栏。
 *
 * 格式：
 * - `---` / `---yaml` … `---` → YAML
 * - `---json` … `---` → JSON
 * - `---toml` … `---` 或 `+++` … `+++` → TOML
 */
export function parseFrontmatter(source: string): FrontmatterResult {
  const input = source ?? "";
  const fence = detectFence(input);
  if (!fence) {
    return { data: {}, body: input, format: null, raw: null };
  }
  return {
    data: parsePayload(fence.format, fence.raw),
    body: fence.body,
    format: fence.format,
    raw: fence.raw,
  };
}

/** {@link parseFrontmatter} 的别名——文档元数据抽取。 */
export const parseMetadata = parseFrontmatter;

export type MetadataFormat = FrontmatterFormat;
export type MetadataResult = FrontmatterResult;
