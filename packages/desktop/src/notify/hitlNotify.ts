/**
 * HITL 系统通知：后台时弹出带操作按钮的 Toast；与 HitlHost 共用 respondHitl。
 */
import {
  type AgentEvent,
  type HitlRequest,
  type HitlResponse,
  IpcChannels,
  shellCommandsToAllowlist,
} from "@thinker-workbench/shared";
import { BrowserWindow, Notification } from "electron";
import { getNotificationIconPath } from "../config/paths";
import { getGeneralSettings, saveGeneralSettings } from "../config/settingsStore";
import type { AgentBridge } from "../utility/AgentBridge";
import { pushAgentHello } from "../utility/startAgentProcess";
import { showMainWindow } from "../window/tray";

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
  const actions = req.actions.filter((a) => a.id === "allow" || a.id === "deny").slice(0, 2);
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
 * `allow_and_whitelist` 时把命令链上尚未加白的命令名写入 GeneralSettings，并经 hello 同步到 agent。
 */
export function respondHitl(response: HitlResponse, bridge: AgentBridge): void {
  if (resolved.has(response.hitlId)) return;
  resolved.add(response.hitlId);
  const req = pending.get(response.hitlId);
  pending.delete(response.hitlId);

  if (response.actionId === "allow_and_whitelist" && req) {
    const command = typeof req.payload?.command === "string" ? req.payload.command : "";
    const general = getGeneralSettings();
    // 硬拒绝不能经确认写入白名单；落盘规范化也会再剔一次。答复仍交给 agent。
    const tokens = shellCommandsToAllowlist(
      command,
      general.shellAllowlist,
      general.shellBlocklist,
    );
    if (tokens.length > 0) {
      const next = saveGeneralSettings({
        shellAllowlist: [...general.shellAllowlist, ...tokens],
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

  bridge.sendHitlResult(response);

  const event: AgentEvent = {
    type: "hitl",
    threadId: req?.threadId ?? "",
    runId: req?.runId ?? "",
    ts: Date.now(),
    phase: "resolved",
    hitlId: response.hitlId,
    kind: req?.kind ?? "shell_approval",
    response,
  };
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IpcChannels.agentEvent, event);
    }
  }
}

/**
 * 按 runId 清掉主进程 HITL pending，并向渲染层广播 resolved。
 * run 结算（取消 / 崩溃 / 失败）时调用，避免批准框孤儿。
 */
export function clearHitlForRun(runId: string, _bridge: AgentBridge): void {
  const id = runId?.trim();
  if (!id) return;
  const toClear: HitlRequest[] = [];
  for (const [hitlId, req] of pending) {
    if (req.runId === id) {
      toClear.push(req);
      pending.delete(hitlId);
      resolved.add(hitlId);
    }
  }
  for (const req of toClear) {
    const event: AgentEvent = {
      type: "hitl",
      threadId: req.threadId,
      runId: req.runId,
      ts: Date.now(),
      phase: "resolved",
      hitlId: req.hitlId,
      kind: req.kind,
      response: { hitlId: req.hitlId, actionId: "deny" },
    };
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IpcChannels.agentEvent, event);
      }
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

  // 密钥输入必须走应用内密码框，不能靠系统 Toast 提交
  if (event.request.kind === "shell_secret_input") {
    if (!anyWindowFocused()) showMainWindow();
    return;
  }

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
          threadId: req.threadId,
          runId: req.runId,
          ts: Date.now(),
          phase: "request",
          hitlId: req.hitlId,
          kind: req.kind,
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
