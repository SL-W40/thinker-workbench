/**
 * 用户消息中的 `/skill` / `@path` 富文本：芯片样式 + 路径限宽省略。
 */
import { parseMentionSegments } from "./composerMentions";

export type MentionsRichTextProps = {
  text: string;
  /** 点击 @path 时打开文件（可选）。 */
  onOpenFile?: (path: string) => void;
  className?: string;
};

/** 展示用短标签：过长路径只露文件名，完整路径放 title。 */
function atLabel(path: string): string {
  const norm = path.replace(/\\/g, "/");
  const base = norm.split("/").pop() || norm;
  return base;
}

export function MentionsRichText({ text, onOpenFile, className }: MentionsRichTextProps) {
  const segments = parseMentionSegments(text);
  const rootClass = ["mentions-rich", className].filter(Boolean).join(" ");

  return (
    <span className={rootClass}>
      {segments.map((seg, i) => {
        if (seg.kind === "text") {
          return <span key={i}>{seg.text}</span>;
        }
        if (seg.kind === "slash") {
          return (
            <span key={i} className="mention-chip mention-chip--slash" title={`/${seg.name}`}>
              <span className="mention-chip__mark">/</span>
              <span className="mention-chip__label">{seg.name}</span>
            </span>
          );
        }
        const openable = Boolean(onOpenFile);
        return (
          <span
            key={i}
            className={`mention-chip mention-chip--at${openable ? " is-action" : ""}`}
            title={seg.path}
            role={openable ? "link" : undefined}
            tabIndex={openable ? 0 : undefined}
            onClick={
              openable
                ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenFile?.(seg.path);
                  }
                : undefined
            }
            onKeyDown={
              openable
                ? (e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenFile?.(seg.path);
                  }
                : undefined
            }
          >
            <span className="mention-chip__mark">@</span>
            <span className="mention-chip__label">{atLabel(seg.path)}</span>
          </span>
        );
      })}
    </span>
  );
}
