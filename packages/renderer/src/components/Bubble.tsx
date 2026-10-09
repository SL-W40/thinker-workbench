/**
 * 单条聊天气泡。
 * - 助手 / 用户均无头像昵称时间。
 * - 用户：外观同底部输入框。点击原位编辑；失焦或 Esc 还原；发送后才从该条截断重发。
 * 运行失败以时间线 error 步展示（不再使用 System 角色气泡）。
 */
import { IconButton, RestartIcon, useDesignTheme } from "@thinker-workbench/design/react";
import { StreamingMarkdownView } from "@thinker-workbench/markdown/react";
import type { ChatMessage } from "@thinker-workbench/shared";
import type { FocusEvent, KeyboardEvent, RefObject } from "react";
import { SendGlyph } from "../features/chat/Composer";
import { ChatUsageBar } from "../features/chat/ChatUsageBar";
import { normalizeChatMessage } from "../features/chat/messageModel";
import { RunTimeline } from "../features/chat/RunTimeline";
import { EMPTY_USAGE, totalTokens } from "../features/chat/usageStats";
import { useT } from "../i18n/I18nProvider";

type BubbleProps = {
  message: ChatMessage;
  /** 当前会话是否正在跑（pending 且 busy 才算 live，避免中断后永远 Planning）。 */
  running?: boolean;
  /** 跳转到设置 → 模型（缺 API key 错误行用）。 */
  onOpenModelSettings?: () => void;
  /** 打开控制台 Logs 并筛选该 trace。 */
  onOpenTrace?: (traceId: string) => void;
  /** 在右侧 Files 面板打开工作空间文件。 */
  onOpenFile?: (path: string) => void;
  /** 时间线 delete_file「恢复」。 */
  onRestoreDeletedFile?: (stepId: string) => void | Promise<void>;
  /** 手动停止后「继续」。 */
  onResume?: () => void;
  canResume?: boolean;
  /** 是否正在原位编辑这条用户消息。 */
  editing?: boolean;
  editDraft?: string;
  editInputRef?: RefObject<HTMLTextAreaElement | null>;
  onBeginEdit?: (messageId: string) => void;
  onEditDraftChange?: (value: string) => void;
  onEditKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSendEdit?: () => void;
  /** 失焦 / Esc：退出原位编辑，历史不变。 */
  onCancelEdit?: () => void;
};

export function Bubble({
  message,
  running = false,
  onOpenModelSettings,
  onOpenTrace,
  onOpenFile,
  onRestoreDeletedFile,
  onResume,
  canResume = false,
  editing = false,
  editDraft = "",
  editInputRef,
  onBeginEdit,
  onEditDraftChange,
  onEditKeyDown,
  onSendEdit,
  onCancelEdit,
}: BubbleProps) {
  const t = useT();
  const view = normalizeChatMessage(message);
  const { markdownTheme } = useDesignTheme();
  const timeline = view.timeline ?? [];
  const showTimeline = timeline.length > 0 || Boolean(view.pending);
  const hasText = Boolean(view.text?.trim());
  // reply 已按序插入时间线时，不再在底部重复渲染整段正文
  const timelineHasReply = timeline.some((s) => s.kind === "text");
  const role = view.role === "user" ? "user" : "assistant";
  const live = Boolean(view.pending && running);
  const usage = view.usage ?? EMPTY_USAGE;
  const showUsage =
    role === "assistant" &&
    (totalTokens(usage) > 0 ||
      (view.durationMs != null && view.durationMs > 0) ||
      (live && view.runStartedAt != null) ||
      Boolean(view.traceId));

  if (role === "user") {
    if (editing) {
      const leaveIfOutside = (e: FocusEvent<HTMLDivElement>) => {
        const root = e.currentTarget;
        const next = e.relatedTarget;
        if (next instanceof Node && root.contains(next)) return;
        // 点发送时焦点可能先离开；等一帧再看是否仍在壳内
        window.setTimeout(() => {
          if (root.contains(document.activeElement)) return;
          onCancelEdit?.();
        }, 0);
      };
      return (
        <li className="bubble role-user">
          <div
            className="user-prompt user-prompt--editing composer-shell"
            onBlur={leaveIfOutside}
          >
            <textarea
              ref={editInputRef}
              className="composer-input"
              rows={2}
              value={editDraft}
              placeholder={t("chat.placeholder")}
              onChange={(e) => onEditDraftChange?.(e.target.value)}
              onKeyDown={onEditKeyDown}
            />
            <div className="composer-bar">
              <div className="composer-bar-left" />
              <div className="composer-bar-right">
                <IconButton
                  className="composer-send"
                  size="lg"
                  variant="secondary"
                  disabled={!editDraft.trim()}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onSendEdit?.()}
                  aria-label={t("chat.send")}
                  title={t("chat.sendHint")}
                >
                  <span className="composer-send__ico" aria-hidden="true">
                    <SendGlyph />
                  </span>
                </IconButton>
              </div>
            </div>
          </div>
        </li>
      );
    }

    return (
      <li className="bubble role-user">
        <button
          type="button"
          className="user-prompt"
          onClick={() => onBeginEdit?.(message.id)}
          aria-label={t("chat.editUserMessage")}
          title={t("chat.editUserMessageHint")}
        >
          <div className="user-prompt__text">{view.text}</div>
          <div className="user-prompt__bar">
            <span className="user-prompt__retry" aria-hidden="true">
              <RestartIcon size="md" />
            </span>
          </div>
        </button>
      </li>
    );
  }

  return (
    <li className={`bubble role-assistant${view.pending ? " pending" : ""}`}>
      <div className="bubble-main">
        {showTimeline ? (
          <RunTimeline
            steps={timeline}
            live={live}
            onOpenModelSettings={onOpenModelSettings}
            onOpenFile={onOpenFile}
            onRestoreDeletedFile={onRestoreDeletedFile}
            onResume={onResume}
            canResume={canResume}
          />
        ) : null}
        {hasText && !timelineHasReply ? (
          <div className="bubble-body">
            <StreamingMarkdownView markdown={view.text} theme={markdownTheme} />
          </div>
        ) : null}
        {showUsage ? (
          <ChatUsageBar
            usage={usage}
            durationMs={view.durationMs ?? 0}
            runStartedAt={live ? view.runStartedAt ?? null : null}
            busy={live}
            variant="message"
            traceId={view.traceId}
            onOpenTrace={onOpenTrace}
          />
        ) : null}
      </div>
    </li>
  );
}
