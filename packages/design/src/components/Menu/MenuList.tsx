/**
 * 菜单项列表：↑↓ / ←→ / Enter / Esc，支持勾选、快捷键、说明与子菜单。
 */
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { placeBeside } from "../../overlay/place";
import { useOverlayScope } from "../../overlay/scope";
import { CheckIcon, ChevronRightIcon } from "../Icon";
import { Kbd } from "../Kbd/Kbd";
import { nextEnabledIndex } from "./nav";
import type { MenuItem } from "./types";

export type MenuListProps = {
  items: MenuItem[];
  onClose: () => void;
  /** 无障碍名称。 */
  "aria-label"?: string;
  className?: string;
  style?: CSSProperties;
  /** 子菜单按 ← 收起本层。 */
  onCollapse?: () => void;
};

export function MenuList({
  items,
  onClose,
  className,
  style,
  onCollapse,
  "aria-label": ariaLabel,
}: MenuListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(() => items.findIndex((item) => !item.disabled));
  const [openSub, setOpenSub] = useState<number | null>(null);
  const hasChecks = items.some((item) => typeof item.checked === "boolean");

  useEffect(() => {
    if (openSub != null) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `:scope > .tw-menu__row > [data-index="${active}"]`,
    );
    el?.focus();
  }, [active, openSub]);

  function move(delta: number) {
    setOpenSub(null);
    setActive((current) => nextEnabledIndex(items, current, delta));
  }

  function onListKeyDown(event: ReactKeyboardEvent) {
    if (openSub != null) return;
    const item = items[active];
    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      move(-1);
    } else if (event.key === "ArrowRight" && item?.items?.length && !item.disabled) {
      event.preventDefault();
      event.stopPropagation();
      setOpenSub(active);
    } else if (event.key === "ArrowLeft" && onCollapse) {
      event.preventDefault();
      event.stopPropagation();
      onCollapse();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      if (!item || item.disabled) return;
      if (item.items?.length) {
        setOpenSub(active);
        return;
      }
      item.onSelect?.();
      onClose();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }

  return (
    <div
      ref={listRef}
      className={className ?? "tw-menu__list"}
      style={style}
      role="menu"
      aria-label={ariaLabel}
      onKeyDown={onListKeyDown}
    >
      {items.map((item, index) => (
        <MenuRow
          key={`${item.label}-${index}`}
          item={item}
          index={index}
          active={index === active}
          hasChecks={hasChecks}
          subOpen={openSub === index}
          onHover={() => {
            if (item.disabled) return;
            setActive(index);
            setOpenSub(item.items?.length ? index : null);
          }}
          onActivate={() => {
            if (item.disabled) return;
            if (item.items?.length) {
              setActive(index);
              setOpenSub(index);
              return;
            }
            item.onSelect?.();
            onClose();
          }}
          onClose={onClose}
          onCollapse={() => {
            setOpenSub(null);
            setActive(index);
          }}
        />
      ))}
    </div>
  );
}

type RowProps = {
  item: MenuItem;
  index: number;
  active: boolean;
  hasChecks: boolean;
  subOpen: boolean;
  onHover: () => void;
  onActivate: () => void;
  onClose: () => void;
  onCollapse: () => void;
};

function MenuRow({
  item,
  index,
  active,
  hasChecks,
  subOpen,
  onHover,
  onActivate,
  onClose,
  onCollapse,
}: RowProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hasSub = Boolean(item.items?.length);
  const checkbox = typeof item.checked === "boolean";

  return (
    <div className="tw-menu__row" role="none">
      {item.separatorBefore ? <hr className="tw-menu__sep" /> : null}
      {item.groupLabel ? (
        <div className="tw-menu__group" role="presentation">
          {item.groupLabel}
        </div>
      ) : null}
      <button
        ref={buttonRef}
        type="button"
        role={checkbox ? "menuitemcheckbox" : "menuitem"}
        aria-checked={checkbox ? item.checked : undefined}
        aria-haspopup={hasSub ? "menu" : undefined}
        aria-expanded={hasSub ? subOpen : undefined}
        data-index={index}
        className={`tw-menu__item${item.danger ? " is-danger" : ""}${active ? " is-active" : ""}`}
        disabled={item.disabled}
        tabIndex={active ? 0 : -1}
        onMouseEnter={onHover}
        onClick={onActivate}
      >
        {hasChecks ? (
          <span className="tw-menu__check" aria-hidden>
            {item.checked ? <CheckIcon size="sm" /> : null}
          </span>
        ) : null}
        {item.icon ? <span className="tw-menu__icon">{item.icon}</span> : null}
        <span className="tw-menu__text">
          <span className="tw-menu__label">{item.label}</span>
          {item.description ? <span className="tw-menu__desc">{item.description}</span> : null}
        </span>
        {item.shortcut ? (
          <Kbd compact className="tw-menu__kbd">
            {item.shortcut}
          </Kbd>
        ) : null}
        {hasSub ? <ChevronRightIcon size="sm" /> : null}
      </button>
      {subOpen && item.items?.length ? (
        <Submenu
          anchorRef={buttonRef}
          items={item.items}
          onClose={onClose}
          onCollapse={onCollapse}
        />
      ) : null}
    </div>
  );
}

function Submenu({
  anchorRef,
  items,
  onClose,
  onCollapse,
}: {
  anchorRef: { readonly current: HTMLElement | null };
  items: MenuItem[];
  onClose: () => void;
  onCollapse: () => void;
}) {
  const overlayId = useOverlayScope();
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ left: 0, top: 0, visibility: "hidden" });

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const next = placeBeside({
        anchor: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        size: { width: panel.offsetWidth, height: panel.offsetHeight },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      });
      setStyle((prev) => {
        if (prev.left === next.left && prev.top === next.top && prev.maxHeight === next.maxHeight)
          return prev;
        return { left: next.left, top: next.top, maxHeight: next.maxHeight };
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorRef, items]);

  if (typeof document === "undefined") return null;

  const panel = (
    <div
      ref={panelRef}
      className="tw-menu tw-menu__sub"
      style={style}
      data-tw-overlay={overlayId ?? undefined}
    >
      <MenuList items={items} onClose={onClose} onCollapse={onCollapse} />
    </div>
  );

  return createPortal(panel, document.body);
}
