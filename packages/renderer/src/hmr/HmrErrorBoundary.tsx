/**
 * 仅开发态使用：HMR / Fast Refresh 导致渲染抛错时自动 remount，避免 Electron 白屏只能硬刷新。
 * 生产包不应挂载本组件（见 RootApp）。
 */
import { Button, EmptyState, Spinner } from "@thinker-workbench/design/react";
import { Component, type ErrorInfo, type ReactNode } from "react";

/** 同一错误连续自动 remount 的上限；超出后展示失败态。 */
const MAX_AUTO_RETRIES = 2;

type Props = {
  children: ReactNode;
  /** 递增以强制整树 remount。 */
  resetKey: number;
  onError?: () => void;
};

type State = {
  error: Error | null;
  /** 已消耗的自动 remount 次数。 */
  retries: number;
  /** true = 不再自动重试，展示错误面板。 */
  stuck: boolean;
};

export class HmrErrorBoundary extends Component<Props, State> {
  state: State = { error: null, retries: 0, stuck: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[hmr] render error", error, info.componentStack);
    if (this.state.stuck) return;
    if (this.state.retries >= MAX_AUTO_RETRIES) {
      this.setState({ stuck: true });
      return;
    }
    this.setState((s) => ({ retries: s.retries + 1 }));
    this.props.onError?.();
  }

  componentDidUpdate(prevProps: Props): void {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error && !this.state.stuck) {
      this.setState({ error: null });
    }
  }

  private hardReload = (): void => {
    window.location.reload();
  };

  private retryOnce = (): void => {
    this.setState({ error: null, retries: 0, stuck: false });
    this.props.onError?.();
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    if (this.state.stuck) {
      const message = this.state.error.message?.trim() || String(this.state.error);
      return (
        <div
          style={{
            display: "grid",
            placeItems: "center",
            height: "100%",
            padding: 32,
            boxSizing: "border-box",
            background: "var(--tw-bg, var(--bg, #f6f4ef))",
            color: "var(--tw-fg, var(--ink, #2a2622))",
          }}
          role="alert"
        >
          <EmptyState
            title="界面未能恢复"
            description={`${message}\n开发热更新出错时会出现此页；修代码后点重载即可。`}
            action={
              <>
                <Button variant="primary" size="sm" onClick={this.hardReload}>
                  重新加载
                </Button>
                <Button variant="ghost" size="sm" onClick={this.retryOnce}>
                  再试一次
                </Button>
              </>
            }
          />
        </div>
      );
    }

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          height: "100%",
          padding: 24,
          boxSizing: "border-box",
          background: "var(--tw-bg, var(--bg, #f6f4ef))",
          color: "var(--tw-fg-muted, var(--muted, #6b6560))",
          fontFamily: "var(--tw-font-ui, system-ui, sans-serif)",
          fontSize: 13,
        }}
        role="status"
        aria-live="polite"
      >
        <Spinner size="md" label="正在恢复界面" />
        <p style={{ margin: 0 }}>正在恢复界面…</p>
      </div>
    );
  }
}
