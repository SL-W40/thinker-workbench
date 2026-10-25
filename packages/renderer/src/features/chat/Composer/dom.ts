/**
 * Composer 编辑器 DOM 纯读取 / 序列化（可在 jsdom 下单测）。
 */
import { type ParseMentionMode, parseMentionSegments } from "./composerMentions";

export function atLabel(path: string): string {
  const norm = path.replace(/\\/g, "/");
  return norm.split("/").pop() || norm;
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  if (node.dataset.mention === "slash") return `/${node.dataset.name ?? ""}`;
  if (node.dataset.mention === "link") return node.dataset.url ?? "";
  if (node.dataset.mention === "at") {
    const path = node.dataset.path ?? "";
    return /\s/.test(path) ? `@\`${path}\`` : `@${path}`;
  }
  if (node.tagName === "BR") {
    // 仅用于撑开末尾空行，不计入正文
    if (node.dataset.pad === "1") return "";
    return "\n";
  }
  const inner = Array.from(node.childNodes).map(serializeNode).join("");
  // 块本身会多记一个换行；内部已以换行结束时不要再加
  if (node.tagName === "DIV" || node.tagName === "P") {
    return inner.endsWith("\n") ? inner : `${inner}\n`;
  }
  return inner;
}

/** 跳过占位 br 和空文本，找到真正的末尾节点。 */
export function lastMeaningfulChild(root: HTMLElement): Node | null {
  let node: Node | null = root.lastChild;
  while (node) {
    if (node instanceof HTMLElement && node.dataset.pad === "1") {
      node = node.previousSibling;
      continue;
    }
    if (node.nodeType === Node.TEXT_NODE && !(node.textContent ?? "")) {
      node = node.previousSibling;
      continue;
    }
    return node;
  }
  return null;
}

/** 从编辑器 DOM 还原纯文本。末尾用户换行保留；块包装多出来的换行丢掉。 */
export function serializeComposerEditor(root: HTMLElement): string {
  const raw = Array.from(root.childNodes).map(serializeNode).join("");
  const tail = lastMeaningfulChild(root);
  if (tail instanceof HTMLElement && (tail.tagName === "DIV" || tail.tagName === "P")) {
    return raw.replace(/\n$/, "");
  }
  return raw;
}

/** 文本中应固化的芯片键（顺序拼接）。 */
export function chipKey(
  text: string,
  mode: ParseMentionMode,
  pinned?: ReadonlySet<string>,
): string {
  return parseMentionSegments(text, mode, pinned)
    .filter((seg) => seg.kind !== "text")
    .map((seg) =>
      seg.kind === "slash" ? `/${seg.name}` : seg.kind === "link" ? seg.url : `@${seg.path}`,
    )
    .join("\n");
}

/** DOM 中已固化的芯片键（顺序拼接）。 */
export function domChipKey(root: HTMLElement): string {
  const keys: string[] = [];
  const walk = (node: Node) => {
    if (!(node instanceof HTMLElement) || node.dataset.pad === "1") return;
    if (node.dataset.mention === "slash") {
      keys.push(`/${node.dataset.name ?? ""}`);
      return;
    }
    if (node.dataset.mention === "link") {
      keys.push(node.dataset.url ?? "");
      return;
    }
    if (node.dataset.mention === "at") {
      keys.push(`@${node.dataset.path ?? ""}`);
      return;
    }
    if (node.tagName === "BR") return;
    for (const child of node.childNodes) walk(child);
  };
  for (const child of root.childNodes) walk(child);
  return keys.join("\n");
}

/** 纯文本偏移 → DOM caret。 */
export function setPlainCaret(root: HTMLElement, offset: number): void {
  const total = serializeComposerEditor(root).length;
  const target = Math.max(0, Math.min(offset, total));
  const sel = window.getSelection();
  if (!sel) return;

  let remaining = target;
  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (remaining <= len) {
        const range = document.createRange();
        range.setStart(node, remaining);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      }
      remaining -= len;
      return false;
    }
    if (!(node instanceof HTMLElement)) return false;
    if (node.dataset.mention) {
      const token =
        node.dataset.mention === "slash"
          ? `/${node.dataset.name ?? ""}`
          : node.dataset.mention === "link"
            ? (node.dataset.url ?? "")
            : /\s/.test(node.dataset.path ?? "")
              ? `@\`${node.dataset.path}\``
              : `@${node.dataset.path ?? ""}`;
      if (remaining <= token.length) {
        // 落在芯片上：放在芯片后
        const range = document.createRange();
        range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      }
      remaining -= token.length;
      return false;
    }
    if (node.tagName === "BR") {
      if (node.dataset.pad === "1") return false;
      if (remaining <= 1) {
        const range = document.createRange();
        range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      }
      remaining -= 1;
      return false;
    }
    for (const child of Array.from(node.childNodes)) {
      if (walk(child)) return true;
    }
    return false;
  };

  for (const child of Array.from(root.childNodes)) {
    if (walk(child)) return;
  }
  // 落到末尾
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** DOM caret → 纯文本偏移。 */
export function getPlainCaret(root: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return serializeComposerEditor(root).length;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) {
    return serializeComposerEditor(root).length;
  }

  const pre = document.createRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.startContainer, range.startOffset);

  // 用克隆子树序列化 pre 内容
  const holder = document.createElement("div");
  holder.appendChild(pre.cloneContents());
  return serializeComposerEditor(holder).length;
}

/** 光标屏幕锚点（弹窗定位用）。 */
export function caretAnchor(root: HTMLElement): { left: number; top: number; bottom: number } {
  const sel = window.getSelection();
  const rect = root.getBoundingClientRect();
  const line = Number.parseFloat(window.getComputedStyle(root).lineHeight) || 18;
  if (!sel || sel.rangeCount === 0) {
    return { left: rect.left + 8, top: rect.top + 8, bottom: rect.top + 8 + line };
  }
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  let caretRect = range.getBoundingClientRect();
  // 空编辑器时 rect 可能为 0
  if (caretRect.width === 0 && caretRect.height === 0) {
    const pad = document.createElement("span");
    pad.textContent = "\u200b";
    range.insertNode(pad);
    caretRect = pad.getBoundingClientRect();
    pad.parentNode?.removeChild(pad);
    // 恢复选区到原处
    sel.removeAllRanges();
    sel.addRange(range);
  }
  return {
    left: caretRect.left,
    top: caretRect.top,
    bottom: caretRect.bottom || caretRect.top + line,
  };
}
