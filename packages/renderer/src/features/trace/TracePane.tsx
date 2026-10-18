/**
 * Tools → Trace：左侧会话→run 两级导航；主区只渲染选中 run 的树 / 时序。
 */
import {
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  ContextMenu,
  type ContextMenuItemProps,
  EmptyState,
  FolderIcon,
  IconButton,
  Input,
  Modal,
  SegmentedControl,
  Spinner,
} from "@thinker-workbench/design/react";
import type {
  TracePayloadRecord,
  TraceSessionSummary,
  TraceSpanRecord,
} from "@thinker-workbench/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getModelSettings, MODEL_SETTINGS_CHANGED } from "../../bridge/thinker";
import { listWorkspaces } from "../../bridge/workspaces";
import { useT } from "../../i18n/useI18n";
import { CallTreeDiagram } from "./CallTreeDiagram";
import { groupSpansByRun, type TraceRunGroup, UNKNOWN_RUN_ID } from "./callTreeModel";
import { type OverviewNames, omitOutputOverview } from "./overviewModel";
import { SequenceDiagram } from "./SequenceDiagram";
import { SpanOverview } from "./SpanOverview";
import { TracePayloadView } from "./TracePayloadView";
import "./trace.less";

const DETAIL_WIDTH_KEY = "tw.trace.detailWidth";
const DETAIL_COLLAPSED_KEY = "tw.trace.detailCollapsed";
const DETAIL_WIDTH_DEFAULT = 380;
const DETAIL_WIDTH_MIN = 350;
const DETAIL_WIDTH_MAX = 560;
const DETAIL_RAIL_WIDTH = 40;

function readDetailWidth(): number {
  try {
    const raw = localStorage.getItem(DETAIL_WIDTH_KEY);
    const n = raw ? Number(raw) : DETAIL_WIDTH_DEFAULT;
    if (!Number.isFinite(n)) return DETAIL_WIDTH_DEFAULT;
    return Math.min(DETAIL_WIDTH_MAX, Math.max(DETAIL_WIDTH_MIN, Math.floor(n)));
  } catch {
    return DETAIL_WIDTH_DEFAULT;
  }
}

function readDetailCollapsed(): boolean {
  try {
    return localStorage.getItem(DETAIL_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

type Props = {
  active: boolean;
  /** 从聊天跳转时聚焦会话（可选）。*/
  focusSessionId?: string | null;
};

/** calltree=追踪树（默认）；sequence=时序 */
type ViewMode = "calltree" | "sequence";

/** 侧栏短时间：月/日 时:分 */
function formatShortTs(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(ts);
  }
}

type SessionMenuState = {
  session: TraceSessionSummary;
  anchor: { x: number; y: number };
};

/** 默认选中时间线上第一个 span（列表按 start_ts 升序）。 */
function defaultSpanId(rows: TraceSpanRecord[]): string | null {
  return rows[0]?.id ?? null;
}

/** 取最新 run（startTs 最大）。 */
function latestRunId(groups: TraceRunGroup[]): string | null {
  if (groups.length === 0) return null;
  const first = groups[0];
  if (!first) return null;
  let best = first;
  for (const g of groups) {
    if (g.startTs > best.startTs) best = g;
  }
  return best.runId;
}

export function TracePane({ active, focusSessionId = null }: Props) {
  const t = useT();
  const [sessions, setSessions] = useState<TraceSessionSummary[]>([]);
  const [q, setQ] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  /** 已展开的会话（可多开）。 */
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  /** sessionId → spans 缓存（展开过的会话）。 */
  const [spansBySession, setSpansBySession] = useState<Map<string, TraceSpanRecord[]>>(
    () => new Map(),
  );
  const [loadingList, setLoadingList] = useState(false);
  const [loadingSpans, setLoadingSpans] = useState(false);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [payloadIn, setPayloadIn] = useState<TracePayloadRecord | null>(null);
  const [payloadOut, setPayloadOut] = useState<TracePayloadRecord | null>(null);
  const [view, setView] = useState<ViewMode>("calltree");
  const [pendingDelete, setPendingDelete] = useState<TraceSessionSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [sessionMenu, setSessionMenu] = useState<SessionMenuState | null>(null);
  const [detailWidth, setDetailWidth] = useState(readDetailWidth);
  const [detailCollapsed, setDetailCollapsed] = useState(readDetailCollapsed);
  const [resizingDetail, setResizingDetail] = useState(false);
  const [overviewNames, setOverviewNames] = useState<OverviewNames>({});
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(DETAIL_WIDTH_DEFAULT);

  const api = window.thinker?.trace;

  useEffect(() => {
    try {
      localStorage.setItem(DETAIL_WIDTH_KEY, String(detailWidth));
    } catch {
      /* ignore */
    }
  }, [detailWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(DETAIL_COLLAPSED_KEY, detailCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [detailCollapsed]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const applyModels = (models: Array<{ id: string; label: string; model: string }>) => {
      const next: Record<string, string> = {};
      for (const entry of models) {
        const name = (entry.label || entry.model).trim();
        if (name) next[entry.id] = name;
      }
      setOverviewNames((prev) => ({ ...prev, models: next }));
    };
    void getModelSettings()
      .then((catalog) => {
        if (!cancelled) applyModels(catalog.models);
      })
      .catch(() => {});
    void listWorkspaces()
      .then((rows) => {
        if (cancelled) return;
        const workspaces: Record<string, string> = {};
        for (const row of rows) {
          const name = row.name.trim();
          if (name) workspaces[row.id] = name;
        }
        setOverviewNames((prev) => ({ ...prev, workspaces }));
      })
      .catch(() => {});
    const onModels = (event: Event) => {
      const detail = (
        event as CustomEvent<{ models?: Array<{ id: string; label: string; model: string }> }>
      ).detail;
      if (detail?.models) applyModels(detail.models);
    };
    window.addEventListener(MODEL_SETTINGS_CHANGED, onModels);
    return () => {
      cancelled = true;
      window.removeEventListener(MODEL_SETTINGS_CHANGED, onModels);
    };
  }, [active]);

  useEffect(() => {
    if (!resizingDetail) return;
    const onMove = (event: PointerEvent) => {
      const delta = resizeStartX.current - event.clientX;
      const next = resizeStartW.current + delta;
      setDetailWidth(Math.min(DETAIL_WIDTH_MAX, Math.max(DETAIL_WIDTH_MIN, next)));
    };
    const onUp = () => setResizingDetail(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [resizingDetail]);

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

  /** 拉取会话 spans 并写入缓存；可选同步选中最新 run。 */
  const loadSessionSpans = useCallback(
    async (sessionId: string, opts?: { quiet?: boolean; selectLatestRun?: boolean }) => {
      if (!api) return;
      if (!opts?.quiet) setLoadingSpans(true);
      try {
        const rows = await api.getSessionSpans(sessionId);
        setSpansBySession((prev) => {
          const next = new Map(prev);
          next.set(sessionId, rows);
          return next;
        });
        if (opts?.selectLatestRun) {
          const groups = groupSpansByRun(rows);
          const runId = latestRunId(groups);
          setSelectedRunId(runId);
          const runSpans = groups.find((g) => g.runId === runId)?.spans ?? rows;
          setSelectedSpanId(defaultSpanId(runSpans));
        }
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

  // 安静刷新已展开 / 当前会话的 spans
  useEffect(() => {
    if (!active) return;
    const ids = new Set(expandedIds);
    if (selectedSessionId) ids.add(selectedSessionId);
    if (ids.size === 0) return;
    const timer = window.setInterval(() => {
      for (const id of ids) {
        void loadSessionSpans(id, { quiet: true });
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [active, expandedIds, selectedSessionId, loadSessionSpans]);

  // 会话列表变化时校正选中（失效则落到第一个并展开加载）
  useEffect(() => {
    if (sessions.length === 0) {
      setSelectedSessionId(null);
      setSelectedRunId(null);
      return;
    }
    if (selectedSessionId && sessions.some((s) => s.sessionId === selectedSessionId)) {
      return;
    }
    const first = sessions[0]?.sessionId;
    setSelectedSessionId(first);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(first);
      return next;
    });
    void loadSessionSpans(first, { selectLatestRun: true });
  }, [sessions, selectedSessionId, loadSessionSpans]);

  // 从聊天跳转：展开并选中该会话最新 run
  const appliedFocusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusSessionId || focusSessionId === appliedFocusRef.current) return;
    if (!sessions.some((s) => s.sessionId === focusSessionId)) return;
    appliedFocusRef.current = focusSessionId;
    setSelectedSessionId(focusSessionId);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(focusSessionId);
      return next;
    });
    void loadSessionSpans(focusSessionId, { selectLatestRun: true });
  }, [focusSessionId, sessions, loadSessionSpans]);

  // 已选中但尚未缓存 spans 时补拉（不强制展开，尊重用户折叠）
  useEffect(() => {
    if (!active || !selectedSessionId) return;
    if (spansBySession.has(selectedSessionId)) return;
    void loadSessionSpans(selectedSessionId, { selectLatestRun: true });
  }, [active, selectedSessionId, spansBySession, loadSessionSpans]);

  const sessionSpans = selectedSessionId ? (spansBySession.get(selectedSessionId) ?? []) : [];
  const runGroups = useMemo(() => groupSpansByRun(sessionSpans), [sessionSpans]);

  // 当前会话的 run 列表变化时校正 selectedRunId
  useEffect(() => {
    if (!selectedSessionId) {
      setSelectedRunId(null);
      return;
    }
    if (runGroups.length === 0) {
      setSelectedRunId(null);
      return;
    }
    setSelectedRunId((prev) => {
      if (prev && runGroups.some((g) => g.runId === prev)) return prev;
      return latestRunId(runGroups);
    });
  }, [selectedSessionId, runGroups]);

  const runSpans = useMemo(() => {
    if (!selectedRunId) return [];
    return runGroups.find((g) => g.runId === selectedRunId)?.spans ?? [];
  }, [runGroups, selectedRunId]);

  useEffect(() => {
    if (runSpans.length === 0) {
      if (selectedSpanId) setSelectedSpanId(null);
      return;
    }
    if (selectedSpanId && runSpans.some((s) => s.id === selectedSpanId)) return;
    setSelectedSpanId(defaultSpanId(runSpans));
  }, [runSpans, selectedSpanId]);

  const selectedSpan = useMemo(
    () => runSpans.find((s) => s.id === selectedSpanId) ?? null,
    [runSpans, selectedSpanId],
  );

  useEffect(() => {
    if (!api || !selectedSessionId || !selectedSpan) {
      setPayloadIn(null);
      setPayloadOut(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const inn = selectedSpan.inputRef
        ? await api.getPayload(selectedSessionId, selectedSpan.inputRef)
        : null;
      const out = selectedSpan.outputRef
        ? await api.getPayload(selectedSessionId, selectedSpan.outputRef)
        : null;
      if (cancelled) return;
      setPayloadIn(inn);
      setPayloadOut(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [api, selectedSessionId, selectedSpan]);

  const confirmDelete = useCallback(async () => {
    if (!api || !pendingDelete) return;
    const id = pendingDelete.sessionId;
    setDeleting(true);
    try {
      await api.deleteSession(id);
      setPendingDelete(null);
      setSpansBySession((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (selectedSessionId === id) {
        setSelectedSessionId(null);
        setSelectedRunId(null);
        setSelectedSpanId(null);
      }
      await refreshSessions({ quiet: true });
    } finally {
      setDeleting(false);
    }
  }, [api, pendingDelete, refreshSessions, selectedSessionId]);

  const exportSession = useCallback(
    async (sessionId: string) => {
      if (!api?.exportSession || exportingId) return;
      setExportingId(sessionId);
      setExportNotice(null);
      try {
        const result = await api.exportSession(sessionId);
        if (result.ok) {
          setExportNotice(t("tools.trace.exportSessionOk", { path: result.path }));
        } else if (result.error !== "cancelled") {
          setExportNotice(t("tools.trace.exportSessionFail", { error: result.error }));
        }
      } catch (err) {
        setExportNotice(
          t("tools.trace.exportSessionFail", {
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      } finally {
        setExportingId(null);
      }
    },
    [api, exportingId, t],
  );

  useEffect(() => {
    if (!exportNotice) return;
    const timer = window.setTimeout(() => setExportNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [exportNotice]);

  function toggleExpanded(sessionId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }

  function selectSession(sessionId: string) {
    setSelectedSessionId(sessionId);
    setSelectedSpanId(null);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(sessionId);
      return next;
    });
    void loadSessionSpans(sessionId, {
      selectLatestRun: true,
      quiet: spansBySession.has(sessionId),
    });
  }

  function selectRun(sessionId: string, runId: string) {
    setSelectedSessionId(sessionId);
    setSelectedRunId(runId);
    setSelectedSpanId(null);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(sessionId);
      return next;
    });
  }

  function runLabel(group: TraceRunGroup, index: number): string {
    if (group.runId === UNKNOWN_RUN_ID) {
      return t("tools.trace.runUnknown", { n: String(index + 1) });
    }
    return t("tools.trace.runLabelShort", { n: String(index + 1) });
  }

  const sessionMenuItems: ContextMenuItemProps[] = sessionMenu
    ? [
        {
          label: t("tools.trace.exportSession"),
          disabled: exportingId === sessionMenu.session.sessionId,
          onSelect: () => void exportSession(sessionMenu.session.sessionId),
        },
        {
          label: t("tools.trace.deleteSession"),
          danger: true,
          separatorBefore: true,
          onSelect: () => setPendingDelete(sessionMenu.session),
        },
      ]
    : [];

  const searching = Boolean(q.trim());
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

  const showMainLoading =
    Boolean(selectedSessionId) && loadingSpans && !spansBySession.has(selectedSessionId ?? "");

  return (
    <div
      className={`trace-pane${resizingDetail ? " is-resizing-detail" : ""}`}
      style={{
        gridTemplateColumns: `minmax(160px, 220px) minmax(0, 1fr) ${detailCollapsed ? DETAIL_RAIL_WIDTH : detailWidth}px`,
      }}
    >
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
          <div className="trace-pane__session-tree">
            {sessions.map((s) => {
              const isExpanded = expandedIds.has(s.sessionId);
              const isSessionActive = selectedSessionId === s.sessionId;
              const cached = spansBySession.get(s.sessionId);
              const groups = cached ? groupSpansByRun(cached) : null;
              return (
                <div key={s.sessionId} className="trace-pane__session-group">
                  <button
                    type="button"
                    className={`trace-pane__session${isSessionActive ? " is-active" : ""}`}
                    aria-expanded={isExpanded}
                    onClick={() => {
                      if (!isExpanded) {
                        selectSession(s.sessionId);
                      } else if (!isSessionActive) {
                        selectSession(s.sessionId);
                      } else {
                        toggleExpanded(s.sessionId);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setSessionMenu({
                        session: s,
                        anchor: { x: e.clientX, y: e.clientY },
                      });
                    }}
                  >
                    <span className="trace-pane__session-lead" aria-hidden>
                      <span className="trace-pane__session-lead-icon trace-pane__session-lead-icon--folder">
                        <FolderIcon size="sm" open={isExpanded} />
                      </span>
                      <span className="trace-pane__session-lead-icon trace-pane__session-lead-icon--chevron">
                        <ChevronRightIcon open={isExpanded} size="sm" />
                      </span>
                    </span>
                    <span className="trace-pane__session-copy">
                      <span className="trace-pane__session-main">
                        <strong>{s.title?.trim() || s.sessionId.slice(0, 18)}</strong>
                        <span className="trace-pane__session-meta">
                          {t("tools.trace.runCount", { n: String(s.runCount) })}
                        </span>
                      </span>
                      <span className="trace-pane__session-time">{formatShortTs(s.lastTs)}</span>
                    </span>
                  </button>
                  <div
                    className={`trace-pane__runs${isExpanded ? " is-open" : " is-collapsed"}`}
                    aria-hidden={!isExpanded}
                  >
                    <div className="trace-pane__runs-inner">
                      {groups == null ? (
                        <p className="trace-pane__hint">{t("tools.trace.loadingRuns")}</p>
                      ) : groups.length === 0 ? (
                        <p className="trace-pane__hint">{t("tools.trace.emptyRuns")}</p>
                      ) : (
                        groups.map((g, i) => {
                          const selected = isSessionActive && selectedRunId === g.runId;
                          return (
                            <button
                              key={g.runId}
                              type="button"
                              className={`trace-pane__run${selected ? " is-selected" : ""}`}
                              onClick={() => selectRun(s.sessionId, g.runId)}
                            >
                              <span className="trace-pane__run-main">
                                <span className="trace-pane__run-name">{runLabel(g, i)}</span>
                                <span className="trace-pane__run-meta">
                                  {t("tools.trace.spanCount", {
                                    n: String(g.spans.length),
                                  })}
                                </span>
                              </span>
                              <span className="trace-pane__run-time">
                                {formatShortTs(g.startTs)}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {exportNotice ? (
          <p className="trace-pane__export-notice" role="status">
            {exportNotice}
          </p>
        ) : null}
        <ContextMenu
          open={Boolean(sessionMenu)}
          anchor={sessionMenu?.anchor ?? null}
          onClose={() => setSessionMenu(null)}
          aria-label={t("tools.trace.sessionMenu")}
          items={sessionMenuItems}
        />
      </aside>

      <section className="trace-pane__main">
        {showMainLoading ? (
          <div className="trace-pane__loading">
            <Spinner />
          </div>
        ) : !selectedSessionId ? (
          <EmptyState title={t("tools.trace.pickSession")} />
        ) : runSpans.length === 0 ? (
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
            </div>
            {view === "calltree" ? (
              <CallTreeDiagram
                spans={runSpans}
                selectedSpanId={selectedSpanId}
                onSelect={setSelectedSpanId}
              />
            ) : (
              <SequenceDiagram
                spans={runSpans}
                selectedSpanId={selectedSpanId}
                onSelect={setSelectedSpanId}
              />
            )}
          </>
        )}
      </section>

      <aside className={`trace-pane__detail${detailCollapsed ? " is-collapsed" : ""}`}>
        {detailCollapsed ? null : (
          // biome-ignore lint/a11y/useSemanticElements: 详情面板拖宽手柄，ARIA separator + 指针拖拽模式，无对应原生控件
          <div
            className="trace-pane__detail-resize"
            role="separator"
            aria-orientation="vertical"
            aria-valuemin={DETAIL_WIDTH_MIN}
            aria-valuemax={DETAIL_WIDTH_MAX}
            aria-valuenow={detailWidth}
            aria-label={t("tools.trace.resizeDetail")}
            title={t("tools.trace.resizeDetail")}
            onPointerDown={(event) => {
              event.preventDefault();
              resizeStartX.current = event.clientX;
              resizeStartW.current = detailWidth;
              setResizingDetail(true);
            }}
          />
        )}
        <div className="trace-pane__detail-bar">
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={t(
              detailCollapsed ? "tools.trace.expandDetail" : "tools.trace.collapseDetail",
            )}
            title={t(detailCollapsed ? "tools.trace.expandDetail" : "tools.trace.collapseDetail")}
            onClick={() => setDetailCollapsed((collapsed) => !collapsed)}
          >
            {detailCollapsed ? <ChevronLeftIcon /> : <ChevronRightIcon />}
          </IconButton>
        </div>
        {detailCollapsed ? null : !selectedSpan ? (
          loadingSpans || runSpans.length > 0 ? (
            <div className="trace-pane__loading">
              <Spinner />
            </div>
          ) : null
        ) : (
          <div className="trace-pane__detail-body">
            <SpanOverview span={selectedSpan} output={payloadOut?.json} names={overviewNames} />
            {payloadIn ? (
              <TracePayloadView
                title={t("tools.trace.input")}
                payload={payloadIn}
                truncatedLabel={t("tools.trace.truncated")}
                partialLabel={t("tools.trace.partial")}
              />
            ) : null}
            {payloadOut ? (
              <TracePayloadView
                title={t("tools.trace.output")}
                payload={{ ...payloadOut, json: omitOutputOverview(payloadOut.json) }}
                truncatedLabel={t("tools.trace.truncated")}
                partialLabel={t("tools.trace.partial")}
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
          <Button variant="ghost" disabled={deleting} onClick={() => setPendingDelete(null)}>
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
