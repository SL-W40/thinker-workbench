/**
 * Trace 详情载荷：结构化清新展示，可切换原始 JSON。
 */
import { SegmentedControl } from "@thinker-workbench/design/react";
import type { TracePayloadRecord } from "@thinker-workbench/shared";
import { useMemo, useState, type ReactNode } from "react";
import { useT } from "../../i18n/useI18n";

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
  return (
    v == null ||
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  );
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
    if (value.every(isPrimitive) && value.length <= 12) {
      return (
        <ul className="trace-pane__chip-list">
          {value.map((item, i) => (
            <li key={i}>{formatPrimitive(item)}</li>
          ))}
        </ul>
      );
    }
    if (depth >= 2) {
      return (
        <pre className="trace-pane__prose is-compact">
          {JSON.stringify(value, null, 2)}
        </pre>
      );
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
      return (
        <pre className="trace-pane__prose is-compact">
          {JSON.stringify(value, null, 2)}
        </pre>
      );
    }
    return <PrettyObject obj={value} depth={depth} />;
  }
  return (
    <pre className="trace-pane__prose is-compact">{JSON.stringify(value, null, 2)}</pre>
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

  for (const [k, v] of entries) {
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
      {shortEntries.length > 0 ? (
        <dl className="trace-pane__kv">
          {shortEntries.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>
                <PrettyValue value={v} depth={depth + 1} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {longEntries.map(([k, v]) => (
        <div key={k} className="trace-pane__field">
          <div className="trace-pane__field-label">{k}</div>
          <pre className="trace-pane__prose">{v}</pre>
        </div>
      ))}
      {nestedEntries.map(([k, v]) => (
        <div key={k} className="trace-pane__field">
          <div className="trace-pane__field-label">{k}</div>
          <PrettyValue value={v} depth={depth + 1} />
        </div>
      ))}
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

export function TracePayloadView({
  title,
  payload,
  truncatedLabel,
  partialLabel,
}: Props) {
  const t = useT();
  const [mode, setMode] = useState<ViewMode>("pretty");
  const partial = isPartialPayload(payload.json);
  const flags = useMemo(
    () =>
      [partial ? partialLabel : null, payload.truncated ? truncatedLabel : null].filter(
        Boolean,
      ),
    [partial, partialLabel, payload.truncated, truncatedLabel],
  );

  return (
    <div className="trace-pane__payload">
      <div className="trace-pane__payload-head">
        <strong>{title}</strong>
        <div className="trace-pane__payload-head-right">
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
          <span className="trace-pane__payload-size">
            {flags.length ? `${flags.join(" · ")} · ` : ""}
            {(payload.bytes / 1024).toFixed(1)} KB
          </span>
        </div>
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
