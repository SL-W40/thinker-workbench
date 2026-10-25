/**
 * 侧栏检索：本地过滤 + 跨会话全文检索。
 *
 * 本地过滤同步即时；全文检索走 IPC（FTS5），带 250ms 防抖与请求序号，
 * 保证只有最后一次输入的结果会被采用（避免乱序回填）。
 */
import { CloseIcon, Input, Spinner } from "@thinker-workbench/design/react";
import type { ChatSearchResult, SearchHit } from "@thinker-workbench/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchSessions } from "../../../platform/ipc/workspaces";
import { useT } from "../../../ui/i18n/useI18n";
import { splitSnippetMatch } from "./sidebarFilter";

/** 全文检索防抖时长：够快又不至于每次按键打一次 IPC。 */
const SEARCH_DEBOUNCE_MS = 250;

/** 触发全文检索的最小长度：短输入只做本地过滤，避免噪音结果。 */
const FULLTEXT_MIN_LEN = 2;

type Props = {
  value: string;
  onChange: (next: string) => void;
  /** 选中一条全文命中（跳到对应会话）。 */
  onPickHit: (hit: SearchHit) => void;
};

export function SidebarSearch({ value, onChange, onPickHit }: Props) {
  const t = useT();
  const [result, setResult] = useState<ChatSearchResult | null>(null);
  const [pending, setPending] = useState(false);
  /** 请求序号：只有最新一次请求的响应会被接受。 */
  const seqRef = useRef(0);

  const trimmed = value.trim();
  const fulltextQuery = trimmed.length >= FULLTEXT_MIN_LEN ? trimmed : "";

  useEffect(() => {
    if (!fulltextQuery) {
      seqRef.current += 1;
      setResult(null);
      setPending(false);
      return;
    }
    const seq = ++seqRef.current;
    setPending(true);
    const timer = window.setTimeout(() => {
      void searchSessions({ query: fulltextQuery }).then((res) => {
        // 过期响应直接丢弃（输入已变化）
        if (seq !== seqRef.current) return;
        setResult(res);
        setPending(false);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [fulltextQuery]);

  const hits = useMemo(() => result?.hits ?? [], [result]);

  const clear = useCallback(() => {
    seqRef.current += 1;
    setResult(null);
    setPending(false);
    onChange("");
  }, [onChange]);

  return (
    <div className="ws-search">
      <Input
        size="sm"
        className="ws-search__input"
        value={value}
        aria-label={t("workspaces.filterToggle")}
        placeholder={t("workspaces.filterPlaceholder")}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.stopPropagation();
            clear();
          }
        }}
        endAdornment={
          value ? (
            <button
              type="button"
              className="ws-search__clear"
              aria-label={t("workspaces.searchClear")}
              onClick={clear}
            >
              <CloseIcon size="sm" />
            </button>
          ) : null
        }
      />
      {fulltextQuery ? (
        <div className="ws-search__results">
          {pending ? (
            <div className="ws-search__row is-muted">
              <Spinner size="sm" />
              <span>{t("workspaces.searching")}</span>
            </div>
          ) : hits.length === 0 ? (
            <div className="ws-search__row is-muted">{t("workspaces.searchEmpty")}</div>
          ) : (
            <>
              {hits.map((hit) => (
                <SearchHitRow
                  key={`${hit.sessionId}:${hit.messageIndex ?? "title"}`}
                  hit={hit}
                  onPick={() => onPickHit(hit)}
                />
              ))}
              {result?.truncated ? (
                <div className="ws-search__row is-muted">{t("workspaces.searchTruncated")}</div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** 单条命中：标题行 + 可选片段（命中部分加粗渲染，片段始终是纯文本）。 */
function SearchHitRow({ hit, onPick }: { hit: SearchHit; onPick: () => void }) {
  const parts = useMemo(() => splitSnippetMatch(hit.snippet, hit.snippetMatch), [hit]);
  return (
    <button type="button" className="ws-search__row" onClick={onPick}>
      <span className="ws-search__hit-title">{hit.title}</span>
      {parts.before || parts.hit || parts.after ? (
        <span className="ws-search__hit-snippet">
          {parts.before}
          <mark>{parts.hit}</mark>
          {parts.after}
        </span>
      ) : null}
    </button>
  );
}
