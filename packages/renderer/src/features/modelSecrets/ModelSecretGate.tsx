/**
 * 全局模型密钥门禁：仅拦截「钥匙串未授权」(denied)。
 *
 * 从未配置密钥 (missing) **不**弹此窗、也不拦截发送——交给气泡内
 * `MODEL_API_KEY_MISSING` 的既有引导（跳转模型设置）。
 *
 * 说明：macOS 若本进程已点过「拒绝」，系统常不再弹密码框，Retry 会立刻失败；
 * 需完全退出应用后再试。
 */
import { Button, Callout, Modal } from "@thinker-workbench/design/react";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { unlockModelSecrets } from "../../bridge/thinker";
import { useT } from "../../i18n/useI18n";

/** Retry 后的持久反馈（避免「一闪就没」）。 */
type RetryFeedback = "ok" | "still-denied" | null;

type ModelSecretGateContextValue = {
  /**
   * 尝试解锁。
   * - 成功 / 仅未配置密钥：返回 true（调用方继续；missing 由下游既有逻辑处理）
   * - 钥匙串拒绝：弹窗并返回 false（调用方应中止）
   */
  ensureUnlocked: () => Promise<boolean>;
  /** 直接展示钥匙串拒绝弹窗（IPC 已返回 UNLOCK_DENIED 时的兜底）。 */
  showDeniedGate: () => void;
  dismiss: () => void;
  open: boolean;
};

const ModelSecretGateContext = createContext<ModelSecretGateContextValue | null>(null);

/** 成功提示停留后再关弹窗，让用户看清结果。 */
const SUCCESS_HOLD_MS = 1200;
/** Retry 时至少展示「正在获取」，避免系统秒拒时按钮一闪即过。 */
const RETRY_MIN_HOLD_MS = 700;

type ProviderProps = {
  children: ReactNode;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** 提供全局解锁门禁 + 钥匙串拒绝 Modal。 */
export function ModelSecretGateProvider({ children }: ProviderProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [feedback, setFeedback] = useState<RetryFeedback>(null);

  const dismiss = useCallback(() => {
    setRetrying(false);
    setFeedback(null);
    setOpen(false);
  }, []);

  const showDeniedGate = useCallback(() => {
    setFeedback(null);
    setOpen(true);
  }, []);

  const ensureUnlocked = useCallback(async () => {
    const result = await unlockModelSecrets();
    if (result.ok) return true;
    // 未配置：不拦截，交给气泡 / 探测等既有 missing 处理
    if (result.reason === "missing") return true;
    setFeedback(null);
    setOpen(true);
    return false;
  }, []);

  const value = useMemo(
    () => ({ ensureUnlocked, showDeniedGate, dismiss, open }),
    [ensureUnlocked, showDeniedGate, dismiss, open],
  );

  async function retryUnlock() {
    setRetrying(true);
    setFeedback(null);
    const started = Date.now();
    try {
      // force：清空内存明文并再调 decrypt，尽量再次触发系统授权
      const result = await unlockModelSecrets({ force: true });
      const elapsed = Date.now() - started;
      if (elapsed < RETRY_MIN_HOLD_MS) {
        await wait(RETRY_MIN_HOLD_MS - elapsed);
      }
      if (result.ok) {
        setFeedback("ok");
        window.setTimeout(() => dismiss(), SUCCESS_HOLD_MS);
        return;
      }
      // missing：关窗，让调用方后续走既有引导
      if (result.reason === "missing") {
        dismiss();
        return;
      }
      setFeedback("still-denied");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <ModelSecretGateContext.Provider value={value}>
      {children}
      <Modal
        open={open}
        onClose={dismiss}
        closeOnBackdrop={!retrying && feedback !== "ok"}
        closeOnEscape={!retrying && feedback !== "ok"}
        aria-labelledby="model-secret-gate-title"
      >
        <h2 id="model-secret-gate-title" className="components-modal-title">
          {t("chat.errors.secretDeniedTitle")}
        </h2>
        <p className="components-modal-body">{t("chat.errors.secretDenied")}</p>
        {feedback === "ok" ? <Callout tone="info">{t("chat.errors.secretRetryOk")}</Callout> : null}
        {feedback === "still-denied" ? (
          <Callout tone="warning">{t("chat.errors.secretRetryStillDenied")}</Callout>
        ) : null}
        <div className="components-row components-row--end">
          <Button variant="ghost" onClick={dismiss} disabled={retrying || feedback === "ok"}>
            {t("chat.errors.secretUnlockCancel")}
          </Button>
          <Button
            variant="primary"
            onClick={() => void retryUnlock()}
            disabled={retrying || feedback === "ok"}
          >
            {retrying ? t("chat.errors.secretRetrying") : t("chat.errors.secretRetryUnlock")}
          </Button>
        </div>
      </Modal>
    </ModelSecretGateContext.Provider>
  );
}

function useModelSecretGateContext(): ModelSecretGateContextValue {
  const ctx = useContext(ModelSecretGateContext);
  if (!ctx) {
    throw new Error("Model secret gate hooks require ModelSecretGateProvider");
  }
  return ctx;
}

/**
 * 需要明文 API key 前调用：钥匙串拒绝时已弹窗并返回 false；
 * 未配置密钥返回 true（不拦截）。须在 `ModelSecretGateProvider` 内使用。
 */
export function useEnsureModelSecrets(): () => Promise<boolean> {
  return useModelSecretGateContext().ensureUnlocked;
}

/** 直接弹出钥匙串拒绝门禁（例如 IPC 已返回 UNLOCK_DENIED）。 */
export function useShowModelSecretGate(): () => void {
  return useModelSecretGateContext().showDeniedGate;
}
