/**
 * 轻提示（Toast）：Portal 到 `document.body` 的提示栈。
 *
 * - `ToastProvider` 注入能力，`useToast()` 取命令式 API（info / success / warning / danger）。
 *   文案由调用方给出，组件内不内置任何语言。
 * - 默认按语气自动消失；`duration: 0` 表示常驻直到手动关闭。
 * - 悬停 / 键盘聚焦时暂停计时，避免「正在读就被收走」。
 * - 同屏超过 `max` 条时挤掉最旧的一条，避免铺满角落。
 */
import {
  type ComponentType,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangleIcon, CheckIcon, CloseIcon, type IconProps, InfoIcon } from "../Icon";
import { IconButton } from "../IconButton/IconButton";

export type ToastTone = "info" | "success" | "warning" | "danger";

export type ToastOptions = {
  /** 主文案。 */
  title?: ReactNode;
  /** 次级说明（可选）。 */
  description?: ReactNode;
  /** 语气。默认 `info`。 */
  tone?: ToastTone;
  /** 自动关闭毫秒；0 为不自动关闭。缺省按语气取默认时长。 */
  duration?: number;
  /** 行内操作（如「重试」）。 */
  action?: ReactNode;
};

type ToastEntry = {
  id: string;
  tone: ToastTone;
  title?: ReactNode;
  description?: ReactNode;
  duration: number;
  action?: ReactNode;
};

export type ToastApi = {
  /** 入栈一条提示，返回其 id。 */
  show: (options?: ToastOptions) => string;
  info: (options?: ToastOptions) => string;
  success: (options?: ToastOptions) => string;
  warning: (options?: ToastOptions) => string;
  danger: (options?: ToastOptions) => string;
  /** 关闭指定 id（无论是否还在播离场动画）。 */
  dismiss: (id: string) => void;
  /** 清空全部。 */
  clear: () => void;
};

export type ToastPlacement = "bottom-right" | "bottom-center" | "top-right" | "top-center";

export type ToastProviderProps = {
  children: ReactNode;
  /** 同屏最多保留几条。默认 4。 */
  max?: number;
  /** 覆盖按语气的默认时长（毫秒）。 */
  defaultDuration?: number;
  /** 停靠位置。默认 `bottom-right`。 */
  placement?: ToastPlacement;
  /** 关闭按钮的无障碍名称（仅图标控件必填）。 */
  dismissLabel?: string;
  /** 提示区（`role="region"`）的无障碍名称。 */
  regionLabel?: string;
  /** 追加到提示区的 class。 */
  className?: string;
};

/** 按语气的默认停留时长（毫秒）。 */
const TONE_DURATION: Record<ToastTone, number> = {
  info: 3200,
  success: 3200,
  warning: 5000,
  danger: 6000,
};

/** 语气图标；info / success / warning / danger 各一。 */
const TONE_ICON: Record<ToastTone, ComponentType<IconProps>> = {
  info: InfoIcon,
  success: CheckIcon,
  warning: AlertTriangleIcon,
  danger: AlertTriangleIcon,
};

/** 离场动画时长，需与 Toast.less 的 `tw-toast-out` 对齐。 */
const EXIT_MS = 180;

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({
  children,
  max = 4,
  defaultDuration,
  placement = "bottom-right",
  dismissLabel = "Dismiss",
  regionLabel = "Notifications",
  className,
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  /** 自增序号：id 只用于定位，不需要全局唯一。 */
  const seq = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const show = useCallback(
    (options: ToastOptions = {}) => {
      const tone = options.tone ?? "info";
      seq.current += 1;
      const id = `tw-toast-${seq.current}`;
      const entry: ToastEntry = {
        id,
        tone,
        title: options.title,
        description: options.description,
        action: options.action,
        duration: options.duration ?? defaultDuration ?? TONE_DURATION[tone],
      };
      setToasts((prev) => {
        const next = [...prev, entry];
        return next.length > max ? next.slice(next.length - max) : next;
      });
      return id;
    },
    [defaultDuration, max],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      dismiss,
      clear: () => setToasts([]),
      info: (options) => show({ ...options, tone: "info" }),
      success: (options) => show({ ...options, tone: "success" }),
      warning: (options) => show({ ...options, tone: "warning" }),
      danger: (options) => show({ ...options, tone: "danger" }),
    }),
    [show, dismiss],
  );

  const viewport =
    typeof document === "undefined" ? null : (
      <ToastViewport
        toasts={toasts}
        placement={placement}
        dismissLabel={dismissLabel}
        regionLabel={regionLabel}
        onDismiss={dismiss}
        className={className}
      />
    );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {viewport ? createPortal(viewport, document.body) : null}
    </ToastContext.Provider>
  );
}

/** 读取 Toast API；必须在 `ToastProvider` 内使用。 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used within ToastProvider");
  return api;
}

type ToastViewportProps = {
  toasts: ToastEntry[];
  placement: ToastPlacement;
  dismissLabel: string;
  regionLabel: string;
  onDismiss: (id: string) => void;
  className?: string;
};

function ToastViewport({
  toasts,
  placement,
  dismissLabel,
  regionLabel,
  onDismiss,
  className,
}: ToastViewportProps) {
  return (
    <section
      className={`tw-toast-viewport tw-toast-viewport--${placement}${className ? ` ${className}` : ""}`}
      aria-live="polite"
      aria-label={regionLabel}
    >
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} dismissLabel={dismissLabel} onDismiss={onDismiss} />
      ))}
    </section>
  );
}

type ToastRowProps = {
  toast: ToastEntry;
  dismissLabel: string;
  onDismiss: (id: string) => void;
};

function ToastRow({ toast, dismissLabel, onDismiss }: ToastRowProps) {
  const [leaving, setLeaving] = useState(false);
  /** 悬停 / 聚焦时暂停计时，离开后重新计时。 */
  const [paused, setPaused] = useState(false);
  const ToneIcon = TONE_ICON[toast.tone];

  const close = useCallback(() => {
    setLeaving(true);
    // 等离场动画播完再卸载；无动画环境（reduced-motion）也只是晚一帧移除
    window.setTimeout(() => onDismiss(toast.id), EXIT_MS);
  }, [onDismiss, toast.id]);

  useEffect(() => {
    if (leaving || paused || toast.duration <= 0) return;
    const timer = window.setTimeout(close, toast.duration);
    return () => window.clearTimeout(timer);
  }, [close, leaving, paused, toast.duration]);

  const assertive = toast.tone === "danger" || toast.tone === "warning";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 悬停 / 聚焦暂停计时是纯鼠标与焦点增强，关闭另有按钮
    <div
      className={`tw-toast tw-toast--${toast.tone}${leaving ? " is-leaving" : ""}`}
      role={assertive ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="tw-toast__icon">
        <ToneIcon size="md" />
      </span>
      <div className="tw-toast__content">
        {toast.title != null ? <strong className="tw-toast__title">{toast.title}</strong> : null}
        {toast.description != null ? (
          <span className="tw-toast__desc">{toast.description}</span>
        ) : null}
      </div>
      {toast.action != null ? <div className="tw-toast__action">{toast.action}</div> : null}
      <IconButton
        size="sm"
        variant="ghost"
        aria-label={dismissLabel}
        className="tw-toast__close"
        onClick={close}
      >
        <CloseIcon size="sm" />
      </IconButton>
    </div>
  );
}
