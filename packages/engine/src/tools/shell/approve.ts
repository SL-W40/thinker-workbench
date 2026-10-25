/**
 * shell 审批闸门：硬拒绝优先，其后才是白名单 / AI 研判 / HITL。
 */
import {
  type GitConfirmTarget,
  gitConfirmTargets,
  isShellTokenBlocked,
  type ShellApprovalMode,
  shellCommandsToAllowlist,
} from "@thinker-workbench/shared";
import { requestHitl } from "../../hitl/requestHitl";
import {
  addShellAllowlistToken,
  getShellAllowlist,
  getShellApprovalMode,
  getShellBlocklist,
} from "../../workspace";
import { reviewCommand } from "./reviewCommand";
import { getShellSessionCommand } from "./sessionMeta";

/** 取命令首 token（剥路径与 Windows 可执行扩展名，含 .com）。 */
export function commandBaseToken(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) return "";
  // 去掉前导 env 赋值较难；取第一个空白分隔段
  const first = trimmed.split(/\s+/)[0] ?? "";
  const base = first.replace(/^["']|["']$/g, "");
  const name = base.split(/[/\\]/).pop() ?? base;
  return name.replace(/\.(exe|cmd|bat|com|ps1)$/i, "").toLowerCase();
}

function isAllowlisted(command: string): boolean {
  const token = commandBaseToken(command);
  if (!token) return false;
  return getShellAllowlist().includes(token);
}

/**
 * 硬拒绝命中时的错误；未命中返回 null。
 * 文案固定，供模型与测试识别，不走静默跳过。
 */
function shellBlockError(command: string): Error | null {
  const token = commandBaseToken(command);
  if (!token || !isShellTokenBlocked(token, getShellBlocklist())) return null;
  return new Error(
    `Shell command blocked: "${token}" is on the hard-deny list and cannot be overridden.`,
  );
}

/** 确认到达时再查一次：期间加入黑名单的命令不能执行，也不能写入白名单。 */
function throwIfBlocked(command: string): void {
  const blocked = shellBlockError(command);
  if (blocked) throw blocked;
}

/**
 * git 不可逆写操作闸门：命中子命令（commit / push / reset / rebase / clean / …）即弹确认卡。
 *
 * 只给 Allow / Deny，不给「允许并加白」——白名单按首 token 匹配，一旦把 git 写操作
 * 加白就永久失效；要放行只能在设置里显式配置。
 * 位置在 unrestricted 放行之后、白名单之前：即便 `git` 已在白名单里也要先过这道闸门。
 */
async function requestGitApproval(
  command: string,
  targets: GitConfirmTarget[],
  signal: AbortSignal,
): Promise<void> {
  const remote = targets.some((target) => target.severity === "remote");
  const body = [
    ...targets.map((target) => `${target.segment}\n  reason: ${target.reason}`),
    "",
    remote
      ? "This changes remote state and cannot be undone locally."
      : "This changes repository state and may discard work.",
  ].join("\n");

  const response = await requestHitl(
    {
      kind: "shell_approval",
      title: remote ? "Allow git command that affects the remote?" : "Allow git command?",
      body: body.slice(0, 500),
      payload: { command, gitTargets: targets },
      actions: [
        { id: "allow", label: "Allow", style: "primary" },
        { id: "deny", label: "Deny", style: "danger" },
      ],
    },
    signal,
  );

  throwIfBlocked(command);
  if (response.actionId !== "allow") {
    throw new Error("Shell command denied by user.");
  }
}

/**
 * 按设置决定是否放行；需用户确认时走 HITL。
 * 优先级：硬拒绝 → unrestricted 放行 → git 不可逆写操作闸门 → 白名单 → allowlist / AI 研判 → HITL。
 * 硬拒绝最高，确认也不能放行。
 */
export async function ensureShellApproved(command: string, signal: AbortSignal): Promise<void> {
  const blocked = shellBlockError(command);
  if (blocked) throw blocked;

  const mode: ShellApprovalMode = getShellApprovalMode();

  if (mode === "unrestricted") return;

  // git 子命令级闸门：先于白名单，白名单含 git 也要确认。
  // 未命中时不 await，避免把后续 requestHitl 推到微任务里（既有测试依赖同步投递）
  const gitTargets = gitConfirmTargets(command);
  if (gitTargets.length > 0) {
    await requestGitApproval(command, gitTargets, signal);
  }

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
  // 确认到达时再查一次：期间加入黑名单的 token 不能执行，也不能写入白名单
  throwIfBlocked(command);

  if (response.actionId === "deny") {
    throw new Error("Shell command denied by user.");
  }
  if (response.actionId === "allow_and_whitelist") {
    for (const token of shellCommandsToAllowlist(
      command,
      getShellAllowlist(),
      getShellBlocklist(),
    )) {
      addShellAllowlistToken(token);
    }
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
