/**
 * YAML frontmatter 子集：嵌套映射、块列表、流式列表、块标量。
 * skills / customize / markdown 共用这一份，避免三套解析器分叉。
 */

export type YamlFrontmatter = {
  /** 围栏内的映射；没有围栏时为空对象。 */
  data: Record<string, unknown>;
  /** 去掉围栏后的正文。 */
  body: string;
};

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseScalar(raw: string): unknown {
  const value = raw.trim();
  if (!value || value === "~" || value === "null" || value === "Null" || value === "NULL") {
    return null;
  }
  if (value === "true" || value === "True" || value === "TRUE") return true;
  if (value === "false" || value === "False" || value === "FALSE") return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (/^-?\d+\.\d+$/.test(value)) return Number(value);
  return stripQuotes(value);
}

function isBlockScalarIndicator(value: string): boolean {
  return /^[|>][+-]?$/.test(value);
}

function parseFlowList(raw: string): unknown[] {
  const inner = raw.slice(1, -1).trim();
  if (!inner) return [];
  return inner
    .split(",")
    .map((part) => parseScalar(part))
    .filter((item) => item !== "");
}

/** 折叠标量拼成一行；字面标量保留换行。 */
function joinBlock(lines: string[], folded: boolean): string {
  if (folded) {
    return lines
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return lines.join("\n").replace(/\s+$/u, "");
}

/**
 * 从 `start` 起收集比 `indent` 更深的块标量行。
 * @returns 收集到的文本，以及下一次应从哪一行继续。
 */
function readBlockScalar(
  lines: string[],
  start: number,
  indent: number,
  folded: boolean,
): { text: string; next: number } {
  const collected: string[] = [];
  let j = start;
  while (j < lines.length) {
    const next = lines[j] ?? "";
    if (!next.trim()) {
      if (!folded) collected.push("");
      j += 1;
      continue;
    }
    const nextIndent = next.match(/^ */)?.[0].length ?? 0;
    if (nextIndent <= indent) break;
    collected.push(next.trim());
    j += 1;
  }
  return { text: joinBlock(collected, folded), next: j };
}

/** 解析 YAML 映射文本（不含围栏）。 */
export function parseYamlObject(raw: string): Record<string, unknown> {
  const lines = raw.replace(/\t/g, "  ").replace(/\r\n/g, "\n").split("\n");
  const root: Record<string, unknown> = {};
  const stack: Array<{ indent: number; container: Record<string, unknown> | unknown[] }> = [
    { indent: -1, container: root },
  ];
  // 栈底固定是 root，正常不会取空；防御性兜底
  const top = () => {
    const t = stack[stack.length - 1];
    if (!t) throw new Error("YAML 解析栈为空（不应发生）");
    return t;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
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
        if (isBlockScalarIndicator(rest)) {
          const block = readBlockScalar(lines, i + 1, indent, rest.startsWith(">"));
          obj[key] = block.text;
          i = block.next - 1;
        } else if (rest) {
          obj[key] = parseScalar(rest);
        }
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
    if (!key) continue;
    const rest = trimmed.slice(colon + 1).trim();

    if (isBlockScalarIndicator(rest)) {
      const block = readBlockScalar(lines, i + 1, indent, rest.startsWith(">"));
      parent[key] = block.text;
      i = block.next - 1;
      continue;
    }

    if (rest.startsWith("[") && rest.endsWith("]")) {
      parent[key] = parseFlowList(rest);
      continue;
    }

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

/** 解析文首 `---` YAML 围栏；没有围栏时 data 为空、body 为原文。 */
export function parseYamlFrontmatter(source: string): YamlFrontmatter {
  const input = (source ?? "").replace(/^\uFEFF/, "");
  if (!input.startsWith("---")) return { data: {}, body: input };
  const end = input.indexOf("\n---", 3);
  if (end < 0) return { data: {}, body: input };
  const raw = input.slice(3, end).replace(/^\r?\n/, "");
  const body = input.slice(end + 4).replace(/^\r?\n/, "");
  return { data: parseYamlObject(raw), body };
}
