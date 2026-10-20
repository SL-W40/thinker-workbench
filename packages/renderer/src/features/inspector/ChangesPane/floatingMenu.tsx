/**
 * 浮动菜单定位与 portal 挂载（ChangesPane 视图 / CTA 菜单共用）。
 */
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useLayoutEffect,
  useState,
} from "react";
import { createPortal } from "react-dom";

const MENU_GAP = 6;
const MENU_VIEW_PAD = 8;

export type FloatingMenuCoords = {
  top: number;
  left: number;
  minWidth: number;
};

/** 右对齐触发器，必要时夹入视口，避免被侧栏 overflow 裁切（配合 portal）。*/
export function placeFloatingMenu(trigger: DOMRect, minWidth: number): FloatingMenuCoords {
  const vw = window.innerWidth;
  const width = Math.max(minWidth, trigger.width);
  let left = trigger.right - width;
  if (left < MENU_VIEW_PAD) left = MENU_VIEW_PAD;
  if (left + width > vw - MENU_VIEW_PAD) {
    left = Math.max(MENU_VIEW_PAD, vw - width - MENU_VIEW_PAD);
  }
  return {
    top: trigger.bottom + MENU_GAP,
    left,
    minWidth: width,
  };
}

/** 将菜单挂到 body，并随触发器 / 滚动 / 窗口变化重算位置。*/
export function useFloatingMenuCoords(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  minWidth: number,
): FloatingMenuCoords | null {
  const [coords, setCoords] = useState<FloatingMenuCoords | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    function update() {
      const el = triggerRef.current;
      if (!el) return;
      setCoords(placeFloatingMenu(el.getBoundingClientRect(), minWidth));
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, triggerRef, minWidth]);

  return coords;
}

export function PortalMenu({
  open,
  coords,
  menuRef,
  className,
  children,
}: {
  open: boolean;
  coords: FloatingMenuCoords | null;
  menuRef: RefObject<HTMLDivElement | null>;
  className?: string;
  children: ReactNode;
}) {
  if (!open || !coords || typeof document === "undefined") return null;
  const style: CSSProperties = {
    top: coords.top,
    left: coords.left,
    minWidth: coords.minWidth,
  };
  return createPortal(
    <div
      ref={menuRef}
      className={`changes-pane__menu changes-pane__menu--portal${className ? ` ${className}` : ""}`}
      role="menu"
      style={style}
    >
      {children}
    </div>,
    document.body,
  );
}
