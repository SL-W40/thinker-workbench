import { useCallback, useEffect, useMemo, useState } from "react";
import type { LogRecord } from "@thinker-workbench/logger";
import { Button, Input, Select, Checkbox, Modal } from "@thinker-workbench/design/react";
import { fetchLogs, fetchMeta, fetchTraces, type LogFileInfo, type TraceSummary } from "./api";
import { isEmbed } from "./boot";
import { readLocale, t, type Locale } from "./i18n";
import { LogVirtualTable } from "./LogVirtualTable";

const PAGE_SIZES = [50, 100, 200, 500] as const;
const DEFAULT_PAGE_SIZE = 100;

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { hour12: false });
}

function formatDetail(record: LogRecord): string {
  return JSON.stringify(
    {
      ts: record.ts,
      time: new Date(record.ts).toISOString(),
      level: record.level,
      source: record.source,
      scope: record.scope,
      message: record.message,
      traceId: record.traceId,
      runId: record.runId,
      threadId: record.threadId,
      spanId: record.spanId,
      meta: record.meta ?? null,
    },
    null,
    2,
  );
}

function chainLabel(sources: string[]): string {
  const order = ["app", "desktop", "agent"];
  const present = order.filter((s) => sources.includes(s));
  for (const s of sources) {
    if (!present.includes(s)) present.push(s);
  }
  return present.join(" → ");
}

function shortId(id?: string): string {
  if (!id) return "";
  const parts = id.split("_");
  return parts[parts.length - 1]?.slice(0, 8) ?? id.slice(-8);
}

/** 分片下拉展示：`log-2026-10-08_203712.db` → `2026-10-08 20:37:12`。 */
function formatLogShardLabel(name: string): string {
  const m = name.match(/^log-(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})(\d{2})(?:-(\d+))?\.db$/);
  if (!m) return name;
  const base = `${m[1]} ${m[2]}:${m[3]}:${m[4]}`;
  return m[5] ? `${base} (#${m[5]})` : base;
}

type AppProps = {
  /** 宿主（产品工具窗）下发的 UI 语言；优先于 query / localStorage。 */
  hostLocale?: Locale;
  /** 宿主要求筛选的追踪 id（聊天 Trace 胶囊跳转）。 */
  focusTraceId?: string | null;
  /** 与 focusTraceId 配对；同 id 再次跳转时递增。 */
  focusSeq?: number;
};

export function App({ hostLocale, focusTraceId = null, focusSeq = 0 }: AppProps = {}) {
  const locale = hostLocale ?? readLocale();
  const embed = isEmbed();
  const [files, setFiles] = useState<LogFileInfo[]>([]);
  const [logDir, setLogDir] = useState("");
  const [file, setFile] = useState("all");
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("");
  const [source, setSource] = useState("");
  const [traceId, setTraceId] = useState("");
  const [records, setRecords] = useState<LogRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [offset, setOffset] = useState(0);
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [chain, setChain] = useState<TraceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<LogRecord | null>(null);

  const loadMeta = useCallback(async () => {
    try {
      const meta = await fetchMeta();
      setLogDir(meta.logDir);
      setFiles(meta.files);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const loadTraces = useCallback(async () => {
    try {
      setTraces(await fetchTraces(80));
    } catch {
      /* 列表失败不阻断主表 */
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetchLogs({
        file: traceId.trim() ? "all" : file,
        q: q.trim() || undefined,
        level: level || undefined,
        source: source || undefined,
        traceId: traceId.trim() || undefined,
        limit: pageSize,
        offset,
      });
      // 整页替换，释放上一页大 meta 的引用，便于 GC
      setRecords(res.records);
      setTotal(res.total ?? res.records.length);
      setHasMore(Boolean(res.hasMore));
      if (typeof res.offset === "number" && res.offset !== offset) {
        setOffset(res.offset);
      }
      setChain(res.chain ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [file, q, level, source, traceId, pageSize, offset]);

  useEffect(() => {
    void loadMeta();
    void loadTraces();
  }, [loadMeta, loadTraces]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  // 筛选条件变化时回到最新页
  useEffect(() => {
    setOffset(0);
  }, [file, q, level, source, traceId, pageSize]);

  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => {
      void loadMeta();
      void loadTraces();
      void loadLogs();
    }, 2500);
    return () => window.clearInterval(id);
  }, [auto, loadMeta, loadTraces, loadLogs]);

  // 翻页 / 筛选后关掉详情，避免持有已卸载页的大对象
  useEffect(() => {
    setDetail(null);
  }, [offset, pageSize, file, q, level, source, traceId]);

  const fileOptions = useMemo(() => {
    const named = files.map((f) => ({
      value: f.name,
      label: formatLogShardLabel(f.name),
    }));
    return [{ value: "all", label: t(locale, "fileAll") }, ...named];
  }, [files, locale]);

  const pageRange = useMemo(() => {
    if (total === 0 || records.length === 0) return null;
    const to = total - offset;
    const from = to - records.length + 1;
    return { from, to, total };
  }, [total, offset, records.length]);

  const listResetKey = `${file}|${q}|${level}|${source}|${traceId}|${pageSize}|${offset}`;

  const selectTrace = (id: string) => {
    setTraceId(id);
    setFile("all");
    setOffset(0);
  };

  // 宿主从聊天跳转：筛选该 trace（跨分片「全部」）
  useEffect(() => {
    const id = focusTraceId?.trim();
    if (!id) return;
    selectTrace(id);
  }, [focusTraceId, focusSeq]);

  return (
    <div className={`logs-app${embed ? " is-embed" : ""}`}>
      {!embed ? (
        <header className="logs-header">
          <h1>{t(locale, "title")}</h1>
          <p>{t(locale, "lead")}</p>
          {logDir ? <code className="logs-dir">{logDir}</code> : null}
        </header>
      ) : (
        <header className="logs-header logs-header--embed">
          <div>
            <h1>{t(locale, "title")}</h1>
            {logDir ? <code className="logs-dir">{logDir}</code> : null}
          </div>
          <span className="logs-count">
            {pageRange
              ? t(locale, "range", pageRange)
              : t(locale, "count", { n: total })}
          </span>
        </header>
      )}

      <section className="logs-filters">
        <label className="logs-field">
          <span>{t(locale, "file")}</span>
          <Select
            value={file}
            options={fileOptions}
            onChange={(value) => setFile(value)}
            aria-label={t(locale, "file")}
            disabled={Boolean(traceId.trim())}
          />
        </label>
        <label className="logs-field logs-field--grow">
          <span>{t(locale, "query")}</span>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t(locale, "queryPlaceholder")}
          />
        </label>
        <label className="logs-field">
          <span>{t(locale, "level")}</span>
          <Select
            value={level || "__all__"}
            options={[
              { value: "__all__", label: t(locale, "all") },
              { value: "debug", label: "debug" },
              { value: "info", label: "info" },
              { value: "warn", label: "warn" },
              { value: "error", label: "error" },
            ]}
            onChange={(value) => setLevel(value === "__all__" ? "" : value)}
            aria-label={t(locale, "level")}
          />
        </label>
        <label className="logs-field">
          <span>{t(locale, "source")}</span>
          <Select
            value={source || "__all__"}
            options={[
              { value: "__all__", label: t(locale, "all") },
              { value: "app", label: "app" },
              { value: "desktop", label: "desktop" },
              { value: "agent", label: "agent" },
            ]}
            onChange={(value) => setSource(value === "__all__" ? "" : value)}
            aria-label={t(locale, "source")}
          />
        </label>
        <label className="logs-field logs-field--grow">
          <span>{t(locale, "trace")}</span>
          <Input
            value={traceId}
            onChange={(e) => setTraceId(e.target.value)}
            placeholder="trace_…"
          />
        </label>
        <div className="logs-actions">
          <Checkbox checked={auto} onChange={setAuto}>
            {t(locale, "auto")}
          </Checkbox>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void loadLogs()}
          >
            {t(locale, "refresh")}
          </Button>
          {traceId ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setTraceId("")}>
              {t(locale, "clearTrace")}
            </Button>
          ) : null}
        </div>
      </section>

      {chain ? (
        <div className="logs-chain">
          <div className="logs-chain-title">
            <strong>{t(locale, "chain")}</strong>
            <code title={chain.traceId}>{chain.traceId}</code>
            <span className="logs-chain-sources">{chainLabel(chain.sources)}</span>
            <span className="logs-count">{t(locale, "count", { n: chain.count })}</span>
          </div>
          <ol className="logs-hops">
            {chain.hops.map((hop, i) => (
              <li key={`${hop}-${i}`}>{hop}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {error ? <p className="logs-error">{error}</p> : null}

      <div className="logs-body">
        <aside className="logs-traces">
          <div className="logs-traces-title">{t(locale, "traces")}</div>
          {traces.length === 0 ? (
            <p className="logs-empty logs-empty--aside">{t(locale, "noTraces")}</p>
          ) : (
            <ul className="logs-trace-list">
              {traces.map((tr) => (
                <li key={tr.traceId}>
                  <button
                    type="button"
                    className={`logs-trace-item${traceId === tr.traceId ? " is-active" : ""}`}
                    onClick={() => selectTrace(tr.traceId)}
                    title={tr.traceId}
                  >
                    <span className="logs-trace-id">{shortId(tr.traceId)}</span>
                    <span className="logs-trace-meta">
                      {chainLabel(tr.sources)} · {tr.count}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="logs-table-pane">
          <div className="logs-table-wrap">
            {files.length === 0 ? (
              <p className="logs-empty">{t(locale, "missing")}</p>
            ) : records.length === 0 ? (
              <p className="logs-empty">{t(locale, "empty")}</p>
            ) : (
              <LogVirtualTable
                records={records}
                resetKey={listResetKey}
                spanLabel={t(locale, "span")}
                openDetailLabel={t(locale, "openDetail")}
                onOpenDetail={setDetail}
                onSelectTrace={selectTrace}
              />
            )}
          </div>

          <div className="logs-pager">
            <label className="logs-field logs-field--inline">
              <span>{t(locale, "pageSize")}</span>
              <Select
                value={String(pageSize)}
                options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
                onChange={(value) => setPageSize(Number(value) || DEFAULT_PAGE_SIZE)}
                aria-label={t(locale, "pageSize")}
              />
            </label>
            <span className="logs-count">
              {pageRange
                ? t(locale, "range", pageRange)
                : t(locale, "count", { n: total })}
            </span>
            <div className="logs-pager-actions">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy || offset <= 0}
                onClick={() => setOffset((o) => Math.max(0, o - pageSize))}
              >
                {t(locale, "newer")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy || !hasMore}
                onClick={() => setOffset((o) => o + pageSize)}
              >
                {t(locale, "older")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        closeOnBackdrop
        closeOnEscape
        aria-labelledby="logs-detail-title"
        panelClassName="logs-detail-panel"
      >
        {detail ? (
          <div className="logs-detail">
            <div className="logs-detail-head">
              <div>
                <h2 id="logs-detail-title">{t(locale, "detailTitle")}</h2>
                <p className="logs-detail-sub">
                  {detail.scope} · {detail.message} · {formatTime(detail.ts)}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setDetail(null)}>
                {t(locale, "close")}
              </Button>
            </div>
            <pre className="logs-detail-pre">{formatDetail(detail)}</pre>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
