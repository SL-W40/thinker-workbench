/**
 * 单条聊天气泡：按 role 分别渲染用户提问与助手答复（含时间线、用量、附件与原位编辑）。
 * 只被 ChatStage 使用，故不进对外 barrel —— 内部跨域引用直接指到具体领域。
 */
import {
  Button,
  CheckIcon,
  CopyIcon,
  IconButton,
  PaperclipIcon,
  RestartIcon,
  useDesignTheme,
} from "@thinker-workbench/design/react";
import { StreamingMarkdownView } from "@thinker-workbench/markdown/react";
import type { ChatAttachmentRef, ChatMessage, ChatPlan } from "@thinker-workbench/shared";
import {
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { isBrowserableUrl, requestOpenBrowser } from "../../../platform/ipc/browser";
import { useSharedResizeObserver } from "../../../ui/hooks/useSharedResizeObserver";
import { useT } from "../../../ui/i18n/useI18n";
import {
  ComposerEditor,
  type ComposerEditorHandle,
  extractAttachmentIds,
  MentionsRichText,
  SendGlyph,
} from "../composer";
import { ChatImageStrip, visibleAssistantText } from "../message";
import { ModelPicker, ModePicker } from "../pickers";
import { RunTimeline, reconcileTimelineReply, stripTimelineEcho } from "../timeline";
import { ChatUsageBar } from "../usage";

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
  attachments,
}: {
  text: string;
  onOpenFile?: (path: string) => void;
  attachments?: ChatAttachmentRef[];
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  // 溢出判定：首屏同步测一次，之后交给共享 RO（不再每个气泡各建一个观察者）。
  const measure = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, []);

  useLayoutEffect(measure, [measure]);
  useSharedResizeObserver(bodyRef, measure);

  return (
    <div className={`user-prompt__body${overflows ? " has-fade" : ""}`}>
      <div ref={bodyRef} className="user-prompt__text">
        <MentionsRichText text={text} onOpenFile={onOpenFile} attachments={attachments} />
      </div>
    </div>
  );
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
  /** 在右侧面板以预览方式打开计划文档。*/
  onOpenPlan?: (plan: ChatPlan) => void;
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
  /** 进行中或排队：原位编辑仍可改文字和图片，但不能发送。*/
  sendBlocked?: boolean;
  /** 原位编辑中的统一资产（图片即附件，@file: 芯片展示）。 */
  editAttachments?: ChatAttachmentRef[];
  onAttachEditFiles?: (files: File[]) => void;
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
  onOpenPlan,
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
  sendBlocked = false,
  editAttachments = [],
  onAttachEditFiles,
  onCancelEdit,
  sessionId = null,
}: BubbleProps) {
  const t = useT();
  const view = message;
  // 计划由 create_plan 工具产出（结构化状态），卡片渲染在时间线内；正文即模型的说明
  const plan = view.plan;
  const { markdownTheme } = useDesignTheme();
  const timeline = reconcileTimelineReply(view.timeline ?? [], view.text ?? "");
  const showTimeline = timeline.length > 0 || Boolean(view.pending);
  const hasText = Boolean(view.text?.trim());
  // reply 已按序插入时间线时，不再在底部重复渲染整段正
  const timelineHasReply = timeline.some((s) => s.kind === "text");
  const role = view.role === "user" ? "user" : "assistant";
  const live = Boolean(view.pending && running);
  // 用量只认引擎写下的值；缺失就是「未知」（展示「—」），不用 EMPTY_USAGE 假装是 0
  const usage = view.usage;
  const usageEstimated = view.usageEstimated === true;
  // 耗时只认引擎写下的值；缺失就是「未知」，由展示层画「—」，不从时间线反推
  const durationMs =
    view.durationMs != null && Number.isFinite(view.durationMs) ? view.durationMs : undefined;
  // 仅在完成 / 停止后展示；流式活跃中不显示 Tokens / 耗时 / Trace
  const showUsage =
    role === "assistant" && !live && (usage != null || durationMs != null || Boolean(view.traceId));
  const editFileRef = useRef<HTMLInputElement | null>(null);
  /** 系统文件框会让编辑区失焦；选图期间不要退出编辑。 */
  const pickingEditFileRef = useRef(false);
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
          if (pickingEditFileRef.current) return;
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
      const editHasAssets = editAttachments.length > 0;
      return (
        <li className="bubble role-user">
          {/* biome-ignore lint/a11y/noStaticElementInteractions: 编辑态容器靠 onBlur 判定点击外部收起，自身不可交互 */}
          <div className="user-prompt user-prompt--editing composer-shell" onBlur={leaveIfOutside}>
            <ComposerEditor
              ref={editInputRef}
              value={editDraft}
              placeholder={t("chat.placeholder")}
              onChange={(v) => onEditDraftChange?.(v)}
              onKeyDown={onEditKeyDown}
              attachments={editAttachments}
              onPasteFiles={(files) => {
                if (!onAttachEditFiles || files.length === 0) return false;
                void onAttachEditFiles(files);
                return true;
              }}
            />
            <input
              ref={editFileRef}
              type="file"
              accept="*/*,image/jpeg,image/gif,image/webp,image/heic,image/heif"
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                pickingEditFileRef.current = false;
                if (files.length) onAttachEditFiles?.(files);
              }}
            />
            <div className="composer-bar">
              <div className="composer-bar-left">
                <ModePicker sessionId={sessionId} />
                <ModelPicker sessionId={sessionId} />
              </div>
              <div className="composer-bar-right">
                <IconButton
                  className="composer-attach"
                  size="md"
                  variant="ghost"
                  aria-label={t("chat.attachments.attach")}
                  title={t("chat.attachments.attach")}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    pickingEditFileRef.current = true;
                    editFileRef.current?.click();
                    // 取消文件框时 change 不会触发，焦点回来后再放开
                    window.addEventListener(
                      "focus",
                      () => {
                        window.setTimeout(() => {
                          pickingEditFileRef.current = false;
                        }, 0);
                      },
                      { once: true },
                    );
                  }}
                >
                  <PaperclipIcon />
                </IconButton>
                <IconButton
                  className="composer-send"
                  size="lg"
                  variant="secondary"
                  disabled={sendBlocked || (!editDraft.trim() && !editHasAssets)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onSendEdit?.()}
                  aria-label={t("chat.send")}
                  title={sendBlocked ? t("chat.sendBlocked") : t("chat.sendHint")}
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

    const allUserImages = Array.isArray(view.images) ? view.images : [];
    // 已被正文 @file:<id> 芯片引用的图片不再进缩略图条（避免同一张图重复展示）
    const chipIds = new Set(extractAttachmentIds(view.text ?? ""));
    const userImages = allUserImages.filter((img) => !chipIds.has(img.id));
    return (
      <li className="bubble role-user">
        {/* biome-ignore lint/a11y/useSemanticElements: 整条用户消息作为可点击块进入编辑，包原生 button 会改变内部排版结构 */}
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
          {view.text?.trim() || allUserImages.length > 0 ? (
            <UserPromptBody
              text={view.text}
              onOpenFile={onOpenFile}
              attachments={view.attachments}
            />
          ) : null}
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
            plan={plan}
            onOpenPlan={onOpenPlan}
          />
        ) : null}
        {hasText && !timelineHasReply ? (
          <div className="bubble-body">
            <StreamingMarkdownView
              markdown={stripTimelineEcho(view.text ?? "", timeline)}
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
            usageEstimated={usageEstimated}
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
