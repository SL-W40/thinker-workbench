/**
 * 聊天主舞台：空会话展示品牌字标 + 引导文案 + 快捷方式；有消息时渲染可滚动气泡列表。
 * 滚动策略（贴底跟随）：
 * - 靠近底部时内容增高才自动跟上
 * - 用户上翻 / 划词时绝不抢滚动
 * - 父级 `stickNonce` 递增（发送、切会话）时强制贴底
 */

import { Button, ChevronRightIcon, useDesignTheme } from "@thinker-workbench/design/react";
import type { ChatAttachmentRef, ChatMessage, ChatPlan } from "@thinker-workbench/shared";
import { type KeyboardEvent, memo, type RefObject, useEffect, useRef, useState } from "react";
import { brandGlyphSrc } from "../../../platform/branding";
import { bindSubagentSession } from "../../../platform/ipc/subagent";
import { workspaceTree } from "../../../platform/ipc/workspaceFs";
import type { MessageKey } from "../../../ui/i18n/translate";
import { useT } from "../../../ui/i18n/useI18n";
import { Bubble } from "./Bubble";
import { useStickToBottomScroll } from "./useStickToBottomScroll";

type Props = {
  empty: boolean;
  messages: ChatMessage[];
  scroller: RefObject<HTMLDivElement | null>;
  /**
   * 递增时强制贴底并滚到底（发送 / 续跑 / 切换会话）。
   * 普通 messages 更新不会递增，故不会打断上翻阅读。
   */
  stickNonce?: number;
  busy?: boolean;
  /** 当前工作空间（用于空会话快捷方式文案）*/
  workspaceId?: string | null;
  /** 空会话快捷方式：发送预设提示词*/
  onShortcut?: (prompt: string) => void;
  /** 系统提示「缺 API key」时跳转到设置 → 模型*/
  onOpenModelSettings?: () => void;
  /** 打开控制台 Logs 并筛选该 trace*/
  onOpenTrace?: (traceId: string) => void;
  /** 在右侧 Files 面板打开工作空间文件*/
  onOpenFile?: (path: string) => void;
  /** 在右侧面板以预览方式打开计划文档*/
  onOpenPlan?: (plan: ChatPlan) => void;
  /** 打开右侧 Terminal*/
  onOpenTerminal?: (detail?: {
    sessionId?: string;
    previewOutput?: string;
    title?: string;
  }) => void;
  /** 时间线 delete_file「恢复」*/
  onRestoreDeletedFile?: (messageId: string, stepId: string) => void | Promise<void>;
  /** 手动停止后「继续」*/
  onResume?: () => void;
  canResume?: boolean;
  /** 正在原位编辑的用户消息 id*/
  editingUserId?: string | null;
  editDraft?: string;
  editInputRef?: RefObject<import("../composer/ComposerEditor").ComposerEditorHandle | null>;
  onBeginEditUserMessage?: (messageId: string) => void;
  onEditDraftChange?: (value: string) => void;
  onEditKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  onSendUserEdit?: () => void;
  /** 进行中或排队时原位编辑不能发送。 */
  sendBlocked?: boolean;
  /** 原位编辑中的统一资产（图片即附件，@file: 芯片展示）。 */
  editAttachments?: ChatAttachmentRef[];
  onAttachEditFiles?: (files: File[]) => void;
  onCancelUserEdit?: () => void;
  /** 当前会话 id（绑定子代理 Task tab）*/
  sessionId?: string | null;
};

/** 空会话快捷方式：文案键 + 发送用提示词键*/
type ShortcutItem = { labelKey: MessageKey; promptKey: MessageKey };

/** 工作空间已有文件时的项目向快捷方式*/
const PROJECT_SHORTCUTS: ShortcutItem[] = [
  {
    labelKey: "chat.shortcuts.listFiles",
    promptKey: "chat.shortcuts.listFilesPrompt",
  },
  {
    labelKey: "chat.shortcuts.projectOverview",
    promptKey: "chat.shortcuts.projectOverviewPrompt",
  },
  {
    labelKey: "chat.shortcuts.findConfig",
    promptKey: "chat.shortcuts.findConfigPrompt",
  },
];

/** 工作空间为空（或未选择）时的通用快捷方式*/
const EMPTY_WORKSPACE_SHORTCUTS: ShortcutItem[] = [
  {
    labelKey: "chat.shortcuts.emptyWhat",
    promptKey: "chat.shortcuts.emptyWhatPrompt",
  },
  {
    labelKey: "chat.shortcuts.emptyScaffold",
    promptKey: "chat.shortcuts.emptyScaffoldPrompt",
  },
  {
    labelKey: "chat.shortcuts.emptySample",
    promptKey: "chat.shortcuts.emptySamplePrompt",
  },
];

/**
 * memo：整条时间线是最重的子树，拖面板宽度之类的顶层 state 变化不该让它重渲染。
 * 前提是上层传进来的回调引用稳定（ChatShell 里用 useStableCallback 包过了）。
 */
export const ChatStage = memo(function ChatStage({
  empty,
  messages,
  scroller,
  stickNonce = 0,
  workspaceId = null,
  onShortcut,
  busy = false,
  onOpenModelSettings,
  onOpenTrace,
  onOpenFile,
  onOpenPlan,
  onOpenTerminal,
  onRestoreDeletedFile,
  onResume,
  canResume = false,
  editingUserId = null,
  editDraft = "",
  editInputRef,
  onBeginEditUserMessage,
  onEditDraftChange,
  onEditKeyDown,
  onSendUserEdit,
  sendBlocked = false,
  editAttachments = [],
  onAttachEditFiles,
  onCancelUserEdit,
  sessionId = null,
}: Props) {
  const t = useT();
  const { theme } = useDesignTheme();
  const glyphSrc = brandGlyphSrc(theme.colorScheme);
  /** true = 无文件 / 未选工作空间；探测完成前先按空处理，避免闪一下「了解项目」*/
  const [workspaceEmpty, setWorkspaceEmpty] = useState(true);
  const threadRef = useRef<HTMLOListElement | null>(null);
  const { showJump, jumpToLatest } = useStickToBottomScroll({
    scrollerRef: scroller,
    contentRef: threadRef,
    followKey: messages,
    stickNonce,
    enabled: !empty,
  });

  useEffect(() => {
    if (!workspaceId || !window.thinker?.workspaceFs) {
      setWorkspaceEmpty(true);
      return;
    }
    let cancelled = false;
    void workspaceTree(workspaceId)
      .then((tree) => {
        if (cancelled) return;
        setWorkspaceEmpty((tree.children?.length ?? 0) === 0);
      })
      .catch(() => {
        if (!cancelled) setWorkspaceEmpty(true);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const leadKey: MessageKey = workspaceEmpty ? "chat.welcomeLeadEmpty" : "chat.welcomeLead";
  const shortcuts = workspaceEmpty ? EMPTY_WORKSPACE_SHORTCUTS : PROJECT_SHORTCUTS;

  // 切换 / 刷新会话：绑定并恢复该会话下已打开的 Task tab
  useEffect(() => {
    bindSubagentSession(sessionId ?? null);
  }, [sessionId]);

  return (
    <div className="stage-shell">
      <main className="stage" ref={scroller}>
        {empty ? (
          <section className="chat-welcome" aria-label={t("chat.welcomeLabel")}>
            <img className="chat-welcome__mascot" src={glyphSrc} alt="" width={96} height={96} />
            <p className="chat-welcome__lead">{t(leadKey)}</p>
            <ul className="chat-welcome__shortcuts">
              {shortcuts.map((item) => (
                <li key={item.labelKey}>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy || !onShortcut}
                    onClick={() => onShortcut?.(t(item.promptKey))}
                  >
                    {t(item.labelKey)}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <ol className="thread" ref={threadRef}>
            {messages.map((m, i) => (
              <Bubble
                key={m.id}
                message={m}
                running={busy}
                trailing={i === messages.length - 1}
                onOpenModelSettings={onOpenModelSettings}
                onOpenTrace={onOpenTrace}
                onOpenFile={onOpenFile}
                onOpenPlan={onOpenPlan}
                onOpenTerminal={onOpenTerminal}
                onRestoreDeletedFile={
                  onRestoreDeletedFile ? (stepId) => onRestoreDeletedFile(m.id, stepId) : undefined
                }
                onResume={onResume}
                canResume={canResume}
                editing={m.role === "user" && m.id === editingUserId}
                editDraft={editDraft}
                editInputRef={editInputRef}
                onBeginEdit={onBeginEditUserMessage}
                onEditDraftChange={onEditDraftChange}
                onEditKeyDown={onEditKeyDown}
                onSendEdit={onSendUserEdit}
                sendBlocked={sendBlocked}
                editAttachments={editAttachments}
                onAttachEditFiles={onAttachEditFiles}
                onCancelEdit={onCancelUserEdit}
                sessionId={sessionId}
              />
            ))}
          </ol>
        )}
      </main>
      {showJump && !empty ? (
        <div className="stage-jump">
          <Button
            size="sm"
            variant="ghost"
            className="stage-jump__btn"
            endIcon={<ChevronRightIcon size="sm" className="stage-jump__chev" />}
            onClick={jumpToLatest}
          >
            {t("chat.jumpToLatest")}
          </Button>
        </div>
      ) : null}
    </div>
  );
});
