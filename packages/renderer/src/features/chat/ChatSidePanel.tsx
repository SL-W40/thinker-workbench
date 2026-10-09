/**
 * 聊天左右可调整宽度的侧栏。
 *
 * - `open` 为 false 时不渲染（卸载）
 * - 拖拽分隔条时用 pointer 事件全局监听；左侧加宽随鼠标右移，右侧相反
 */
import { type ReactNode, useEffect, useRef, useState } from "react";

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
  onWidthChange: (width: number) => void;
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
  onWidthChange,
  children,
}: Props) {
  const startX = useRef(0);
  const startWidth = useRef(width);
  const [dragging, setDragging] = useState(false);

  // 拖拽中：更新宽度，并锁定 body 光标 / 选区
  useEffect(() => {
    if (!dragging) return;

    const onMove = (event: PointerEvent) => {
      const delta = event.clientX - startX.current;
      const next = side === "left" ? startWidth.current + delta : startWidth.current - delta;
      onWidthChange(Math.min(maxWidth, Math.max(minWidth, next)));
    };

    const onUp = () => setDragging(false);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging, maxWidth, minWidth, onWidthChange, side]);

  if (!open) return null;

  return (
    <aside
      className={`chat-side chat-side--${side}${showHead ? "" : " chat-side--no-head"}${dragging ? " is-dragging" : ""}`}
      style={{ width }}
      aria-label={title}
    >
      {showHead ? (
        <header className="chat-side__head">
          <h2>{title}</h2>
        </header>
      ) : null}
      <div className="chat-side__body">{children}</div>
      <div
        className={`chat-side__resize chat-side__resize--${side}`}
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        aria-valuenow={width}
        aria-label={title}
        onPointerDown={(event) => {
          event.preventDefault();
          startX.current = event.clientX;
          startWidth.current = width;
          setDragging(true);
        }}
      />
    </aside>
  );
}
