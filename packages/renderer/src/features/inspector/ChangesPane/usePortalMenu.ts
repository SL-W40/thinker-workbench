/**
 * 面板内浮层菜单的开关、定位与「该关的时候一定关」。
 *
 * 菜单是 portal 挂在 body 上的，所以两件事必须做，缺一个菜单就会赖在屏幕上：
 * - 点外部关闭（capture 阶段，避免中间层 stopPropagation）
 * - keep-alive 切页关闭：聊天页用 hidden 藏起来，DOM 还在，靠 MutationObserver + hashchange
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useFloatingMenuCoords } from "./floatingMenu";

export function usePortalMenu(width: number) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const coords = useFloatingMenuCoords(open, wrapRef, width);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onPointer, true);
    return () => window.removeEventListener("mousedown", onPointer, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trigger = wrapRef.current;
    if (!trigger) return;

    const closeIfHidden = () => {
      if (!trigger.isConnected || trigger.closest("[hidden]")) setOpen(false);
    };

    const mo = new MutationObserver(closeIfHidden);
    let node: Element | null = trigger;
    while (node) {
      mo.observe(node, { attributes: true, attributeFilter: ["hidden"] });
      node = node.parentElement;
    }
    window.addEventListener("hashchange", closeIfHidden);
    closeIfHidden();

    return () => {
      mo.disconnect();
      window.removeEventListener("hashchange", closeIfHidden);
    };
  }, [open]);

  return { open, setOpen, toggle, close, wrapRef, menuRef, coords };
}
