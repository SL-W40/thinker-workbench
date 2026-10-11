/**
 * i18n React Context（与 Provider / hooks 分文件，避免 Fast Refresh 整页重载白屏）。
 */
import { createContext } from "react";
import type { AppLocale, GeneralSettings } from "@thinker-workbench/shared";
import type { MessageKey } from "./translate";

export type I18nContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: MessageKey, vars?: Record<string, string>) => string;
  /** 应用完整通用设置快照（例如设置保存成功后）。 */
  applyGeneral: (general: GeneralSettings) => void;
};

export const I18nContext = createContext<I18nContextValue | null>(null);
