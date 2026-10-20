/**
 * 用户消息中的 `/skill` / `@path` 富文本：芯片样式 + 路径限宽省略。
 */
import type { ChatAttachmentRef } from "@thinker-workbench/shared";
import { FileGlyph } from "../inspector/icons";
import { ChipIcon } from "./chipIcons";
import { isAttachmentPath, linkLabel, parseMentionSegments } from "./composerMentions";

export type MentionsRichTextProps = {
  text: string;
  /** 点击 @path 时打开文件（可选，仅工作空间路径）。 */
  onOpenFile?: (path: string) => void;
  /** 外部附件引用解析（@file:<id> → 展示名）。 */
  attachments?: ChatAttachmentRef[];
  className?: string;
};

/** 展示用短标签：过长路径只露文件名，完整路径放 title。 */
function atLabel(path: string): string {
  const norm = path.replace(/\\/g, "/");
  const base = norm.split("/").pop() || norm;
  return base;
}

export function MentionsRichText({
  text,
  onOpenFile,
  attachments,
  className,
}: MentionsRichTextProps) {
  const segments = parseMentionSegments(text);
  const attachById = new Map((attachments ?? []).map((a) => [a.id, a]));
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
        // @ 路径：区分工作空间路径与外部附件
        const isAttach = isAttachmentPath(seg.path);
        const attachRef = isAttach ? attachById.get(seg.path.slice("file:".length)) : undefined;
        const label = isAttach ? (attachRef?.name ?? seg.path) : atLabel(seg.path);
        const openable = Boolean(onOpenFile) && !isAttach;
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
              <FileGlyph name={isAttach ? (attachRef?.name ?? seg.path) : seg.path} />
            </span>
            <span className="mention-chip__label">{label}</span>
          </span>
        );
      })}
    </span>
  );
}
