/**
 * 系统通知文案（按 uiLocale 中英切换）。
 *
 * 字符串本身按语言保留 en/zh 内容；本模块注释为中文。
 */
import { DEFAULT_APP_LOCALE, type AppLocale } from "@thinker-workbench/shared";
import { getGeneralSettings } from "../config/settingsStore";

/** 通知标题/正文等本地化字段。 */
type NotifyCopy = {
  finished: string;
  error: string;
  attention: string;
  previewTitle: string;
  previewBody: string;
  runCompleted: string;
};

/** 各语言文案表。 */
const COPY: Record<AppLocale, NotifyCopy> = {
  en: {
    finished: "Agent finished",
    error: "Agent error",
    attention: "Agent needs attention",
    previewTitle: "Notification preview",
    previewBody:
      "When an agent finishes or needs your attention, a banner like this appears. Click it to jump back to the app.",
    runCompleted: "Run completed.",
  },
  zh: {
    finished: "Agent 已完成",
    error: "Agent 出错",
    attention: "Agent 需要关注",
    previewTitle: "系统通知预览",
    previewBody: "当 Agent 完成或需要你处理时，会弹出这样的系统横幅。点击即可回到应用继续查看。",
    runCompleted: "运行已完成。",
  },
};

/**
 * 按 locale 取通知文案；未知 locale 回退默认语言。
 * @param locale 默认取通用设置中的 uiLocale
 */
export function notifyCopy(locale: AppLocale = getGeneralSettings().uiLocale): NotifyCopy {
  return COPY[locale] ?? COPY[DEFAULT_APP_LOCALE];
}
