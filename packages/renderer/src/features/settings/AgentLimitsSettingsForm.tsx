/**
 * 设置 → Agent Limits：轮次、重试、Shell/MCP 超时与上下文注入预算。
 */
import { Input } from "@thinker-workbench/design/react";
import type { GeneralSettings } from "@thinker-workbench/shared";
import type { MessageKey } from "../../i18n/translate";
import { useI18n } from "../../i18n/useI18n";
import { useGeneralSettings } from "./useGeneralSettings";

type Props = {
  active?: boolean;
};

type LimitKey =
  | "maxAgentSteps"
  | "maxSubagentSteps"
  | "modelRetryMaxAttempts"
  | "modelRetryBaseDelayMs"
  | "defaultShellBlockUntilMs"
  | "shellOutputCap"
  | "mcpConnectTimeoutMs"
  | "mcpCallTimeoutMs"
  | "contextFilesMaxFileBytes"
  | "contextFilesMaxTotalBytes"
  | "readFileDefaultMaxChars";

const LIMIT_KEYS: LimitKey[] = [
  "maxAgentSteps",
  "maxSubagentSteps",
  "modelRetryMaxAttempts",
  "modelRetryBaseDelayMs",
  "defaultShellBlockUntilMs",
  "shellOutputCap",
  "mcpConnectTimeoutMs",
  "mcpCallTimeoutMs",
  "contextFilesMaxFileBytes",
  "contextFilesMaxTotalBytes",
  "readFileDefaultMaxChars",
];

/** 输入框后缀单位；无单位的项省略 */
const LIMIT_UNIT: Partial<Record<LimitKey, MessageKey>> = {
  modelRetryBaseDelayMs: "settings.general.unit.ms",
  defaultShellBlockUntilMs: "settings.general.unit.ms",
  shellOutputCap: "settings.general.unit.chars",
  mcpConnectTimeoutMs: "settings.general.unit.ms",
  mcpCallTimeoutMs: "settings.general.unit.ms",
  contextFilesMaxFileBytes: "settings.general.unit.bytes",
  contextFilesMaxTotalBytes: "settings.general.unit.bytes",
  readFileDefaultMaxChars: "settings.general.unit.chars",
};

export function AgentLimitsSettingsForm({ active = true }: Props) {
  const { t } = useI18n();
  const { available, general, error, patchGeneral } = useGeneralSettings(active);

  function patchNumber(key: LimitKey, raw: string) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    void patchGeneral({ [key]: Math.floor(n) } as Partial<GeneralSettings>);
  }

  if (!available) {
    return (
      <p className="settings-note">{t("settings.general.unavailable", { cmd: "pnpm run dev" })}</p>
    );
  }

  return (
    <div className="settings-general">
      <ul className="settings-toggle-list">
        {LIMIT_KEYS.map((key) => {
          const title = t(`settings.general.${key}.title` as MessageKey);
          const unitKey = LIMIT_UNIT[key];
          const unit = unitKey ? t(unitKey) : null;
          return (
            <li key={key} className="settings-toggle-row">
              <div className="settings-toggle-copy">
                <strong>{title}</strong>
                <span>{t(`settings.general.${key}.description` as MessageKey)}</span>
              </div>
              <Input
                className="settings-limit-input"
                type="number"
                value={String(general[key])}
                aria-label={unit ? `${title} (${unit})` : title}
                endAdornment={unit}
                onChange={(e) => patchNumber(key, e.target.value)}
              />
            </li>
          );
        })}
      </ul>
      {error ? <p className="settings-err">{error}</p> : null}
    </div>
  );
}
