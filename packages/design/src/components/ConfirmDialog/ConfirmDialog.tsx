/**
 * 确认对话框：替代 `window.confirm` 的自定义弹窗（基于 Modal）。
 *
 * - 文案全部由调用方传入（组件不内置语言）；`confirmLabel` / `cancelLabel` 必填。
 * - 默认允许 Escape 与点蒙层关闭；`busy` 中一律禁止关闭，避免操作半途弹窗消失。
 * - `tone="danger"` 时确认按钮走 danger 变体且不自动聚焦，避免回车误触发不可逆操作。
 */
import { type ReactNode, useId } from "react";
import { Button } from "../Button/Button";
import { Modal } from "../Modal/Modal";

export type ConfirmDialogTone = "default" | "danger";

export type ConfirmDialogProps = {
  /** 是否打开。 */
  open: boolean;
  /** 标题（有则作为对话框的 aria-labelledby）。 */
  title?: ReactNode;
  /** 说明正文。 */
  description?: ReactNode;
  /** 确认按钮文案。 */
  confirmLabel: string;
  /** 取消按钮文案。 */
  cancelLabel: string;
  /** 语气。默认 `default`；不可逆操作用 `danger`。 */
  tone?: ConfirmDialogTone;
  /** 确认进行中：禁用两个按钮并关闭所有关闭路径。 */
  busy?: boolean;
  /** 点击确认。 */
  onConfirm: () => void;
  /** 取消 / 关闭。 */
  onCancel: () => void;
  /** 点蒙层是否关闭。默认跟随 `busy`（忙时不可关）。 */
  closeOnBackdrop?: boolean;
  /** 无标题时给对话框的 aria-label。 */
  "aria-label"?: string;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "default",
  busy = false,
  onConfirm,
  onCancel,
  closeOnBackdrop,
  "aria-label": ariaLabel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const danger = tone === "danger";

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onCancel}
      closeOnEscape={!busy}
      closeOnBackdrop={closeOnBackdrop ?? !busy}
      aria-labelledby={title != null ? titleId : undefined}
      aria-label={title != null ? undefined : ariaLabel}
      panelClassName="tw-confirm__panel"
    >
      {title != null ? <Modal.Header title={title} titleId={titleId} /> : null}
      {description != null ? <Modal.Body>{description}</Modal.Body> : null}
      <Modal.Footer>
        <Button variant="ghost" disabled={busy} autoFocus={danger} onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          variant={danger ? "danger" : "primary"}
          busy={busy}
          autoFocus={!danger}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
