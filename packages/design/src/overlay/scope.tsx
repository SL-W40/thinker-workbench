/**
 * 同一浮层（含 Portal 出去的子菜单）共享的标记，供点外侧判断。
 */
import { createContext, useContext } from "react";

export const OverlayScopeContext = createContext<string | null>(null);

export function useOverlayScope(): string | null {
  return useContext(OverlayScopeContext);
}

/** 事件目标是否落在同一浮层标记内（含子菜单 Portal）。 */
export function eventInOverlay(target: EventTarget | null, overlayId: string, root: Node | null): boolean {
  if (!(target instanceof Node)) return false;
  if (root?.contains(target)) return true;
  let node: Node | null = target;
  while (node) {
    if (node instanceof HTMLElement && node.dataset.twOverlay === overlayId) return true;
    node = node.parentNode;
  }
  return false;
}
