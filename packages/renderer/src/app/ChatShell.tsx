/**
 * 聊天页三栏外壳：左侧工作区 / 中间舞台 + Composer / 右侧检视器。
 * 聊天页常驻挂载（hidden + inert 保布局），故本组件始终渲染。
 */
import { ChatSidePanel } from "../features/chat/ChatSidePanel";
import { ChatStage } from "../features/chat/ChatStage";
import { Composer } from "../features/chat/Composer";
import { MentionChipPreview } from "../features/chat/MentionChipPreview";
import type { useChatPanels } from "../features/chat/useChatPanels";
import type { useChatSession } from "../features/chat/useChatSession";
import { WorkspaceSidebar } from "../features/chat/WorkspaceSidebar";
import { RightInspector } from "../features/inspector/RightInspector";
import type { SettingsSectionId } from "../features/settings/sections";
import type { ToolTabId } from "../features/tools/ToolsPane";
import { useT } from "../i18n/useI18n";

type Props = {
  panels: ReturnType<typeof useChatPanels>;
  session: ReturnType<typeof useChatSession>;
  pageActive: boolean;
  pendingOpenPath: string | null;
  onPendingOpenPathConsumed: () => void;
  onOpenFile: (path: string) => void;
  onOpenTerminal: (detail?: { sessionId?: string; previewOutput?: string; title?: string }) => void;
  onOpenConsole: (tab: ToolTabId, section?: SettingsSectionId) => void;
  onOpenTrace: () => void;
  onOpenTraceForSession: (sessionId: string) => void;
};

export function ChatShell({
  panels,
  session,
  pageActive,
  pendingOpenPath,
  onPendingOpenPathConsumed,
  onOpenFile,
  onOpenTerminal,
  onOpenConsole,
  onOpenTrace,
  onOpenTraceForSession,
}: Props) {
  const t = useT();

  return (
    <div
      className="chat-shell"
      ref={panels.shellRef}
      hidden={!pageActive}
      inert={!pageActive || undefined}
    >
      <ChatSidePanel
        side="left"
        open={panels.leftOpen}
        width={panels.leftWidth}
        minWidth={panels.minWidth}
        maxWidth={panels.maxLeftWidth}
        title={t("chat.leftPanel")}
        showHead={false}
        onWidthChange={panels.setLeftWidth}
      >
        <WorkspaceSidebar
          activeSessionId={session.sessionId}
          busy={session.busy}
          onSelectSession={(sessionId, threadId) => {
            void session.selectSession(sessionId, threadId);
          }}
          onSelectWorkspace={(workspaceId) => {
            void session.selectWorkspace(workspaceId);
          }}
          onSessionCreated={(sessionId, threadId) => {
            void session.activateNewSession(sessionId, threadId);
          }}
          onOpenTrace={onOpenTraceForSession}
        />
      </ChatSidePanel>
      <div
        className="chat-main"
        style={panels.mainWidth > 0 ? { flex: `0 0 ${panels.mainWidth}px` } : undefined}
      >
        <ChatStage
          empty={session.empty}
          messages={session.messages}
          scroller={session.scroller}
          stickNonce={session.stickNonce}
          busy={session.busy}
          sessionId={session.sessionId}
          workspaceId={session.workspaceId}
          onShortcut={(prompt) => void session.send(prompt)}
          onOpenModelSettings={() => onOpenConsole("settings", "model")}
          onOpenTrace={onOpenTrace}
          onOpenFile={onOpenFile}
          onOpenTerminal={onOpenTerminal}
          onRestoreDeletedFile={(messageId, stepId) =>
            void session.restoreDeletedFile(messageId, stepId)
          }
          onResume={() => void session.resume()}
          canResume={session.canResume && !session.busy}
          editingUserId={session.editingUserId}
          editDraft={session.editDraft}
          editInputRef={session.editInputRef}
          onBeginEditUserMessage={session.beginEditUserMessage}
          onEditDraftChange={session.setEditDraft}
          onEditKeyDown={session.onEditKeyDown}
          onSendUserEdit={session.sendUserEdit}
          sendBlocked={session.busy || session.queued}
          editAttachments={session.editAttachments}
          onAttachEditFiles={(files) => void session.attachEditFiles(files)}
          onCancelUserEdit={session.cancelUserEdit}
        />
        <Composer
          draft={session.draft}
          onAttachFiles={(files) => void session.attachFiles(files)}
          attachments={session.draftAttachments}
          busy={session.busy}
          queued={session.queued}
          inputRef={session.inputRef}
          onDraftChange={session.setDraft}
          onKeyDown={session.onKeyDown}
          onSend={() => void session.send()}
          onCancel={() => session.cancel()}
          workspaceName={session.workspaceName}
          workspaceRoot={session.workspaceRoot}
          workspaceId={session.workspaceId}
          sessionId={session.sessionId}
          threadId={session.threadId}
          messages={session.messages}
          gateMessage={session.workspaceGate?.message ?? null}
          onOpenWorkspace={
            session.workspaceGate?.kind === "no-workspace"
              ? () => void session.openWorkspaceFromGate()
              : undefined
          }
          onOpenTerminal={onOpenTerminal}
        />
        <MentionChipPreview workspaceId={session.workspaceId} onOpenFile={onOpenFile} />
      </div>
      <ChatSidePanel
        side="right"
        open={panels.rightOpen}
        width={panels.rightWidth}
        minWidth={panels.minRightWidth}
        maxWidth={panels.maxRightWidth}
        title={t("chat.rightPanel")}
        showHead={false}
        onWidthChange={panels.setRightWidth}
      >
        <RightInspector
          workspaceId={session.workspaceId}
          pageActive={pageActive}
          onSendPrompt={(prompt) => void session.send(prompt)}
          pendingOpenPath={pendingOpenPath}
          onPendingOpenPathConsumed={onPendingOpenPathConsumed}
        />
      </ChatSidePanel>
    </div>
  );
}
