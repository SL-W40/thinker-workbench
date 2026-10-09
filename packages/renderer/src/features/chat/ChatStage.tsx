/**
 * 聊天主舞台：空会话展示 IP 形象 + 引导文案 + 快捷方式；有消息时渲染可滚动气泡列表。
 * `scroller` 由 `useChatSession` 持有，用于新消息后滚到底部。
 */

import { Button } from "@thinker-workbench/design/react";
import type { ChatMessage } from "@thinker-workbench/shared";
import type { KeyboardEvent, RefObject } from "react";
import { Bubble } from "../../components/Bubble";
import { useT } from "../../i18n/I18nProvider";
import type { MessageKey } from "../../i18n/translate";

type Props = {
  empty: boolean;
  messages: ChatMessage[];
  scroller: RefObject<HTMLDivElement | null>;
  /** 空会话快捷方式：一键发送对应提示词。 */
  onShortcut?: (prompt: string) => void;
  /** 是否忙碌（禁用快捷方式）。 */
  busy?: boolean;
  /** 系统提示「缺 API key」时跳转到设置 → 模型。 */
  onOpenModelSettings?: () => void;
  /** 打开控制台 Logs 并筛选该 trace。 */
  onOpenTrace?: (traceId: string) => void;
  /** 在右侧 Files 面板打开工作空间文件。 */
  onOpenFile?: (path: string) => void;
  /** 时间线 delete_file「恢复」。 */
  onRestoreDeletedFile?: (messageId: string, stepId: string) => void | Promise<void>;
  /** 手动停止后「继续」。 */
  onResume?: () => void;
  canResume?: boolean;
  /** 正在原位编辑的用户消息 id。 */
  editingUserId?: string | null;
  editDraft?: string;
  editInputRef?: RefObject<HTMLTextAreaElement | null>;
  onBeginEditUserMessage?: (messageId: string) => void;
  onEditDraftChange?: (value: string) => void;
  onEditKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSendUserEdit?: () => void;
  onCancelUserEdit?: () => void;
};

/** 空会话快捷方式：文案键 + 发送用提示词键。 */
const SHORTCUTS: Array<{ labelKey: MessageKey; promptKey: MessageKey }> = [
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

export function ChatStage({
  empty,
  messages,
  scroller,
  onShortcut,
  busy = false,
  onOpenModelSettings,
  onOpenTrace,
  onOpenFile,
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
}: Props) {
  const t = useT();

  return (
    <main className="stage" ref={scroller}>
      {empty ? (
        <section className="chat-welcome" aria-label={t("chat.welcomeLabel")}>
          <img
            className="chat-welcome__mascot"
            src="./brand/logo-glyph.png"
            alt=""
            width={96}
            height={96}
          />
          <p className="chat-welcome__lead">{t("chat.welcomeLead")}</p>
          <ul className="chat-welcome__shortcuts">
            {SHORTCUTS.map((item) => (
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
        <ol className="thread">
          {messages.map((m) => (
            <Bubble
              key={m.id}
              message={m}
              running={busy}
              onOpenModelSettings={onOpenModelSettings}
              onOpenTrace={onOpenTrace}
              onOpenFile={onOpenFile}
              onRestoreDeletedFile={
                onRestoreDeletedFile
                  ? (stepId) => onRestoreDeletedFile(m.id, stepId)
                  : undefined
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
            />
          ))}
        </ol>
      )}
    </main>
  );
}
