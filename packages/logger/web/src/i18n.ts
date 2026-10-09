export type Locale = "en" | "zh";

const copy = {
  en: {
    title: "Logs",
    lead: "Cross-process traces in the configured log directory — same traceId links app → desktop → agent",
    file: "File",
    fileAll: "All (merged)",
    query: "Search",
    queryPlaceholder: "message, scope, traceId…",
    level: "Level",
    source: "Source",
    trace: "Trace id",
    refresh: "Refresh",
    auto: "Auto-refresh",
    empty: "No matching log lines.",
    missing: "No log files yet. Run the desktop app to create logs in the configured directory.",
    count: "{n} lines",
    range: "{from}–{to} / {total}",
    pageSize: "Page size",
    newer: "Newer",
    older: "Older",
    all: "All",
    traces: "Traces",
    noTraces: "No traces yet. Send a chat message to start a chain.",
    chain: "Chain",
    clearTrace: "Clear filter",
    hops: "Hops",
    span: "Span",
    openDetail: "Open log detail",
    detailTitle: "Log detail",
    close: "Close",
  },
  zh: {
    title: "日志",
    lead: "检索已配置的日志目录；同一 traceId 串联 app → desktop → agent",
    file: "文件",
    fileAll: "全部（合并）",
    query: "搜索",
    queryPlaceholder: "消息、scope、traceId…",
    level: "级别",
    source: "来源",
    trace: "Trace id",
    refresh: "刷新",
    auto: "自动刷新",
    empty: "没有匹配的日志行。",
    missing: "还没有日志文件。运行桌面应用后会在已配置的日志目录下生成。",
    count: "{n} 行",
    range: "{from}–{to} / {total}",
    pageSize: "每页",
    newer: "更新",
    older: "更早",
    all: "全部",
    traces: "链路",
    noTraces: "还没有链路。在聊天里发送一条消息即可产生。",
    chain: "链路",
    clearTrace: "清除筛选",
    hops: "跳转",
    span: "Span",
    openDetail: "查看日志详情",
    detailTitle: "日志详情",
    close: "关闭",
  },
} as const;

/**
 * 独立站语言：`?lang=` → localStorage；嵌入宿主应传 `hostLocale`，勿依赖此默认。
 */
export function readLocale(): Locale {
  const params = new URLSearchParams(location.search);
  const fromQuery = params.get("lang");
  if (fromQuery === "zh" || fromQuery === "en") return fromQuery;
  const saved = localStorage.getItem("tw-logs-lang");
  return saved === "zh" ? "zh" : "en";
}

export function t(
  locale: Locale,
  key: keyof (typeof copy)["en"],
  vars?: { n?: number; from?: number; to?: number; total?: number },
): string {
  let s: string = copy[locale][key] ?? copy.en[key];
  if (vars?.n != null) s = s.replace("{n}", String(vars.n));
  if (vars?.from != null) s = s.replace("{from}", String(vars.from));
  if (vars?.to != null) s = s.replace("{to}", String(vars.to));
  if (vars?.total != null) s = s.replace("{total}", String(vars.total));
  return s;
}
