/**
 * 流式块外壳：代码 / mermaid / 表格 / pending 的状态条与主体。
 */
import type { ReactNode } from "react";

export type StreamStatus = "streaming" | "loading" | "preview" | "ready" | "error";

const STATUS_LABEL: Record<StreamStatus, string> = {
  streaming: "streaming",
  loading: "",
  preview: "preview",
  ready: "",
  error: "error",
};

type Props = {
  /** 块种类。 */
  kind: "code" | "mermaid" | "table" | "pending";
  /** 顶栏左侧标签（语言名等）。 */
  label: string;
  /** 流式状态。默认 `ready`。 */
  status?: StreamStatus;
  children: ReactNode;
  /** 顶栏右侧操作区（如代码块 ⋯ 菜单）。 */
  actions?: ReactNode;
  /** 可选底栏。 */
  footer?: ReactNode;
};

export function StreamChrome({
  kind,
  label,
  status = "ready",
  children,
  actions,
  footer,
}: Props) {
  const live = status === "streaming" || status === "loading" || status === "preview";
  const statusText = STATUS_LABEL[status];

  return (
    <div
      className={[
        "tw-md-stream",
        `tw-md-stream--${kind}`,
        live ? "tw-md-stream--live" : "",
        status === "error" ? "tw-md-stream--error" : "",
        status === "preview" ? "tw-md-stream--preview" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-status={status}
    >
      <div className="tw-md-stream-bar">
        <span className="tw-md-stream-label">{label}</span>
        <div className="tw-md-stream-bar-end">
          {statusText ? (
            <span className="tw-md-stream-status">
              {live ? <span className="tw-md-stream-pulse" aria-hidden="true" /> : null}
              {statusText}
            </span>
          ) : null}
          {actions}
        </div>
      </div>
      <div className="tw-md-stream-body">{children}</div>
      {footer ? <div className="tw-md-stream-footer">{footer}</div> : null}
    </div>
  );
}
