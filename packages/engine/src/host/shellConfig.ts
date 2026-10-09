/**
 * 从 hello / run / resume 消息应用 shell 相关设置。
 */
import type {
  ShellApprovalMode,
  ShellProfile,
} from "@thinker-workbench/shared";
import {
  setAllowAiBrowser,
  setAllowAiShell,
  setShellAllowlist,
  setShellApprovalMode,
  setShellProfile,
} from "../workspace";

export function applyShellConfig(message: {
  allowAiShell?: boolean;
  allowAiBrowser?: boolean;
  shellApprovalMode?: ShellApprovalMode;
  shellAllowlist?: string[];
  shell?: ShellProfile;
}): void {
  setAllowAiShell(message.allowAiShell);
  setAllowAiBrowser(message.allowAiBrowser);
  setShellApprovalMode(message.shellApprovalMode);
  setShellAllowlist(message.shellAllowlist);
  if (message.shell) setShellProfile(message.shell);
}
