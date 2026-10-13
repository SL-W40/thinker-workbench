/**
 * shell 审批闸门：白名单 / AI 研判 / HITL。
 */
import type { ShellApprovalMode } from "@thinker-workbench/shared";
import { requestHitl } from "../../hitl/requestHitl";
import { addShellAllowlistToken, getShellAllowlist, getShellApprovalMode } from "../../workspace";
import { reviewCommand } from "./reviewCommand";
import { getShellSessionCommand } from "./sessionMeta";

/** 取命令首 token（剥 Windows 扩展名）。 */
export function commandBaseToken(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) return "";
  // 去掉前导 env 赋值较难；取第一个空白分隔段
  const first = trimmed.split(/\s+/)[0] ?? "";
  const base = first.replace(/^["']|["']$/g, "");
  const name = base.split(/[/\\]/).pop() ?? base;
  return name.replace(/\.(exe|cmd|bat|ps1)$/i, "").toLowerCase();
}

function isAllowlisted(command: string): boolean {
  const token = commandBaseToken(command);
  if (!token) return false;
  return getShellAllowlist().includes(token);
}

/**
 * 按设置决定是否放行；需用户确认时走 HITL。
 * @returns true 放行；false 用户拒绝（应抛错或返回失败）
 */
export async function ensureShellApproved(command: string, signal: AbortSignal): Promise<void> {
  const mode: ShellApprovalMode = getShellApprovalMode();

  if (mode === "unrestricted") return;

  if (isAllowlisted(command)) return;

  if (mode === "allowlist") {
    const response = await requestHitl(
      {
        kind: "shell_approval",
        title: "Allow shell command?",
        body: command.slice(0, 500),
        payload: { command },
        actions: [
          { id: "allow", label: "Allow", style: "primary" },
          { id: "deny", label: "Deny", style: "danger" },
          { id: "allow_and_whitelist", label: "Allow & whitelist", style: "ghost" },
        ],
      },
      signal,
    );
    await applyHitlResponse(response, command);
    return;
  }

  // ai_review
  const review = await reviewCommand(command, signal);
  if (review.decision === "allow") return;

  const response = await requestHitl(
    {
      kind: "shell_approval",
      title: "Allow shell command?",
      body: `${command.slice(0, 400)}\n\n(${review.reason})`,
      payload: { command, reviewReason: review.reason },
      actions: [
        { id: "allow", label: "Allow", style: "primary" },
        { id: "deny", label: "Deny", style: "danger" },
        { id: "allow_and_whitelist", label: "Allow & whitelist", style: "ghost" },
      ],
    },
    signal,
  );
  await applyHitlResponse(response, command);
}

async function applyHitlResponse(response: { actionId: string }, command: string): Promise<void> {
  if (response.actionId === "deny") {
    throw new Error("Shell command denied by user.");
  }
  if (response.actionId === "allow_and_whitelist") {
    const token = commandBaseToken(command);
    if (token) addShellAllowlistToken(token);
    return;
  }
  if (response.actionId === "allow") return;
  throw new Error("Shell command denied by user.");
}

/**
 * shell_write 审批：默认 HITL 确认（预览截断）；unrestricted 跳过。
 * 文案带上原 shell 命令，说明「向哪条命令的等待输入写入什么」。
 */
export async function ensureShellWriteApproved(
  sessionId: string,
  data: string,
  signal: AbortSignal,
  options?: { parentCommand?: string },
): Promise<void> {
  const mode: ShellApprovalMode = getShellApprovalMode();
  if (mode === "unrestricted") return;

  const preview = data.length > 200 ? `${data.slice(0, 200)}…` : data;
  const parent = options?.parentCommand?.trim() || getShellSessionCommand(sessionId) || "";
  const parentLine = parent
    ? `Waiting command:\n${parent.slice(0, 300)}`
    : `Shell session:\n${sessionId}`;
  const body = [
    parentLine,
    "",
    "Will type into the terminal:",
    preview || "(empty)",
    "",
    `(sessionId: ${sessionId})`,
  ].join("\n");

  const response = await requestHitl(
    {
      kind: "shell_write_approval",
      title: parent
        ? "Allow typing into the waiting shell command?"
        : "Allow writing to shell session?",
      body,
      payload: {
        sessionId,
        dataPreview: preview,
        parentCommand: parent || undefined,
      },
      actions: [
        { id: "allow", label: "Allow", style: "primary" },
        { id: "deny", label: "Deny", style: "danger" },
      ],
    },
    signal,
  );
  if (response.actionId !== "allow") {
    throw new Error("Shell write denied by user.");
  }
}
