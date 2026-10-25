/**
 * 流式光标：谁自带光标、以及光标本体。
 *
 * 「末块是否补光标」这个判定要同时被块渲染、列表项与文末附加区复用，
 * 所以单独成文件，避免各处重复判断。
 */
import type { BlockNode } from "../types";

export function ownsLiveCaret(node: BlockNode): boolean {
  if (node.type === "pending") return true;
  if (
    (node.type === "code" ||
      node.type === "diagram" ||
      node.type === "math" ||
      node.type === "table") &&
    node.incomplete
  ) {
    return true;
  }
  return false;
}

export function Caret() {
  return <span className="tw-md-caret" aria-hidden="true" />;
}
