/**
 * Composer 富文本输入：contenteditable + `/skill` / `@path` 芯片。
 * 对外暴露与 textarea 相近的 handle（focus / selection / caret 锚点）。
 */
import {
  type FormEvent,
  forwardRef,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import { ComposerHistory, composerHistoryAction } from "./composerHistory";
import { type ParseMentionMode, parseMentionSegments } from "./composerMentions";

export type ComposerEditorHandle = {
  focus: () => void;
  blur: () => void;
  /** 纯文本（与 draft 一致）。 */
  getValue: () => string;
  getSelectionStart: () => number;
  setSelectionRange: (start: number, end: number) => void;
  getCaretAnchor: () => { left: number; top: number; bottom: number };
  getElement: () => HTMLDivElement | null;
};

type Props = {
  value: string;
  placeholder?: string;
  className?: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  onCaretChange?: () => void;
  /** 剪贴板含图片时回调；返回 true 表示已处理（不再插入纯文本）。 */
  onPasteImages?: (files: File[]) => boolean | void;
};

function atLabel(path: string): string {
  const norm = path.replace(/\\/g, "/");
  return norm.split("/").pop() || norm;
}

function createChip(kind: "slash" | "at", key: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = `mention-chip mention-chip--${kind}`;
  span.contentEditable = "false";
  span.dataset.mention = kind;
  if (kind === "slash") {
    span.dataset.name = key;
    span.title = `/${key}`;
  } else {
    span.dataset.path = key;
    span.title = key;
  }
  const mark = document.createElement("span");
  mark.className = "mention-chip__mark";
  mark.textContent = kind === "slash" ? "/" : "@";
  const label = document.createElement("span");
  label.className = "mention-chip__label";
  label.textContent = kind === "slash" ? key : atLabel(key);
  span.append(mark, label);
  return span;
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  if (node.dataset.mention === "slash") return `/${node.dataset.name ?? ""}`;
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
function lastMeaningfulChild(root: HTMLElement): Node | null {
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

function fillEditor(root: HTMLElement, text: string, mode: ParseMentionMode = "edit"): void {
  root.replaceChildren();
  if (!text) return;
  const segs = parseMentionSegments(text, mode);
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
    } else {
      root.appendChild(createChip("at", seg.path));
    }
  }
  // 末尾单个 br 没有行高，补一个占位 br 才能把光标放到最后一行之后
  if (text.endsWith("\n")) {
    const pad = document.createElement("br");
    pad.dataset.pad = "1";
    root.appendChild(pad);
  }
}

/** 末尾换行是 br 时补占位，让最后一行之下还能再出现一行。文本节点里的 \\n 交给 pre-wrap。 */
function ensureTrailingPad(root: HTMLElement, text: string): void {
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
function insertComposerNewline(root: HTMLElement): void {
  const before = serializeComposerEditor(root);
  document.execCommand("insertText", false, "\n");
  if (serializeComposerEditor(root) === before) {
    document.execCommand("insertLineBreak");
  }
  ensureTrailingPad(root, serializeComposerEditor(root));
}

function revealCaret(root: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  if (rect.height === 0 && rect.width === 0) return;
  const box = root.getBoundingClientRect();
  if (rect.bottom > box.bottom - 1) {
    root.scrollTop += rect.bottom - box.bottom + 4;
  }
}

function chipKey(text: string, mode: ParseMentionMode): string {
  return parseMentionSegments(text, mode)
    .filter((seg) => seg.kind !== "text")
    .map((seg) => (seg.kind === "slash" ? `/${seg.name}` : `@${seg.path}`))
    .join("\n");
}

function domChipKey(root: HTMLElement): string {
  const keys: string[] = [];
  const walk = (node: Node) => {
    if (!(node instanceof HTMLElement) || node.dataset.pad === "1") return;
    if (node.dataset.mention === "slash") {
      keys.push(`/${node.dataset.name ?? ""}`);
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
function setPlainCaret(root: HTMLElement, offset: number): void {
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
function getPlainCaret(root: HTMLElement): number {
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

function caretAnchor(root: HTMLElement): { left: number; top: number; bottom: number } {
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

export const ComposerEditor = forwardRef<ComposerEditorHandle, Props>(function ComposerEditor(
  { value, placeholder, className, onChange, onKeyDown, onCaretChange, onPasteImages },
  ref,
) {
  const elRef = useRef<HTMLDivElement>(null);
  const skipSync = useRef(false);
  const lastValue = useRef(value);
  /** IME 组合中：禁止重建 DOM，否则拼音会被立刻固化。 */
  const composingRef = useRef(false);
  const historyRef = useRef(new ComposerHistory());
  const applyingHistory = useRef(false);

  useImperativeHandle(ref, () => ({
    focus: () => elRef.current?.focus(),
    blur: () => elRef.current?.blur(),
    getValue: () => (elRef.current ? serializeComposerEditor(elRef.current) : ""),
    getSelectionStart: () => (elRef.current ? getPlainCaret(elRef.current) : 0),
    setSelectionRange: (start: number, _end?: number) => {
      const el = elRef.current;
      if (!el) return;
      el.focus();
      setPlainCaret(el, start);
    },
    getCaretAnchor: () =>
      elRef.current ? caretAnchor(elRef.current) : { left: 0, top: 0, bottom: 0 },
    getElement: () => elRef.current,
  }));

  // 受控同步：外部 value 变化时重绘芯片（保留光标）
  useLayoutEffect(() => {
    const el = elRef.current;
    if (!el) return;
    // 组合输入期间勿同步，避免打断 IME
    if (composingRef.current) return;
    if (skipSync.current) {
      skipSync.current = false;
      lastValue.current = value;
      // DOM 已一致才跳过；否则仍须同步（避免 skipSync 卡住时发完消息清不掉）
      if (serializeComposerEditor(el) === value) return;
    } else if (value === lastValue.current && serializeComposerEditor(el) === value) {
      return;
    }
    const hadFocus = document.activeElement === el;
    const caret = hadFocus ? getPlainCaret(el) : value.length;
    // 外部整段替换（发送后清空、载入编辑）时丢弃本框历史
    historyRef.current.clear();
    // 外部写入用 display：行末完整 token 也固化为芯片
    fillEditor(el, value, "display");
    lastValue.current = value;
    if (hadFocus) setPlainCaret(el, caret);
    el.classList.toggle("is-empty", !value);
  }, [value]);

  useEffect(() => {
    const el = elRef.current;
    if (el) el.classList.toggle("is-empty", !value);
  }, [value]);

  /** 从 DOM 同步 draft。只有 mention 芯片需要固化时才重绘，避免清掉撤销栈、吃掉末尾换行。 */
  function emitFromDom(allowRebuild: boolean) {
    const el = elRef.current;
    if (!el) return;
    const next = serializeComposerEditor(el);
    const rebuild = allowRebuild && chipKey(next, "edit") !== domChipKey(el);
    if (rebuild) {
      // 输入中用 edit：仅「后跟空白」的 token 固化，避免半截 /cre 成芯片
      const caret = getPlainCaret(el);
      fillEditor(el, next, "edit");
      setPlainCaret(el, caret);
    } else {
      ensureTrailingPad(el, next);
    }
    skipSync.current = true;
    lastValue.current = next;
    el.classList.toggle("is-empty", !next);
    onChange(next);
    onCaretChange?.();
  }

  function snapshotBeforeEdit() {
    const el = elRef.current;
    if (!el || applyingHistory.current || composingRef.current) return;
    historyRef.current.checkpoint(serializeComposerEditor(el), getPlainCaret(el));
  }

  function restoreSnapshot(next: { text: string; caret: number } | null) {
    const el = elRef.current;
    if (!el || !next) return;
    applyingHistory.current = true;
    fillEditor(el, next.text, "edit");
    setPlainCaret(el, next.caret);
    skipSync.current = true;
    lastValue.current = next.text;
    el.classList.toggle("is-empty", !next.text);
    onChange(next.text);
    onCaretChange?.();
    applyingHistory.current = false;
  }

  function onBeforeInput(e: FormEvent<HTMLDivElement>) {
    const inputType = (e.nativeEvent as InputEvent).inputType ?? "";
    if (inputType === "historyUndo" || inputType === "historyRedo") {
      e.preventDefault();
      return;
    }
    snapshotBeforeEdit();
  }

  function onInput(_e: FormEvent<HTMLDivElement>) {
    if (applyingHistory.current) return;
    if (composingRef.current) {
      // 组合中只同步 draft，绝不 rebuild DOM
      const el = elRef.current;
      if (!el) return;
      const next = serializeComposerEditor(el);
      lastValue.current = next;
      el.classList.toggle("is-empty", !next);
      onChange(next);
      return;
    }
    emitFromDom(true);
  }

  function handleCompositionStart() {
    snapshotBeforeEdit();
    composingRef.current = true;
  }

  function handleCompositionEnd() {
    composingRef.current = false;
    // 落字后再固化 mention 芯片
    emitFromDom(true);
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    // IME 选字中的按键（含 Enter / 数字键）勿拦截
    if (e.nativeEvent.isComposing || e.keyCode === 229) {
      return;
    }
    const historyAction = composerHistoryAction(e);
    if (historyAction) {
      e.preventDefault();
      const el = elRef.current;
      if (!el) return;
      const current = { text: serializeComposerEditor(el), caret: getPlainCaret(el) };
      restoreSnapshot(
        historyAction === "undo" ? historyRef.current.undo(current) : historyRef.current.redo(current),
      );
      return;
    }
    // 禁止富文本快捷键
    if ((e.metaKey || e.ctrlKey) && ["b", "i", "u"].includes(e.key.toLowerCase())) {
      e.preventDefault();
      return;
    }
    // Shift+Enter：在末尾也能换行。Enter 发送仍交给上层。
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      const el = elRef.current;
      if (!el) return;
      snapshotBeforeEdit();
      insertComposerNewline(el);
      emitFromDom(false);
      window.requestAnimationFrame(() => revealCaret(el));
      return;
    }
    onKeyDown?.(e);
    // 菜单导航键已由上层 preventDefault，勿再刷 caret（避免菜单高亮被重置）
    if (
      e.defaultPrevented &&
      (e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "Enter" ||
        e.key === "Tab" ||
        e.key === "Escape")
    ) {
      return;
    }
    window.requestAnimationFrame(() => onCaretChange?.());
  }

  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const files: File[] = [];
    for (const item of Array.from(e.clipboardData.items ?? [])) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0 && onPasteImages?.(files)) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  }

  return (
    <div
      ref={elRef}
      className={["composer-input", "composer-input--chips", className].filter(Boolean).join(" ")}
      contentEditable
      role="textbox"
      aria-multiline="true"
      data-placeholder={placeholder ?? ""}
      spellCheck={false}
      suppressContentEditableWarning
      onInput={onInput}
      onBeforeInput={onBeforeInput}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onKeyDown={handleKeyDown}
      onKeyUp={(e) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (
          e.key === "ArrowDown" ||
          e.key === "ArrowUp" ||
          e.key === "Enter" ||
          e.key === "Tab" ||
          e.key === "Escape"
        ) {
          return;
        }
        onCaretChange?.();
      }}
      onClick={() => onCaretChange?.()}
      onPaste={onPaste}
    />
  );
});
