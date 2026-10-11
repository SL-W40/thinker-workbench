/**
 * i18n hooks：与 I18nProvider 分文件，保证 Vite Fast Refresh 兼容。
 */
import { useContext } from "react";
import { I18nContext, type I18nContextValue } from "./context";

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
