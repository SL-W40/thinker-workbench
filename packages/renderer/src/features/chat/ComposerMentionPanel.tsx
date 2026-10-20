/**
 * Composer `/` Skills 与 `@` 文件候选面板（composer 顶端的背景面板）。
 *
 * 结构：固定 header（标题 + `@` 的搜索态提示，不随列表滚动）+ 可滚动 body。
 * 内联渲染在 composer-dock 最上方（BackgroundTasksBar 之上），不 portal、不按光标定位、
 * 不覆盖已输入内容；键盘 ↑↓ / Enter / Tab / Esc 由 Composer 统一处理。
 */
import { CodeIcon, FolderIcon } from "@thinker-workbench/design/react";
import { useEffect, useId, useRef } from "react";
import { useT } from "../../i18n/useI18n";
import { FileGlyph, IconFolder } from "../inspector/icons";
import type { MentionKind } from "./composerMentions";
import "./ComposerMentionPanel.less";

export type MentionItem = {
  id: string;
  /** 插入用完整值（skill 名或文件/目录相对路径）*/
  label: string;
  /** 主行展示；缺省用 label（文件场景为文件名）*/
  title?: string;
  /** 副行（skill 描述 / 父目录）*/
  description?: string;
  /** 分组：skills / recent / files（header 已按 kind 给标题，故不再渲染分组小标题）*/
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
  onHighlight: (index: number) => void;
  onSelect: (item: MentionItem) => void;
  /** Skills 列表是否仍折叠「显示更多」*/
  skillsCollapsed?: boolean;
  onExpandSkills?: () => void;
  skillsHiddenCount?: number;
  emptyHint?: string;
};

/** composer 顶端的 mention 候选面板（内联，非浮层）*/
export function ComposerMentionPanel({
  open,
  kind,
  items,
  highlight,
  onHighlight,
  onSelect,
  skillsCollapsed,
  onExpandSkills,
  skillsHiddenCount = 0,
  emptyHint,
}: Props) {
  const t = useT();
  const panelId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const fileQuery = kind === "at" ? (items[0]?.query ?? "") : "";

  // 键盘移动高亮时保证选中行可见（只在 body 内滚动，header 保持固定）
  useEffect(() => {
    if (!open) return;
    const row = bodyRef.current?.querySelector(`[data-idx="${highlight}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [open, highlight]);

  if (!open) return null;

  // header 标题：`/` 恒为 Skills；`@` 无查询时是最近文件，有查询时是搜索结果
  const headTitle = t(
    kind === "slash"
      ? "chat.mention.skills"
      : fileQuery
        ? "chat.mention.files"
        : "chat.mention.recent",
  );

  return (
    <div
      id={panelId}
      className={`composer-mention${kind === "slash" ? " is-slash" : " is-at"}`}
      role="listbox"
      aria-label={kind === "slash" ? t("chat.mention.skills") : t("chat.mention.files")}
    >
      {/* 固定 header：不随列表滚动 */}
      <div className="composer-mention__head">
        <span className="composer-mention__head-ico" aria-hidden="true">
          {kind === "slash" ? <CodeIcon size="sm" /> : <FolderIcon size="sm" />}
        </span>
        <span className="composer-mention__title">{headTitle}</span>
        {kind === "at" ? (
          <span className="composer-mention__head-hint">
            {fileQuery
              ? t("chat.mention.searching", { q: fileQuery })
              : t("chat.mention.typeToSearch")}
          </span>
        ) : null}
      </div>
      <div className="composer-mention__body" ref={bodyRef}>
        {items.length === 0 ? (
          <p className="composer-mention__empty">{emptyHint || t("chat.mention.empty")}</p>
        ) : (
          <>
            <ul className="composer-mention__list">
              {items.map((item, idx) => {
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
                      <span className="composer-mention__ico" aria-hidden="true">
                        {kind === "at" ? (
                          item.isDir ? (
                            <IconFolder />
                          ) : (
                            <FileGlyph name={fileName.replace(/\/+$/, "")} />
                          )
                        ) : (
                          <CodeIcon size="sm" />
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
            {kind === "slash" && skillsCollapsed && skillsHiddenCount > 0 ? (
              <button
                type="button"
                className="composer-mention__more"
                onClick={() => onExpandSkills?.()}
              >
                {t("chat.mention.showMore", { n: String(skillsHiddenCount) })}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
