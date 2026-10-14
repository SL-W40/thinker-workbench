/**
 * 从 hello / run / resume 消息应用 shell 相关设置。
 * 黑名单先写入；白名单若与之重叠则剔除（硬拒绝优先）。
 */
import {
  type ShellApprovalMode,
  type ShellProfile,
  shellAllowlistWithoutBlocked,
} from "@thinker-workbench/shared";
import {
  getShellAllowlist,
  getShellBlocklist,
  setAllowAiBrowser,
  setAllowAiShell,
  setShellAllowlist,
  setShellApprovalMode,
  setShellBlocklist,
  setShellProfile,
} from "../workspace";

export function applyShellConfig(message: {
  allowAiShell?: boolean;
  allowAiBrowser?: boolean;
  shellApprovalMode?: ShellApprovalMode;
  shellAllowlist?: string[];
  shellBlocklist?: string[];
  shell?: ShellProfile;
}): void {
  setAllowAiShell(message.allowAiShell);
  setAllowAiBrowser(message.allowAiBrowser);
  setShellApprovalMode(message.shellApprovalMode);
  if (Array.isArray(message.shellBlocklist)) setShellBlocklist(message.shellBlocklist);
  if (Array.isArray(message.shellAllowlist)) {
    setShellAllowlist(shellAllowlistWithoutBlocked(message.shellAllowlist, getShellBlocklist()));
  } else if (Array.isArray(message.shellBlocklist)) {
    setShellAllowlist(shellAllowlistWithoutBlocked(getShellAllowlist(), getShellBlocklist()));
  }
  if (message.shell) setShellProfile(message.shell);
}
