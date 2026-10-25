/**
 * 右侧 Browser 面板：地址栏 + <webview> 承载的页面 + AI 锁定蒙层。
 *
 * 页面是 DOM 里的 <webview>（不是主进程叠加的原生视图），所以蒙层、菜单、
 * 弹窗这些应用内 UI 都能正常压在它上面；主进程只借 webContents id 做自动化。
 */
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EmptyState,
  IconButton,
  Input,
  RestartIcon,
} from "@thinker-workbench/design/react";
import { BROWSER_PARTITION, type BrowserState, browserUrlsEqual } from "@thinker-workbench/shared";
import { memo, useEffect, useRef, useState } from "react";
import {
  browserAttachWebview,
  browserDetachWebview,
  browserGetState,
  browserGoBack,
  browserGoForward,
  browserNavigate,
  browserReload,
  browserSetViewport,
  browserSetVisible,
  onBrowserEvent,
} from "../../platform/ipc/browser";
import { useT } from "../../ui/i18n/useI18n";
import { patchInspectorUi } from "../inspector/inspectorUi";
import "./BrowserPane.less";

type Props = {
  /** 面板是否为当前激活 tab。*/
  active?: boolean;
  /** 外部请求导航到的 URL（消费后清空）。*/
  pendingUrl?: string | null;
  onPendingUrlConsumed?: () => void;
  /** 工作空间 id：地址变化写回，供重启后还原。*/
  workspaceId?: string | null;
};

const EMPTY_STATE: BrowserState = {
  url: "about:blank",
  title: "",
  loading: false,
  canGoBack: false,
  canGoForward: false,
  locked: false,
  visible: false,
  viewportWidth: 0,
  viewportHeight: 0,
};

/** memo：webview 挂载成本高，顶层 state 变化不该让它重渲染。 */
export const BrowserPane = memo(function BrowserPane({
  active = true,
  pendingUrl = null,
  onPendingUrlConsumed,
  workspaceId = null,
}: Props) {
  const t = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<BrowserState>(EMPTY_STATE);
  const [urlDraft, setUrlDraft] = useState("");
  const available = Boolean(window.thinker?.browser);

  useEffect(() => {
    if (!available) return;
    void browserGetState().then((s) => {
      if (!s) return;
      setState(s);
      if (s.url && s.url !== "about:blank") setUrlDraft(s.url);
    });
    return onBrowserEvent((event) => {
      if (event.type === "state") {
        setState(event.state);
        if (event.state.url && event.state.url !== "about:blank") {
          setUrlDraft(event.state.url);
        }
      }
    });
  }, [available]);

  // 地址变化即落盘（跳过空白页）：重启后还原用
  useEffect(() => {
    if (!available || !workspaceId) return;
    const url = state.url?.trim() ?? "";
    if (!url || url === "about:blank") return;
    patchInspectorUi(workspaceId, { browserUrl: url });
  }, [available, workspaceId, state.url]);

  // 面板激活与否：告诉主进程「视口在不在」
  useEffect(() => {
    if (!available) return;
    void browserSetVisible(active);
    return () => {
      void browserSetVisible(false);
    };
  }, [active, available]);

  // <webview> 生命周期：挂载后把 webContents id 交主进程，卸载时收回
  useEffect(() => {
    if (!available || !active) return;
    const host = hostRef.current;
    if (!host) return;

    const webview = document.createElement("webview");
    webview.setAttribute("partition", BROWSER_PARTITION);
    // 必须带初始 src：不带 src 的 <webview> 不会创建 guest（dom-ready 永不触发，
    // 主进程也就拿不到 webContents id）。about:blank 起步，地址由主进程 loadURL 驱动。
    webview.setAttribute("src", "about:blank");
    webview.className = "browser-pane__webview";
    host.appendChild(webview);

    const measure = () => {
      const rect = host.getBoundingClientRect();
      return { width: Math.round(rect.width), height: Math.round(rect.height) };
    };

    // dom-ready 时 id 才可用；之后主进程即可对它做导航 / 求值 / 截图
    const onReady = () => {
      const withId = webview as unknown as { getWebContentsId?: () => number };
      const id = withId.getWebContentsId?.();
      if (typeof id !== "number") return;
      void browserAttachWebview(id, measure());
    };
    webview.addEventListener("dom-ready", onReady);

    const ro = new ResizeObserver(() => void browserSetViewport(measure()));
    ro.observe(host);

    return () => {
      ro.disconnect();
      webview.removeEventListener("dom-ready", onReady);
      void browserDetachWebview();
      webview.remove();
    };
  }, [active, available]);

  useEffect(() => {
    if (!pendingUrl?.trim()) return;
    const url = pendingUrl.trim();
    onPendingUrlConsumed?.();
    setUrlDraft(url);
    // 已在目标页则跳过，防止外部重复 open 触发刷新风暴
    void browserGetState().then((s) => {
      if (s && browserUrlsEqual(s.url, url) && !s.loading) return;
      void browserNavigate(url);
    });
  }, [pendingUrl, onPendingUrlConsumed]);

  async function submitUrl() {
    const next = urlDraft.trim();
    if (!next) return;
    await browserNavigate(next);
  }

  if (!available) {
    return (
      <div className="browser-pane browser-pane--empty">
        <EmptyState
          title={t("inspector.unavailableTitle")}
          description={t("inspector.unavailableBody", { cmd: "pnpm run dev" })}
        />
      </div>
    );
  }

  const blank = !state.url || state.url === "about:blank";

  return (
    <div className="browser-pane">
      <div className="browser-pane__toolbar">
        <div className="browser-pane__nav">
          <IconButton
            aria-label={t("browser.back")}
            size="sm"
            disabled={!state.canGoBack}
            onClick={() => void browserGoBack()}
          >
            <ChevronLeftIcon />
          </IconButton>
          <IconButton
            aria-label={t("browser.forward")}
            size="sm"
            disabled={!state.canGoForward}
            onClick={() => void browserGoForward()}
          >
            <ChevronRightIcon />
          </IconButton>
          <IconButton
            aria-label={t("browser.reload")}
            size="sm"
            onClick={() => void browserReload()}
          >
            <RestartIcon />
          </IconButton>
        </div>
        <div className="browser-pane__url">
          <Input
            size="sm"
            value={urlDraft}
            placeholder={t("browser.urlPlaceholder")}
            spellCheck={false}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitUrl();
              }
            }}
          />
        </div>
        {state.locked ? <span className="browser-pane__badge">{t("browser.aiBadge")}</span> : null}
        {state.loading ? <span className="browser-pane__badge">{t("browser.loading")}</span> : null}
      </div>
      <div className="browser-pane__viewport">
        {/* 页面本体：<webview> 由上面 effect 创建并挂进来（React 不管它） */}
        <div className="browser-pane__host" ref={hostRef} />
        {/* AI 锁定：只是两层字，压在 <webview> 之上挡住输入 */}
        {state.locked ? (
          <div className="browser-pane__overlay">
            <div className="browser-pane__overlay-title">{t("browser.aiOverlayTitle")}</div>
            <p className="browser-pane__overlay-hint">{t("browser.aiOverlayHint")}</p>
          </div>
        ) : null}
        {blank && active ? (
          <div className="browser-pane__placeholder">
            <p className="browser-pane__hint">{t("browser.emptyHint")}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
});
