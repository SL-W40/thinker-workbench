/**
 * 应用显示名与 Windows App User Model ID。
 *
 * 托盘、通知、窗口标题等共用 APP_NAME；
 * APP_USER_MODEL_ID 须与 Start Menu 快捷方式一致，否则 Windows Toast 可能不显示。
 */

/** 窗口标题、托盘与系统通知使用的显示名。 */
export const APP_NAME = "Thinker Workbench";

/**
 * Windows App User Model ID。
 * 必须与 `ensureWindowsToastShortcut` 写入的 Start Menu 快捷方式一致，Toast 横幅才会出现。
 */
export const APP_USER_MODEL_ID = "com.thinker.workbench";
