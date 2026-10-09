/**
 * 对话框：Portal 到 `document.body`，遮罩 / Escape 关闭可选。
 * 打开 / 关闭带进出场动画；关闭时等面板离场动画结束再卸载。
 * 内容过高时在滚动层滚动，蒙层本身不动。
 */
import { useEffect, useState, type AnimationEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type ModalProps = {
  /** 是否打开。 */
  open: boolean;
  children: ReactNode;
  /** 允许关闭时调用（遮罩 / Escape）。 */
  onClose?: () => void;
  /** 为 true 时点击遮罩调用 `onClose`。默认 false。 */
  closeOnBackdrop?: boolean;
  /** 为 true 时 Escape 调用 `onClose`。默认 false。 */
  closeOnEscape?: boolean;
  /** 对话框的 `aria-labelledby`。 */
  "aria-labelledby"?: string;
  /** 无 labelledby 时的 `aria-label`。 */
  "aria-label"?: string;
  /** 追加到根节点的 class。 */
  className?: string;
  /** 追加到面板的 class。 */
  panelClassName?: string;
};

export function Modal({
  open,
  children,
  onClose,
  closeOnBackdrop = false,
  closeOnEscape = false,
  "aria-labelledby": ariaLabelledBy,
  "aria-label": ariaLabel,
  className,
  panelClassName,
}: ModalProps) {
  /** 是否仍挂在 DOM（含离场动画帧）。 */
  const [present, setPresent] = useState(open);
  /** 当前为进场或离场，驱动 CSS class。 */
  const [phase, setPhase] = useState<"enter" | "exit" | null>(open ? "enter" : null);

  useEffect(() => {
    if (open) {
      setPresent(true);
      setPhase("enter");
      return;
    }
    if (present) setPhase("exit");
  }, [open, present]);

  // 打开时锁住 body；过高内容在 `.tw-modal__scroll` 内滚，蒙层不跟着动
  useEffect(() => {
    if (!present || typeof document === "undefined") return;
    const { body } = document;
    const prev = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = prev;
    };
  }, [present]);

  useEffect(() => {
    if (!present || !closeOnEscape || !onClose) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && phase !== "exit") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [present, closeOnEscape, onClose, phase]);

  // 面板离场动画结束后再卸 Portal；无动画环境则立即卸。
  function onPanelAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (phase !== "exit") return;
    const name = event.animationName;
    if (!name.includes("tw-modal-panel-out")) return;
    setPresent(false);
    setPhase(null);
  }

  useEffect(() => {
    if (phase !== "exit" || typeof window === "undefined") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) return;
    setPresent(false);
    setPhase(null);
  }, [phase]);

  if (!present || typeof document === "undefined") return null;

  const phaseClass = phase === "exit" ? " is-exit" : " is-enter";
  const canDismiss = Boolean(closeOnBackdrop && onClose && phase !== "exit");

  return createPortal(
    <div
      className={`tw-modal${phaseClass}${className ? ` ${className}` : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledBy}
      aria-label={ariaLabel}
    >
      <div
        className="tw-modal__backdrop"
        aria-hidden
        onClick={canDismiss ? () => onClose?.() : undefined}
      />
      <div
        className="tw-modal__scroll"
        onClick={
          canDismiss
            ? (event) => {
                // 点滚动层空白（非面板）视同点蒙层
                if (event.target === event.currentTarget) onClose?.();
              }
            : undefined
        }
      >
        <div
          className={`tw-modal__panel${panelClassName ? ` ${panelClassName}` : ""}`}
          onAnimationEnd={onPanelAnimationEnd}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
