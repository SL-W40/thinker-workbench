/**
 * 设置 → 模型：连接凭据（API Key / Base URL / 模型名）与回复偏好（emoji）。
 * 文本字段防抖保存；开关立即保存；已保存的 Key 不回显明文，用 hint 占位。
 */
import { useEffect, useId, useRef, useState } from "react";
import { Callout, Field, Input, Switch } from "@thinker-workbench/design/react";
import type { ModelSettingsPublic } from "@thinker-workbench/shared";
import { getModelSettings, setModelSettings } from "../../bridge/thinker";
import { useT } from "../../i18n/I18nProvider";

/** 输入停止后延迟再写入主进程的毫秒数。 */
const SAVE_DEBOUNCE_MS = 450;

export function ModelSettingsForm() {
  const t = useT();
  const keyId = useId();
  const urlId = useId();
  const modelId = useId();
  const [publicSettings, setPublicSettings] = useState<ModelSettingsPublic | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [allowEmoji, setAllowEmoji] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const available = Boolean(window.thinker?.settings);
  /** 首轮加载完成前不触发自动保存。 */
  const readyRef = useRef(false);
  /** 上次成功写入的值，用于跳过无变更保存。 */
  const lastSavedRef = useRef({ baseUrl: "", model: "", apiKey: "", allowEmoji: false });

  // 挂载时拉取公开设置（不含完整 Key）
  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    void (async () => {
      try {
        const next = await getModelSettings();
        if (cancelled) return;
        setPublicSettings(next);
        setBaseUrl(next.baseUrl);
        setModel(next.model);
        setAllowEmoji(next.allowEmoji);
        setApiKey("");
        lastSavedRef.current = {
          baseUrl: next.baseUrl,
          model: next.model,
          apiKey: "",
          allowEmoji: next.allowEmoji,
        };
        readyRef.current = true;
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [available]);

  // 防抖自动保存文本字段；成功后清空本地 apiKey 输入（避免明文滞留）
  useEffect(() => {
    if (!available || !readyRef.current) return;

    const key = apiKey.trim();
    const last = lastSavedRef.current;
    if (baseUrl === last.baseUrl && model === last.model && key === last.apiKey) return;

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const next = await setModelSettings({
            apiKey: key || undefined,
            baseUrl,
            model,
          });
          setPublicSettings(next);
          lastSavedRef.current = {
            baseUrl,
            model,
            apiKey: "",
            allowEmoji: next.allowEmoji,
          };
          if (key) setApiKey("");
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })();
    }, SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [available, apiKey, baseUrl, model]);

  async function toggleAllowEmoji(next: boolean): Promise<void> {
    setAllowEmoji(next);
    if (!available || !readyRef.current) return;
    try {
      const saved = await setModelSettings({ allowEmoji: next });
      setPublicSettings(saved);
      lastSavedRef.current = { ...lastSavedRef.current, allowEmoji: saved.allowEmoji };
      setError(null);
    } catch (err) {
      setAllowEmoji(lastSavedRef.current.allowEmoji);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!available) {
    return (
      <Callout tone="warning">{t("settings.model.unavailable", { cmd: "pnpm run dev" })}</Callout>
    );
  }

  return (
    <div className="settings-model">
      <section className="settings-model-block">
        <div className="settings-theme-head">
          <strong>{t("settings.model.connection.title")}</strong>
          <span>{t("settings.model.connection.description")}</span>
        </div>
        <div className="settings-model-fields">
          <Field
            label={t("settings.model.apiKey")}
            htmlFor={keyId}
            description={t("settings.model.apiKeyHint")}
            error={error}
          >
            <Input
              id={keyId}
              type="password"
              value={apiKey}
              placeholder={
                publicSettings?.hasApiKey
                  ? t("settings.model.apiKeySaved", { hint: publicSettings.apiKeyHint })
                  : t("settings.model.apiKeyPlaceholder")
              }
              onChange={(e) => setApiKey(e.target.value)}
            />
          </Field>
          <Field
            label={t("settings.model.baseUrl")}
            htmlFor={urlId}
            description={t("settings.model.baseUrlHint")}
          >
            <Input
              id={urlId}
              type="url"
              value={baseUrl}
              placeholder={t("settings.model.baseUrlPlaceholder")}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </Field>
          <Field
            label={t("settings.model.model")}
            htmlFor={modelId}
            description={t("settings.model.modelHint")}
          >
            <Input
              id={modelId}
              value={model}
              placeholder={t("settings.model.modelPlaceholder")}
              onChange={(e) => setModel(e.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="settings-model-block">
        <div className="settings-theme-head">
          <strong>{t("settings.model.reply.title")}</strong>
          <span>{t("settings.model.reply.description")}</span>
        </div>
        <ul className="settings-toggle-list">
          <li className="settings-toggle-row">
            <div className="settings-toggle-copy">
              <strong>{t("settings.model.allowEmoji.title")}</strong>
              <span>{t("settings.model.allowEmoji.description")}</span>
            </div>
            <Switch
              checked={allowEmoji}
              aria-label={t("settings.model.allowEmoji.title")}
              onChange={(checked) => void toggleAllowEmoji(checked)}
            />
          </li>
        </ul>
      </section>
    </div>
  );
}
