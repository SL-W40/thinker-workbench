/**
 * Composer `/` Skills 与 `@` 文件弹出菜单。
 */
import { CodeIcon, FolderIcon } from "@thinker-workbench/design/react";
import { type ReactNode, useEffect, useId, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import type { MessageKey } from "../../i18n/translate";
import { useT } from "../../i18n/useI18n";
import { FileGlyph, IconFolder } from "../inspector/icons";
import type { MentionKind } from "./composerMentions";
import "./ComposerMentionPopup.less";

export type MentionItem = {
  id: string;
  /** 插入用完整值（skill 名或文件/目录相对路径）*/
  label: string;
  /** 主行展示；缺省用 label（文件场景为文件名）*/
  title?: string;
  /** 副行（skill 描述 / 父目录）*/
  description?: string;
  /** 分组标题键：skills / recent / files*/
  group: "skills" | "recent" | "files";
  /** 用于文件名匹配高亮的查询串*/
  query?: string;
  /** `@` 命中是否为目录*/
  isDir?: boolean;
};

/** 在文本中高亮第一处 query（大小写不敏感）*/
function HighlightMatch({ text, query }: { text: string; query?: string }) {
  const q = query?.trim();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const i = lower.indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="composer-mention__hl">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

type Props = {
  open: boolean;
  kind: MentionKind;
  items: MentionItem[];
  highlight: number;
  /** 锚点：textarea 内 caret 附近屏幕坐标*/
  anchor: { left: number; top: number; bottom: number } | null;
  onHighlight: (index: number) => void;
  onSelect: (item: MentionItem) => void;
  onClose: () => void;
  /** Skills 列表是否仍折叠「显示更多」*/
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

/** 锚定在输入光标上方的 mention 菜单*/
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
  const fileQuery = kind === "at" ? (items[0]?.query ?? "") : "";

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
      {/* 有结果时才显示顶栏提示；空态只用 emptyHint，避免与 typeToSearch / noRecent 叠两行 */}
      {kind === "at" && items.length > 0 ? (
        <div className="composer-mention__hint">
          {fileQuery
            ? t("chat.mention.searching", { q: fileQuery })
            : t("chat.mention.typeToSearch")}
        </div>
      ) : null}
      {items.length === 0 ? (
        <p className="composer-mention__empty">{emptyHint || t("chat.mention.empty")}</p>
      ) : (
        grouped.map(({ group, items: rows }) => (
          <div key={group} className="composer-mention__group">
            {/* 搜索结果不再套一层 Files 标题，减少噪音 */}
            {kind === "slash" || (kind === "at" && !fileQuery) ? (
              <div className="composer-mention__group-title">{t(GROUP_TITLE_KEY[group])}</div>
            ) : null}
            <ul className="composer-mention__list">
              {rows.map((item) => {
                const idx = flatIndex++;
                const active = idx === highlight;
                const fileName = item.title ?? item.label;
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
                        {kind === "at" ? (
                          item.isDir ? (
                            <IconFolder />
                          ) : (
                            <FileGlyph name={fileName.replace(/\/+$/, "")} />
                          )
                        ) : (
                          groupIcon(item.group)
                        )}
                      </span>
                      <span className="composer-mention__text">
                        <span className="composer-mention__label" title={item.label}>
                          {kind === "slash" ? (
                            `/${item.label}`
                          ) : (
                            <HighlightMatch text={fileName} query={item.query} />
                          )}
                        </span>
                        {item.description ? (
                          <span className="composer-mention__desc" title={item.label}>
                            {item.description}
                          </span>
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
 * 粗算 textarea 内 caret 的屏幕坐标（mirror 法）。 */
export function getTextareaCaretAnchor(el: HTMLTextAreaElement): {
  left: number;
  top: number;
  bottom: number;
} {
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
