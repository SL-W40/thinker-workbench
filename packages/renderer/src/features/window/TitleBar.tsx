/**
 * 自定义标题栏：品牌回首页、页面后退/前进、左侧栏开关、控制台入口，
 * 以及 Windows 窗口控件（最小化 / 最大化 / 关闭）。
 *
 * 控制台含 Settings / Logs / Components；Mod（Ctrl/Cmd）+ 点击在辅助窗打开；
 * 若该页辅助窗已存在，普通点击也会聚焦过去。
 * 辅助窗：品牌标题（点按聚焦主窗）+ 控制台顶栏 tab + 关闭。
 *
 * 拖拽区域在 `.titlebar-drag`；窗口按钮走 `windowApi()`（无 Electron 时隐藏）。
 */
import { useEffect, useState, type MouseEvent } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  ConsoleIcon,
  IconButton,
  MaximizeIcon,
  MinimizeIcon,
  RestoreIcon,
  SidebarLeftIcon,
} from "@thinker-workbench/design/react";
import type { AuxPageId, WindowRole } from "@thinker-workbench/shared";
import { windowApi } from "../../bridge/thinker";
import { useT } from "../../i18n/I18nProvider";
import type { PageId } from "../nav/usePageStack";
import { TOOL_TAB_IDS, toolTabIcon, toolTabLabel, type ToolTabId } from "../tools/ToolsPane";
import "../tools/tools.less";

type TitleBarProps = {
  /** 当前窗口角色；辅助窗渲染精简栏。 */
  role: WindowRole;
  current: PageId;
  canBack: boolean;
  canForward: boolean;
  leftPanelOpen: boolean;
  onBack: () => void;
  onForward: () => void;
  onGoHome: () => void;
  onToggleLeftPanel: () => void;
  /** 打开控制台（主窗内导航）。 */
  onOpenConsole: () => void;
  /** 控制台当前 tab。 */
  toolsTab?: ToolTabId;
  onToolsTabChange?: (tab: ToolTabId) => void;
};

/** 控制台顶栏 tab 条。 */
function ConsoleTabs({
  toolsTab,
  onToolsTabChange,
  ariaLabel,
}: {
  toolsTab: ToolTabId;
  onToolsTabChange?: (tab: ToolTabId) => void;
  ariaLabel: string;
}) {
  const t = useT();
  return (
    <nav className="titlebar-tool-tabs" aria-label={ariaLabel}>
      {TOOL_TAB_IDS.map((id) => (
        <button
          key={id}
          type="button"
          className={`titlebar-tool-tab${toolsTab === id ? " is-active" : ""}`}
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
  canBack,
  canForward,
  leftPanelOpen,
  onBack,
  onForward,
  onGoHome,
  onToggleLeftPanel,
  onOpenConsole,
  toolsTab = "settings",
  onToolsTabChange,
}: TitleBarProps) {
  const t = useT();
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

  /** Mod（Ctrl/Cmd）+ 点击 → 开/聚焦辅助窗；否则若已有辅助窗则聚焦，否则主窗内导航。 */
  function handleAuxNavClick(page: AuxPageId, openInMain: () => void) {
    return (event: MouseEvent<HTMLButtonElement>) => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && api?.openOrFocusPage) {
        event.preventDefault();
        void api.openOrFocusPage(page);
        return;
      }
      if (api?.focusPageIfOpen) {
        void api.focusPageIfOpen(page).then((focused) => {
          if (!focused) openInMain();
        });
        return;
      }
      openInMain();
    };
  }

  // 辅助窗口：品牌标题 +（控制台顶栏 tab）+ 关闭
  if (isAux) {
    const isTools = role.page === "tools" || role.page === "settings";
    const pageLabel = t("nav.tools");
    const fullTitle = t("nav.auxWindowTitle", { page: pageLabel });
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
            <img className="mark-logo" src="./brand/logo-glyph.png" alt="" width={22} height={22} />
            <span className="mark-name">{fullTitle}</span>
          </button>
          {isTools ? (
            <ConsoleTabs
              toolsTab={toolsTab}
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
          <img className="mark-logo" src="./brand/logo-glyph.png" alt="" width={22} height={22} />
          <span className="mark-name">{t("brand.name")}</span>
        </button>
        <div className="titlebar-nav" aria-label={t("nav.pageNav")}>
          {onChat ? (
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
          ) : null}
          <IconButton
            className="titlebar-nav-btn"
            size="sm"
            title={t("nav.back")}
            aria-label={t("nav.back")}
            disabled={!canBack}
            onClick={onBack}
          >
            <ChevronLeftIcon />
          </IconButton>
          <IconButton
            className="titlebar-nav-btn"
            size="sm"
            title={t("nav.forward")}
            aria-label={t("nav.forward")}
            disabled={!canForward}
            onClick={onForward}
          >
            <ChevronRightIcon />
          </IconButton>
        </div>
        {onConsole ? (
          <ConsoleTabs
            toolsTab={toolsTab}
            onToolsTabChange={onToolsTabChange}
            ariaLabel={t("tools.navLabel")}
          />
        ) : null}
      </div>
      <div className="titlebar-actions">
        <IconButton
          className={`titlebar-action-icon${onConsole ? " is-active" : ""}`}
          size="sm"
          title={t("nav.openConsoleHint")}
          aria-label={t("nav.openConsole")}
          aria-current={onConsole ? "page" : undefined}
          onClick={handleAuxNavClick("tools", onOpenConsole)}
        >
          <ConsoleIcon active={onConsole} />
        </IconButton>
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
