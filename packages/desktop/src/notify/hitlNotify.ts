/**
 * HITL 系统通知：后台时弹出带操作按钮的 Toast；与 HitlHost 共用 respondHitl。
 */
import {
  type AgentEvent,
  type HitlRequest,
  type HitlResponse,
  IpcChannels,
  shellCommandBaseToken,
} from "@thinker-workbench/shared";
import { BrowserWindow, Notification } from "electron";
import { getGeneralSettings, saveGeneralSettings } from "../config/settingsStore";
import type { AgentBridge } from "../utility/AgentBridge";
import { pushAgentHello } from "../utility/startAgentProcess";
import { showMainWindow } from "../window/tray";
import { getNotificationIconPath } from "../config/paths";

/** 已答复的 hitlId，防双提交。 */
const resolved = new Set<string>();
/** 进行中的请求（供通知按钮查找）。 */
const pending = new Map<string, HitlRequest>();

function anyWindowFocused(): boolean {
  return BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.isFocused());
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Windows Toast：标题 + 正文 + 最多两个操作按钮。 */
function windowsHitlToastXml(req: HitlRequest): string {
  const actions = req.actions
    .filter((a) => a.id === "allow" || a.id === "deny")
    .slice(0, 2);
  const actionXml = actions
    .map(
      (a) =>
        `<action content="${escapeXml(a.label)}" arguments="hitl:${escapeXml(req.hitlId)}:${escapeXml(a.id)}" activationType="foreground"/>`,
    )
    .join("");
  return `<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>${escapeXml(req.title)}</text>
      <text>${escapeXml((req.body ?? "").slice(0, 180))}</text>
    </binding>
  </visual>
  <actions>${actionXml}</actions>
</toast>`;
}

/**
 * 统一 HITL 答复入口（UI Modal / 系统通知按钮）。
 * `allow_and_whitelist` 时把首 token 写入 GeneralSettings 并经 hello 同步到 agent。
 */
export function respondHitl(response: HitlResponse, bridge: AgentBridge): void {
  if (resolved.has(response.hitlId)) return;
  resolved.add(response.hitlId);
  const req = pending.get(response.hitlId);
  pending.delete(response.hitlId);

  if (response.actionId === "allow_and_whitelist" && req) {
    const command =
      typeof req.payload?.command === "string" ? req.payload.command : "";
    const token = shellCommandBaseToken(command);
    if (token) {
      const general = getGeneralSettings();
      if (!general.shellAllowlist.includes(token)) {
        const next = saveGeneralSettings({
          shellAllowlist: [...general.shellAllowlist, token],
        });
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send(IpcChannels.settingsGeneralChanged, next);
          }
        }
        try {
          pushAgentHello(bridge);
        } catch {
          /* agent 未就绪时忽略 */
        }
      }
    }
  }

  bridge.sendHitlResult(response);

  const event: AgentEvent = {
    type: "hitl",
    phase: "resolved",
    hitlId: response.hitlId,
    kind: req?.kind ?? "shell_approval",
    threadId: req?.threadId ?? "",
    runId: req?.runId ?? "",
    ts: Date.now(),
    response,
  };
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IpcChannels.agentEvent, event);
    }
  }
}

/** 处理来自 agent 的 hitl 事件：登记 pending + 必要时弹通知。 */
export function handleHitlAgentEvent(event: AgentEvent, bridge: AgentBridge): void {
  if (event.type !== "hitl") return;
  if (event.phase === "resolved") {
    resolved.add(event.hitlId);
    pending.delete(event.hitlId);
    return;
  }
  if (event.phase !== "request" || !event.request) return;

  pending.set(event.hitlId, event.request);
  resolved.delete(event.hitlId);

  const general = getGeneralSettings();
  if (!general.systemNotifications) return;
  if (anyWindowFocused()) return;

  showHitlNotification(event.request, bridge);
}

/** 后台弹出可操作 HITL 通知。 */
export function showHitlNotification(req: HitlRequest, bridge: AgentBridge): void {
  if (!Notification.isSupported()) return;

  const toastActions = req.actions.filter((a) => a.id === "allow" || a.id === "deny").slice(0, 2);

  let options: Electron.NotificationConstructorOptions;
  if (process.platform === "win32") {
    options = { toastXml: windowsHitlToastXml(req) };
  } else if (process.platform === "darwin") {
    options = {
      title: req.title,
      body: (req.body ?? "").slice(0, 180),
      actions: toastActions.map((a) => ({ type: "button" as const, text: a.label })),
    };
  } else {
    options = {
      title: req.title,
      body: (req.body ?? "").slice(0, 180),
      icon: getNotificationIconPath(),
      actions: toastActions.map((a) => ({ type: "button" as const, text: a.label })),
    };
  }

  const notification = new Notification(options);
  notification.on("click", () => {
    showMainWindow();
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IpcChannels.agentEvent, {
          type: "hitl",
          phase: "request",
          hitlId: req.hitlId,
          kind: req.kind,
          threadId: req.threadId,
          runId: req.runId,
          ts: Date.now(),
          request: req,
        } satisfies AgentEvent);
      }
    }
  });
  notification.on("action", (_e, index) => {
    const action = toastActions[index];
    if (!action) return;
    respondHitl({ hitlId: req.hitlId, actionId: action.id }, bridge);
  });
  // Windows toastXml 按钮经 click 带 arguments —— Electron 可能走 action 或特殊路径
  notification.on("failed", (_event, error) => {
    console.error("[hitl-notify] notification failed", error);
  });
  notification.show();
}
