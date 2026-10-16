/**
 * 单条聊天气泡。
 */
import {
  Button,
  CheckIcon,
  CopyIcon,
  IconButton,
  RestartIcon,
  useDesignTheme,
} from "@thinker-workbench/design/react";
import { StreamingMarkdownView } from "@thinker-workbench/markdown/react";
import type { ChatMessage, ChatTimelineStep } from "@thinker-workbench/shared";
import {
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { isBrowserableUrl, requestOpenBrowser } from "../bridge/browser";
import { ChatImageStrip } from "../features/chat/ChatImageStrip";
import { ChatUsageBar } from "../features/chat/ChatUsageBar";
import { SendGlyph } from "../features/chat/Composer";
import { ComposerEditor, type ComposerEditorHandle } from "../features/chat/ComposerEditor";
import { MentionsRichText } from "../features/chat/MentionsRichText";
import { ModelPicker } from "../features/chat/ModelPicker";
import { ModePicker } from "../features/chat/ModePicker";
import { normalizeChatMessage, visibleAssistantText } from "../features/chat/messageModel";
import { RunTimeline } from "../features/chat/RunTimeline";
import { EMPTY_USAGE, totalTokens } from "../features/chat/usageStats";
import { useT } from "../i18n/useI18n";

/** 写入剪贴板；失败时回退 execCommand。 */
async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 回退 */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** 焦点是否在模型选用器（portal 菜单在 body 下，不算进编辑壳）。*/
function focusInModelPicker(node: Node | null): boolean {
  if (!(node instanceof Element)) return false;
  return Boolean(
    node.closest(
      ".composer-model-picker, .composer-model-menu, .composer-mode-picker, .composer-mode-menu",
    ),
  );
}

/** 在右侧 Files 面板打开工作空间文件。 */
function UserPromptBody({
  text,
  onOpenFile,
}: {
  text: string;
  onOpenFile?: (path: string) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    function measure() {
      if (!el) return;
      setOverflows(el.scrollHeight > el.clientHeight + 1);
    }
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  return (
    <div className={`user-prompt__body${overflows ? " has-fade" : ""}`}>
      <div ref={bodyRef} className="user-prompt__text">
        <MentionsRichText text={text} onOpenFile={onOpenFile} />
      </div>
    </div>
  );
}

/** 消息未结算 durationMs 时，用时间线 status 耗时（如思考）兜底。*/
function durationFromTimeline(steps: ChatTimelineStep[]): number {
  let sum = 0;
  for (const s of steps) {
    if (s.kind === "status" && typeof s.durationMs === "number" && s.durationMs > 0) {
      sum += s.durationMs;
    }
  }
  return sum;
}

type BubbleProps = {
  message: ChatMessage;
  /** 当前会话是否正在跑（pending 且 busy 才算 live，避免中断后永远 Planning）。*/
  running?: boolean;
  /** 是否为线程末条（刚跑完的末条保持展开；重开 / 跟随后历史折成 Worked for）。*/
  trailing?: boolean;
  /** 跳转到设置 → 模型（缺 API key 错误行用）。*/
  onOpenModelSettings?: () => void;
  // reply 已按序插入时间线时，不再在底部重复渲染整段正文
  onOpenTrace?: (traceId: string) => void;
  /** 在右侧 Files 面板打开工作空间文件。*/
  onOpenFile?: (path: string) => void;
  /** 打开右侧 Terminal。*/
  onOpenTerminal?: (detail?: {
    sessionId?: string;
    previewOutput?: string;
    title?: string;
  }) => void;
  /** 时间线 delete_file「恢复」。*/
  onRestoreDeletedFile?: (stepId: string) => void | Promise<void>;
  /** 手动停止后「继续」。*/
  onResume?: () => void;
  canResume?: boolean;
  /** 是否正在原位编辑这条用户消息。*/
  editing?: boolean;
  editDraft?: string;
  editInputRef?: RefObject<ComposerEditorHandle | null>;
  onBeginEdit?: (messageId: string) => void;
  onEditDraftChange?: (value: string) => void;
  onEditKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  onSendEdit?: () => void;
  /** 失焦 / Esc：退出原位编辑，历史不变。*/
  onCancelEdit?: () => void;
  /** 当前会话：编辑态模型选用与底部 Composer 共用。*/
  sessionId?: string | null;
};

export function Bubble({
  message,
  running = false,
  trailing = false,
  onOpenModelSettings,
  onOpenTrace,
  onOpenFile,
  onOpenTerminal,
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
  sessionId = null,
}: BubbleProps) {
  const t = useT();
  const view = normalizeChatMessage(message);
  const { markdownTheme } = useDesignTheme();
  const timeline = view.timeline ?? [];
  const showTimeline = timeline.length > 0 || Boolean(view.pending);
  const hasText = Boolean(view.text?.trim());
  // reply 已按序插入时间线时，不再在底部重复渲染整段正
  const timelineHasReply = timeline.some((s) => s.kind === "text");
  const role = view.role === "user" ? "user" : "assistant";
  const live = Boolean(view.pending && running);
  const usage = view.usage ?? EMPTY_USAGE;
  const durationMs =
    view.durationMs != null && view.durationMs > 0
      ? view.durationMs
      : durationFromTimeline(timeline);
  // 仅在完成 / 停止后展示；流式活跃中不显示 Tokens / 耗时 / Trace
  const showUsage =
    role === "assistant" &&
    !live &&
    (totalTokens(usage) > 0 || durationMs > 0 || Boolean(view.traceId));
  const copyableText = role === "assistant" ? visibleAssistantText(view) : "";
  // 流式结束后才显示复制；正文可来自 message.text 或时间线 text 步
  const showCopy = role === "assistant" && !live && Boolean(copyableText);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(id);
  }, [copied]);

  async function onCopyMessage() {
    if (!copyableText) return;
    const ok = await copyTextToClipboard(copyableText);
    if (ok) setCopied(true);
  }

  const copyButton = showCopy ? (
    <Button
      className="bubble-actions__copy"
      variant="text"
      size="sm"
      startIcon={copied ? <CheckIcon size="sm" /> : <CopyIcon size="sm" />}
      aria-label={copied ? t("chat.copiedMessage") : t("chat.copyMessage")}
      title={copied ? t("chat.copiedMessage") : t("chat.copyMessage")}
      onClick={() => void onCopyMessage()}
    >
      {copied ? t("chat.copiedMessage") : t("chat.copyMessage")}
    </Button>
  ) : null;

  if (role === "user") {
    if (editing) {
      const leaveIfOutside = (e: FocusEvent<HTMLDivElement>) => {
        const root = e.currentTarget;
        const next = e.relatedTarget;
        if (next instanceof Node && root.contains(next)) return;
        if (focusInModelPicker(next)) return;
        // 点发送 / 模型菜单时焦点可能先离开；等一帧再判
        window.setTimeout(() => {
          if (root.contains(document.activeElement)) return;
          if (focusInModelPicker(document.activeElement)) return;
          if (
            document.querySelector(
              ".composer-model-picker.is-open, .composer-model-menu, .composer-mode-picker.is-open, .composer-mode-menu",
            )
          ) {
            return;
          }
          onCancelEdit?.();
        }, 0);
      };
      const editHasImages = Array.isArray(view.images) && view.images.length > 0;
      return (
        <li className="bubble role-user">
          <div className="user-prompt user-prompt--editing composer-shell" onBlur={leaveIfOutside}>
            {editHasImages ? <ChatImageStrip images={view.images!} /> : null}
            <ComposerEditor
              ref={editInputRef}
              value={editDraft}
              placeholder={t("chat.placeholder")}
              onChange={(v) => onEditDraftChange?.(v)}
              onKeyDown={onEditKeyDown}
            />
            <div className="composer-bar">
              <div className="composer-bar-left">
                <ModePicker sessionId={sessionId} />
                <ModelPicker sessionId={sessionId} />
              </div>
              <div className="composer-bar-right">
                <IconButton
                  className="composer-send"
                  size="lg"
                  variant="secondary"
                  disabled={!editDraft.trim() && !editHasImages}
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

    const userImages = Array.isArray(view.images) ? view.images : [];
    return (
      <li className="bubble role-user">
        <div
          className="user-prompt"
          role="button"
          tabIndex={0}
          onClick={() => onBeginEdit?.(message.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onBeginEdit?.(message.id);
            }
          }}
          aria-label={t("chat.editUserMessage")}
        >
          {userImages.length > 0 ? <ChatImageStrip images={userImages} /> : null}
          {view.text?.trim() ? (
            <UserPromptBody text={view.text} onOpenFile={onOpenFile} />
          ) : userImages.length > 0 ? null : (
            <UserPromptBody text={view.text} onOpenFile={onOpenFile} />
          )}
          <span className="user-prompt__retry" aria-hidden="true">
            <RestartIcon size="sm" />
          </span>
        </div>
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
            durationMs={durationMs}
            trailing={trailing}
            onOpenModelSettings={onOpenModelSettings}
            onOpenFile={onOpenFile}
            onOpenTerminal={onOpenTerminal}
            onRestoreDeletedFile={onRestoreDeletedFile}
            onResume={onResume}
            canResume={canResume}
          />
        ) : null}
        {hasText && !timelineHasReply ? (
          <div className="bubble-body">
            <StreamingMarkdownView
              markdown={view.text}
              theme={markdownTheme}
              streaming={live}
              onLinkClick={(href) => {
                if (!isBrowserableUrl(href)) return false;
                requestOpenBrowser(href);
                return true;
              }}
            />
          </div>
        ) : null}
        {showUsage ? (
          <ChatUsageBar
            usage={usage}
            durationMs={durationMs}
            runStartedAt={null}
            busy={false}
            variant="message"
            traceId={view.traceId}
            onOpenTrace={onOpenTrace}
            showCopy={showCopy}
            copied={copied}
            onCopy={() => void onCopyMessage()}
          />
        ) : showCopy ? (
          <div className="bubble-actions">{copyButton}</div>
        ) : null}
      </div>
    </li>
  );
}
