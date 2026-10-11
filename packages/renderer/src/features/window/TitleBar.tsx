/**
 * 自定义标题栏：品牌回首页、控制台 tab（主窗 logo 旁）、非聊天时「返回」tab、
 * 聊天时左侧栏开关，以及 Windows 窗口控件（最小化 / 最大化 / 关闭）。
 */
import { useEffect, useState } from "react";
import {
  ChevronLeftIcon,
  CloseIcon,
  IconButton,
  MaximizeIcon,
  MinimizeIcon,
  RestoreIcon,
  SidebarLeftIcon,
  useDesignTheme,
} from "@thinker-workbench/design/react";
import type { WindowRole } from "@thinker-workbench/shared";
import { brandGlyphSrc } from "../../brand/logo";
import { windowApi } from "../../bridge/thinker";
import { useT } from "../../i18n/useI18n";
import type { PageId } from "../nav/usePageStack";
import { TOOL_TAB_IDS, toolTabIcon, toolTabLabel, type ToolTabId } from "../tools/ToolsPane";
import "../tools/tools.less";

type TitleBarProps = {
  /** 当前窗口角色；辅助窗渲染精简栏。 */
  role: WindowRole;
  current: PageId;
  leftPanelOpen: boolean;
  onGoHome: () => void;
  onToggleLeftPanel: () => void;
  /** 控制台当前 tab。 */
  toolsTab?: ToolTabId;
  /** 点 tab：切 tab 并打开控制台页。 */
  onToolsTabChange?: (tab: ToolTabId) => void;
};

/** 控制台顶栏 tab；可选在 Settings 左侧插入「返回」。 */
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
      {TOOL_TAB_IDS.map((id) => (
        <button
          key={id}
          type="button"
          className={`titlebar-tool-tab${active && toolsTab === id ? " is-active" : ""}`}
          onClick={() => onToolsTabChange?.(id)}
        >
          {toolTabIcon(id)}
          <span>{toolTabLabel(t, id)}</span>
        </button>
      ))}
    </nav>
  );
}

export function TitleBar({
  role,
  current,
  leftPanelOpen,
  onGoHome,
  onToggleLeftPanel,
  toolsTab = "settings",
  onToolsTabChange,
}: TitleBarProps) {
  const t = useT();
  const { theme } = useDesignTheme();
  const glyphSrc = brandGlyphSrc(theme.colorScheme);
  const [maximized, setMaximized] = useState(false);
  const api = windowApi();
  const onChat = current === "chat";
  const onConsole = current === "tools" || current === "settings";
  const isAux = role.kind === "aux";

  // 同步最大化状态，并订阅主进程变化
  useEffect(() => {
    if (!api) return;
    void api.isMaximized().then(setMaximized);
    return api.onMaximized(setMaximized);
  }, [api]);

  // 辅助窗口：品牌 + 控制台 tab + 关闭
  if (isAux) {
    const isTools = role.page === "tools" || role.page === "settings";
    return (
      <header className="titlebar titlebar--aux">
        <div className="titlebar-drag">
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
        <div className="titlebar-actions">
          {api ? (
            <div className="win-controls" aria-label={t("window.controls")}>
              <button
                type="button"
                className="win-btn win-close"
                title={t("window.close")}
                onClick={() => void api.close()}
              >
                <CloseIcon size="sm" />
              </button>
            </div>
          ) : null}
        </div>
      </header>
    );
  }

  return (
    <header className="titlebar">
      <div className="titlebar-drag">
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
          <div className="titlebar-nav" aria-label={t("nav.pageNav")}>
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
      <div className="titlebar-actions">
        {api ? (
          <div className="win-controls" aria-label={t("window.controls")}>
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
            <button
              type="button"
              className="win-btn win-close"
              title={t("window.close")}
              onClick={() => void api.close()}
            >
              <CloseIcon size="sm" />
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
