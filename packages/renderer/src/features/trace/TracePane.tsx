/**
 * Tools →Trace：按会话查看 Span 时序与入参出参；支持删除会话 Trace。 */
import {
  Button,
  EmptyState,
  IconButton,
  Input,
  Modal,
  SegmentedControl,
  Spinner,
  TrashIcon,
} from "@thinker-workbench/design/react";
import type {
  TracePayloadRecord,
  TraceSessionSummary,
  TraceSpanRecord,
} from "@thinker-workbench/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../i18n/useI18n";
import { callTreeLabel } from "./callTreeModel";
import { CallTreeDiagram } from "./CallTreeDiagram";
import { SequenceDiagram } from "./SequenceDiagram";
import "./trace.less";

type Props = {
  active: boolean;
  /** 从聊天跳转时聚焦会话（可选）。*/
  focusSessionId?: string | null;
};

/** calltree=追踪树（默认）；sequence=时序?*/
type ViewMode = "calltree" | "sequence";

function formatTs(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

/** 默认选中时间线上第一个 span（列表按 start_ts 升序）。 */
function defaultSpanId(rows: TraceSpanRecord[]): string | null {
  return rows[0]?.spanId ?? null;
}

export function TracePane({ active, focusSessionId = null }: Props) {
  const t = useT();
  const [sessions, setSessions] = useState<TraceSessionSummary[]>([]);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [spans, setSpans] = useState<TraceSpanRecord[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingSpans, setLoadingSpans] = useState(false);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [payloadIn, setPayloadIn] = useState<TracePayloadRecord | null>(null);
  const [payloadOut, setPayloadOut] = useState<TracePayloadRecord | null>(null);
  const [view, setView] = useState<ViewMode>("calltree");
  const [pendingDelete, setPendingDelete] = useState<TraceSessionSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const api = window.thinker?.trace;

  /** quiet：后台轮询，不闪 loading、不卸图（避免滚动被顶回）。*/
  const refreshSessions = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!api) return;
      if (!opts?.quiet) setLoadingList(true);
      try {
        const list = await api.listSessions({
          q: q.trim() || undefined,
          limit: 200,
        });
        setSessions(list);
      } finally {
        if (!opts?.quiet) setLoadingList(false);
      }
    },
    [api, q],
  );

  const loadSpans = useCallback(
    async (sessionId: string, opts?: { quiet?: boolean }) => {
      if (!api) return;
      if (!opts?.quiet) setLoadingSpans(true);
      try {
        const rows = await api.getSessionSpans(sessionId);
        setSpans(rows);
      } finally {
        if (!opts?.quiet) setLoadingSpans(false);
      }
    },
    [api],
  );

  useEffect(() => {
    if (!active) return;
    void refreshSessions();
    const timer = window.setInterval(() => {
      void refreshSessions({ quiet: true });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [active, refreshSessions]);

  // 选中会话：切换时 loading；之后 quiet 轮询只原地更新，不卸图
  useEffect(() => {
    if (!active || !selectedId) {
      setSpans([]);
      return;
    }
    let cancelled = false;
    setSpans([]);
    setSelectedSpanId(null);
    void (async () => {
      setLoadingSpans(true);
      try {
        if (!api) return;
        const rows = await api.getSessionSpans(selectedId);
        if (cancelled) return;
        setSpans(rows);
        setSelectedSpanId(defaultSpanId(rows));
      } finally {
        if (!cancelled) setLoadingSpans(false);
      }
    })();
    const timer = window.setInterval(() => {
      void loadSpans(selectedId, { quiet: true });
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [active, api, selectedId, loadSpans]);

  // 有会话且当前选中无效时：默认选列表第一个
  useEffect(() => {
    if (sessions.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) => {
      if (prev && sessions.some((s) => s.sessionId === prev)) return prev;
      return sessions[0]!.sessionId;
    });
  }, [sessions]);

  // 从聊天跳转：只在 focusSessionId 变化时选中一次，不锁死用户后续点击
  const appliedFocusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusSessionId || focusSessionId === appliedFocusRef.current) return;
    if (!sessions.some((s) => s.sessionId === focusSessionId)) return;
    appliedFocusRef.current = focusSessionId;
    setSelectedId(focusSessionId);
  }, [focusSessionId, sessions]);

  // 轮询后若当前节点消失，或尚未选中：落到第一个 span
  useEffect(() => {
    if (spans.length === 0) {
      if (selectedSpanId) setSelectedSpanId(null);
      return;
    }
    if (selectedSpanId && spans.some((s) => s.spanId === selectedSpanId)) return;
    setSelectedSpanId(defaultSpanId(spans));
  }, [spans, selectedSpanId]);

  const selectedSpan = useMemo(
    () => spans.find((s) => s.spanId === selectedSpanId) ?? null,
    [spans, selectedSpanId],
  );

  useEffect(() => {
    if (!api || !selectedId || !selectedSpan) {
      setPayloadIn(null);
      setPayloadOut(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const inn = selectedSpan.inputRef
        ? await api.getPayload(selectedId, selectedSpan.inputRef)
        : null;
      const out = selectedSpan.outputRef
        ? await api.getPayload(selectedId, selectedSpan.outputRef)
        : null;
      if (cancelled) return;
      setPayloadIn(inn);
      setPayloadOut(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [api, selectedId, selectedSpan]);

  const confirmDelete = useCallback(async () => {
    if (!api || !pendingDelete) return;
    const id = pendingDelete.sessionId;
    setDeleting(true);
    try {
      await api.deleteSession(id);
      setPendingDelete(null);
      if (selectedId === id) {
        setSelectedId(null);
        setSelectedSpanId(null);
        setSpans([]);
      }
      await refreshSessions({ quiet: true });
    } finally {
      setDeleting(false);
    }
  }, [api, pendingDelete, refreshSessions, selectedId]);

  const searching = Boolean(q.trim());
  // 真正无会话（非搜索空结果）：不分栏，居中空状
  if (!searching && sessions.length === 0) {
    return (
      <div className="trace-pane trace-pane--solo">
        {loadingList ? (
          <div className="trace-pane__loading">
            <Spinner />
          </div>
        ) : (
          <EmptyState title={t("tools.trace.emptySessions")} />
        )}
      </div>
    );
  }

  return (
    <div className="trace-pane">
      <aside className="trace-pane__sessions">
        <div className="trace-pane__sessions-head">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("tools.trace.searchPlaceholder")}
            aria-label={t("tools.trace.searchPlaceholder")}
          />
        </div>
        {sessions.length === 0 ? (
          <p className="trace-pane__hint">{t("tools.trace.emptySessions")}</p>
        ) : (
          <ul className="trace-pane__session-list">
            {sessions.map((s) => (
              <li
                key={s.sessionId}
                className={`trace-pane__session-row${selectedId === s.sessionId ? " is-active" : ""}`}
              >
                <button
                  type="button"
                  className={`trace-pane__session${selectedId === s.sessionId ? " is-active" : ""}`}
                  onClick={() => {
                    setSelectedId(s.sessionId);
                    setSelectedSpanId(null);
                  }}
                >
                  <strong>{s.title?.trim() || s.sessionId.slice(0, 18)}</strong>
                  <span>{formatTs(s.lastTs)}</span>
                  <span className="trace-pane__meta">
                    {t("tools.trace.runCount", { n: String(s.runCount) })}
                  </span>
                </button>
                <IconButton
                  size="sm"
                  variant="ghost"
                  className="trace-pane__session-del"
                  aria-label={t("tools.trace.deleteSession")}
                  title={t("tools.trace.deleteSession")}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingDelete(s);
                  }}
                >
                  <TrashIcon />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="trace-pane__main">
        {!selectedId || (loadingSpans && spans.length === 0) ? (
          <div className="trace-pane__loading">
            <Spinner />
          </div>
        ) : spans.length === 0 ? (
          <EmptyState title={t("tools.trace.emptySpans")} />
        ) : (
          <>
            <div className="trace-pane__toolbar">
              <SegmentedControl
                value={view}
                onChange={(v) => setView(v as ViewMode)}
                options={[
                  { value: "calltree", label: t("tools.trace.viewCallTree") },
                  { value: "sequence", label: t("tools.trace.viewSequence") },
                ]}
              />
              <p className="trace-pane__toolbar-hint">
                {view === "calltree"
                  ? t("tools.trace.callTreeHint")
                  : t("tools.trace.sequenceHint")}
              </p>
            </div>
            {view === "calltree" ? (
              <CallTreeDiagram
                spans={spans}
                selectedSpanId={selectedSpanId}
                onSelect={setSelectedSpanId}
              />
            ) : (
              <SequenceDiagram
                spans={spans}
                selectedSpanId={selectedSpanId}
                onSelect={setSelectedSpanId}
              />
            )}
          </>
        )}
      </section>

      <aside className="trace-pane__detail">
        {!selectedSpan ? (
          loadingSpans || spans.length > 0 ? (
            <div className="trace-pane__loading">
              <Spinner />
            </div>
          ) : null
        ) : (
          <div className="trace-pane__detail-body">
            <h3>{callTreeLabel(selectedSpan)}</h3>
            <dl className="trace-pane__facts">
              <div>
                <dt>kind</dt>
                <dd>{selectedSpan.kind}</dd>
              </div>
              <div>
                <dt>source</dt>
                <dd>{selectedSpan.source}</dd>
              </div>
              <div>
                <dt>status</dt>
                <dd>{selectedSpan.status ?? "…"}</dd>
              </div>
              <div>
                <dt>start</dt>
                <dd>{formatTs(selectedSpan.startTs)}</dd>
              </div>
              {selectedSpan.endTs ? (
                <div>
                  <dt>end</dt>
                  <dd>{formatTs(selectedSpan.endTs)}</dd>
                </div>
              ) : null}
              {selectedSpan.summary ? (
                <div>
                  <dt>summary</dt>
                  <dd>{selectedSpan.summary}</dd>
                </div>
              ) : null}
            </dl>
            {payloadIn ? (
              <PayloadBlock
                title={t("tools.trace.input")}
                payload={payloadIn}
                truncatedLabel={t("tools.trace.truncated")}
              />
            ) : null}
            {payloadOut ? (
              <PayloadBlock
                title={t("tools.trace.output")}
                payload={payloadOut}
                truncatedLabel={t("tools.trace.truncated")}
              />
            ) : null}
            {selectedSpan.attrs ? (
              <PayloadBlock
                title="attrs"
                payload={{
                  id: "attrs",
                  spanId: selectedSpan.spanId,
                  side: "out",
                  ts: selectedSpan.startTs,
                  bytes: 0,
                  truncated: false,
                  json: selectedSpan.attrs,
                }}
                truncatedLabel={t("tools.trace.truncated")}
              />
            ) : null}
          </div>
        )}
      </aside>

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => {
          if (!deleting) setPendingDelete(null);
        }}
        closeOnBackdrop={!deleting}
        closeOnEscape={!deleting}
        aria-label={t("tools.trace.deleteSessionTitle")}
      >
        <h2 className="components-modal-title">{t("tools.trace.deleteSessionTitle")}</h2>
        <p className="components-modal-body">{t("tools.trace.deleteSessionBody")}</p>
        <div className="components-row components-row--end">
          <Button
            variant="ghost"
            disabled={deleting}
            onClick={() => setPendingDelete(null)}
          >
            {t("tools.trace.deleteCancel")}
          </Button>
          <Button variant="danger" disabled={deleting} onClick={() => void confirmDelete()}>
            {t("tools.trace.deleteConfirm")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function PayloadBlock({
  title,
  payload,
  truncatedLabel,
}: {
  title: string;
  payload: TracePayloadRecord;
  truncatedLabel: string;
}) {
  return (
    <div className="trace-pane__payload">
      <div className="trace-pane__payload-head">
        <strong>{title}</strong>
        {payload.truncated ? (
          <span>
            {truncatedLabel} · {(payload.bytes / 1024).toFixed(1)} KB
          </span>
        ) : (
          <span>{(payload.bytes / 1024).toFixed(1)} KB</span>
        )}
      </div>
      <pre>{JSON.stringify(payload.json, null, 2)}</pre>
    </div>
  );
}
