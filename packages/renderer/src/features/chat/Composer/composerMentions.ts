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
    const ch = before[i];
    if (ch === undefined) break;
    if (ch === "/" || ch === "@") {
      const prev = i === 0 ? " " : (before[i - 1] ?? " ");
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
      // 非词首的 @ 视为邮箱等，结束 mention；非词首的 / 是路径分隔符，继续回溯
      if (ch === "@") return null;
      i -= 1;
      continue;
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
 * 从用户文抽取 `@path`（仅工作空间相对路径）。
 * 外部附件 `@file:<id>` 不在此列，走 `extractAttachmentIds` 单独通道。
 * 支持 `@foo/bar.ts`、@`path with space`、@"path with space"。
 */
export function extractContextPaths(text: string): string[] {
  const out: string[] = [];
  const re = /(?:^|[\s])@(?:"([^"]+)"|`([^`]+)`|([^\s@]+))/g;
  for (const m of text.matchAll(re)) {
    const p = (m[1] || m[2] || m[3] || "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\.\//, "")
      .replace(/\/+$/, "");
    if (!p || p.startsWith("file:")) continue;
    out.push(p);
  }
  return [...new Set(out)];
}

/** 抽取文本中的外部附件 id（`@file:<id>`，可紧接前文，无需前导空白）。 */
export function extractAttachmentIds(text: string): string[] {
  const ids: string[] = [];
  const re = /@file:([^\s@]+)/g;
  for (const m of text.matchAll(re)) {
    const id = (m[1] ?? "").trim();
    if (id) ids.push(id);
  }
  return [...new Set(ids)];
}

/** 是否为外部附件引用路径（`file:<id>`）。 */
export function isAttachmentPath(path: string): boolean {
  return path.startsWith("file:");
}

/** 插入 @ 路径时的文本形式。 */
export function formatAtPath(relPath: string): string {
  const p = relPath.replace(/\\/g, "/");
  if (/\s/.test(p)) return `@\`${p}\` `;
  return `@${p} `;
}

/** 插入外部附件引用的文本形式。 */
export function formatFileAttachment(id: string): string {
  return `@file:${id} `;
}

/** 插入 skill 斜杠。 */
export function formatSlashSkill(name: string): string {
  return `/${name} `;
}

/**
 * 网址：仅 http/https（粘贴进来的链接自动芯片化）。
 * 排除 CJK 区段——中文正文常紧跟在链接后（"见 https://a.com/x这里"），
 * 且中文标点（。、，）不属于网址。
 */
const URL_RE = /https?:\/\/[^\s<>"'\\\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]+/gi;

/** 句末标点不属于网址（中英混排常见 "见 https://a.com。"）。 */
function stripTrailingPunctuation(url: string): string {
  let out = url;
  for (;;) {
    const last = out.slice(-1);
    if (last && ".,;:!?".includes(last)) {
      out = out.slice(0, -1);
      continue;
    }
    // 右括号只有在没有配对左括号时，才可能是句末标点而非网址的一部分
    const closeIdx = ")]}".indexOf(last);
    if (closeIdx >= 0) {
      const openCh = "([{".charAt(closeIdx);
      const opens = out.split(openCh).length - 1;
      const closes = out.split(last).length - 1;
      if (closes > opens) {
        out = out.slice(0, -1);
        continue;
      }
    }
    break;
  }
  return out;
}

/** 抽取文本中的网址（去重、剔除句末标点）。供粘贴时判断该固化哪些芯片。 */
export function extractUrls(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const url = stripTrailingPunctuation(m[0]);
    if (url) out.push(url);
  }
  return [...new Set(out)];
}

/** 网址芯片的展示标签：去掉协议 / www，过长中间省略（不铺开完整 URL）。 */
export function linkLabel(url: string): string {
  const s = url
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
  if (s.length <= 40) return s;
  return `${s.slice(0, 24)}…${s.slice(-12)}`;
}

/** 富文本分段：普通文本 / `/skill` / `@path` / 网址。 */
export type MentionSegment =
  | { kind: "text"; text: string }
  | { kind: "slash"; text: string; name: string }
  | { kind: "at"; text: string; path: string }
  | { kind: "link"; text: string; url: string };

export type ParseMentionMode = "display" | "edit";

/**
 * 把用户文拆成可着色的 mention 段（与 slash / @ 抽取规则对齐）。
 * - `display`：气泡展示，行末 token 也成芯片
 * - `edit`：输入中，仅「后面已有空白」的 token 成芯片（避免 /cre 半截被芯片化）
 */
function parseMentionCore(
  text: string,
  mode: ParseMentionMode = "display",
  /** 已在 DOM 中固化的芯片键（`/name` / `@path`）：编辑态下免检，防止删掉尾随空格后芯片"溶解"回纯文本 */
  pinned?: ReadonlySet<string>,
): MentionSegment[] {
  if (!text) return [];
  // 两段式交替匹配：
  //  - `@file:<id>` 任意位置（含紧接前文，无需前导空白），外部附件统一 token
  //  - 其它 `@path` / `/skill` 须行首或空白后（避免把邮箱等 @ 误判为芯片）
  // `\b` 只挂在 skill 上——路径常以 `/` 结尾，`/` 与空白之间没有词边界。
  const re =
    /@file:([^\s@]+)|(?:^|[\s])(?:@(?:"([^"]+)"|`([^`]+)`|([^\s@]+))|\/([a-z0-9]+(?:-[a-z0-9]+)*)\b)/gi;
  const out: MentionSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const full = m[0] ?? "";
    // 匹配可能含前导空白；token 从第一个 @ 或 / 起
    const tokenOffset = full.search(/[@/]/);
    if (tokenOffset < 0) continue;
    const absStart = m.index + tokenOffset;
    const token = full.slice(tokenOffset);
    const absEnd = absStart + token.length;
    // 编辑态：芯片只来自「DOM 中已固化的芯片」（面板选中 / 附件插入产生的）。
    // 手打的 /xxx、@path 一律保持纯文本——输入只是唤起搜索，只有选中才成芯片。
    if (mode === "edit") {
      const fileId = m[1];
      const key = m[5]
        ? `/${m[5].toLowerCase()}`
        : `@${fileId ? `file:${fileId}` : (m[2] || m[3] || m[4] || "").trim().replace(/\\/g, "/").replace(/^\.\//, "")}`;
      if (!pinned?.has(key)) continue;
    }
    if (absStart > last) {
      out.push({ kind: "text", text: text.slice(last, absStart) });
    }
    const slashName = m[5];
    if (slashName) {
      out.push({ kind: "slash", text: token, name: slashName.toLowerCase() });
    } else {
      // 分支 A：@file:<id>（m[1] 为 id，无前导空白要求）
      const filePath = m[1];
      const path = filePath
        ? `file:${filePath}`
        : (m[2] || m[3] || m[4] || "").trim().replace(/\\/g, "/").replace(/^\.\//, "");
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

/**
 * 拆段入口：先按网址切段（网址成 link 芯片），其余片段走 `/` `@` 解析。
 * 编辑态下网址同样要求「已固化」（粘贴时由 ComposerEditor 把网址塞进 pinned），
 * 因此手打网址不会在输入过程中被芯片化。
 */
export function parseMentionSegments(
  text: string,
  mode: ParseMentionMode = "display",
  pinned?: ReadonlySet<string>,
): MentionSegment[] {
  if (!text) return [];
  const out: MentionSegment[] = [];
  const re = new RegExp(URL_RE.source, "gi");
  let cursor = 0;
  for (;;) {
    const m = re.exec(text);
    if (!m) break;
    const url = stripTrailingPunctuation(m[0]);
    if (!url) break;
    if (m.index > cursor) {
      out.push(...parseMentionCore(text.slice(cursor, m.index), mode, pinned));
    }
    // 编辑态：仅粘贴（pinned）或已固化的网址成芯片，其余保持纯文本
    if (mode === "edit" && !pinned?.has(url)) {
      out.push({ kind: "text", text: url });
    } else {
      out.push({ kind: "link", text: url, url });
    }
    cursor = m.index + url.length;
    re.lastIndex = cursor;
  }
  if (cursor < text.length) out.push(...parseMentionCore(text.slice(cursor), mode, pinned));
  return out.length ? out : [{ kind: "text", text }];
}
