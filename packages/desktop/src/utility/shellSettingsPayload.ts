/**
 * hello / run / resume 共用的 shell 字段。
 * 硬拒绝名单与审批模式、白名单一并下发，执法只在 engine。
 */
import type { GeneralSettings, ShellProfile } from "@thinker-workbench/shared";

/** 下发给 agent 的 shell 配置快照。 */
export type ShellSettingsPayload = {
  allowAiShell: boolean;
  allowAiBrowser: boolean;
  shellApprovalMode: GeneralSettings["shellApprovalMode"];
  shellAllowlist: string[];
  shellBlocklist: string[];
  shell: ShellProfile;
};

/** 从当前通用设置组装 shell 载荷。 */
export function shellSettingsPayload(
  general: Pick<
    GeneralSettings,
    "allowAiShell" | "allowAiBrowser" | "shellApprovalMode" | "shellAllowlist" | "shellBlocklist"
  >,
  shell: ShellProfile,
): ShellSettingsPayload {
  return {
    allowAiShell: general.allowAiShell,
    allowAiBrowser: general.allowAiBrowser,
    shellApprovalMode: general.shellApprovalMode,
    shellAllowlist: general.shellAllowlist,
    shellBlocklist: general.shellBlocklist,
    shell,
  };
}
