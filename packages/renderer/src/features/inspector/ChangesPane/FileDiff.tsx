/**
 * 单文件 diff 渲染：纯文本首屏 + 空闲分片高亮。
 */
import { highlightCode } from "@thinker-workbench/markdown";
import { escapeHtml } from "@thinker-workbench/shared";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../../ui/i18n/useI18n";
import { diffLineKey, langFromPath, parseUnifiedDiff } from "./diffText";
import { enqueueHighlightJob, HIGHLIGHT_CHUNK } from "./highlightQueue";

/** 单行 diff：memo，避免分片高亮时整表重绘。*/
export const DiffCodeLine = memo(function DiffCodeLine({
  kind,
  lineNo,
  html,
}: {
  kind: "add" | "del" | "ctx";
  lineNo: number | null;
  html: string;
}) {
  return (
    <div className={`changes-diff__line changes-diff__line--${kind}`}>
      <span className="changes-diff__gutter">{lineNo ?? ""}</span>
      <span className="changes-diff__mark" aria-hidden>
        {kind === "add" ? "+" : kind === "del" ? "−" : " "}
      </span>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: diff 高亮产物来自 hljs 的受控转义输出 */}
      <code className="changes-diff__text hljs" dangerouslySetInnerHTML={{ __html: html || " " }} />
    </div>
  );
});

export const FileDiffBody = memo(function FileDiffBody({
  path,
  patch,
  binary,
  full,
  onExpandFull,
  loadingFull,
  wordWrap,
}: {
  path: string;
  patch: string;
  binary: boolean;
  full: boolean;
  onExpandFull: () => void;
  loadingFull: boolean;
  wordWrap: boolean;
}) {
  const t = useT();
  const rows = useMemo(() => parseUnifiedDiff(patch), [patch]);
  const lang = useMemo(() => langFromPath(path), [path]);

  // 先纯文本首屏，再空闲分片高亮，避免全部展开时主线程长时间阻塞。
  const [highlighted, setHighlighted] = useState<string[]>(() =>
    rows.map((row) => {
      if (row.kind === "gap" || row.kind === "hunk" || row.kind === "meta" || !row.text) {
        return "";
      }
      return escapeHtml(row.text);
    }),
  );
  const highlightedRef = useRef(highlighted);

  useEffect(() => {
    const plain = rows.map((row) => {
      if (row.kind === "gap" || row.kind === "hunk" || row.kind === "meta" || !row.text) {
        return "";
      }
      return escapeHtml(row.text);
    });
    highlightedRef.current = plain;
    setHighlighted(plain);

    // 无可用语言时纯文本已足够，不必进高亮队
    if (!lang) return;

    let index = 0;
    return enqueueHighlightJob({
      cancelled: false,
      tick: () => {
        const next = highlightedRef.current.slice();
        const end = Math.min(index + HIGHLIGHT_CHUNK, rows.length);
        for (let i = index; i < end; i++) {
          const row = rows[i];
          if (
            !row ||
            row.kind === "gap" ||
            row.kind === "hunk" ||
            row.kind === "meta" ||
            !row.text
          ) {
            next[i] = "";
            continue;
          }
          next[i] = highlightCode(row.text, lang).html;
        }
        index = end;
        highlightedRef.current = next;
        setHighlighted(next);
        return index < rows.length;
      },
    });
  }, [rows, lang]);

  if (binary) {
    return <div className="changes-diff__empty">{t("inspector.changes.binaryDiff")}</div>;
  }
  if (!patch.trim()) {
    return <div className="changes-diff__empty">{t("inspector.changes.emptyDiff")}</div>;
  }

  return (
    <div className={`changes-diff${wordWrap ? " is-wrap" : ""}`}>
      <div className="changes-diff__body">
        {rows.map((row, i) => {
          if (row.kind === "gap") {
            if (full) return null;
            return (
              <button
                key={row.id}
                type="button"
                className="changes-diff__gap"
                onClick={onExpandFull}
                disabled={loadingFull}
              >
                <span className="changes-diff__gap-ctrl" aria-hidden>
                  {/* biome-ignore lint/a11y/noSvgWithoutTitle: 纯装饰性展开箭头，父级 button 已带文本语义 */}
                  <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
                    <path
                      d="M2.2 5.2 5 2.4l2.8 2.8M2.2 8.8 5 11.6l2.8-2.8"
                      stroke="currentColor"
                      strokeWidth="1.35"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="changes-diff__gap-label">
                  {loadingFull
                    ? t("inspector.changes.expanding")
                    : t("inspector.changes.unmodifiedLines", { n: String(row.count) })}
                </span>
              </button>
            );
          }
          if (row.kind === "hunk" || row.kind === "meta") return null;
          const lineNo = row.kind === "del" ? row.oldNo : row.newNo;
          return (
            <DiffCodeLine
              key={diffLineKey(i)}
              kind={row.kind}
              lineNo={lineNo}
              html={highlighted[i] || " "}
            />
          );
        })}
      </div>
    </div>
  );
});
