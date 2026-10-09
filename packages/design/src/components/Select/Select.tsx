/**
 * 单选列表框：触发器 + Portal 菜单，自动上下定位。
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

export type SelectOption<T extends string = string> = {
  /** 选项值。 */
  value: T;
  /** 可见标签。 */
  label: string;
};

export type SelectProps<T extends string = string> = {
  /** 当前选中值。 */
  value: T;
  /** 选项列表。 */
  options: SelectOption<T>[];
  /** 选中变化回调。 */
  onChange: (value: T) => void;
  /** 禁用。 */
  disabled?: boolean;
  /** 触发器 id。 */
  id?: string;
  /** 无障碍名称。 */
  "aria-label"?: string;
  /** 追加到根节点的 class。 */
  className?: string;
};

type MenuCoords = {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

const GAP = 4;
const VIEW_PAD = 8;
const LIST_MAX = 224;

/** 根据触发器矩形计算菜单固定定位。 */
function placeMenu(trigger: DOMRect): MenuCoords {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = trigger.width;
  let left = trigger.left;
  if (left + width > vw - VIEW_PAD) left = Math.max(VIEW_PAD, vw - width - VIEW_PAD);
  if (left < VIEW_PAD) left = VIEW_PAD;

  const spaceBelow = vh - trigger.bottom - GAP - VIEW_PAD;
  const spaceAbove = trigger.top - GAP - VIEW_PAD;
  const preferBelow = spaceBelow >= 120 || spaceBelow >= spaceAbove;

  if (preferBelow) {
    return {
      top: trigger.bottom + GAP,
      left,
      width,
      maxHeight: Math.max(0, Math.min(LIST_MAX, spaceBelow)),
    };
  }
  return {
    bottom: vh - trigger.top + GAP,
    left,
    width,
    maxHeight: Math.max(0, Math.min(LIST_MAX, spaceAbove)),
  };
}

export function Select<T extends string = string>({
  value,
  options,
  onChange,
  disabled,
  id,
  className,
  "aria-label": ariaLabel,
}: SelectProps<T>) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      options.findIndex((o) => o.value === value),
    ),
  );

  const selected = options.find((o) => o.value === value) ?? options[0];

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    function update() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      setCoords(placeMenu(trigger.getBoundingClientRect()));
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    // capture：避免中间层 stopPropagation 导致关不掉
    window.addEventListener("mousedown", onPointer, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // keep-alive 页（hidden）切走时 portal 仍在 body，需主动关闭
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    if (!trigger) return;

    const close = () => setOpen(false);
    const closeIfTriggerHidden = () => {
      if (!trigger.isConnected || trigger.closest("[hidden]")) close();
    };

    const mo = new MutationObserver(closeIfTriggerHidden);
    let node: Element | null = trigger;
    while (node) {
      mo.observe(node, { attributes: true, attributeFilter: ["hidden"] });
      node = node.parentElement;
    }
    window.addEventListener("hashchange", close);
    closeIfTriggerHidden();

    return () => {
      mo.disconnect();
      window.removeEventListener("hashchange", close);
    };
  }, [open]);

  useEffect(() => {
    setActiveIndex(
      Math.max(
        0,
        options.findIndex((o) => o.value === value),
      ),
    );
  }, [value, options]);

  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open, coords]);

  function choose(next: T) {
    onChange(next);
    setOpen(false);
  }

  function onTriggerKeyDown(event: ReactKeyboardEvent) {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  }

  function onListKeyDown(event: ReactKeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(options.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const opt = options[activeIndex];
      if (opt) choose(opt.value);
    }
  }

  const listStyle: CSSProperties | undefined = coords
    ? {
        left: coords.left,
        width: coords.width,
        maxHeight: coords.maxHeight,
        ...(coords.top != null ? { top: coords.top } : {}),
        ...(coords.bottom != null ? { bottom: coords.bottom } : {}),
      }
    : undefined;

  const list =
    open && coords && typeof document !== "undefined"
      ? createPortal(
          <ul
            ref={listRef}
            id={listId}
            className="tw-select__list"
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={`${listId}-${activeIndex}`}
            style={listStyle}
            onKeyDown={onListKeyDown}
          >
            {options.map((opt, index) => (
              <li key={opt.value} role="presentation">
                <button
                  type="button"
                  id={`${listId}-${index}`}
                  role="option"
                  className="tw-select__option"
                  aria-selected={opt.value === value}
                  data-active={index === activeIndex ? "true" : undefined}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(opt.value)}
                >
                  {opt.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={`tw-select${className ? ` ${className}` : ""}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="tw-select__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="tw-select__value">{selected?.label ?? value}</span>
        <svg className="tw-select__chevron" viewBox="0 0 12 12" width={12} height={12} aria-hidden>
          <path
            d="M3 4.5L6 7.5 9 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {list}
    </div>
  );
}
