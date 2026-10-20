/**
 * Composer 富文本输入（编排壳）：contenteditable + `/skill` / `@path` 芯片。
 * 对外暴露与 textarea 相近的 handle（focus / selection / caret 锚点）。
 * DOM 序列化与光标见 ./dom，DOM 变更见 ./mutate。
 */

import type { ChatAttachmentRef } from "@thinker-workbench/shared";
import {
  type FormEvent,
  forwardRef,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import { ComposerHistory, composerHistoryAction } from "../composerHistory";
import { extractUrls } from "../composerMentions";
import {
  caretAnchor,
  chipKey,
  domChipKey,
  getPlainCaret,
  serializeComposerEditor,
  setPlainCaret,
} from "./dom";
import { ensureTrailingPad, fillEditor, insertComposerNewline, revealCaret } from "./mutate";

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
  onPasteImages?: (files: File[]) => boolean | undefined;
  /** 剪贴板含文件（含图片，统一附件流）时回调；返回 true 表示已处理（不再插入纯文本）。 */
  onPasteFiles?: (files: File[]) => boolean | undefined;
  /** 外部附件引用（@file:<id> → 展示名），供回填时解析芯片标签。 */
  attachments?: ChatAttachmentRef[];
};

export const ComposerEditor = forwardRef<ComposerEditorHandle, Props>(function ComposerEditor(
  {
    value,
    placeholder,
    className,
    onChange,
    onKeyDown,
    onCaretChange,
    onPasteImages,
    onPasteFiles,
    attachments,
  },
  ref,
) {
  const elRef = useRef<HTMLDivElement>(null);
  const skipSync = useRef(false);
  const lastValue = useRef(value);
  /** IME 组合中：禁止重建 DOM，否则拼音会被立刻固化。 */
  const composingRef = useRef(false);
  const historyRef = useRef(new ComposerHistory());
  const applyingHistory = useRef(false);
  /** 本次粘贴文本里的网址：允许固化成链接芯片（手打网址不芯片化）。 */
  const pastedUrlsRef = useRef<string[]>([]);

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
    const domText = serializeComposerEditor(el);
    // 受控同步三态：noop / pureAppend / fullReplace
    if (skipSync.current) {
      skipSync.current = false;
      lastValue.current = value;
      // DOM 已一致才跳过；否则仍须同步（避免 skipSync 卡住时发完消息清不掉）
      if (domText === value) return;
    } else if (value === lastValue.current && domText === value) {
      return;
    }
    const hadFocus = document.activeElement === el;
    // 纯追加（粘贴/附加文件 token、行尾补 @ 引用、mention 追加）：保留历史、光标跟末尾
    const pureAppend = value.length > domText.length && value.startsWith(domText);
    const caret = hadFocus ? (pureAppend ? value.length : getPlainCaret(el)) : value.length;
    // 仅「整段替换」（发送后清空 / 载入编辑 / 不一致恢复）才清空撤销栈；纯追加不清
    if (!pureAppend) historyRef.current.clear();
    // 外部写入用 display：行末完整 token 也固化为芯片
    fillEditor(el, value, "display", attachments);
    lastValue.current = value;
    if (hadFocus) setPlainCaret(el, caret);
    el.classList.toggle("is-empty", !value);
  }, [value, attachments]);

  useEffect(() => {
    const el = elRef.current;
    if (el) el.classList.toggle("is-empty", !value);
  }, [value]);

  /** 从 DOM 同步 draft。只有 mention 芯片需要固化时才重绘，避免清掉撤销栈、吃掉末尾换行。 */
  function emitFromDom(allowRebuild: boolean) {
    const el = elRef.current;
    if (!el) return;
    const next = serializeComposerEditor(el);
    const domKey = domChipKey(el);
    // 已固化的芯片免检：否则删掉尾随空格的芯片每次输入都被判为「芯片集合变了」而反复重绘
    const pinned = new Set(domKey.split("\n").filter(Boolean));
    // 粘贴进来的网址：本次允许固化成链接芯片
    for (const url of pastedUrlsRef.current) pinned.add(url);
    pastedUrlsRef.current = [];
    const rebuild = allowRebuild && chipKey(next, "edit", pinned) !== domKey;
    if (rebuild) {
      // 输入中用 edit：仅「已固化」（面板选中 / 附件 / 粘贴网址）的 token 固化，
      // 避免手打的 /cre、@path、网址在输入过程中被芯片化
      const caret = getPlainCaret(el);
      fillEditor(el, next, "edit", attachments, pinned);
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
    fillEditor(el, next.text, "edit", attachments);
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
        historyAction === "undo"
          ? historyRef.current.undo(current)
          : historyRef.current.redo(current),
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
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    // 统一附件流：composer 把所有文件（含图片）落盘为 @file:<id> 芯片；
    // 原位编辑流只传 onPasteImages，图片回退到旧附图通道。
    if (files.length > 0 && onPasteFiles?.(files)) {
      e.preventDefault();
      return;
    }
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length > 0 && onPasteImages?.(imageFiles)) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    // 文本里的网址自动固化为链接芯片；纯文本插入后由 emitFromDom 完成芯片化
    pastedUrlsRef.current = extractUrls(text);
    document.execCommand("insertText", false, text);
  }

  return (
    // biome-ignore lint/a11y/useFocusableInteractive: contentEditable 本身可聚焦，无需 tabIndex
    // biome-ignore lint/a11y/useSemanticElements: 富文本编辑器（contentEditable + role="textbox"），需携带 mention 芯片，非原生 input/textarea 可替代
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
