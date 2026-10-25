/**
 * 聊天左右可调整宽度的侧栏。
 *
 * - `open` 为 false 时不渲染（卸载）
 * - 宽度由 `.chat-shell` 上的 CSS 变量下发，组件本身不再写 inline width
 * - 拖拽分隔条时用 pointer 事件全局监听，但按 rAF 合并成每帧一次（见 useResizeDrag）；
 *   左侧加宽随鼠标右移，右侧相反
 * - 每帧只调 `onWidthPreview`（直接改 CSS 变量，不渲染），松手才 `onWidthCommit` 提交 state
 */
import type { ReactNode } from "react";
import { useResizeDrag } from "../../../ui/hooks/useResizeDrag";

type Side = "left" | "right";

type Props = {
  side: Side;
  open: boolean;
  width: number;
  minWidth: number;
  maxWidth: number;
  title: string;
  /** 为 false 时不渲染标题栏，内容从面板顶开始（如左侧 Open workspace） */
  showHead?: boolean;
  /** 拖拽中的宽度预览：每帧一次，只写 CSS 变量，不触发渲染。 */
  onWidthPreview: (width: number) => void;
  /** 松手后的最终宽度：提交到 React state（并落盘）。 */
  onWidthCommit: (width: number) => void;
  /** 按下瞬间：冻结面板内容宽度，拖拽期不再逐帧重排。 */
  onResizeStart?: () => void;
  /** 松手后：解除冻结。 */
  onResizeEnd?: () => void;
  children?: ReactNode;
};

export function ChatSidePanel({
  side,
  open,
  width,
  minWidth,
  maxWidth,
  title,
  showHead = true,
  onWidthPreview,
  onWidthCommit,
  onResizeStart,
  onResizeEnd,
  children,
}: Props) {
  // 空间紧时 max 可能 < 名义 min，取两者较小值作下限，避免强行超宽盖住中间列
  const { dragging, onPointerDown } = useResizeDrag({
    width,
    project: (startWidth, delta) => (side === "left" ? startWidth + delta : startWidth - delta),
    clamp: (next) => Math.min(maxWidth, Math.max(Math.min(minWidth, maxWidth), next)),
    onResize: onWidthPreview,
    onCommit: onWidthCommit,
    onStart: onResizeStart,
    onEnd: onResizeEnd,
  });

  if (!open) return null;

  return (
    <aside
      className={`chat-side chat-side--${side}${showHead ? "" : " chat-side--no-head"}${dragging ? " is-dragging" : ""}`}
      aria-label={title}
    >
      {showHead ? (
        <header className="chat-side__head">
          <h2>{title}</h2>
        </header>
      ) : null}
      <div className="chat-side__body">{children}</div>
      {/* biome-ignore lint/a11y/useSemanticElements: 面板拖宽手柄，ARIA separator + 指针拖拽模式，无对应原生控件 */}
      <div
        className={`chat-side__resize chat-side__resize--${side}`}
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        aria-valuenow={width}
        aria-label={title}
        onPointerDown={onPointerDown}
      />
    </aside>
  );
}
