/**
 * Trace 详情载荷：结构化清新展示，可切换原始 JSON。
 */
// biome-ignore-all lint/suspicious/noArrayIndexKey: 载荷为只读展示数据（工具输出 / 消息 / 条目列表），不会中途重排，index 即稳定 key
import { ChevronRightIcon, SegmentedControl } from "@thinker-workbench/design/react";
import type { TracePayloadRecord } from "@thinker-workbench/shared";
import { type ReactNode, useMemo, useState } from "react";
import type { MessageKey } from "../../i18n/translate";
import { useT } from "../../i18n/useI18n";
import {
  countMessageRoles,
  formatTraceJson,
  isChipValueList,
  isSystemSectionList,
  parseToolOutput,
  readToolCalls,
  readToolParams,
  readToolResult,
  readTraceMessages,
  readTraceTools,
  type SystemSectionRecord,
  type TraceMessageCard,
  type TraceToolCall,
  type TraceToolCard,
} from "./systemSections";

type ViewMode = "pretty" | "raw";

type Props = {
  title: string;
  payload: TracePayloadRecord;
  truncatedLabel: string;
  partialLabel: string;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function isLongText(v: unknown): v is string {
  return typeof v === "string" && (v.length > 72 || v.includes("\n"));
}

function isPrimitive(v: unknown): boolean {
  return v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

function formatPrimitive(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "string") return v;
  return String(v);
}

/** 长文本字段优先单独成块（模型回复 / prompt 等）。 */
const LONG_FIELD_HINT =
  /^(reply|preview|message|prompt|text|body|content|output|input|summary|error|stderr|stdout)/i;

function PrettyValue({ value, depth = 0 }: { value: unknown; depth?: number }): ReactNode {
  if (isPrimitive(value) && !isLongText(value)) {
    return <span className="trace-pane__kv-val">{formatPrimitive(value)}</span>;
  }
  if (typeof value === "string") {
    return <pre className="trace-pane__prose">{value}</pre>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="trace-pane__kv-val is-muted">[]</span>;
    }
    if (isChipValueList(value)) {
      return (
        <ul className="trace-pane__chip-list">
          {value.map((item, i) => (
            <li key={i}>{formatPrimitive(item)}</li>
          ))}
        </ul>
      );
    }
    if (depth >= 2) {
      return <pre className="trace-pane__prose is-compact">{JSON.stringify(value, null, 2)}</pre>;
    }
    return (
      <div className="trace-pane__nested-list">
        {value.map((item, i) => (
          <div key={i} className="trace-pane__nested-item">
            <span className="trace-pane__nested-idx">{i}</span>
            <PrettyValue value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }
  if (isPlainObject(value)) {
    if (depth >= 2) {
      return <pre className="trace-pane__prose is-compact">{JSON.stringify(value, null, 2)}</pre>;
    }
    return <PrettyObject obj={value} depth={depth} />;
  }
  return <pre className="trace-pane__prose is-compact">{JSON.stringify(value, null, 2)}</pre>;
}

const SECTION_LABEL: Record<string, MessageKey> = {
  base: "tools.trace.systemSection.base",
  environment: "tools.trace.systemSection.environment",
  mode: "tools.trace.systemSection.mode",
  subagents: "tools.trace.systemSection.subagents",
  rules: "tools.trace.systemSection.rules",
  skills: "tools.trace.systemSection.skills",
  contextFiles: "tools.trace.systemSection.contextFiles",
  subagent: "tools.trace.systemSection.subagent",
  subagentRules: "tools.trace.systemSection.subagentRules",
};

const ROLE_TONES = new Set(["system", "user", "assistant", "tool"]);

/** 对话角色用色块区分，避免和普通字段混在一起。 */
function RoleTag({ role, count }: { role: string; count?: number }) {
  const tone = ROLE_TONES.has(role) ? role : "other";
  return (
    <span className={`trace-role trace-role--${tone}`}>
      {role}
      {count != null ? <span className="trace-role__count">{count}</span> : null}
    </span>
  );
}

/** 详情里的折叠行：摘要和计数都紧跟标题，超出截断。 */
function Fold({
  title,
  detail,
  aside,
  mono,
  clipDetail,
  open,
  onToggle,
  children,
}: {
  title: ReactNode;
  detail?: ReactNode;
  aside?: string;
  mono?: boolean;
  clipDetail?: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`trace-fold${open ? " is-open" : ""}`}>
      <button type="button" className="trace-fold__toggle" aria-expanded={open} onClick={onToggle}>
        <ChevronRightIcon open={open} size="sm" />
        <span className="trace-fold__main">
          <span className={`trace-fold__title${mono ? " is-mono" : ""}`}>{title}</span>
          {aside ? <span className="trace-fold__aside">{aside}</span> : null}
          {detail ? (
            <span className={`trace-fold__detail${clipDetail ? " is-clip" : ""}`}>{detail}</span>
          ) : null}
        </span>
      </button>
      <div className="trace-fold__body">
        <div className="trace-fold__body-inner">
          <div className="trace-fold__pad">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** system：整组默认折叠，标题右侧列出各块名称和字数；组内各块再各自折叠。 */
function SystemSections({ sections }: { sections: SystemSectionRecord[] }) {
  const t = useT();
  const [groupOpen, setGroupOpen] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const summary = sections
    .map((section) => {
      const labelKey = SECTION_LABEL[section.id];
      const label = labelKey ? t(labelKey) : section.id;
      return `${label} ${section.text.length}`;
    })
    .join(" · ");
  return (
    <Fold title="system" detail={summary} open={groupOpen} onToggle={() => setGroupOpen((v) => !v)}>
      <div className="trace-fold__group">
        {sections.map((section) => {
          const labelKey = SECTION_LABEL[section.id];
          const expanded = Boolean(open[section.id]);
          return (
            <Fold
              key={section.id}
              title={labelKey ? t(labelKey) : section.id}
              aside={String(section.text.length)}
              open={expanded}
              onToggle={() => setOpen((prev) => ({ ...prev, [section.id]: !expanded }))}
            >
              <pre className="trace-pane__prose">{section.text}</pre>
            </Fold>
          );
        })}
      </div>
    </Fold>
  );
}

/** 折叠行上的一行预览，避免整段正文铺开。 */
function messagePreview(message: TraceMessageCard): string {
  const chunks: string[] = [];
  if (message.name) chunks.push(message.name);
  if (message.toolCallId) chunks.push(message.toolCallId);
  const content = message.content;
  if (typeof content === "string") chunks.push(content);
  else if (Array.isArray(content)) {
    for (const part of content) {
      if (typeof part === "string") chunks.push(part);
      else if (part && typeof part === "object") {
        const row = part as { type?: unknown; text?: unknown; path?: unknown };
        if (row.type === "text" && typeof row.text === "string") chunks.push(row.text);
        else if (row.type === "image_ref" && typeof row.path === "string") chunks.push(row.path);
      }
    }
  }
  if (Array.isArray(message.toolCalls)) {
    for (const call of message.toolCalls) {
      if (call && typeof call === "object") {
        const name = (call as { function?: { name?: unknown } }).function?.name;
        if (typeof name === "string") chunks.push(name);
      }
    }
  }
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

function messageBodyText(content: unknown): string {
  if (content == null || content === "") return "";
  if (typeof content === "string") return formatTraceJson(content);
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const row = part as { type?: unknown; text?: unknown; mime?: unknown; path?: unknown };
          if (row.type === "text" && typeof row.text === "string") return row.text;
          if (row.type === "image_ref") {
            const mime = typeof row.mime === "string" ? row.mime : "image";
            const path = typeof row.path === "string" ? row.path : "";
            return `[${mime}] ${path}`.trim();
          }
        }
        return JSON.stringify(part, null, 2);
      })
      .join("\n");
  }
  return JSON.stringify(content, null, 2);
}

/** 用同列表里 assistant 的 tool_calls 补上 tool 消息缺的工具名。 */
function toolNamesByCallId(messages: TraceMessageCard[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const message of messages) {
    for (const call of readToolCalls(message.toolCalls)) {
      if (call.id && call.name) names.set(call.id, call.name);
    }
  }
  return names;
}

function ToolOutputBody({ body }: { body: string }) {
  const output = parseToolOutput(body);
  if (output.kind === "listing") {
    return (
      <div className="trace-dir">
        {output.path ? <div className="trace-dir__path">{output.path}</div> : null}
        {output.entries.length > 0 ? (
          <ul className="trace-dir__list">
            {output.entries.map((entry, index) => (
              <li key={`${entry.kind}:${entry.name}:${index}`}>
                <span className={`trace-dir__kind is-${entry.kind}`}>{entry.kind}</span>
                <span className="trace-dir__name">{entry.name}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }
  if (output.kind === "fields") {
    return (
      <div className="trace-fields">
        {output.rows.map((row, index) => (
          <div key={`${row.key}:${index}`} className="trace-fields__row">
            <span className="trace-fields__key">{row.key}</span>
            <span className="trace-fields__val">{row.value}</span>
          </div>
        ))}
        {output.rest ? <pre className="trace-pane__prose">{output.rest}</pre> : null}
      </div>
    );
  }
  const text = formatTraceJson(output.text);
  return text ? <pre className="trace-pane__prose">{text}</pre> : null;
}

function toolResultDetail(content: unknown): string {
  if (typeof content !== "string") return "";
  const result = readToolResult(content);
  if (!result) return "";
  const output = parseToolOutput(result.body);
  if (output.kind === "listing") {
    const count = output.entries.length;
    return [result.name, output.path, count ? String(count) : ""].filter(Boolean).join(" · ");
  }
  if (output.kind === "fields" && output.rows[0]) {
    return `${result.name} · ${output.rows[0].key} ${output.rows[0].value}`;
  }
  const line = (output.kind === "text" ? output.text : output.rest)
    .split("\n")
    .find((item) => item.trim());
  return [result.name, line?.replace(/\s+/g, " ")].filter(Boolean).join(" · ");
}

function ToolCallCard({ call }: { call: TraceToolCall }) {
  return (
    <div className="trace-call">
      <div className="trace-call__head">
        <span className="trace-call__name">{call.name || "tool"}</span>
        {call.id ? <span className="trace-call__id">{call.id}</span> : null}
      </div>
      {call.argumentsText ? <pre className="trace-pane__prose">{call.argumentsText}</pre> : null}
    </div>
  );
}

function MessageBody({ message, toolName }: { message: TraceMessageCard; toolName?: string }) {
  const calls = readToolCalls(message.toolCalls);
  const raw = typeof message.content === "string" ? message.content : "";
  const result = raw ? readToolResult(raw) : null;
  const name = result?.name || message.name || toolName || "";
  const body =
    message.role === "tool" || message.toolCallId ? "" : messageBodyText(message.content);
  if (message.role === "tool" || message.toolCallId) {
    return (
      <div className="trace-call">
        <div className="trace-call__head">
          {name ? <span className="trace-call__name">{name}</span> : null}
          {result ? (
            <span className={`trace-call__status is-${result.ok ? "ok" : "error"}`}>
              {result.ok ? "ok" : "error"}
            </span>
          ) : null}
          {message.toolCallId ? <span className="trace-call__id">{message.toolCallId}</span> : null}
        </div>
        {result ? (
          <ToolOutputBody body={result.body} />
        ) : raw ? (
          <ToolOutputBody body={messageBodyText(raw)} />
        ) : null}
      </div>
    );
  }
  return (
    <>
      {calls.map((call, index) => (
        <ToolCallCard key={call.id || `${call.name}:${index}`} call={call} />
      ))}
      {body ? <pre className="trace-pane__prose">{body}</pre> : null}
    </>
  );
}

/** 消息列表：整组默认折叠并标出每种 role 的条数。 */
function MessageList({ messages }: { messages: TraceMessageCard[] }) {
  const [groupOpen, setGroupOpen] = useState(false);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const names = toolNamesByCallId(messages);
  return (
    <Fold
      title="messages"
      detail={
        <span className="trace-role-row">
          {countMessageRoles(messages).map((item) => (
            <RoleTag key={item.role} role={item.role} count={item.count} />
          ))}
        </span>
      }
      open={groupOpen}
      onToggle={() => setGroupOpen((v) => !v)}
    >
      <div className="trace-fold__group">
        {messages.map((message, index) => {
          const expanded = Boolean(open[index]);
          const toolName = message.toolCallId ? names.get(message.toolCallId) : undefined;
          const preview =
            message.role === "tool" ? toolResultDetail(message.content) : messagePreview(message);
          return (
            <Fold
              key={`${message.role}:${index}`}
              title={<RoleTag role={message.role} />}
              detail={preview || undefined}
              clipDetail
              open={expanded}
              onToggle={() => setOpen((prev) => ({ ...prev, [index]: !expanded }))}
            >
              <MessageBody message={message} toolName={toolName} />
            </Fold>
          );
        })}
      </div>
    </Fold>
  );
}

/** 工具参数：名字、类型、是否必填，说明跟在下面。认不出 schema 时退回原文。 */
function ToolParams({ parameters }: { parameters: unknown }) {
  const params = readToolParams(parameters);
  if (!params) {
    return parameters != null ? (
      <pre className="trace-pane__prose">{JSON.stringify(parameters, null, 2)}</pre>
    ) : null;
  }
  if (params.length === 0) return null;
  return (
    <ul className="trace-tooldef">
      {params.map((param) => (
        <li key={param.name}>
          <div className="trace-tooldef__head">
            <span className="trace-tooldef__name">{param.name}</span>
            {param.type ? <span className="trace-tooldef__type">{param.type}</span> : null}
            {param.required ? <span className="trace-tooldef__req">required</span> : null}
            {param.defaultText != null ? (
              <span className="trace-tooldef__default">{param.defaultText}</span>
            ) : null}
          </div>
          {param.description ? <p>{param.description}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/** 长文本默认折叠，标题旁是字数。 */
function TextFolds({ entries }: { entries: Array<[string, string]> }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return entries.map(([key, text]) => {
    const expanded = Boolean(open[key]);
    return (
      <Fold
        key={key}
        title={key}
        aside={String(text.length)}
        open={expanded}
        onToggle={() => setOpen((prev) => ({ ...prev, [key]: !expanded }))}
      >
        <pre className="trace-pane__prose">{text}</pre>
      </Fold>
    );
  });
}

/** 模型返回的 toolCalls：整组折叠，组内是调用卡片。 */
function CallList({ calls }: { calls: TraceToolCall[] }) {
  const [groupOpen, setGroupOpen] = useState(false);
  return (
    <Fold
      title="toolCalls"
      aside={String(calls.length)}
      open={groupOpen}
      onToggle={() => setGroupOpen((v) => !v)}
    >
      <div className="trace-fold__group">
        {calls.map((call, index) => (
          <ToolCallCard key={call.id || `${call.name}:${index}`} call={call} />
        ))}
      </div>
    </Fold>
  );
}

function ToolList({ tools }: { tools: TraceToolCard[] }) {
  const [groupOpen, setGroupOpen] = useState(false);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  return (
    <Fold
      title="tools"
      aside={String(tools.length)}
      open={groupOpen}
      onToggle={() => setGroupOpen((v) => !v)}
    >
      <div className="trace-fold__group">
        {tools.map((tool, index) => {
          const expanded = Boolean(open[index]);
          return (
            <Fold
              key={`${tool.name}:${index}`}
              title={tool.name}
              mono
              open={expanded}
              onToggle={() => setOpen((prev) => ({ ...prev, [index]: !expanded }))}
            >
              {tool.description ? <p className="trace-fold__note">{tool.description}</p> : null}
              <ToolParams parameters={tool.parameters} />
            </Fold>
          );
        })}
      </div>
    </Fold>
  );
}

const TOKEN_KEYS = new Set([
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "reasoningTokens",
]);

/** 短字段收成一张摘要：身份信息在上，用量贴着数字排，放不下再换行。 */
function SummaryCard({ entries }: { entries: Array<[string, unknown]> }) {
  if (entries.length === 0) return null;
  const fields: Array<[string, unknown]> = [];
  const stats: Array<[string, number]> = [];
  let partial: boolean | null = null;
  for (const [key, value] of entries) {
    if (key === "partial" && typeof value === "boolean") {
      partial = value;
      continue;
    }
    if (TOKEN_KEYS.has(key) && typeof value === "number") {
      stats.push([key, value]);
      continue;
    }
    fields.push([key, value]);
  }
  return (
    <section className="trace-summary">
      {fields.length > 0 || partial != null ? (
        <div className="trace-summary__top">
          <div className="trace-summary__fields">
            {fields.map(([key, value]) => (
              <div key={key} className="trace-summary__field">
                <span className="trace-summary__label">{key}</span>
                <span className="trace-summary__value">
                  <PrettyValue value={value} />
                </span>
              </div>
            ))}
          </div>
          {partial != null ? (
            <span className={`trace-summary__status${partial ? " is-partial" : " is-done"}`}>
              {partial ? "partial" : "complete"}
            </span>
          ) : null}
        </div>
      ) : null}
      {stats.length > 0 ? (
        <div className="trace-summary__usage">
          {stats.map(([key, value]) => (
            <span key={key} className="trace-summary__stat">
              <span>{key}</span>
              <strong>{value.toLocaleString()}</strong>
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
function PrettyObject({
  obj,
  depth = 0,
}: {
  obj: Record<string, unknown>;
  depth?: number;
}): ReactNode {
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    return <span className="trace-pane__kv-val is-muted">{"{}"}</span>;
  }

  const longEntries: Array<[string, string]> = [];
  const shortEntries: Array<[string, unknown]> = [];
  const nestedEntries: Array<[string, unknown]> = [];

  const hasMessages = readTraceMessages(obj.messages) != null;
  const hasContent = typeof obj.content === "string";
  const hasReasoning = typeof obj.reasoning === "string";
  for (const [k, v] of entries) {
    // 字数已经标在折叠标题上；last 摘要和完整消息重复。
    if (k === "messageCount" && hasMessages) continue;
    if (k === "contentChars" && hasContent) continue;
    if (k === "reasoningChars" && hasReasoning) continue;
    if (k === "lastRole" || k === "lastContentPreview") continue;
    if ((k === "content" || k === "reasoning") && v === "") continue;
    if (k === "toolCalls" && Array.isArray(v) && v.length === 0) continue;
    if (k === "usage" && v && typeof v === "object" && !Array.isArray(v)) {
      const rows = Object.entries(v as Record<string, unknown>);
      if (rows.length > 0 && rows.every(([, item]) => typeof item === "number")) {
        shortEntries.push(...rows);
        continue;
      }
    }
    if (isLongText(v) || (typeof v === "string" && LONG_FIELD_HINT.test(k) && v.length > 40)) {
      longEntries.push([k, v as string]);
    } else if (isPrimitive(v)) {
      shortEntries.push([k, v]);
    } else {
      nestedEntries.push([k, v]);
    }
  }

  return (
    <div className="trace-pane__pretty">
      <SummaryCard entries={shortEntries} />
      <TextFolds entries={longEntries} />
      {nestedEntries.map(([k, v]) => {
        if (k === "system" && isSystemSectionList(v)) {
          return <SystemSections key={k} sections={v} />;
        }
        const tools = k === "tools" ? readTraceTools(v) : null;
        if (tools) return <ToolList key={k} tools={tools} />;
        const messages = k === "messages" ? readTraceMessages(v) : null;
        if (messages) return <MessageList key={k} messages={messages} />;
        const calls = k === "toolCalls" ? readToolCalls(v) : [];
        if (calls.length > 0) return <CallList key={k} calls={calls} />;
        return (
          <div key={k} className="trace-pane__field">
            <div className="trace-pane__field-label">{k}</div>
            <PrettyValue value={v} depth={depth + 1} />
          </div>
        );
      })}
    </div>
  );
}

function isPartialPayload(json: unknown): boolean {
  return (
    Boolean(json) &&
    typeof json === "object" &&
    !Array.isArray(json) &&
    (json as { partial?: unknown }).partial === true
  );
}

export function TracePayloadView({ title, payload, truncatedLabel, partialLabel }: Props) {
  const t = useT();
  const [mode, setMode] = useState<ViewMode>("pretty");
  const partial = isPartialPayload(payload.json);
  const flags = useMemo(
    () =>
      [partial ? partialLabel : null, payload.truncated ? truncatedLabel : null].filter(Boolean),
    [partial, partialLabel, payload.truncated, truncatedLabel],
  );

  return (
    <div className="trace-pane__payload">
      <div className="trace-pane__payload-head">
        <div className="trace-pane__payload-title">
          <strong>{title}</strong>
          <span className="trace-pane__payload-size">
            {flags.length ? `${flags.join(" · ")} · ` : ""}
            {(payload.bytes / 1024).toFixed(1)} KB
          </span>
        </div>
        <SegmentedControl
          className="trace-pane__payload-mode"
          value={mode}
          onChange={(v) => setMode(v as ViewMode)}
          options={[
            { value: "pretty", label: t("tools.trace.viewPretty") },
            { value: "raw", label: t("tools.trace.viewRaw") },
          ]}
          aria-label={t("tools.trace.payloadViewMode")}
        />
      </div>
      {mode === "raw" ? (
        <pre className="trace-pane__raw">{JSON.stringify(payload.json, null, 2)}</pre>
      ) : payload.json == null ? (
        <p className="trace-pane__empty-payload">{t("tools.trace.emptyPayload")}</p>
      ) : (
        <div className="trace-pane__payload-body">
          <PrettyValue value={payload.json} />
        </div>
      )}
    </div>
  );
}
