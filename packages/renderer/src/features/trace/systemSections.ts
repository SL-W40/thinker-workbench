/**
 * 判断 Trace 载荷里 system、tools、messages 能否按块展示。
 */
export type SystemSectionRecord = {
  id: string;
  text: string;
};

/** 展开卡片用的工具定义。 */
export type TraceToolCard = {
  name: string;
  description: string;
  parameters: unknown;
};

/** 从 Trace 的 tools 数组读出名称、说明和参数。不是工具定义则返回 null。 */
export function readTraceTools(value: unknown): TraceToolCard[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const cards: TraceToolCard[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const fn = (item as { function?: unknown }).function;
    if (!fn || typeof fn !== "object") return null;
    const name = (fn as { name?: unknown }).name;
    if (typeof name !== "string" || name.length === 0) return null;
    const description = (fn as { description?: unknown }).description;
    cards.push({
      name,
      description: typeof description === "string" ? description : "",
      parameters: (fn as { parameters?: unknown }).parameters ?? null,
    });
  }
  return cards;
}

/** 工具定义里的一个参数。 */
export type TraceToolParam = {
  name: string;
  type: string;
  description: string;
  required: boolean;
  defaultText?: string;
};

/** 从 parameters schema 读出参数列表。没有 properties 则返回 null。 */
export function readToolParams(parameters: unknown): TraceToolParam[] | null {
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) return null;
  const props = (parameters as { properties?: unknown }).properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) return null;
  const requiredList = (parameters as { required?: unknown }).required;
  const required = new Set(
    Array.isArray(requiredList) ? requiredList.filter((item): item is string => typeof item === "string") : [],
  );
  return Object.entries(props as Record<string, unknown>).map(([name, spec]) => {
    const row = spec && typeof spec === "object" && !Array.isArray(spec) ? (spec as Record<string, unknown>) : {};
    const type = typeof row.type === "string" ? row.type : "";
    const description = typeof row.description === "string" ? row.description : "";
    const hasDefault = "default" in row && row.default != null;
    const defaultText = !hasDefault
      ? undefined
      : typeof row.default === "string"
        ? row.default
        : JSON.stringify(row.default);
    return {
      name,
      type,
      description,
      required: required.has(name),
      ...(defaultText != null ? { defaultText } : {}),
    };
  });
}

/** 一次工具调用：名称、编号，以及格式化后的参数。 */
export type TraceToolCall = {
  id: string;
  name: string;
  argumentsText: string;
};

/** JSON 字符串展开成缩进文本；不是 JSON 则原样返回。 */
export function formatTraceJson(value: unknown): string {
  if (typeof value !== "string") return value == null ? "" : JSON.stringify(value, null, 2);
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return value;
  }
}

/** 从消息上的 tool_calls 读出可展示的调用。 */
export function readToolCalls(value: unknown): TraceToolCall[] {
  if (!Array.isArray(value)) return [];
  const calls: TraceToolCall[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
    const name = typeof row.function?.name === "string" ? row.function.name : "";
    const id = typeof row.id === "string" ? row.id : "";
    const argumentsText =
      row.function && "arguments" in row.function ? formatTraceJson(row.function.arguments) : "";
    if (!name && !id && !argumentsText) continue;
    calls.push({ id, name, argumentsText });
  }
  return calls;
}

/** 工具结果正文的标准头：`[tool:name ok]`。 */
const TOOL_RESULT_HEADER = /^\[tool:([^\s\]]+) (ok|error)\](?:\n|$)/;

export type TraceToolResult = {
  name: string;
  ok: boolean;
  body: string;
};

/** 拆掉工具结果头。没有这个头则返回 null。 */
export function readToolResult(content: string): TraceToolResult | null {
  const match = TOOL_RESULT_HEADER.exec(content);
  if (!match?.[1] || !match[2]) return null;
  return { name: match[1], ok: match[2] === "ok", body: content.slice(match[0].length) };
}

export type TraceFieldRow = { key: string; value: string };

export type TraceToolOutput =
  | { kind: "listing"; path: string; entries: Array<{ kind: "dir" | "file" | "link"; name: string }> }
  | { kind: "fields"; rows: TraceFieldRow[]; rest: string }
  | { kind: "text"; text: string };

const FIELD_KEY = /^[a-z][a-z0-9_]*$/;
const LISTING_KIND = new Set(["path", "dir", "file", "link"]);

/** 把工具正文拆成目录列表、字段表或普通文本。末行被截断时仍保留已完整的行。 */
export function parseToolOutput(body: string): TraceToolOutput {
  const lines = body.split("\n");
  const listing: Array<{ kind: string; name: string }> = [];
  let listingOk = lines.some((line) => line.length > 0);
  for (let index = 0; index < lines.length && listingOk; index += 1) {
    const line = lines[index] ?? "";
    if (!line) {
      if (index !== lines.length - 1) listingOk = false;
      continue;
    }
    const tab = line.indexOf("\t");
    if (tab <= 0) {
      listingOk = index === lines.length - 1 && listing.length > 0;
      break;
    }
    const kind = line.slice(0, tab);
    const name = line.slice(tab + 1);
    if (!LISTING_KIND.has(kind) || !name || name.includes("\t")) {
      listingOk = false;
      break;
    }
    listing.push({ kind, name });
  }
  if (listingOk && listing.length > 0) {
    return {
      kind: "listing",
      path: listing.find((row) => row.kind === "path")?.name ?? "",
      entries: listing
        .filter((row) => row.kind === "dir" || row.kind === "file" || row.kind === "link")
        .map((row) => ({ kind: row.kind as "dir" | "file" | "link", name: row.name })),
    };
  }

  const rows: TraceFieldRow[] = [];
  let index = 0;
  for (; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line === "") {
      index += 1;
      break;
    }
    const tab = line.indexOf("\t");
    if (tab <= 0) break;
    const key = line.slice(0, tab);
    if (!FIELD_KEY.test(key)) break;
    rows.push({ key, value: line.slice(tab + 1).split("\t").join(" ") });
  }
  if (rows.length > 0) {
    return { kind: "fields", rows, rest: lines.slice(index).join("\n").replace(/^\n+/, "") };
  }
  return { kind: "text", text: body };
}

/** Trace 里的一条对话消息。 */
export type TraceMessageCard = {
  role: string;
  content: unknown;
  name?: string;
  toolCallId?: string;
  toolCalls?: unknown;
};

const MESSAGE_ROLE_ORDER = ["system", "user", "assistant", "tool"];

/** 从 Trace 的 messages 读出角色和正文。不是消息数组则返回 null。 */
export function readTraceMessages(value: unknown): TraceMessageCard[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const cards: TraceMessageCard[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const role = (item as { role?: unknown }).role;
    if (typeof role !== "string" || role.length === 0) return null;
    const row = item as {
      content?: unknown;
      name?: unknown;
      tool_call_id?: unknown;
      tool_calls?: unknown;
    };
    cards.push({
      role,
      content: "content" in row ? row.content : null,
      ...(typeof row.name === "string" && row.name ? { name: row.name } : {}),
      ...(typeof row.tool_call_id === "string" && row.tool_call_id ? { toolCallId: row.tool_call_id } : {}),
      ...(Array.isArray(row.tool_calls) ? { toolCalls: row.tool_calls } : {}),
    });
  }
  return cards;
}

/** 按固定角色顺序统计每种有多少条。 */
export function countMessageRoles(
  messages: Array<{ role: string }>,
): Array<{ role: string; count: number }> {
  const counts = new Map<string, number>();
  for (const message of messages) {
    counts.set(message.role, (counts.get(message.role) ?? 0) + 1);
  }
  const roles = [
    ...MESSAGE_ROLE_ORDER.filter((role) => counts.has(role)),
    ...[...counts.keys()].filter((role) => !MESSAGE_ROLE_ORDER.includes(role)),
  ];
  return roles.map((role) => ({ role, count: counts.get(role) ?? 0 }));
}

/** 折叠标题用：按固定角色顺序写出每种有多少条。 */
export function summarizeMessageRoles(messages: Array<{ role: string }>): string {
  return countMessageRoles(messages)
    .map((item) => `${item.role} ${item.count}`)
    .join(" · ");
}

/** 短标量数组用标签展示（工具名等），不排成带序号的竖表。 */
export function isChipValueList(value: unknown[]): boolean {
  return (
    value.length > 0 &&
    value.every((item) => {
      if (item == null || typeof item === "number" || typeof item === "boolean") return true;
      return typeof item === "string" && item.length <= 72 && !item.includes("\n");
    })
  );
}

export function isSystemSectionList(value: unknown): value is SystemSectionRecord[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const row = item as { id?: unknown; text?: unknown };
    return typeof row.id === "string" && row.id.length > 0 && typeof row.text === "string";
  });
}
