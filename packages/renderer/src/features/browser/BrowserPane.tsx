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
import { BROWSER_PARTITION, type BrowserState } from "@thinker-workbench/shared";
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
import "./BrowserPane.less";

type Props = {
  /** 面板是否为当前激活 tab。*/
  active?: boolean;
  /** 这个标签打开时要载入的地址；只在首次变为可见时导航一次。*/
  initialUrl?: string;
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
export const BrowserPane = memo(function BrowserPane({ active = true, initialUrl = "" }: Props) {
  const t = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const contentsIdRef = useRef<number | null>(null);
  const bootUrlRef = useRef(initialUrl.trim());
  const [state, setState] = useState<BrowserState>(EMPTY_STATE);
  const [urlDraft, setUrlDraft] = useState("");
  const available = Boolean(window.thinker?.browser);

  useEffect(() => {
    if (!available) return;
    void browserGetState().then((s) => {
      // 后台标签不能吃到当前页的状态，否则一切回来地址栏是别人的
      if (!activeRef.current || !s) return;
      setState(s);
      if (s.url && s.url !== "about:blank") setUrlDraft(s.url);
    });
    return onBrowserEvent((event) => {
      if (!activeRef.current) return;
      if (event.type === "state") {
        setState(event.state);
        if (event.state.url && event.state.url !== "about:blank") {
          setUrlDraft(event.state.url);
        }
      }
    });
  }, [available]);

  // <webview> 跟着标签活着：切到别的标签只是隐藏，不拆掉页面。
  useEffect(() => {
    if (!available) return;
    const host = hostRef.current;
    if (!host) return;

    const webview = document.createElement("webview");
    webview.setAttribute("partition", BROWSER_PARTITION);
    // 必须带初始 src：不带 src 的 <webview> 不会创建 guest（dom-ready 永不触发）。
    webview.setAttribute("src", "about:blank");
    webview.className = "browser-pane__webview";
    host.appendChild(webview);

    const measure = (report: boolean) => {
      const rect = host.getBoundingClientRect();
      const width = Math.max(0, Math.round(rect.width));
      const height = Math.max(0, Math.round(rect.height));
      // 百分比高度不会传进 guest；用布局盒的像素值才能让页面跟面板一起变高。
      if (width > 0 && height > 0) {
        webview.style.width = `${width}px`;
        webview.style.height = `${height}px`;
        // 属性尺寸与 style 双写：部分 Electron 版本只认其一
        webview.setAttribute("width", String(width));
        webview.setAttribute("height", String(height));
      }
      if (report && activeRef.current && width > 0 && height > 0) {
        void browserSetViewport({ width, height });
      }
      return { width, height };
    };

    /** Electron <webview> 内部 browser 对象偶发不撑满，强制铺满宿主。 */
    const fitGuestSurface = () => {
      try {
        const root = webview.shadowRoot;
        const surface = root?.querySelector("iframe") ?? root?.firstElementChild;
        if (surface instanceof HTMLElement) {
          surface.style.cssText =
            "display:block;width:100%;height:100%;border:0;position:absolute;inset:0";
        }
      } catch {
        /* shadow 不可访问时忽略 */
      }
    };

    const onReady = () => {
      fitGuestSurface();
      const withId = webview as unknown as { getWebContentsId?: () => number };
      const id = withId.getWebContentsId?.();
      if (typeof id !== "number") return;
      contentsIdRef.current = id;
      // 首次就绪就上报真实尺寸，触发主进程同步 CSS 视口
      if (activeRef.current) void browserAttachWebview(id, measure(true));
    };
    webview.addEventListener("dom-ready", onReady);

    const ro = new ResizeObserver(() => {
      measure(true);
      fitGuestSurface();
    });
    ro.observe(host);
    requestAnimationFrame(() => {
      measure(true);
      fitGuestSurface();
    });

    return () => {
      ro.disconnect();
      webview.removeEventListener("dom-ready", onReady);
      const id = contentsIdRef.current;
      contentsIdRef.current = null;
      if (id != null) void browserDetachWebview(id);
      webview.remove();
    };
  }, [available]);

  // 只有当前标签挂到主进程。cleanup 里摘掉，避免后面的隐藏标签把 visible 盖成 false。
  useEffect(() => {
    if (!available || !active) return;
    void browserSetVisible(true);
    const id = contentsIdRef.current;
    if (id != null) {
      const rect = hostRef.current?.getBoundingClientRect();
      void browserAttachWebview(id, {
        width: Math.max(0, Math.round(rect?.width ?? 0)),
        height: Math.max(0, Math.round(rect?.height ?? 0)),
      });
    }
    return () => {
      void browserSetVisible(false);
      const current = contentsIdRef.current;
      if (current != null) void browserDetachWebview(current);
    };
  }, [active, available]);

  // 标签自带的地址只在它第一次被看到时打开，之后的跳转留在这一页里。
  useEffect(() => {
    if (!available || !active) return;
    const url = bootUrlRef.current;
    if (!url) return;
    bootUrlRef.current = "";
    setUrlDraft(url);
    void browserNavigate(url);
  }, [available, active]);

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
