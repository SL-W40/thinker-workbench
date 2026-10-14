/**
 * 文档前置元数据（frontmatter）解析：YAML / JSON / TOML 子集。
 * YAML 对象解析交给 shared，这里只负责围栏识别与 JSON / TOML。
 */
import { parseYamlObject } from "@thinker-workbench/shared";

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
  if (start?.index !== 0) return null;
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
    return parseYamlObject(text);
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
