/**
 * 通用设置相关的 Select / 文案标签（各子表单共用）。
 */
import type {
  AiLocale,
  AppLocale,
  ShellApprovalMode,
  WorkspaceAccess,
} from "@thinker-workbench/shared";
import type { MessageKey } from "../../ui/i18n/translate";

export function retentionLabel(days: number, t: (key: MessageKey) => string): string {
  if (days <= 0) return t("settings.general.logRetention.never");
  return t("settings.general.logRetention.days").replace("{n}", String(days));
}

export function localeLabel(locale: AppLocale, t: (key: MessageKey) => string): string {
  return locale === "zh" ? t("settings.general.localeZh") : t("settings.general.localeEn");
}

export function aiLocaleLabel(locale: AiLocale, t: (key: MessageKey) => string): string {
  if (locale === "smart") return t("settings.general.localeSmart");
  return localeLabel(locale, t);
}

export function workspaceAccessLabel(
  access: WorkspaceAccess,
  t: (key: MessageKey) => string,
): string {
  if (access === "workspace") return t("settings.general.workspaceAccess.workspace");
  if (access === "readOutside") return t("settings.general.workspaceAccess.readOutside");
  return t("settings.general.workspaceAccess.full");
}

export function shellApprovalLabel(
  mode: ShellApprovalMode,
  t: (key: MessageKey) => string,
): string {
  if (mode === "ai_review") return t("settings.general.shellApprovalMode.ai_review");
  if (mode === "allowlist") return t("settings.general.shellApprovalMode.allowlist");
  return t("settings.general.shellApprovalMode.unrestricted");
}

export function deleteRestoreTtlLabel(days: number, t: (key: MessageKey) => string): string {
  if (days <= 0) return t("settings.general.deleteFileRestoreTtl.never");
  return t("settings.general.deleteFileRestoreTtl.days").replace("{n}", String(days));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
