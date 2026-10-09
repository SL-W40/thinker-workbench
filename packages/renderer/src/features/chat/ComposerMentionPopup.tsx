/**
 * Composer `/` Skills 与 `@` 文件弹出菜单。
 */
import { CodeIcon, FolderIcon } from "@thinker-workbench/design/react";
import { useEffect, useId, useMemo, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "../../i18n/I18nProvider";
import type { MessageKey } from "../../i18n/translate";
import type { MentionKind } from "./composerMentions";
import "./ComposerMentionPopup.less";

export type MentionItem = {
  id: string;
  label: string;
  description?: string;
  /** 分组标题键：skills / recent / files。 */
  group: "skills" | "recent" | "files";
};

type Props = {
  open: boolean;
  kind: MentionKind;
  items: MentionItem[];
  highlight: number;
  /** 锚点：textarea 内 caret 附近屏幕坐标。 */
  anchor: { left: number; top: number; bottom: number } | null;
  onHighlight: (index: number) => void;
  onSelect: (item: MentionItem) => void;
  onClose: () => void;
  /** Skills 列表是否仍折叠「显示更多」。 */
  skillsCollapsed?: boolean;
  onExpandSkills?: () => void;
  skillsHiddenCount?: number;
  emptyHint?: string;
};

const GROUP_ORDER: MentionItem["group"][] = ["skills", "recent", "files"];

const GROUP_TITLE_KEY: Record<MentionItem["group"], MessageKey> = {
  skills: "chat.mention.skills",
  recent: "chat.mention.recent",
  files: "chat.mention.files",
};

function groupIcon(group: MentionItem["group"]): ReactNode {
  if (group === "skills") return <CodeIcon size="sm" />;
  return <FolderIcon size="sm" />;
}

/** 锚定在输入光标上方的 mention 菜单。 */
export function ComposerMentionPopup({
  open,
  kind,
  items,
  highlight,
  anchor,
  onHighlight,
  onSelect,
  onClose,
  skillsCollapsed,
  onExpandSkills,
  skillsHiddenCount = 0,
  emptyHint,
}: Props) {
  const t = useT();
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  const grouped = useMemo(() => {
    const map = new Map<MentionItem["group"], MentionItem[]>();
    for (const g of GROUP_ORDER) map.set(g, []);
    for (const item of items) {
      map.get(item.group)?.push(item);
    }
    return GROUP_ORDER.map((g) => ({ group: g, items: map.get(g) ?? [] })).filter(
      (x) => x.items.length > 0,
    );
  }, [items]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const el = panelRef.current;
      if (el && !el.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", onPointer, true);
    return () => window.removeEventListener("pointerdown", onPointer, true);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const row = panelRef.current?.querySelector(`[data-idx="${highlight}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [open, highlight]);

  if (!open || !anchor) return null;

  const style: React.CSSProperties = {
    left: Math.max(8, Math.min(anchor.left, window.innerWidth - 320)),
    bottom: Math.max(8, window.innerHeight - anchor.top + 6),
  };

  let flatIndex = 0;

  return createPortal(
    <div
      ref={panelRef}
      id={panelId}
      className={`composer-mention${kind === "slash" ? " is-slash" : " is-at"}`}
      style={style}
      role="listbox"
      aria-label={kind === "slash" ? t("chat.mention.skills") : t("chat.mention.files")}
    >
      {items.length === 0 ? (
        <p className="composer-mention__empty">{emptyHint || t("chat.mention.empty")}</p>
      ) : (
        grouped.map(({ group, items: rows }) => (
          <div key={group} className="composer-mention__group">
            <div className="composer-mention__group-title">{t(GROUP_TITLE_KEY[group])}</div>
            <ul className="composer-mention__list">
              {rows.map((item) => {
                const idx = flatIndex++;
                const active = idx === highlight;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      data-idx={idx}
                      className={`composer-mention__item${active ? " is-active" : ""}`}
                      onMouseEnter={() => onHighlight(idx)}
                      onClick={() => onSelect(item)}
                    >
                      <span className="composer-mention__ico" aria-hidden>
                        {groupIcon(item.group)}
                      </span>
                      <span className="composer-mention__text">
                        <span className="composer-mention__label">
                          {kind === "slash" ? `/${item.label}` : item.label}
                        </span>
                        {item.description ? (
                          <span className="composer-mention__desc">{item.description}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {group === "skills" && skillsCollapsed && skillsHiddenCount > 0 ? (
              <button
                type="button"
                className="composer-mention__more"
                onClick={() => onExpandSkills?.()}
              >
                {t("chat.mention.showMore", { n: String(skillsHiddenCount) })}
              </button>
            ) : null}
          </div>
        ))
      )}
    </div>,
    document.body,
  );
}

/**
 * 粗算 textarea 内 caret 的屏幕坐标（mirror 法）。
 */
export function getTextareaCaretAnchor(
  el: HTMLTextAreaElement,
): { left: number; top: number; bottom: number } {
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  const div = document.createElement("div");
  const props = [
    "boxSizing",
    "width",
    "height",
    "overflowX",
    "overflowY",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "fontStyle",
    "fontVariant",
    "fontWeight",
    "fontStretch",
    "fontSize",
    "fontSizeAdjust",
    "lineHeight",
    "fontFamily",
    "textAlign",
    "textTransform",
    "textIndent",
    "textDecoration",
    "letterSpacing",
    "wordSpacing",
    "tabSize",
    "whiteSpace",
    "wordBreak",
    "wordWrap",
  ] as const;
  div.style.position = "absolute";
  div.style.visibility = "hidden";
  div.style.whiteSpace = "pre-wrap";
  div.style.wordWrap = "break-word";
  for (const p of props) {
    div.style[p] = style[p];
  }
  div.style.width = `${el.clientWidth}px`;
  const value = el.value;
  const caret = el.selectionStart ?? value.length;
  div.textContent = value.slice(0, caret);
  const span = document.createElement("span");
  span.textContent = value.slice(caret) || ".";
  div.appendChild(span);
  document.body.appendChild(div);
  const spanRect = span.getBoundingClientRect();
  const divRect = div.getBoundingClientRect();
  document.body.removeChild(div);
  const top = rect.top - el.scrollTop + (spanRect.top - divRect.top);
  const left = rect.left - el.scrollLeft + (spanRect.left - divRect.left);
  const line = Number.parseFloat(style.lineHeight) || 18;
  return { left, top, bottom: top + line };
}
