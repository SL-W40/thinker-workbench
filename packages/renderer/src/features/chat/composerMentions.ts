/**
 * Composer `/` / `@` 触发解析与插入、contextPaths 抽取。
 */

export type MentionKind = "slash" | "at";

export type ActiveMention = {
  kind: MentionKind;
  /** 触发符在 draft 中的下标。 */
  start: number;
  /** 光标位置（query 结束）。 */
  end: number;
  /** 触发符后的过滤串（不含 / 或 @）。 */
  query: string;
};

/**
 * 根据光标位置检测是否处于 `/` 或 `@` 触发态。
 * 触发符须在行首或空白之后。
 */
export function detectActiveMention(text: string, caret: number): ActiveMention | null {
  const end = Math.max(0, Math.min(caret, text.length));
  const before = text.slice(0, end);
  // 从光标回扫到空白或行首
  let i = end - 1;
  while (i >= 0) {
    const ch = before[i]!;
    if (ch === "/" || ch === "@") {
      const prev = i === 0 ? " " : before[i - 1]!;
      if (i === 0 || /\s/.test(prev)) {
        const query = before.slice(i + 1);
        // query 内不应再有空白（否则已结束 mention）
        if (/\s/.test(query)) return null;
        return {
          kind: ch === "/" ? "slash" : "at",
          start: i,
          end,
          query,
        };
      }
      return null;
    }
    if (/\s/.test(ch)) return null;
    i -= 1;
  }
  return null;
}

/** 用替换文本覆盖触发段，返回新 draft 与新光标。 */
export function applyMentionInsert(
  text: string,
  mention: ActiveMention,
  insert: string,
): { text: string; caret: number } {
  const next = `${text.slice(0, mention.start)}${insert}${text.slice(mention.end)}`;
  const caret = mention.start + insert.length;
  return { text: next, caret };
}

/**
 * 从用户文抽取 `@path`。
 * 支持 `@foo/bar.ts`、@`path with space`、@"path with space"。
 */
export function extractContextPaths(text: string): string[] {
  const out: string[] = [];
  const re = /(?:^|[\s])@(?:"([^"]+)"|`([^`]+)`|([^\s@]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const p = (m[1] || m[2] || m[3] || "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\.\//, "")
      .replace(/\/+$/, "");
    if (p) out.push(p);
  }
  return [...new Set(out)];
}

/** 插入 @ 路径时的文本形式。 */
export function formatAtPath(relPath: string): string {
  const p = relPath.replace(/\\/g, "/");
  if (/\s/.test(p)) return `@\`${p}\` `;
  return `@${p} `;
}

/** 插入 skill 斜杠。 */
export function formatSlashSkill(name: string): string {
  return `/${name} `;
}

/** 富文本分段：普通文本 / `/skill` / `@path`。 */
export type MentionSegment =
  | { kind: "text"; text: string }
  | { kind: "slash"; text: string; name: string }
  | { kind: "at"; text: string; path: string };

export type ParseMentionMode = "display" | "edit";

/**
 * 把用户文拆成可着色的 mention 段（与 slash / @ 抽取规则对齐）。
 * - `display`：气泡展示，行末 token 也成芯片
 * - `edit`：输入中，仅「后面已有空白」的 token 成芯片（避免 /cre 半截被芯片化）
 */
export function parseMentionSegments(
  text: string,
  mode: ParseMentionMode = "display",
): MentionSegment[] {
  if (!text) return [];
  // 全局交替匹配：@ 引用 或 /skill（行首/空白后）。
  // `\b` 只挂在 skill 上——路径常以 `/` 结尾，`/` 与空白之间没有词边界。
  const re = /(?:^|[\s])(?:@(?:"([^"]+)"|`([^`]+)`|([^\s@]+))|\/([a-z0-9]+(?:-[a-z0-9]+)*)\b)/gi;
  const out: MentionSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const full = m[0]!;
    // 匹配可能含前导空白；token 从第一个 @ 或 / 起
    const tokenOffset = full.search(/[@/]/);
    if (tokenOffset < 0) continue;
    const absStart = m.index + tokenOffset;
    const token = full.slice(tokenOffset);
    const absEnd = absStart + token.length;
    // 编辑态：必须后跟空白才固化为芯片
    if (mode === "edit") {
      const next = text[absEnd];
      if (next === undefined || !/\s/.test(next)) {
        continue;
      }
    }
    if (absStart > last) {
      out.push({ kind: "text", text: text.slice(last, absStart) });
    }
    const slashName = m[4];
    if (slashName) {
      out.push({ kind: "slash", text: token, name: slashName.toLowerCase() });
    } else {
      const path = (m[1] || m[2] || m[3] || "").trim().replace(/\\/g, "/").replace(/^\.\//, "");
      if (path) out.push({ kind: "at", text: token, path });
      else out.push({ kind: "text", text: token });
    }
    last = absEnd;
    // 避免零宽死循环
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out.length ? out : [{ kind: "text", text }];
}
