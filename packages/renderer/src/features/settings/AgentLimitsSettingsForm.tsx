/**
 * 设置 → Agent Limits：执行步数、重试、Shell/MCP 超时与上下文注入预算。
 *
 * 输入用本地草稿自由编辑（可清空 / 删到超界）；只有草稿能通过 shared 的
 * normalize 往返校验（normalizeX(n) === n）才即时保存，否则标红且不落盘。
 */
import { Input } from "@thinker-workbench/design/react";
import type { GeneralSettings } from "@thinker-workbench/shared";
import {
  normalizeContextFilesMaxFileBytes,
  normalizeContextFilesMaxTotalBytes,
  normalizeDefaultShellBlockUntilMs,
  normalizeMaxAgentSteps,
  normalizeMaxSubagentSteps,
  normalizeMcpCallTimeoutMs,
  normalizeMcpConnectTimeoutMs,
  normalizeModelRetryBaseDelayMs,
  normalizeModelRetryMaxAttempts,
  normalizeReadFileDefaultMaxChars,
  normalizeShellOutputCap,
} from "@thinker-workbench/shared";
import { useEffect, useRef, useState } from "react";
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

type LimitValidator = (value: unknown, fallback: number) => number;

/** 与后端 setGeneral 落盘时同一套归一化：normalizeX(n) === n 即为合法值。 */
const LIMIT_VALIDATORS: Record<LimitKey, LimitValidator> = {
  maxAgentSteps: normalizeMaxAgentSteps,
  maxSubagentSteps: normalizeMaxSubagentSteps,
  modelRetryMaxAttempts: normalizeModelRetryMaxAttempts,
  modelRetryBaseDelayMs: normalizeModelRetryBaseDelayMs,
  defaultShellBlockUntilMs: normalizeDefaultShellBlockUntilMs,
  shellOutputCap: normalizeShellOutputCap,
  mcpConnectTimeoutMs: normalizeMcpConnectTimeoutMs,
  mcpCallTimeoutMs: normalizeMcpCallTimeoutMs,
  contextFilesMaxFileBytes: normalizeContextFilesMaxFileBytes,
  contextFilesMaxTotalBytes: normalizeContextFilesMaxTotalBytes,
  readFileDefaultMaxChars: normalizeReadFileDefaultMaxChars,
};

/** 非负整数才算合法输入；空串 / 小数 / 负数一律标红不保存。 */
function parseLimitDraft(draft: string): number | null {
  if (!/^\d+$/.test(draft)) return null;
  const n = Number(draft);
  return Number.isSafeInteger(n) ? n : null;
}

export function AgentLimitsSettingsForm({ active = true }: Props) {
  const { t } = useI18n();
  const { available, general, error, patchGeneral } = useGeneralSettings(active);

  /** 本地草稿：仅覆盖用户正在编辑的项；其余项直接显示已保存值。 */
  const [drafts, setDrafts] = useState<Partial<Record<LimitKey, string>>>({});
  const generalRef = useRef(general);

  // 其它窗口 / 保存回包改动了某项时，重置该项草稿；无效草稿（用户正在输入）不动。
  useEffect(() => {
    const prev = generalRef.current;
    generalRef.current = general;
    setDrafts((cur) => {
      let next: Partial<Record<LimitKey, string>> | null = null;
      for (const key of LIMIT_KEYS) {
        if (general[key] === prev[key]) continue;
        const draft = cur[key];
        if (draft === undefined) continue;
        const n = parseLimitDraft(draft);
        if (n === null || n === general[key]) continue;
        next ??= { ...cur };
        delete next[key];
      }
      return next ?? cur;
    });
  }, [general]);

  function handleChange(key: LimitKey, raw: string) {
    setDrafts((cur) => ({ ...cur, [key]: raw }));
    const n = parseLimitDraft(raw);
    if (n === null) return; // 非法：标红，不保存
    const normalized = LIMIT_VALIDATORS[key](n, n);
    if (normalized !== n) return; // 超出允许范围：标红，不保存
    void patchGeneral({ [key]: n } as Partial<GeneralSettings>);
  }

  /** 失焦时把合法草稿折叠成规范形式（如 "0132" → "132"）；非法草稿保留给用户继续改。 */
  function handleBlur(key: LimitKey) {
    const draft = drafts[key];
    if (draft === undefined) return;
    const n = parseLimitDraft(draft);
    if (n === null) return;
    const normalized = LIMIT_VALIDATORS[key](n, n);
    setDrafts((cur) => ({ ...cur, [key]: String(normalized) }));
    if (normalized !== n) {
      void patchGeneral({ [key]: normalized } as Partial<GeneralSettings>);
    }
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
          const draft = drafts[key];
          const n = draft === undefined ? null : parseLimitDraft(draft);
          const invalid = draft !== undefined && (n === null || LIMIT_VALIDATORS[key](n, n) !== n);
          return (
            <li key={key} className="settings-toggle-row">
              <div className="settings-toggle-copy">
                <strong>{title}</strong>
                <span>{t(`settings.general.${key}.description` as MessageKey)}</span>
              </div>
              <Input
                className="settings-limit-input"
                type="number"
                min={0}
                value={draft ?? String(general[key])}
                invalid={invalid}
                aria-label={unit ? `${title} (${unit})` : title}
                endAdornment={unit}
                onChange={(e) => handleChange(key, e.target.value)}
                onBlur={() => handleBlur(key)}
              />
            </li>
          );
        })}
      </ul>
      {error ? <p className="settings-err">{error}</p> : null}
    </div>
  );
}
