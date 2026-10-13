/**
 * 自定义标题栏：左品牌 / 控制台 tab / 左侧栏；中空白拖窗；右「展开右侧面板」。
 * Windows 最右侧另绘窗口控件；macOS 用系统 traffic lights（左侧留白）。
 * 可点控件勿放进 drag 区，否则 Electron 不显示 pointer 小手。
 */
import { useEffect, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronsRightIcon,
  CloseIcon,
  IconButton,
  MaximizeIcon,
  MinimizeIcon,
  RestoreIcon,
  SidebarLeftIcon,
  SidebarRightIcon,
  useDesignTheme,
} from "@thinker-workbench/design/react";
import { processPlatform, type WindowRole } from "@thinker-workbench/shared";
import { brandGlyphSrc } from "../../brand/logo";
import { windowApi } from "../../bridge/thinker";
import { useT } from "../../i18n/useI18n";
import type { PageId } from "../nav/usePageStack";
import { TOOL_TAB_IDS, toolTabIcon, toolTabLabel, type ToolTabId } from "../tools/ToolsPane";
import "../tools/tools.less";

/** macOS：原生红绿灯；其它平台：渲染进程画最小化 / 最大化 / 关闭。 */
const useNativeWindowControls = processPlatform() === "darwin";

type TitleBarProps = {
  /** 当前窗口角色；辅助窗渲染精简栏。 */
  role: WindowRole;
  current: PageId;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  onGoHome: () => void;
  onToggleLeftPanel: () => void;
  onToggleRightPanel: () => void;
  /** 控制台当前 tab。 */
  toolsTab?: ToolTabId;
  /** 点 tab：切 tab 并打开控制台页。 */
  onToolsTabChange?: (tab: ToolTabId) => void;
};

/** Settings 之外的控制台 tab（可收起）。 */
const EXTRA_TOOL_TAB_IDS = TOOL_TAB_IDS.filter((id) => id !== "settings");

/** 控制台顶栏 tab；默认只显示 Settings，其余经双箭头展开。 */
function ConsoleTabs({
  toolsTab,
  active,
  onToolsTabChange,
  ariaLabel,
  showReturn,
  onReturn,
}: {
  toolsTab: ToolTabId;
  /** 是否处在控制台页（高亮当前 tab）。 */
  active: boolean;
  onToolsTabChange?: (tab: ToolTabId) => void;
  ariaLabel: string;
  showReturn?: boolean;
  onReturn?: () => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  // 当前不在 Settings 时保持展开，避免激活 tab 被藏起
  const open = expanded || toolsTab !== "settings";

  useEffect(() => {
    if (toolsTab !== "settings") setExpanded(true);
  }, [toolsTab]);

  function tabButton(id: ToolTabId) {
    return (
      <button
        key={id}
        type="button"
        className={`titlebar-tool-tab${active && toolsTab === id ? " is-active" : ""}`}
        onClick={() => onToolsTabChange?.(id)}
      >
        {toolTabIcon(id)}
        <span>{toolTabLabel(t, id)}</span>
      </button>
    );
  }

  return (
    <nav className="titlebar-tool-tabs" aria-label={ariaLabel}>
      {showReturn ? (
        <button
          type="button"
          className="titlebar-tool-tab"
          onClick={onReturn}
          title={t("nav.returnToChat")}
        >
          <ChevronLeftIcon size="sm" />
          <span>{t("nav.returnToChat")}</span>
        </button>
      ) : null}
      {tabButton("settings")}
      <div className={`titlebar-tool-tabs-extra${open ? " is-open" : ""}`}>
        <div className="titlebar-tool-tabs-extra__inner">
          {EXTRA_TOOL_TAB_IDS.map((id) => tabButton(id))}
        </div>
      </div>
      <button
        type="button"
        className={`titlebar-tool-tabs-toggle${open ? " is-open" : ""}`}
        title={open ? t("tools.collapseTabs") : t("tools.expandTabs")}
        aria-label={open ? t("tools.collapseTabs") : t("tools.expandTabs")}
        aria-expanded={open}
        onClick={() => {
          if (open) {
            // 收起时若停在其它 tab，先回到 Settings，避免激活项被藏住
            if (toolsTab !== "settings") onToolsTabChange?.("settings");
            setExpanded(false);
            return;
          }
          setExpanded(true);
        }}
      >
        <ChevronsRightIcon size="sm" />
      </button>
    </nav>
  );
}

/** Windows 风格自定义窗口按钮（macOS 不渲染）。 */
function WinControls({ closeOnly }: { closeOnly?: boolean }) {
  const t = useT();
  const api = windowApi();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!api || closeOnly) return;
    void api.isMaximized().then(setMaximized);
    return api.onMaximized(setMaximized);
  }, [api, closeOnly]);

  if (!api) return null;

  return (
    <div className="win-controls" aria-label={t("window.controls")}>
      {closeOnly ? null : (
        <>
          <button
            type="button"
            className="win-btn"
            title={t("window.minimize")}
            onClick={() => void api.minimize()}
          >
            <MinimizeIcon size="sm" />
          </button>
          <button
            type="button"
            className="win-btn"
            title={maximized ? t("window.restore") : t("window.maximize")}
            onClick={() => void api.maximize().then(setMaximized)}
          >
            {maximized ? <RestoreIcon size="sm" /> : <MaximizeIcon size="sm" />}
          </button>
        </>
      )}
      <button
        type="button"
        className="win-btn win-close"
        title={t("window.close")}
        onClick={() => void api.close()}
      >
        <CloseIcon size="sm" />
      </button>
    </div>
  );
}

export function TitleBar({
  role,
  current,
  leftPanelOpen,
  rightPanelOpen,
  onGoHome,
  onToggleLeftPanel,
  onToggleRightPanel,
  toolsTab = "settings",
  onToolsTabChange,
}: TitleBarProps) {
  const t = useT();
  const { theme } = useDesignTheme();
  const glyphSrc = brandGlyphSrc(theme.colorScheme);
  const api = windowApi();
  const onChat = current === "chat";
  const onConsole = current === "tools" || current === "settings";
  const isAux = role.kind === "aux";
  const titlebarClass = [
    "titlebar",
    isAux ? "titlebar--aux" : "",
    useNativeWindowControls ? "titlebar--mac" : "titlebar--win",
  ]
    .filter(Boolean)
    .join(" ");

  // 辅助窗口：左品牌 + 控制台 tab；（非 Mac 时）右关闭
  // 布局：leading(控件) | drag-spacer(拖拽) | actions(控件) — 控件勿放进 drag，否则无小手
  if (isAux) {
    const isTools = role.page === "tools" || role.page === "settings";
    return (
      <header className={titlebarClass}>
        <div className="titlebar-leading">
          <button
            type="button"
            className="mark"
            title={t("nav.focusMain")}
            aria-label={t("nav.focusMain")}
            onClick={() => void api?.focusMain?.()}
          >
            <img className="mark-logo" src={glyphSrc} alt="" width={22} height={22} />
          </button>
          {isTools ? (
            <ConsoleTabs
              toolsTab={toolsTab}
              active
              onToolsTabChange={onToolsTabChange}
              ariaLabel={t("tools.navLabel")}
            />
          ) : null}
        </div>
        <div className="titlebar-drag-spacer" aria-hidden />
        {useNativeWindowControls ? null : (
          <div className="titlebar-actions">
            <WinControls closeOnly />
          </div>
        )}
      </header>
    );
  }

  return (
    <header className={titlebarClass}>
      <div className="titlebar-leading">
        <button
          type="button"
          className="mark"
          title={t("nav.goHome")}
          aria-label={t("nav.goHome")}
          onClick={onGoHome}
        >
          <img className="mark-logo" src={glyphSrc} alt="" width={22} height={22} />
        </button>
        <ConsoleTabs
          toolsTab={toolsTab}
          active={onConsole}
          onToolsTabChange={onToolsTabChange}
          ariaLabel={t("tools.navLabel")}
          showReturn={!onChat}
          onReturn={onGoHome}
        />
        {onChat ? (
          <div className="titlebar-nav" aria-label={t("nav.toggleLeftPanel")}>
            <IconButton
              className={`titlebar-nav-btn${leftPanelOpen ? " is-active" : ""}`}
              size="sm"
              title={t("nav.toggleLeftPanel")}
              aria-label={t("nav.toggleLeftPanel")}
              aria-pressed={leftPanelOpen}
              onClick={onToggleLeftPanel}
            >
              <SidebarLeftIcon open={leftPanelOpen} />
            </IconButton>
          </div>
        ) : null}
      </div>
      <div className="titlebar-drag-spacer" aria-hidden />
      <div className="titlebar-actions">
        {onChat ? (
          <div className="titlebar-nav" aria-label={t("nav.toggleRightPanel")}>
            <IconButton
              className={`titlebar-nav-btn${rightPanelOpen ? " is-active" : ""}`}
              size="sm"
              title={t("nav.toggleRightPanel")}
              aria-label={t("nav.toggleRightPanel")}
              aria-pressed={rightPanelOpen}
              onClick={onToggleRightPanel}
            >
              <SidebarRightIcon open={rightPanelOpen} />
            </IconButton>
          </div>
        ) : null}
        {useNativeWindowControls ? null : <WinControls />}
      </div>
    </header>
  );
}
