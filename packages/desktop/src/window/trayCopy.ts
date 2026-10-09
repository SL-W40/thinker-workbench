/**
 * 系统托盘文案（按 uiLocale 中英切换）。
 *
 * 字符串本身按语言保留 en/zh 内容；本模块注释为中文。
 */
import { DEFAULT_APP_LOCALE, type AppLocale } from "@thinker-workbench/shared";
import { APP_NAME } from "../config/appIdentity";
import { getGeneralSettings } from "../config/settingsStore";

/** 托盘 tooltip 与菜单项文案。 */
type TrayCopy = {
  tooltip: string;
  show: string;
  quit: string;
};

/** 各语言文案表。 */
const COPY: Record<AppLocale, TrayCopy> = {
  en: {
    tooltip: APP_NAME,
    show: `Open ${APP_NAME}`,
    quit: `Quit ${APP_NAME}`,
  },
  zh: {
    tooltip: APP_NAME,
    show: `打开 ${APP_NAME}`,
    quit: `退出 ${APP_NAME}`,
  },
};

/**
 * 按 locale 取托盘文案；未知 locale 回退默认语言。
 * @param locale 默认取通用设置中的 uiLocale
 */
export function trayCopy(locale: AppLocale = getGeneralSettings().uiLocale): TrayCopy {
  return COPY[locale] ?? COPY[DEFAULT_APP_LOCALE];
}
