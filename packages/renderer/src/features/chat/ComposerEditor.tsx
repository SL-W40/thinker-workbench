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
  if (node.tagName === "BR") return "\n";
  const inner = Array.from(node.childNodes).map(serializeNode).join("");
  if (node.tagName === "DIV" || node.tagName === "P") return `${inner}\n`;
  return inner;
}

/** 从编辑器 DOM 还原纯文本。 */
export function serializeComposerEditor(root: HTMLElement): string {
  const raw = Array.from(root.childNodes).map(serializeNode).join("");
  // contenteditable 末尾常多一个空行换行
  return raw.replace(/\n$/, "");
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
  { value, placeholder, className, onChange, onKeyDown, onCaretChange },
  ref,
) {
  const elRef = useRef<HTMLDivElement>(null);
  const skipSync = useRef(false);
  const lastValue = useRef(value);
  /** IME 组合中：禁止重建 DOM，否则拼音会被立刻固化。 */
  const composingRef = useRef(false);

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

  /** 从 DOM 同步 draft；rebuild 时会重绘 mention 芯片。 */
  function emitFromDom(rebuild: boolean) {
    const el = elRef.current;
    if (!el) return;
    const next = serializeComposerEditor(el);
    if (rebuild) {
      // 输入中用 edit：仅「后跟空白」的 token 固化，避免半截 /cre 成芯片
      const caret = getPlainCaret(el);
      fillEditor(el, next, "edit");
      setPlainCaret(el, caret);
    }
    skipSync.current = true;
    lastValue.current = next;
    el.classList.toggle("is-empty", !next);
    onChange(next);
    onCaretChange?.();
  }

  function onInput(_e: FormEvent<HTMLDivElement>) {
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
    // 禁止富文本快捷键
    if ((e.metaKey || e.ctrlKey) && ["b", "i", "u"].includes(e.key.toLowerCase())) {
      e.preventDefault();
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
