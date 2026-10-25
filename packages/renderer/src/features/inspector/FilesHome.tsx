/**
 * Files 首页：搜索 + 新建文件 + 最近 / 搜索结果。
 */
import { Button, Input } from "@thinker-workbench/design/react";
import { useMemo, useState } from "react";
import { useT } from "../../ui/i18n/useI18n";
import { FileGlyph } from "../../ui/icons";

type Props = {
  recents: string[];
  /** 搜索非空时用于补全的全部工作空间文件路径。*/
  fileCandidates?: string[];
  onOpenFile: (path: string) => void;
  onNewFile?: () => void;
};

function baseName(path: string) {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

function dirName(path: string) {
  const norm = path.replace(/\\/g, "/");
  const i = norm.lastIndexOf("/");
  return i > 0 ? norm.slice(0, i).replace(/\//g, "\\") : "";
}

function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q) return true;
  if (t.includes(q)) return true;
  let ti = 0;
  for (const ch of q) {
    ti = t.indexOf(ch, ti);
    if (ti < 0) return false;
    ti += 1;
  }
  return true;
}

export function FilesHome({ recents, fileCandidates = [], onOpenFile, onNewFile }: Props) {
  const t = useT();
  const [query, setQuery] = useState("");
  const q = query.trim();

  const rows = useMemo(() => {
    if (!q) return recents;
    const fromRecents = recents.filter((path) => fuzzyMatch(q, path));
    const seen = new Set(fromRecents);
    const extras = fileCandidates
      .filter((path) => !seen.has(path) && fuzzyMatch(q, path))
      .slice(0, 40);
    return [...fromRecents, ...extras];
  }, [q, recents, fileCandidates]);

  return (
    <div className="files-home">
      <div className="files-home__toolbar">
        <div className="files-home__search">
          <Input
            className="files-home__input"
            value={query}
            placeholder={t("inspector.files.searchPlaceholder")}
            aria-label={t("inspector.files.searchPlaceholder")}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && rows[0]) {
                e.preventDefault();
                onOpenFile(rows[0]);
              }
              if (e.key === "Escape" && query) {
                setQuery("");
              }
            }}
            startAdornment={
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden
                focusable="false"
              >
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
                <path
                  d="M10.5 10.5 13.5 13.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            }
          />
        </div>
        {onNewFile ? (
          <Button
            className="files-home__new"
            variant="secondary"
            onClick={onNewFile}
            startIcon={
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden
                focusable="false"
              >
                <path
                  d="M4.5 2.5h5L12.5 5.5V13.5H4.5zM9.5 2.5V5.5h3"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
                <path
                  d="M8 8v4M6 10h4"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
            }
          >
            {t("inspector.files.newFile")}
          </Button>
        ) : null}
      </div>

      <div className="files-home__section">
        {q ? t("inspector.files.results") : t("inspector.files.recents")}
      </div>
      {rows.length === 0 ? (
        <div className="files-home__empty">
          {q ? t("inspector.files.noMatch") : t("inspector.files.noRecents")}
        </div>
      ) : (
        <ul className="files-home__list">
          {rows.map((path) => {
            const folder = dirName(path);
            return (
              <li key={path}>
                <button type="button" className="files-home__row" onClick={() => onOpenFile(path)}>
                  <span className="files-home__badge" aria-hidden>
                    <FileGlyph name={path} />
                  </span>
                  <span className="files-home__name">{baseName(path)}</span>
                  {folder ? <span className="files-home__path">{folder}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
