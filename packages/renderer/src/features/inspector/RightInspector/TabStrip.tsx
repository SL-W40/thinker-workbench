/**
 * RightInspector 标签条：可滚动标签 + 钉在右侧的文件树 / 添加。
 * 标签不挂 title（避免悬停浮层）；右键打开对应操作菜单。
 */

import {
  ContextMenu,
  type ContextMenuItemProps,
  EmptyState,
  FolderIcon,
  Popover,
} from "@thinker-workbench/design/react";
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useT } from "../../../ui/i18n/useI18n";
import {
  BrowserStartIcon,
  FileGlyph,
  FileStartIcon,
  GitIcon,
  SubagentStartIcon,
  TerminalStartIcon,
} from "../../../ui/icons";
import type { ChangeTreeNode } from "../changesTree";
import { TreeView } from "../TreeView";
import type { StageTab } from "../types";

type Props = {
  tabs: StageTab[];
  activeTab: string;
  unsaved: Record<string, boolean>;
  /** 工作区文件数。树还没加载时为 null。 */
  fileCount: number | null;
  /** 悬停浮窗里的文件树（未按搜索过滤）。 */
  treeNodes: ChangeTreeNode[];
  openDirs: ReadonlySet<string>;
  onToggleDir: (path: string) => void;
  onOpenFile: (path: string) => void;
  onSelect: (key: string) => void;
  onCloseTab: (key: string) => void;
  /** 关闭一组标签（干净的立刻关，未保存的逐个确认）。 */
  onCloseTabs: (keys: string[]) => void;
  onOpenChanges: () => void;
  onOpenTerminal: () => void;
  onOpenBrowser: () => void;
  onCopyPath: (path: string) => void;
  onRevealPath: (path: string) => void;
};

type TabMenu = { key: string; x: number; y: number };

export function TabStrip({
  tabs,
  activeTab,
  unsaved,
  fileCount,
  treeNodes,
  openDirs,
  onToggleDir,
  onOpenFile,
  onSelect,
  onCloseTab,
  onCloseTabs,
  onOpenChanges,
  onOpenTerminal,
  onOpenBrowser,
  onCopyPath,
  onRevealPath,
}: Props) {
  const t = useT();
  const tabsRef = useRef<HTMLDivElement>(null);
  const addTabBtnRef = useRef<HTMLButtonElement>(null);
  const filesBtnRef = useRef<HTMLButtonElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const [flyout, setFlyout] = useState(false);
  const [fadeTop, setFadeTop] = useState(false);
  const [fadeBottom, setFadeBottom] = useState(false);
  const flyoutTimer = useRef(0);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addMenuAnchor, setAddMenuAnchor] = useState<DOMRect | null>(null);
  const [tabMenu, setTabMenu] = useState<TabMenu | null>(null);

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

  const pointerIn = useCallback((x: number, y: number) => {
    const hit = (el: HTMLElement | null, extraBottom: number, extraX: number) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return (
        x >= rect.left - extraX &&
        x <= rect.right + extraX &&
        y >= rect.top - 4 &&
        y <= rect.bottom + extraBottom
      );
    };
    // 按钮向下、浮窗四周留一条通道，指针从图标滑进列表时不会中途关掉。
    return hit(filesBtnRef.current, 16, 12) || hit(flyoutRef.current, 8, 8);
  }, []);

  useEffect(() => {
    if (!flyout) return;
    function onMove(event: PointerEvent) {
      if (pointerIn(event.clientX, event.clientY)) {
        window.clearTimeout(flyoutTimer.current);
        return;
      }
      window.clearTimeout(flyoutTimer.current);
      flyoutTimer.current = window.setTimeout(() => setFlyout(false), 140);
    }
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.clearTimeout(flyoutTimer.current);
    };
  }, [flyout, pointerIn]);

  // 浮窗列表：还能往上 / 往下滚时，对应边缘渐隐。
  useEffect(() => {
    if (!flyout || treeNodes.length === 0) return;
    const root = flyoutRef.current;
    const el = root?.querySelector(".tree-scroller");
    if (!(el instanceof HTMLElement)) return;
    const sync = () => {
      const overflow = el.scrollHeight > el.clientHeight + 1;
      setFadeTop(overflow && el.scrollTop > 1);
      setFadeBottom(overflow && el.scrollTop + el.clientHeight < el.scrollHeight - 1);
    };
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      observer?.disconnect();
      setFadeTop(false);
      setFadeBottom(false);
    };
  }, [flyout, treeNodes]);

  const menuIndex = tabMenu ? tabs.findIndex((tab) => tab.key === tabMenu.key) : -1;
  const menuTab = menuIndex >= 0 ? tabs[menuIndex] : undefined;
  const closableKeys = (list: StageTab[]) =>
    list.filter((tab) => tab.kind !== "changes").map((tab) => tab.key);
  const otherClosable = menuTab ? closableKeys(tabs.filter((tab) => tab.key !== menuTab.key)) : [];
  const rightClosable = menuIndex >= 0 ? closableKeys(tabs.slice(menuIndex + 1)) : [];
  const allClosable = closableKeys(tabs);

  const tabMenuItems: ContextMenuItemProps[] = menuTab
    ? [
        {
          label: t("inspector.tabs.close"),
          disabled: menuTab.kind === "changes",
          onSelect: () => onCloseTab(menuTab.key),
        },
        {
          label: t("inspector.tabs.closeOthers"),
          disabled: otherClosable.length === 0,
          onSelect: () => onCloseTabs(otherClosable),
        },
        {
          label: t("inspector.tabs.closeRight"),
          disabled: rightClosable.length === 0,
          onSelect: () => onCloseTabs(rightClosable),
        },
        {
          label: t("inspector.tabs.closeAll"),
          disabled: allClosable.length === 0,
          onSelect: () => onCloseTabs(allClosable),
        },
        ...(menuTab.kind === "file" && menuTab.path
          ? [
              {
                label: t("inspector.changes.copyPath"),
                separatorBefore: true,
                onSelect: () => onCopyPath(menuTab.path),
              },
              {
                label: t("inspector.files.revealInFolder"),
                onSelect: () => onRevealPath(menuTab.path),
              },
            ]
          : []),
      ]
    : [];

  return (
    <div className="agent-inspector__tabs">
      <div className="agent-inspector__tabs-scroll" ref={tabsRef}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`agent-inspector__tab${tab.key === activeTab ? " is-active" : ""}${
              unsaved[tab.key] ? " is-dirty" : ""
            }`}
            onClick={() => onSelect(tab.key)}
            onMouseDown={(e: ReactMouseEvent) => {
              if (e.button === 1 && tab.kind !== "changes") {
                e.preventDefault();
                onCloseTab(tab.key);
              }
            }}
            onContextMenu={(e: ReactMouseEvent) => {
              e.preventDefault();
              setAddMenuOpen(false);
              setTabMenu({ key: tab.key, x: e.clientX, y: e.clientY });
            }}
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
            {tab.kind === "changes" ? null : (
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
            )}
          </button>
        ))}
      </div>
      <div className="agent-inspector__tabs-pin">
        <button
          ref={filesBtnRef}
          type="button"
          className={`agent-inspector__tab-files${flyout ? " is-on" : ""}`}
          aria-label={t("inspector.section.files")}
          aria-expanded={flyout}
          aria-haspopup="tree"
          onMouseEnter={() => {
            window.clearTimeout(flyoutTimer.current);
            setAddMenuOpen(false);
            setFlyout(true);
          }}
        >
          <FileStartIcon />
        </button>
        <button
          ref={addTabBtnRef}
          type="button"
          className={`agent-inspector__tab-add${addMenuOpen ? " is-on" : ""}`}
          aria-label={t("inspector.addPanel")}
          aria-expanded={addMenuOpen}
          aria-haspopup="menu"
          onClick={() => {
            setTabMenu(null);
            setFlyout(false);
            const rect = addTabBtnRef.current?.getBoundingClientRect() ?? null;
            setAddMenuAnchor(rect);
            setAddMenuOpen((v) => !v);
          }}
        >
          +
        </button>
      </div>
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
      {flyout ? (
        <Popover
          open
          onClose={() => setFlyout(false)}
          anchorRef={filesBtnRef}
          placement="bottom"
          align="end"
          gap={0}
          maxHeight={640}
          aria-label={t("inspector.section.files")}
          className="agent-inspector__file-flyout"
        >
          <div
            ref={flyoutRef}
            className={`agent-inspector__file-flyout-body${fadeTop ? " has-fade-top" : ""}${
              fadeBottom ? " has-fade-bottom" : ""
            }`}
          >
            {treeNodes.length === 0 ? (
              fileCount === null ? null : (
                <EmptyState
                  className="agent-inspector__file-flyout-empty"
                  icon={<FolderIcon />}
                  title={t("inspector.files.emptyTree")}
                  description={t("inspector.files.emptyTreeBody")}
                />
              )
            ) : (
              <TreeView
                nodes={treeNodes}
                openDirs={openDirs}
                onActivate={(node) => {
                  if (node.kind === "dir") {
                    onToggleDir(node.path);
                    return;
                  }
                  onOpenFile(node.path);
                  setFlyout(false);
                }}
              />
            )}
          </div>
        </Popover>
      ) : null}
      <ContextMenu
        open={menuTab !== undefined}
        anchor={tabMenu ? { x: tabMenu.x, y: tabMenu.y } : null}
        onClose={() => setTabMenu(null)}
        aria-label={t("inspector.tabs.menu")}
        items={tabMenuItems}
      />
    </div>
  );
}
