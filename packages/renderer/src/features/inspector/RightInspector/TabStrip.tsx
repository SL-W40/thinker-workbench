/**
 * RightInspector 标签条：tab 按钮 + 关闭 + 添加面板菜单。
 */

import { ContextMenu } from "@thinker-workbench/design/react";
import { type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from "react";
import { useT } from "../../../ui/i18n/useI18n";
import {
  BrowserStartIcon,
  FileGlyph,
  FileStartIcon,
  GitIcon,
  SubagentStartIcon,
  TerminalStartIcon,
} from "../../../ui/icons";
import type { StageTab } from "../types";

type Props = {
  tabs: StageTab[];
  activeTab: string;
  unsaved: Record<string, boolean>;
  onSelect: (key: string) => void;
  onCloseTab: (key: string) => void;
  onOpenChanges: () => void;
  onOpenFiles: () => void;
  onOpenTerminal: () => void;
  onOpenBrowser: () => void;
};

export function TabStrip({
  tabs,
  activeTab,
  unsaved,
  onSelect,
  onCloseTab,
  onOpenChanges,
  onOpenFiles,
  onOpenTerminal,
  onOpenBrowser,
}: Props) {
  const t = useT();
  const tabsRef = useRef<HTMLDivElement>(null);
  const addTabBtnRef = useRef<HTMLButtonElement>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addMenuAnchor, setAddMenuAnchor] = useState<DOMRect | null>(null);

  // Tab 条：纵向滚轮 →横向滚动
  useEffect(() => {
    const strip = tabsRef.current;
    if (!strip) return;
    function onWheel(event: WheelEvent) {
      if (!strip || strip.scrollWidth <= strip.clientWidth) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      strip.scrollLeft += event.deltaY;
    }
    strip.addEventListener("wheel", onWheel, { passive: false });
    return () => strip.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div className="agent-inspector__tabs" ref={tabsRef}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`agent-inspector__tab${tab.key === activeTab ? " is-active" : ""}${
            unsaved[tab.key] ? " is-dirty" : ""
          }`}
          onClick={() => onSelect(tab.key)}
          onMouseDown={(e: ReactMouseEvent) => {
            if (e.button === 1) {
              e.preventDefault();
              onCloseTab(tab.key);
            }
          }}
          title={
            tab.kind === "file"
              ? `${tab.path ?? tab.title}${unsaved[tab.key] ? ` · ${t("inspector.files.dirty")}` : ""}`
              : tab.title
          }
        >
          {tab.kind === "file" ? (
            <span className="agent-inspector__tab-ico">
              <FileGlyph name={tab.path ?? tab.title} />
            </span>
          ) : tab.kind === "changes" ? (
            <span className="agent-inspector__tab-ico">
              <GitIcon />
            </span>
          ) : tab.kind === "terminal" ? (
            <span className="agent-inspector__tab-ico">
              <TerminalStartIcon />
            </span>
          ) : tab.kind === "browser" ? (
            <span className="agent-inspector__tab-ico">
              <BrowserStartIcon />
            </span>
          ) : tab.kind === "subagent" ? (
            <span className="agent-inspector__tab-ico">
              <SubagentStartIcon />
            </span>
          ) : (
            <span className="agent-inspector__tab-ico">
              <FileStartIcon />
            </span>
          )}
          <span className="agent-inspector__tab-title">{tab.title}</span>
          <span className="agent-inspector__tab-trail">
            {unsaved[tab.key] ? (
              // biome-ignore lint/a11y/useAriaPropsSupportedByRole: 未保存脏点为纯展示标记，aria-label 仅用于读屏播报
              <span className="stage-tab-dirty" aria-label={t("inspector.files.dirty")} />
            ) : null}
            {/* biome-ignore lint/a11y/useSemanticElements: 标签页关闭 ×；键盘关闭走标签按钮自身的 Delete 快捷键，故 tabIndex=-1 有意不可聚焦 */}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: 同上，关闭的键盘路径由标签按钮统一处理 */}
            <span
              className="agent-inspector__tab-close"
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.key);
              }}
            >
              ×
            </span>
          </span>
        </button>
      ))}
      <button
        ref={addTabBtnRef}
        type="button"
        className={`agent-inspector__tab-add${addMenuOpen ? " is-on" : ""}`}
        title={t("inspector.addPanel")}
        aria-label={t("inspector.addPanel")}
        aria-expanded={addMenuOpen}
        aria-haspopup="menu"
        onClick={() => {
          const rect = addTabBtnRef.current?.getBoundingClientRect() ?? null;
          setAddMenuAnchor(rect);
          setAddMenuOpen((v) => !v);
        }}
      >
        +
      </button>
      <ContextMenu
        open={addMenuOpen}
        anchor={addMenuAnchor}
        onClose={() => setAddMenuOpen(false)}
        aria-label={t("inspector.addPanel")}
        items={[
          {
            label: t("inspector.section.changes"),
            icon: <GitIcon />,
            onSelect: () => {
              setAddMenuOpen(false);
              onOpenChanges();
            },
          },
          {
            label: t("inspector.section.files"),
            icon: <FileStartIcon />,
            onSelect: () => {
              setAddMenuOpen(false);
              onOpenFiles();
            },
          },
          {
            label: t("inspector.section.terminal"),
            icon: <TerminalStartIcon />,
            onSelect: () => {
              setAddMenuOpen(false);
              onOpenTerminal();
            },
          },
          {
            label: t("inspector.section.browser"),
            icon: <BrowserStartIcon />,
            onSelect: () => {
              setAddMenuOpen(false);
              onOpenBrowser();
            },
          },
        ]}
      />
    </div>
  );
}
