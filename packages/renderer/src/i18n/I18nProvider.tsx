/**
 * UI 语言 Provider：从通用设置加载 `uiLocale`，并提供 `t()`。
 *
 * 注意：本文件只导出组件。hooks 见 `useI18n.ts`——同文件混导出会让
 * Vite Fast Refresh 失败并触发整页 reload，Electron 下常表现为白屏。
 */
import {
  useCallback,
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
import { I18nContext, type I18nContextValue } from "./context";
import { translate } from "./translate";

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
