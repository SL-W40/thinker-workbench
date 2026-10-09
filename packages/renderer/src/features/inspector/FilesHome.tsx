/**
 * Files 首页：搜索 + 新建文件 + 最近 / 搜索结果。
 * 不含文件树；变更 / 终端由 Tab「+」菜单打开。
 */
import { useMemo, useState } from "react";
import { useT } from "../../i18n/I18nProvider";

type Props = {
  recents: string[];
  /** 搜索非空时用于补全的全部工作空间文件路径。 */
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

function fileBadge(path: string): { label: string; color: string } {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "js" || ext === "cjs" || ext === "mjs") return { label: "JS", color: "#c6a132" };
  if (ext === "ts") return { label: "TS", color: "#3178c6" };
  if (ext === "tsx") return { label: "TSX", color: "#3178c6" };
  if (ext === "jsx") return { label: "JSX", color: "#c6a132" };
  if (ext === "css") return { label: "CSS", color: "#563d7c" };
  if (ext === "json") return { label: "{ }", color: "#8b8b4a" };
  if (ext === "md") return { label: "MD", color: "#6a737d" };
  if (ext === "gitignore") return { label: "GIT", color: "#f05033" };
  return { label: (ext || "FILE").slice(0, 4).toUpperCase(), color: "#888" };
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

export function FilesHome({
  recents,
  fileCandidates = [],
  onOpenFile,
  onNewFile,
}: Props) {
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
          <span className="files-home__search-ico" aria-hidden>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
              <path
                d="M10.5 10.5 13.5 13.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <input
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
          />
        </div>
        {onNewFile ? (
          <button type="button" className="files-home__new" onClick={onNewFile}>
            <span className="files-home__new-ico" aria-hidden>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
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
            </span>
            {t("inspector.files.newFile")}
          </button>
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
            const badge = fileBadge(path);
            const folder = dirName(path);
            return (
              <li key={path}>
                <button
                  type="button"
                  className="files-home__row"
                  onClick={() => onOpenFile(path)}
                >
                  <span
                    className="files-home__badge"
                    style={{ color: badge.color }}
                    aria-hidden
                  >
                    {badge.label}
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
