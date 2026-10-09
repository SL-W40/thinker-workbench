/**
 * 文件变更卡片：图标 + 文件名 + +/- 统计；默认折叠 8 行，
 * 超出时底部渐隐 + 居中下箭头展开。点文件名在右侧打开文件。
 */

import { highlightCode } from "@thinker-workbench/markdown";
import { useMemo, useState } from "react";
import { useT } from "../../i18n/I18nProvider";

type Props = {
  path?: string;
  diff: string;
  /** 在右侧 Files 面板打开该路径。 */
  onOpenFile?: (path: string) => void;
};

type DiffRow = {
  kind: "add" | "del" | "ctx";
  prefix: string;
  code: string;
};

/** 折叠时默认可见行数。 */
const COLLAPSED_LINES = 8;

/** 扩展名 → highlight.js 语言 id。 */
function langFromPath(path?: string): string | undefined {
  const ext = fileExt(path);
  if (!ext) return undefined;
  const map: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    ts: "typescript",
    tsx: "typescript",
    json: "json",
    md: "markdown",
    markdown: "markdown",
    py: "python",
    css: "css",
    html: "html",
    htm: "html",
    xml: "xml",
    svg: "xml",
    yml: "yaml",
    yaml: "yaml",
    sh: "bash",
    bash: "bash",
    less: "css",
  };
  return map[ext] ?? ext;
}

function fileExt(path?: string): string | undefined {
  if (!path) return undefined;
  const base = path.split(/[/\\]/).pop() ?? path;
  const dot = base.lastIndexOf(".");
  if (dot < 0) return undefined;
  return base.slice(dot + 1).toLowerCase();
}

function fileName(path?: string): string {
  if (!path) return "file";
  return path.split(/[/\\]/).pop() || path;
}

/** 文件类型图标上的简写。 */
function fileBadge(ext?: string): string {
  if (!ext) return "{}";
  if (ext === "ts" || ext === "tsx") return "TS";
  if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs") return "JS";
  if (ext === "json") return "{}";
  if (ext === "md" || ext === "markdown") return "MD";
  if (ext === "py") return "PY";
  if (ext === "css" || ext === "less") return "{}";
  if (ext === "html" || ext === "htm") return "</>";
  if (ext === "yml" || ext === "yaml") return "Y";
  if (ext === "sh" || ext === "bash") return "$";
  return ext.slice(0, 2).toUpperCase();
}

/** unified diff 文件头 / hunk 头等，对用户无信息量。 */
function isMetaLine(line: string): boolean {
  return (
    line.startsWith("--- ") ||
    line.startsWith("+++ ") ||
    line.startsWith("@@") ||
    line.startsWith("diff --git") ||
    line.startsWith("index ") ||
    line.startsWith("new file mode") ||
    line.startsWith("deleted file mode") ||
    line.startsWith("similarity index") ||
    line.startsWith("rename from") ||
    line.startsWith("rename to") ||
    line.startsWith("\\ No newline")
  );
}

function parseDiffRows(diff: string): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const line of diff.split("\n")) {
    if (isMetaLine(line)) continue;
    if (line.startsWith("+")) {
      rows.push({ kind: "add", prefix: "+", code: line.slice(1) });
    } else if (line.startsWith("-")) {
      rows.push({ kind: "del", prefix: "-", code: line.slice(1) });
    } else if (line.startsWith(" ")) {
      rows.push({ kind: "ctx", prefix: " ", code: line.slice(1) });
    } else if (line === "") {
      rows.push({ kind: "ctx", prefix: " ", code: "" });
    } else {
      rows.push({ kind: "ctx", prefix: " ", code: line });
    }
  }
  return rows;
}

export function FileDiffView({ path, diff, onOpenFile }: Props) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const lang = useMemo(() => langFromPath(path), [path]);
  const ext = useMemo(() => fileExt(path), [path]);
  const rows = useMemo(() => parseDiffRows(diff), [diff]);

  const stats = useMemo(() => {
    let add = 0;
    let del = 0;
    for (const row of rows) {
      if (row.kind === "add") add += 1;
      else if (row.kind === "del") del += 1;
    }
    return { add, del };
  }, [rows]);

  const canCollapse = rows.length > COLLAPSED_LINES;
  const visibleRows = canCollapse && !expanded ? rows.slice(0, COLLAPSED_LINES) : rows;

  const highlighted = useMemo(() => {
    return visibleRows.map((row) => {
      if (!row.code) return "";
      return highlightCode(row.code, lang).html;
    });
  }, [visibleRows, lang]);

  if (rows.length === 0) return null;

  const name = fileName(path);
  const collapsed = canCollapse && !expanded;
  const canOpen = Boolean(path && onOpenFile);

  return (
    <div className={`run-diff${collapsed ? " is-collapsed" : ""}${expanded ? " is-expanded" : ""}`}>
      <div className="run-diff-head">
        <span className={`run-diff-icon run-diff-icon--${ext || "file"}`} aria-hidden="true">
          {fileBadge(ext)}
        </span>
        {canOpen ? (
          <button
            type="button"
            className="run-diff-name is-link"
            onClick={() => onOpenFile?.(path!)}
            aria-label={t("inspector.changes.openFile")}
          >
            {name}
          </button>
        ) : (
          <span className="run-diff-name">{name}</span>
        )}
        {stats.add > 0 ? (
          <span className="run-diff-stat run-diff-stat--add">+{stats.add}</span>
        ) : null}
        {stats.del > 0 ? (
          <span className="run-diff-stat run-diff-stat--del">-{stats.del}</span>
        ) : null}
      </div>

      <div className="run-diff-body-wrap">
        <pre
          className="run-diff-body"
          tabIndex={0}
          style={{ ["--diff-collapsed-lines" as string]: String(COLLAPSED_LINES) }}
        >
          {visibleRows.map((row, i) => (
            <span
              key={`${i}:${row.kind}:${row.code.slice(0, 24)}`}
              className={`run-diff-line run-diff-line--${row.kind}`}
            >
              <span className={`run-diff-prefix run-diff-prefix--${row.kind}`} aria-hidden="true">
                {row.prefix}
              </span>
              <code
                className="run-diff-code hljs"
                dangerouslySetInnerHTML={{ __html: highlighted[i] || " " }}
              />
              {"\n"}
            </span>
          ))}
        </pre>
        {canCollapse ? (
          <button
            type="button"
            className={`run-diff-fade${expanded ? " is-expanded" : ""}`}
            aria-expanded={expanded}
            aria-label={expanded ? t("chat.diffCollapse") : t("chat.diffExpand")}
            onClick={() => setExpanded((v) => !v)}
          >
            <span
              className={`run-diff-arrow${expanded ? " is-up" : ""}`}
              aria-hidden="true"
            />
          </button>
        ) : null}
      </div>
    </div>
  );
}
