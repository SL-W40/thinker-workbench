/**
 * 标签页。line 为下划线；document 为可关闭的文档标签。
 */
import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useId } from "react";
import { CloseIcon } from "../Icon";

export type TabsVariant = "line" | "document";

export type TabItem = {
  /** 稳定 id。 */
  id: string;
  /** 可见标题。 */
  label: string;
  /** 标题前图标。 */
  icon?: ReactNode;
  /** 未保存圆点。 */
  dirty?: boolean;
  /** 禁用。 */
  disabled?: boolean;
  /** 显示关闭按钮。需同时提供 closeLabel。 */
  closable?: boolean;
  /** 关闭按钮的无障碍名称。 */
  closeLabel?: string;
};

export type TabsProps = {
  /** 当前选中 id。 */
  value: string;
  /** 选中变化。 */
  onChange: (id: string) => void;
  /** 关闭某个标签。 */
  onClose?: (id: string) => void;
  tabs: TabItem[];
  /** 外观。默认 line。 */
  variant?: TabsVariant;
  /** 标签列表无障碍名称。 */
  "aria-label": string;
  /** 追加 class。 */
  className?: string;
};

export function Tabs({
  value,
  onChange,
  onClose,
  tabs,
  variant = "line",
  className,
  "aria-label": ariaLabel,
}: TabsProps) {
  const uid = useId();

  function selectByDelta(delta: number) {
    const enabled = tabs
      .map((tab, index) => (tab.disabled ? -1 : index))
      .filter((index) => index >= 0);
    if (enabled.length === 0) return;
    const current = Math.max(
      0,
      tabs.findIndex((tab) => tab.id === value),
    );
    const pos = enabled.indexOf(current);
    const start = pos === -1 ? 0 : pos;
    const next = enabled[(start + delta + enabled.length) % enabled.length];
    const tab = typeof next === "number" ? tabs[next] : undefined;
    if (tab) onChange(tab.id);
  }

  function onKeyDown(event: ReactKeyboardEvent) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      selectByDelta(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectByDelta(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      const tab = tabs.find((item) => !item.disabled);
      if (tab) onChange(tab.id);
    } else if (event.key === "End") {
      event.preventDefault();
      const enabled = tabs.filter((item) => !item.disabled);
      const tab = enabled[enabled.length - 1];
      if (tab) onChange(tab.id);
    }
  }

  return (
    <div
      className={`tw-tabs tw-tabs--${variant}${className ? ` ${className}` : ""}`}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        const showClose = Boolean(tab.closable && onClose);
        return (
          <div
            key={tab.id}
            className={`tw-tabs__item${selected ? " is-selected" : ""}`}
            role="presentation"
          >
            <button
              type="button"
              role="tab"
              id={`${uid}-${tab.id}`}
              className={`tw-tabs__tab${tab.dirty ? " is-dirty" : ""}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => {
                if (!showClose) return;
                if (event.key !== "Backspace" && event.key !== "Delete") return;
                event.preventDefault();
                event.stopPropagation();
                onClose?.(tab.id);
              }}
            >
              {tab.icon ? <span className="tw-tabs__icon">{tab.icon}</span> : null}
              <span className="tw-tabs__label">{tab.label}</span>
              {tab.dirty ? <span className="tw-tabs__dirty" aria-hidden /> : null}
            </button>
            {showClose ? (
              <button
                type="button"
                className="tw-tabs__close"
                aria-label={tab.closeLabel ?? tab.label}
                tabIndex={-1}
                onClick={() => onClose?.(tab.id)}
              >
                <CloseIcon size="sm" />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
