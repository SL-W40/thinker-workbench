/**
 * 右键 / 锚定上下文菜单：Portal 到 body，支持键盘 ↑↓/Enter/Esc 与点击外关闭。
 */
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type ContextMenuItemProps = {
  /** 菜单项标签。 */
  label: string;
  /** 选中回调。 */
  onSelect: () => void;
  /** 危险操作（删除等）。 */
  danger?: boolean;
  /** 禁用。 */
  disabled?: boolean;
  /** 左侧可选图标。 */
  icon?: ReactNode;
  /** 分隔线（渲染在该项之前）。 */
  separatorBefore?: boolean;
};

export type ContextMenuProps = {
  /** 是否打开。 */
  open: boolean;
  /** 锚点：屏幕坐标（右键）或 DOMRect（按钮菜单）。 */
  anchor: { x: number; y: number } | DOMRect | null;
  /** 关闭回调。 */
  onClose: () => void;
  /** 菜单项。 */
  items: ContextMenuItemProps[];
  /** 无障碍标签。 */
  "aria-label"?: string;
};

type Coords = {
  left: number;
  top: number;
  maxHeight: number;
};

const VIEW_PAD = 8;
const MENU_MIN = 160;
const MENU_MAX_W = 280;

/** 根据锚点把菜单钳在视口内。 */
function placeMenu(anchor: { x: number; y: number } | DOMRect, height: number): Coords {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const point =
    anchor instanceof DOMRect ? { x: anchor.left, y: anchor.bottom } : { x: anchor.x, y: anchor.y };

  let left = point.x;
  let top = point.y;
  const width = MENU_MIN;
  if (left + width > vw - VIEW_PAD) left = Math.max(VIEW_PAD, vw - width - VIEW_PAD);
  if (left < VIEW_PAD) left = VIEW_PAD;

  const spaceBelow = vh - top - VIEW_PAD;
  if (height > spaceBelow && point.y > spaceBelow) {
    top = Math.max(VIEW_PAD, point.y - height);
  }
  const maxHeight = Math.max(80, vh - top - VIEW_PAD);
  return { left, top, maxHeight };
}

export function ContextMenu({
  open,
  anchor,
  onClose,
  items,
  "aria-label": ariaLabel,
}: ContextMenuProps) {
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const enabledIndexes = items
    .map((item, index) => (item.disabled ? -1 : index))
    .filter((i) => i >= 0);

  useLayoutEffect(() => {
    if (!open || !anchor) {
      setCoords(null);
      return;
    }
    const el = listRef.current;
    const height = el?.offsetHeight ?? 200;
    setCoords(placeMenu(anchor, height));
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    const firstEnabled = items.findIndex((item) => !item.disabled);
    setActiveIndex(firstEnabled >= 0 ? firstEnabled : 0);
    const onPointer = (event: MouseEvent) => {
      const root = listRef.current;
      if (root && !root.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    // capture：避免中间层 stopPropagation；hashchange：keep-alive 切页时关掉 portal
    window.addEventListener("mousedown", onPointer, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", onClose);
    return () => {
      window.removeEventListener("mousedown", onPointer, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("hashchange", onClose);
    };
  }, [open, onClose, items]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.focus();
  }, [open, activeIndex]);

  if (!open || !anchor || typeof document === "undefined") return null;

  function move(delta: number) {
    if (enabledIndexes.length === 0) return;
    const pos = enabledIndexes.indexOf(activeIndex);
    const nextPos = (pos + delta + enabledIndexes.length) % enabledIndexes.length;
    const next = enabledIndexes[nextPos];
    if (typeof next === "number") setActiveIndex(next);
  }

  function onListKeyDown(event: ReactKeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const item = items[activeIndex];
      if (item && !item.disabled) {
        item.onSelect();
        onClose();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  const style: CSSProperties = coords
    ? {
        left: coords.left,
        top: coords.top,
        maxHeight: coords.maxHeight,
        minWidth: MENU_MIN,
        maxWidth: MENU_MAX_W,
      }
    : { left: -9999, top: -9999, visibility: "hidden" };

  return createPortal(
    <div
      ref={listRef}
      id={listId}
      className="tw-context-menu"
      role="menu"
      aria-label={ariaLabel}
      style={style}
      onKeyDown={onListKeyDown}
    >
      {items.map((item, index) => (
        <div key={item.label} role="none">
          {item.separatorBefore ? <hr className="tw-context-menu__sep" /> : null}
          <button
            type="button"
            role="menuitem"
            data-index={index}
            className={`tw-context-menu__item${item.danger ? " is-danger" : ""}${
              index === activeIndex ? " is-active" : ""
            }`}
            disabled={item.disabled}
            tabIndex={index === activeIndex ? 0 : -1}
            onMouseEnter={() => {
              if (!item.disabled) setActiveIndex(index);
            }}
            onClick={() => {
              if (item.disabled) return;
              item.onSelect();
              onClose();
            }}
          >
            {item.icon ? <span className="tw-context-menu__icon">{item.icon}</span> : null}
            <span className="tw-context-menu__label">{item.label}</span>
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
