/**
 * 命令面板：跨会话 / 文件 / 设置 / 命令的统一跳转入口（Mod+K）。
 *
 * 键盘优先：↑↓ 移动、Enter 执行、Esc 关闭；输入即过滤，结果按相关性排序。
 * 文件候选由调用方在面板打开后异步提供（大仓库不一次性拉全量）。
 */
import {
  CodeIcon,
  Input,
  LanesIcon,
  Modal,
  PaletteIcon,
  SearchIcon,
  SettingsIcon,
  Spinner,
} from "@thinker-workbench/design/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MessageKey } from "../../ui/i18n/translate";
import { useI18n } from "../../ui/i18n/useI18n";
import { type PaletteGroup, type PaletteItem, rankPaletteItems } from "./paletteModel";
import "./palette.less";

type Props = {
  open: boolean;
  onClose: () => void;
  /** 命令候选（新建会话 / 停止运行等）。 */
  commands: PaletteItem[];
  /** 会话候选。 */
  sessions: PaletteItem[];
  /** 工作区文件候选（懒加载；未就绪时可为空）。 */
  files: PaletteItem[];
  /** 设置分区候选（点击直达对应分区）。 */
  settings?: PaletteItem[];
  /** 文件候选是否仍在加载。 */
  filesLoading?: boolean;
  /** 选中某个候选。 */
  onPick: (item: PaletteItem) => void;
};

/** 分组 → i18n key。 */
const GROUP_LABEL_KEY: Record<PaletteGroup, MessageKey> = {
  command: "palette.groupCommand",
  session: "palette.groupSession",
  file: "palette.groupFile",
  setting: "palette.groupSetting",
};

/** 分组渲染顺序（与权重一致）。 */
const GROUP_ORDER: PaletteGroup[] = ["command", "session", "file", "setting"];

/** 分组 → 图标（让不同来源一眼可辨）。 */
const GROUP_ICON: Record<PaletteGroup, typeof PaletteIcon> = {
  command: PaletteIcon,
  session: LanesIcon,
  file: CodeIcon,
  setting: SettingsIcon,
};

export function CommandPalette({
  open,
  onClose,
  commands,
  sessions,
  files,
  settings = [],
  filesLoading,
  onPick,
}: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);

  const items = useMemo(
    () => rankPaletteItems([...commands, ...sessions, ...files, ...settings], query),
    [commands, sessions, files, settings, query],
  );

  /** 展平为一维列表并保留分组顺序（渲染与键盘导航共用同一份顺序）。 */
  const grouped = useMemo<PaletteItem[]>(
    () => GROUP_ORDER.flatMap((group) => items.filter((item) => item.group === group)),
    [items],
  );

  // 打开时重置输入与光标
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCursor(0);
    // Modal 有进场动画，等一拍再聚焦，避免焦点被面板自身抢走
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      if (!inputRef.current) document.getElementById("palette-input")?.focus();
    }, 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  // 结果变化后把光标夹回有效范围
  useEffect(() => {
    setCursor((current) => (items.length === 0 ? 0 : Math.min(current, items.length - 1)));
  }, [items.length]);

  // 键盘移动光标时把选中项滚进视野：只动列表自身的 scrollTop，
  // 不用 scrollIntoView，避免连带滚动外层浮层（Modal 的滚动层）。
  // 依赖 cursor / grouped.length：这两者决定 activeItemRef 指向哪个元素，
  // ref 变化本身不触发渲染，必须显式重跑
  // biome-ignore lint/correctness/useExhaustiveDependencies: ref 目标随 cursor 变化，需显式重跑
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const item = activeItemRef.current;
    if (!list || !item) return;
    const listRect = list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const margin = 6;
    if (itemRect.top < listRect.top + margin) {
      list.scrollTop -= listRect.top + margin - itemRect.top;
    } else if (itemRect.bottom > listRect.bottom - margin) {
      list.scrollTop += itemRect.bottom - (listRect.bottom - margin);
    }
  }, [cursor, grouped.length, open]);

  const pick = useCallback(
    (item: PaletteItem | undefined) => {
      if (!item) return;
      onPick(item);
      onClose();
    },
    [onPick, onClose],
  );

  if (!open) return null;

  return (
    <Modal open onClose={onClose} aria-label={t("palette.title")} panelClassName="palette-panel">
      <div className="palette">
        <div className="palette__search">
          <Input
            id="palette-input"
            ref={inputRef}
            className="palette__input"
            size="lg"
            value={query}
            aria-label={t("palette.title")}
            placeholder={t("palette.placeholder")}
            startAdornment={<SearchIcon size="sm" className="palette__search-icon" />}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => (grouped.length === 0 ? 0 : (c + 1) % grouped.length));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) =>
                  grouped.length === 0 ? 0 : (c - 1 + grouped.length) % grouped.length,
                );
              } else if (e.key === "Enter") {
                e.preventDefault();
                pick(grouped[cursor]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
          />
        </div>
        {filesLoading ? (
          <div className="palette__hint">
            <Spinner size="sm" />
            <span>{t("palette.indexing")}</span>
          </div>
        ) : null}
        {/* listbox 语义要求容器与子项都是非交互元素承载 role，故用 div 而非 ul/li */}
        <div className="palette__list" role="listbox" aria-label={t("palette.title")} ref={listRef}>
          {grouped.length === 0 ? (
            <div className="palette__empty">{t("palette.empty")}</div>
          ) : (
            grouped.map((item, index) => {
              const isFirstOfGroup = index === 0 || grouped[index - 1]?.group !== item.group;
              const ItemIcon = GROUP_ICON[item.group];
              return (
                <div key={item.id}>
                  {isFirstOfGroup ? (
                    <div className="palette__group">{t(GROUP_LABEL_KEY[item.group])}</div>
                  ) : null}
                  <button
                    type="button"
                    role="option"
                    ref={index === cursor ? activeItemRef : undefined}
                    aria-selected={index === cursor}
                    className={`palette__item${index === cursor ? " is-active" : ""}`}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => pick(item)}
                  >
                    <span className={`palette__glyph is-${item.group}`}>
                      <ItemIcon size="sm" />
                    </span>
                    <span className="palette__text">
                      <span className="palette__title">{item.title}</span>
                      {item.subtitle ? <span className="palette__sub">{item.subtitle}</span> : null}
                    </span>
                    {item.shortcut ? <span className="palette__kbd">{item.shortcut}</span> : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
        <footer className="palette__foot">{t("palette.hints")}</footer>
      </div>
    </Modal>
  );
}
