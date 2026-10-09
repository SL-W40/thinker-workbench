/**
 * Agent 终态事件的系统通知与完成音。
 *
 * 监听 done / error：按设置播放 beep、在无焦点窗口时弹出系统通知；
 * 设置页「试听 / 预览」走 previewAttention，忽略焦点与开关。
 */
import type { AgentEvent } from "@thinker-workbench/shared";
import { BrowserWindow, Notification, shell } from "electron";
import { getNotificationIconPath } from "../config/paths";
import { getGeneralSettings } from "../config/settingsStore";
import { showMainWindow } from "../window/tray";
import { notifyCopy } from "./copy";

/** 设置页预览类型：系统通知或完成音。 */
export type AttentionPreviewKind = "notification" | "sound";

/** 是否为需要吸引用户注意的终态事件。 */
function isAttentionEvent(event: AgentEvent): boolean {
  return event.type === "done" || event.type === "error";
}

/** 是否有任一未销毁窗口处于焦点。 */
function anyWindowFocused(): boolean {
  return BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.isFocused());
}

/** 按事件类型取通知标题文案。 */
function titleFor(event: AgentEvent): string {
  const copy = notifyCopy();
  if (event.type === "done") return copy.finished;
  if (event.type === "error") return copy.error;
  return copy.attention;
}

/** 按事件类型取通知正文（截断至约 180 字符）。 */
function bodyFor(event: AgentEvent): string {
  const copy = notifyCopy();
  switch (event.type) {
    case "done": {
      const text = event.text.trim();
      return text ? text.slice(0, 180) : copy.runCompleted;
    }
    case "error":
      return event.error.slice(0, 180);
    default:
      return copy.attention;
  }
}

/** 转义 Toast XML 文本节点中的特殊字符。 */
function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * Windows Toast：仅文本。
 * 不使用 `appLogoOverride`（避免正文区大徽章及其与标题的垂直错位）。
 * 标题栏图标仅来自 Start Menu 快捷方式 / AppUserModelID。
 */
function windowsToastXml(title: string, body: string): string {
  return `<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>${escapeXml(title)}</text>
      <text>${escapeXml(body)}</text>
    </binding>
  </visual>
</toast>`;
}

/** 播放完成提示音（`shell.beep`）。 */
export function playCompletionSound(): void {
  shell.beep();
}

/**
 * 组装各平台 Notification 参数。
 * Windows 走 toastXml；macOS 不传 icon（系统用 .app 图标，icon 会变成右侧附件图）；Linux 仍带 PNG。
 */
function notificationOptions(title: string, body: string): Electron.NotificationConstructorOptions {
  if (process.platform === "win32") {
    return { toastXml: windowsToastXml(title, body) };
  }
  if (process.platform === "darwin") {
    return { title, body };
  }
  return { title, body, icon: getNotificationIconPath() };
}

/**
 * 展示系统通知；点击后显示主窗口。
 */
export function showSystemNotification(title: string, body: string): void {
  if (!Notification.isSupported()) {
    console.warn("[notify] Notification API is not supported.");
    return;
  }

  const notification = new Notification(notificationOptions(title, body));
  notification.on("click", () => showMainWindow());
  notification.on("failed", (_event, error) => {
    console.error("[notify] notification failed", error);
  });
  notification.show();
}

/**
 * 设置 →「试一下」：始终触发，忽略焦点与开关状态。
 * @param kind `sound` 仅响铃；否则弹出预览通知
 */
export function previewAttention(kind: AttentionPreviewKind): void {
  if (kind === "sound") {
    playCompletionSound();
    return;
  }
  const copy = notifyCopy();
  showSystemNotification(copy.previewTitle, copy.previewBody);
}

/**
 * 处理 Agent 终态事件：可选完成音 + 系统通知。
 * 已有窗口获焦时跳过 Toast，避免打扰正在看应用的用户。
 */
export function handleAgentAttention(event: AgentEvent): void {
  if (!isAttentionEvent(event)) return;
  const general = getGeneralSettings();

  if (general.completionSound) {
    playCompletionSound();
  }

  if (!general.systemNotifications) return;
  // 用户已在看应用时跳过 Toast
  if (anyWindowFocused()) return;

  showSystemNotification(titleFor(event), bodyFor(event));
}
