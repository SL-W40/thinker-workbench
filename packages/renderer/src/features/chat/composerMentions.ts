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
  const re =
    /(?:^|[\s])@(?:"([^"]+)"|`([^`]+)`|([^\s@]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const p = (m[1] || m[2] || m[3] || "").trim().replace(/\\/g, "/");
    if (p) out.push(p.replace(/^\.\//, ""));
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
