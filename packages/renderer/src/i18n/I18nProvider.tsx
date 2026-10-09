/**
 * UI 语言上下文：从通用设置加载 `uiLocale`，并提供 `t()` 翻译函数。
 *
 * - 挂载后异步拉取 `getGeneralSettings`（无 API 则保持默认英文）
 * - 同步 `document.documentElement.lang`，便于无障碍与浏览器行为
 * - `applyGeneral` 供设置保存后批量对齐 locale
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_APP_LOCALE,
  DEFAULT_GENERAL_SETTINGS,
  type AppLocale,
  type GeneralSettings,
} from "@thinker-workbench/shared";
import { GENERAL_SETTINGS_CHANGED, getGeneralSettings } from "../bridge/thinker";
import { translate, type MessageKey } from "./translate";

type I18nContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: MessageKey, vars?: Record<string, string>) => string;
  /** 应用完整通用设置快照（例如设置保存成功后）。 */
  applyGeneral: (general: GeneralSettings) => void;
};

const I18nContext = createContext<I18nContextValue | null>(null);

/** 提供 locale / t / applyGeneral；应包裹在 AppearanceProvider 内侧。 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<AppLocale>(DEFAULT_APP_LOCALE);

  // 启动时从持久化通用设置读取 UI 语言
  useEffect(() => {
    if (!window.thinker?.settings?.getGeneral) return;
    let cancelled = false;
    void (async () => {
      try {
        const general = await getGeneralSettings();
        if (!cancelled) setLocale(general.uiLocale || DEFAULT_GENERAL_SETTINGS.uiLocale);
      } catch {
        // 保持默认
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  const applyGeneral = useCallback((general: GeneralSettings) => {
    setLocale(general.uiLocale || DEFAULT_APP_LOCALE);
  }, []);

  // 本窗 / 其它窗口改了通用设置后对齐语言
  useEffect(() => {
    function onChanged(event: Event) {
      const saved = (event as CustomEvent<GeneralSettings>).detail;
      if (saved) applyGeneral(saved);
    }
    window.addEventListener(GENERAL_SETTINGS_CHANGED, onChanged);
    return () => window.removeEventListener(GENERAL_SETTINGS_CHANGED, onChanged);
  }, [applyGeneral]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
      applyGeneral,
    }),
    [locale, applyGeneral],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** 读取完整 i18n 上下文；必须在 I18nProvider 内使用。 */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

/** 仅取翻译函数 `t` 的便捷 hook。 */
export function useT() {
  return useI18n().t;
}
