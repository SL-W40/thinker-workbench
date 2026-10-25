/**
 * Composer 撤销栈。contenteditable 每次重绘会清掉浏览器自带历史，所以自己记。
 * Windows / Linux：Ctrl+Z 撤销，Ctrl+Y 或 Ctrl+Shift+Z 重做。
 * macOS：⌘Z 撤销，⌘⇧Z 重做。
 */

export type ComposerSnapshot = {
  text: string;
  caret: number;
};

const HISTORY_LIMIT = 100;

export class ComposerHistory {
  private undoStack: ComposerSnapshot[] = [];
  private redoStack: ComposerSnapshot[] = [];

  /** 一次编辑开始前记下当前文本。连续相同快照不重复入栈，并清空重做。 */
  checkpoint(text: string, caret: number): void {
    const last = this.undoStack[this.undoStack.length - 1];
    if (last && last.text === text && last.caret === caret) return;
    this.undoStack.push({ text, caret });
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(current: ComposerSnapshot): ComposerSnapshot | null {
    const prev = this.undoStack.pop();
    if (!prev) return null;
    this.redoStack.push(current);
    return prev;
  }

  redo(current: ComposerSnapshot): ComposerSnapshot | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(current);
    return next;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}

export type HistoryKeyEvent = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

/** 撤销 / 重做快捷键。修饰键在 mac 上是 ⌘，其它平台是 Ctrl。 */
export function composerHistoryAction(event: HistoryKeyEvent): "undo" | "redo" | null {
  const mod = event.metaKey || event.ctrlKey;
  if (!mod || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && !event.shiftKey) return "redo";
  return null;
}
