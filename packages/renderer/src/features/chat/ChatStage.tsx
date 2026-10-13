/**
 * 聊天主舞台：空会话展示品牌字标 + 引导文案 + 快捷方式；有消息时渲染可滚动气泡列表。
 * 滚动策略（贴底跟随）：
 * - 靠近底部时内容增高才自动跟上
 * - 用户上翻 / 划词时绝不抢滚动
 * - 父级 `stickNonce` 递增（发送、切会话）时强制贴底
 */

import { Button, ChevronRightIcon, useDesignTheme } from "@thinker-workbench/design/react";
import type { ChatMessage } from "@thinker-workbench/shared";
import {
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { brandGlyphSrc } from "../../brand/logo";
import { bindSubagentSession } from "../../bridge/subagent";
import { workspaceTree } from "../../bridge/workspaceFs";
import { Bubble } from "../../components/Bubble";
import type { MessageKey } from "../../i18n/translate";
import { useT } from "../../i18n/useI18n";
import { isNearBottom, scrollElementToBottom, scrollToBottomIfStuck } from "./chatStickScroll";

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
  editInputRef?: RefObject<import("./ComposerEditor").ComposerEditorHandle | null>;
  onBeginEditUserMessage?: (messageId: string) => void;
  onEditDraftChange?: (value: string) => void;
  onEditKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  onSendUserEdit?: () => void;
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

export function ChatStage({
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
  onCancelUserEdit,
  sessionId = null,
}: Props) {
  const t = useT();
  const { theme } = useDesignTheme();
  const glyphSrc = brandGlyphSrc(theme.colorScheme);
  /** true = 无文件 / 未选工作空间；探测完成前先按空处理，避免闪一下「了解项目」*/
  const [workspaceEmpty, setWorkspaceEmpty] = useState(true);
  /** 是否贴底跟随（用户上翻后为 false）*/
  const stuckRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const lastStickNonce = useRef(stickNonce);
  const threadRef = useRef<HTMLOListElement | null>(null);

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

  /** 用户滚动 → 更新贴底状态*/
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      const near = isNearBottom(el);
      stuckRef.current = near;
      setShowJump(!near);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [scroller]);

  /**
   * 强制贴底：stickNonce 递增（发送 / 切会话 / 续跑）。
   * layout 阶段执行，避免首帧闪在旧位置。
   */
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || empty) return;
    if (lastStickNonce.current !== stickNonce) {
      lastStickNonce.current = stickNonce;
      stuckRef.current = true;
      setShowJump(false);
      scrollElementToBottom(el, "auto");
      return;
    }
    scrollToBottomIfStuck(el, stuckRef.current, "auto");
  }, [empty, scroller, stickNonce]);

  /** 气泡内增高（思考展开、markdown）：贴底则跟上，否则显示「回到最新」*/
  useEffect(() => {
    const el = scroller.current;
    const thread = threadRef.current;
    if (!el || !thread) return;
    const ro = new ResizeObserver(() => {
      if (stuckRef.current) {
        scrollToBottomIfStuck(el, true, "auto");
      } else {
        setShowJump(true);
      }
    });
    ro.observe(thread);
    return () => ro.disconnect();
  }, [scroller]);

  function jumpToLatest() {
    const el = scroller.current;
    if (!el) return;
    stuckRef.current = true;
    setShowJump(false);
    scrollElementToBottom(el, "smooth");
  }

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
            {messages.map((m) => (
              <Bubble
                key={m.id}
                message={m}
                running={busy}
                onOpenModelSettings={onOpenModelSettings}
                onOpenTrace={onOpenTrace}
                onOpenFile={onOpenFile}
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
}
