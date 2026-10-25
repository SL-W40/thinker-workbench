/**
 * create_plan 参数的「半成品」解析。
 *
 * 模型流式输出 tool_call.arguments 时，JSON 是逐字符到达的：整体 `JSON.parse`
 * 必然失败。这里按 JSON 结构顺序走一遍已到达的前缀，能读到的字段就先读出来，
 * 用于让时间线卡片随生成过程逐步成形；读不到的字段留待后续片段。
 *
 * 只服务于 UI 预览 —— 真正的计划状态由create_plan 执行时的完整参数产出，
 * 因此这里对畸形输入一律尽量降级，不抛错、不做任何文本猜测。
 */
import { type ChatPlanStatus, type ChatTodo, normalizeTodos } from "@thinker-workbench/shared";

/** 从参数前缀能读出的计划字段（缺省表示尚未到达）。 */
export type PartialPlanArgs = {
  title?: string;
  description?: string;
  status: ChatPlanStatus;
  todos: ChatTodo[];
};

type Cursor = { text: string; i: number };

function skipWs(c: Cursor): void {
  while (c.i < c.text.length && /\s/.test(c.text[c.i] as string)) c.i += 1;
}

/** 读一个 JSON 字符串；未闭合时返回已解出的部分并标记 closed=false。 */
function readString(c: Cursor): { value: string; closed: boolean } {
  c.i += 1; // 跳过起始引号
  let out = "";
  while (c.i < c.text.length) {
    const ch = c.text[c.i] as string;
    if (ch === "\\") {
      const next = c.text[c.i + 1];
      if (next === undefined) break; // 转义写到一半
      c.i += 2;
      if (next === "n") out += "\n";
      else if (next === "t") out += "\t";
      else if (next === "r") out += "\r";
      else if (next === "b") out += "\b";
      else if (next === "f") out += "\f";
      else if (next === "u") {
        const hex = c.text.slice(c.i, c.i + 4);
        if (hex.length < 4) {
          c.i = c.text.length;
          return { value: out, closed: false };
        }
        const code = Number.parseInt(hex, 16);
        if (Number.isFinite(code)) out += String.fromCharCode(code);
        c.i += 4;
      } else out += next;
      continue;
    }
    if (ch === '"') {
      c.i += 1;
      return { value: out, closed: true };
    }
    out += ch;
    c.i += 1;
  }
  return { value: out, closed: false };
}

/** 跳过一个完整值（未闭合则跳到末尾），用于丢弃不关心的字段。 */
function skipValue(c: Cursor): void {
  const ch = c.text[c.i];
  if (ch === '"') {
    readString(c);
    return;
  }
  if (ch === "{" || ch === "[") {
    const stack: string[] = [];
    while (c.i < c.text.length) {
      const cur = c.text[c.i] as string;
      if (cur === '"') {
        readString(c);
        continue;
      }
      if (cur === "{" || cur === "[") {
        stack.push(cur === "{" ? "}" : "]");
        c.i += 1;
        continue;
      }
      if (cur === "}" || cur === "]") {
        stack.pop();
        c.i += 1;
        if (stack.length === 0) return;
        continue;
      }
      c.i += 1;
    }
    return;
  }
  while (c.i < c.text.length && !",}]".includes(c.text[c.i] as string)) c.i += 1;
}

/** 读一个待办对象（半成品也收）；c.i 指向 `{`。 */
function readTodoRow(c: Cursor): Record<string, unknown> | null {
  c.i += 1; // 跳过 `{`
  const row: Record<string, unknown> = {};
  while (c.i < c.text.length) {
    skipWs(c);
    if (c.text[c.i] === "}") {
      c.i += 1;
      break;
    }
    if (c.text[c.i] !== '"') break;
    const key = readString(c);
    if (!key.closed) break;
    skipWs(c);
    if (c.text[c.i] !== ":") break;
    c.i += 1;
    skipWs(c);
    if (c.text[c.i] === '"') {
      const value = readString(c);
      if (key.value === "id" || key.value === "label" || key.value === "status") {
        row[key.value] = value.value;
      }
      // 字符串还没吐完：本项的其余字段不可能到达，直接收尾
      if (!value.closed) break;
    } else {
      skipValue(c);
    }
    skipWs(c);
    if (c.text[c.i] === ",") {
      c.i += 1;
    }
  }
  return Object.keys(row).length > 0 ? row : null;
}

/** 读 todos 数组（允许尾部元素半成品）；c.i 指向 `[`。 */
function readTodos(c: Cursor): ChatTodo[] {
  c.i += 1; // 跳过 `[`
  const rows: Record<string, unknown>[] = [];
  while (c.i < c.text.length) {
    skipWs(c);
    const ch = c.text[c.i];
    if (ch === "]") break;
    if (ch === "{") {
      const row = readTodoRow(c);
      if (row) rows.push(row);
      skipWs(c);
      if (c.text[c.i] === ",") {
        c.i += 1;
        continue;
      }
      if (c.text[c.i] !== "]") break;
      continue;
    }
    if (ch === ",") {
      c.i += 1;
      continue;
    }
    // 非对象元素（罕见）：跳过，交给最终执行时校验
    skipValue(c);
    skipWs(c);
    if (c.text[c.i] === ",") c.i += 1;
  }
  // 与执行时同一套校验：丢弃缺 label 的项、缺 id 按序补齐、非法状态回落
  return normalizeTodos(rows);
}

function readStatus(value: string, fallback: ChatPlanStatus): ChatPlanStatus {
  const text = value.trim();
  if (text === "draft" || text === "ready" || text === "building" || text === "done") return text;
  return fallback;
}

/**
 * 解析 create_plan 参数前缀。
 * 尚未出现的字段不会出现在返回值里（`todos` 恒为数组，`status` 默认 ready）。
 */
export function readPartialPlanArgs(raw: string): PartialPlanArgs {
  const out: PartialPlanArgs = { status: "ready", todos: [] };
  const c: Cursor = { text: raw ?? "", i: 0 };
  skipWs(c);
  if (c.text[c.i] !== "{") return out;
  c.i += 1;

  while (c.i < c.text.length) {
    skipWs(c);
    if (c.text[c.i] !== '"') break;
    const key = readString(c);
    if (!key.closed) break;
    skipWs(c);
    if (c.text[c.i] !== ":") break;
    c.i += 1;
    skipWs(c);

    if (key.value === "todos") {
      out.todos = readTodos(c);
    } else if (c.text[c.i] === '"') {
      const value = readString(c);
      if (key.value === "title" && value.value.trim()) out.title = value.value.trim();
      if (key.value === "description" && value.value.trim()) {
        out.description = value.value.trim();
      }
      if (key.value === "status") out.status = readStatus(value.value, out.status);
      // 该字段还没吐完：后续字段必然更不完整
      if (!value.closed) break;
    } else {
      skipValue(c);
    }

    skipWs(c);
    if (c.text[c.i] === ",") {
      c.i += 1;
      continue;
    }
    break;
  }
  return out;
}
