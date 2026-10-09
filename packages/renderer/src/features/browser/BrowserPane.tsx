/**
 * 右侧 Browser 面板：地址栏 + 视口洞（WebContentsView 由主进程叠加）。
 */
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EmptyState,
  IconButton,
  Input,
  RestartIcon,
} from "@thinker-workbench/design/react";
import type { BrowserState } from "@thinker-workbench/shared";
import { useEffect, useRef, useState } from "react";
import {
  browserGetState,
  browserGoBack,
  browserGoForward,
  browserNavigate,
  browserReload,
  browserSetBounds,
  browserSetVisible,
  onBrowserEvent,
} from "../../bridge/browser";
import { useT } from "../../i18n/I18nProvider";
import "./BrowserPane.less";

type Props = {
  /** 面板是否为当前激活 tab。 */
  active?: boolean;
  /** 外部请求导航的 URL（消费后清空）。 */
  pendingUrl?: string | null;
  onPendingUrlConsumed?: () => void;
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

export function BrowserPane({
  active = true,
  pendingUrl = null,
  onPendingUrlConsumed,
}: Props) {
  const t = useT();
  const viewportRef = useRef<HTMLDivElement>(null);
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

  // 激活时显示 view，并同步 bounds
  useEffect(() => {
    if (!available) return;
    void browserSetVisible(active);
    return () => {
      void browserSetVisible(false);
    };
  }, [active, available]);

  useEffect(() => {
    if (!available || !active) return;
    const el = viewportRef.current;
    if (!el) return;

    let raf = 0;
    const publish = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        void browserSetBounds({
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        });
      });
    };

    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    window.addEventListener("resize", publish);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", publish);
      void browserSetBounds({ x: 0, y: 0, width: 0, height: 0 });
    };
  }, [active, available]);

  useEffect(() => {
    if (!pendingUrl?.trim()) return;
    const url = pendingUrl.trim();
    onPendingUrlConsumed?.();
    setUrlDraft(url);
    void browserNavigate(url);
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
        {state.locked ? (
          <span className="browser-pane__badge">{t("browser.aiBadge")}</span>
        ) : null}
        {state.loading ? (
          <span className="browser-pane__badge">{t("browser.loading")}</span>
        ) : null}
      </div>
      <div className="browser-pane__viewport" ref={viewportRef}>
        {blank && active ? (
          <div className="browser-pane__placeholder">
            <p className="browser-pane__hint">{t("browser.emptyHint")}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
