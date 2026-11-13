/**
 * 用户消息中的 `/skill` / `@path` 富文本：芯片样式 + 路径限宽省略。
 */
import { FileGlyph } from "../../../ui/icons";
import { ChipIcon } from "./chipIcons";
import { linkLabel, parseMentionSegments } from "./composerMentions";

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
  // 预生成稳定 key（同段内容可能重复，附加序号保证唯一），避免直接以 index 作 JSX key
  const keyed = segments.map((seg, i) => ({ seg, key: `${seg.kind}:${i}` }));
  const rootClass = ["mentions-rich", className].filter(Boolean).join(" ");

  return (
    <span className={rootClass}>
      {keyed.map(({ seg, key }) => {
        if (seg.kind === "text") {
          return <span key={key}>{seg.text}</span>;
        }
        if (seg.kind === "slash") {
          return (
            <span key={key} className="mention-chip mention-chip--slash">
              <span className="mention-chip__mark mention-chip__mark--glyph">
                <ChipIcon kind="slash" />
              </span>
              <span className="mention-chip__label">{seg.name}</span>
            </span>
          );
        }
        if (seg.kind === "link") {
          return (
            <span key={key} className="mention-chip mention-chip--link">
              <span className="mention-chip__mark mention-chip__mark--glyph">
                <ChipIcon kind="link" />
              </span>
              <span className="mention-chip__label">{linkLabel(seg.url)}</span>
            </span>
          );
        }
        const label = atLabel(seg.path);
        const openable = Boolean(onOpenFile);
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: @ 路径芯片在可打开时具备 role="link" + tabIndex + 键盘回车处理
          <span
            key={key}
            className={`mention-chip mention-chip--at${openable ? " is-action" : ""}`}
            data-mention="at"
            data-path={seg.path}
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
            <span className="mention-chip__mark mention-chip__mark--glyph">
              <FileGlyph name={seg.path} />
            </span>
            <span className="mention-chip__label">{label}</span>
          </span>
        );
      })}
    </span>
  );
}
