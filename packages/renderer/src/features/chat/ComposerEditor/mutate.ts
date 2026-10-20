/**
 * Composer 编辑器 DOM 变更：芯片构造 / 回填 / 末尾占位 / 换行 / 光标滚动。
 */
import type { ChatAttachmentRef } from "@thinker-workbench/shared";
import { fileGlyphMarkup } from "../../inspector/icons";
import { chipIconMarkup } from "../chipIcons";
import {
  isAttachmentPath,
  linkLabel,
  type ParseMentionMode,
  parseMentionSegments,
} from "../composerMentions";
import { atLabel, domChipKey, lastMeaningfulChild, serializeComposerEditor } from "./dom";

export function createChip(
  kind: "slash" | "at" | "link",
  key: string,
  label?: string,
): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = `mention-chip mention-chip--${kind}`;
  span.contentEditable = "false";
  span.dataset.mention = kind;
  const mark = document.createElement("span");
  mark.className = "mention-chip__mark mention-chip__mark--glyph";
  // 芯片前缀一律用图标（纯 DOM，无法渲染 React 组件）：/ 代码角标、@ 文件类型、网址链条
  let text = key;
  if (kind === "slash") {
    span.dataset.name = key;
    mark.innerHTML = chipIconMarkup("slash");
  } else if (kind === "link") {
    span.dataset.url = key;
    mark.innerHTML = chipIconMarkup("link");
    // 网址不铺开完整串，只显示短标签
    text = linkLabel(key);
  } else {
    span.dataset.path = key;
    mark.innerHTML = fileGlyphMarkup(label ?? atLabel(key));
    text = label ?? atLabel(key);
  }
  const labelEl = document.createElement("span");
  labelEl.className = "mention-chip__label";
  labelEl.textContent = text;
  span.append(mark, labelEl);
  return span;
}

export function fillEditor(
  root: HTMLElement,
  text: string,
  mode: ParseMentionMode = "edit",
  attachments?: ChatAttachmentRef[],
  /** 额外允许固化的芯片键（如粘贴文本中的网址）：编辑态下免检 */
  extraPinned?: ReadonlySet<string>,
): void {
  // 重建前先记下已固化的芯片：编辑态下它们免检，删掉尾随空格也不会溶解成纯文本
  const pinned = new Set(domChipKey(root).split("\n").filter(Boolean));
  if (extraPinned) for (const key of extraPinned) pinned.add(key);
  root.replaceChildren();
  if (!text) return;
  const segs = parseMentionSegments(text, mode, pinned);
  const attachById = new Map((attachments ?? []).map((a) => [a.id, a]));
  for (const seg of segs) {
    if (seg.kind === "text") {
      // 保留换行：拆成 text + br
      const parts = seg.text.split("\n");
      parts.forEach((part, i) => {
        if (part) root.appendChild(document.createTextNode(part));
        if (i < parts.length - 1) root.appendChild(document.createElement("br"));
      });
    } else if (seg.kind === "slash") {
      root.appendChild(createChip("slash", seg.name));
    } else if (seg.kind === "link") {
      root.appendChild(createChip("link", seg.url));
    } else {
      let label: string | undefined;
      if (isAttachmentPath(seg.path)) {
        label = attachById.get(seg.path.slice("file:".length))?.name;
      }
      root.appendChild(createChip("at", seg.path, label));
    }
  }
  // 末尾单个 br 没有行高，补一个占位 br 才能把光标放到最后一行之后
  if (text.endsWith("\n")) {
    const pad = document.createElement("br");
    pad.dataset.pad = "1";
    root.appendChild(pad);
  }
}

/** 末尾换行是 br 时补占位，让最后一行之下还能再出现一行。文本节点里的 \n 交给 pre-wrap。 */
export function ensureTrailingPad(root: HTMLElement, text: string): void {
  const pads = Array.from(root.querySelectorAll("br[data-pad='1']"));
  const tail = lastMeaningfulChild(root);
  const need = text.endsWith("\n") && tail instanceof HTMLElement && tail.tagName === "BR";
  if (!need) {
    for (const pad of pads) pad.remove();
    return;
  }
  if (pads.length === 1 && root.lastChild === pads[0]) return;
  for (const pad of pads) pad.remove();
  const pad = document.createElement("br");
  pad.dataset.pad = "1";
  root.appendChild(pad);
}

/** 在光标处插入换行。优先插入文本换行，失败再退回 br。 */
export function insertComposerNewline(root: HTMLElement): void {
  const before = serializeComposerEditor(root);
  document.execCommand("insertText", false, "\n");
  if (serializeComposerEditor(root) === before) {
    document.execCommand("insertLineBreak");
  }
  ensureTrailingPad(root, serializeComposerEditor(root));
}

export function revealCaret(root: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  if (rect.height === 0 && rect.width === 0) return;
  const box = root.getBoundingClientRect();
  if (rect.bottom > box.bottom - 1) {
    root.scrollTop += rect.bottom - box.bottom + 4;
  }
}
