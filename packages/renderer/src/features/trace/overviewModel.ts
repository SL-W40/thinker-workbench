/**
 * 把 span 自身、attrs 和 output 里的身份 / 用量收成顶部卡片的数据。
 */
import type { AppLocale, TraceSpanRecord } from "@thinker-workbench/shared";
import { type MessageKey, translate } from "../../i18n/translate";

const FIELD_KEY: Record<string, MessageKey> = {
  runType: "tools.trace.field.runType",
  source: "tools.trace.field.source",
  status: "tools.trace.field.status",
  turn: "tools.trace.field.turn",
  threadId: "tools.trace.field.threadId",
  workspaceId: "tools.trace.field.workspaceId",
  sessionId: "tools.trace.field.sessionId",
  sessionTitle: "tools.trace.field.sessionTitle",
  modelId: "tools.trace.field.modelId",
  providerResponseId: "tools.trace.field.providerResponseId",
  providerId: "tools.trace.field.providerId",
  taskId: "tools.trace.field.taskId",
  subagent: "tools.trace.field.subagent",
  background: "tools.trace.field.background",
  title: "tools.trace.field.title",
  callId: "tools.trace.field.callId",
  path: "tools.trace.field.path",
  reason: "tools.trace.field.reason",
  switched: "tools.trace.field.switched",
  inputTokens: "tools.trace.field.inputTokens",
  outputTokens: "tools.trace.field.outputTokens",
  cacheReadTokens: "tools.trace.field.cacheReadTokens",
  cacheWriteTokens: "tools.trace.field.cacheWriteTokens",
  reasoningTokens: "tools.trace.field.reasoningTokens",
  summary: "tools.trace.field.summary",
  version: "tools.trace.field.version",
  sections: "tools.trace.field.sections",
  chars: "tools.trace.field.chars",
};

const RUN_TYPE_KEY: Record<string, MessageKey> = {
  chain: "tools.trace.runType.chain",
  llm: "tools.trace.runType.llm",
  tool: "tools.trace.runType.tool",
  retriever: "tools.trace.runType.retriever",
  embedding: "tools.trace.runType.embedding",
  prompt: "tools.trace.runType.prompt",
  parser: "tools.trace.runType.parser",
};

const SOURCE_KEY: Record<string, MessageKey> = {
  app: "tools.trace.source.app",
  desktop: "tools.trace.source.desktop",
  agent: "tools.trace.source.agent",
};

const REASON_KEY: Record<string, MessageKey> = {
  auth: "tools.trace.reason.auth",
  not_found: "tools.trace.reason.not_found",
  rate_limit: "tools.trace.reason.rate_limit",
  network: "tools.trace.reason.network",
  server: "tools.trace.reason.server",
  other: "tools.trace.reason.other",
};

const OUTCOME_KEY: Record<string, MessageKey> = {
  ok: "tools.trace.outcome.ok",
  error: "tools.trace.outcome.error",
  cancelled: "tools.trace.outcome.cancelled",
  running: "tools.trace.outcome.running",
  partial: "tools.trace.outcome.partial",
  complete: "tools.trace.outcome.complete",
};

const HIDDEN_ATTRS = new Set(["index", "turn"]);

const ATTR_ORDER = [
  "workspaceId",
  "modelId",
  "sessionId",
  "sessionTitle",
  "providerResponseId",
  "providerId",
  "threadId",
  "taskId",
  "subagent",
  "title",
  "callId",
  "path",
  "reason",
  "background",
  "switched",
];

const TOKEN_KEYS = [
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "reasoningTokens",
];

const BLOCK_KEYS = new Set([
  "modelId",
  "providerId",
  "threadId",
  "workspaceId",
  "sessionId",
  "sessionTitle",
  "providerResponseId",
  "taskId",
  "callId",
  "path",
  "title",
]);
const MONO_KEYS = new Set([
  "modelId",
  "providerId",
  "threadId",
  "workspaceId",
  "sessionId",
  "providerResponseId",
  "taskId",
  "callId",
  "path",
]);

export type OverviewRow = {
  label: string;
  value: string;
  /** 有名称时，编号跟在名称后的括号里。仅模型和工作区。 */
  name?: string;
  /** 长内容标签在上，避免和值抢同一行。 */
  block: boolean;
  mono: boolean;
};

export type OverviewNames = {
  models?: Record<string, string>;
  workspaces?: Record<string, string>;
};

export type OverviewStat = {
  label: string;
  value: string;
};

export type SpanOverviewModel = {
  /** 标题下一行：类型、来源、耗时、轮次。 */
  chips: string[];
  when: string;
  rows: OverviewRow[];
  stats: OverviewStat[];
  partial: boolean | null;
};

/** 驼峰字段名改成当前语言的单词。已知字段走文案表。 */
export function fieldLabel(locale: AppLocale, key: string): string {
  const known = FIELD_KEY[key];
  if (known) return translate(locale, known);
  return englishLabel(key);
}

/** 未知驼峰拆成英文单词。 */
export function englishLabel(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatValue(locale: AppLocale, value: unknown): string {
  if (typeof value === "boolean")
    return translate(locale, value ? "tools.trace.field.yes" : "tools.trace.field.no");
  if (typeof value === "number") return value.toLocaleString(localeTag(locale));
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function localeTag(locale: AppLocale): string {
  return locale === "zh" ? "zh-CN" : "en";
}

function named(locale: AppLocale, table: Record<string, MessageKey>, value: string): string {
  const key = table[value];
  return key ? translate(locale, key) : value;
}

/** 顶部状态胶囊：完成 / 未完成优先于 span 自身状态。 */
export function outcomeLabel(locale: AppLocale, status: string, partial: boolean | null): string {
  const key = partial == null ? status : partial ? "partial" : "complete";
  return named(locale, OUTCOME_KEY, key);
}

function formatClock(locale: AppLocale, ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString(localeTag(locale));
  } catch {
    return String(ts);
  }
}

function formatWhen(locale: AppLocale, startTs: number, endTs?: number): string {
  try {
    const start = new Date(startTs);
    const date = start.toLocaleDateString(localeTag(locale));
    const from = formatClock(locale, startTs);
    if (!endTs) return `${date} ${from}`;
    const end = new Date(endTs);
    const sameDay = start.toDateString() === end.toDateString();
    return sameDay
      ? `${date} ${from} – ${formatClock(locale, endTs)}`
      : `${start.toLocaleString(localeTag(locale))} – ${end.toLocaleString(localeTag(locale))}`;
  } catch {
    return String(startTs);
  }
}

function formatDuration(locale: AppLocale, startTs: number, endTs: number): string {
  const ms = Math.max(0, endTs - startTs);
  if (ms < 1000) return translate(locale, "tools.trace.duration.ms", { n: String(ms) });
  const sec = ms / 1000;
  if (sec < 10) return translate(locale, "tools.trace.duration.sec", { n: sec.toFixed(1) });
  if (sec < 60)
    return translate(locale, "tools.trace.duration.sec", { n: String(Math.round(sec)) });
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  if (!rem) return translate(locale, "tools.trace.duration.min", { n: String(min) });
  return translate(locale, "tools.trace.duration.minSec", { min: String(min), sec: String(rem) });
}

function lookupName(table: Record<string, string> | undefined, id: string): string | undefined {
  const name = table?.[id]?.trim();
  if (!name || name === id) return undefined;
  return name;
}

/** 顶部卡片用的字段和用量。 */
export function buildSpanOverview(
  span: TraceSpanRecord,
  output: unknown,
  locale: AppLocale = "en",
  names?: OverviewNames,
): SpanOverviewModel {
  const out = isRecord(output) ? output : {};
  const attrs = isRecord(span.attrs) ? span.attrs : {};
  const chips = [named(locale, RUN_TYPE_KEY, span.runType), named(locale, SOURCE_KEY, span.source)];
  if (span.endTs) chips.push(formatDuration(locale, span.startTs, span.endTs));
  if (typeof attrs.turn === "number" || typeof attrs.turn === "string") {
    chips.push(translate(locale, "tools.trace.field.turnN", { n: String(attrs.turn) }));
  }

  const rows: OverviewRow[] = [];
  // 摘要放最前：一句话说清该 span 干了什么（如记忆抽取的版本 / 章节 / 字数）
  const summaryText = span.summary?.trim();
  if (summaryText) {
    rows.push({
      label: fieldLabel(locale, "summary"),
      value: summaryText,
      block: true,
      mono: false,
    });
  }
  const seen = new Set<string>(HIDDEN_ATTRS);
  const pushAttr = (key: string, value: unknown) => {
    if (HIDDEN_ATTRS.has(key) || value == null || value === "") return;
    const id = typeof value === "string" ? value : "";
    const name =
      key === "modelId"
        ? lookupName(names?.models, id)
        : key === "workspaceId"
          ? lookupName(names?.workspaces, id)
          : undefined;
    rows.push({
      label: fieldLabel(locale, key),
      value:
        key === "reason" && typeof value === "string"
          ? named(locale, REASON_KEY, value)
          : formatValue(locale, value),
      ...(name ? { name } : {}),
      block: BLOCK_KEYS.has(key),
      mono: MONO_KEYS.has(key),
    });
    seen.add(key);
  };
  pushAttr("workspaceId", attrs.workspaceId);
  pushAttr(
    "modelId",
    typeof attrs.modelId === "string" && attrs.modelId ? attrs.modelId : out.modelId,
  );
  pushAttr("sessionId", span.sessionId);
  pushAttr("sessionTitle", attrs.sessionTitle);
  pushAttr(
    "providerResponseId",
    typeof out.providerResponseId === "string" && out.providerResponseId
      ? out.providerResponseId
      : attrs.providerResponseId,
  );
  for (const key of ATTR_ORDER) {
    if (!seen.has(key)) pushAttr(key, attrs[key]);
  }
  for (const [key, value] of Object.entries(attrs)) {
    if (!seen.has(key)) pushAttr(key, value);
  }

  const usage = isRecord(out.usage) ? out.usage : {};
  const stats: OverviewStat[] = [];
  for (const key of TOKEN_KEYS) {
    const value = usage[key];
    if (typeof value === "number") {
      stats.push({
        label: fieldLabel(locale, key),
        value: value.toLocaleString(localeTag(locale)),
      });
    }
  }
  const partial = typeof out.partial === "boolean" ? out.partial : null;
  return { chips, when: formatWhen(locale, span.startTs, span.endTs), rows, stats, partial };
}

const OUTPUT_OVERVIEW_KEYS = ["modelId", "providerResponseId", "partial", "usage"];

/** 身份和用量已在顶部卡片，Output 正文里不再重复。 */
export function omitOutputOverview(json: unknown): unknown {
  if (!isRecord(json)) return json;
  const next: Record<string, unknown> = { ...json };
  for (const key of OUTPUT_OVERVIEW_KEYS) delete next[key];
  return next;
}
