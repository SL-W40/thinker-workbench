/**
 * 聊天页三栏外壳：左侧工作区 / 中间舞台 + Composer / 右侧检视器。
 * 聊天页常驻挂载（hidden + inert 保布局），故本组件始终渲染。
 */
import type { ChatPlan } from "@thinker-workbench/shared";
import type { useChatPanels, useChatSession } from "../features/chat";
import {
  ChatSidePanel,
  ChatStage,
  Composer,
  MentionChipPreview,
  WorkspaceSidebar,
} from "../features/chat";
import { RightInspector } from "../features/inspector/RightInspector";
import type { SettingsSectionId } from "../features/settings/sections";
import type { ToolTabId } from "../features/tools/ToolsPane";
import { useStableCallback } from "../ui/hooks/useStableCallback";
import { useT } from "../ui/i18n/useI18n";

type Props = {
  panels: ReturnType<typeof useChatPanels>;
  session: ReturnType<typeof useChatSession>;
  pageActive: boolean;
  pendingOpenPath: string | null;
  onPendingOpenPathConsumed: () => void;
  pendingOpenPlan: ChatPlan | null;
  onPendingOpenPlanConsumed: () => void;
  activePlan: ChatPlan | null;
  onOpenPlan: (plan: ChatPlan) => void;
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
  pendingOpenPlan,
  onPendingOpenPlanConsumed,
  activePlan,
  onOpenPlan,
  onOpenFile,
  onOpenTerminal,
  onOpenConsole,
  onOpenTrace,
  onOpenTraceForSession,
}: Props) {
  const t = useT();
  // 引用必须稳定：ChatSidePanel 是 memo 的，起手回调每次新建会让它白 memo
  const beginLeftResize = useStableCallback(() => panels.beginResize("left"));
  const beginRightResize = useStableCallback(() => panels.beginResize("right"));

  // 下面这些回调原本是直接写在 JSX 里的箭头函数，每次渲染都是新引用。
  // 三栏子组件（ChatStage / Composer / RightInspector）都包了 memo，回调不稳定会让 memo 全部失效，
  // 于是拖面板宽度这类顶层 state 变化会把整条时间线、编辑器、文件树全部重渲染一遍。
  const onStageShortcut = useStableCallback((prompt: string) => {
    void session.send(prompt);
  });
  const onOpenModelSettings = useStableCallback(() => onOpenConsole("settings", "model"));
  const onRestoreDeletedFile = useStableCallback((messageId: string, stepId: string) => {
    void session.restoreDeletedFile(messageId, stepId);
  });
  const onResume = useStableCallback(() => void session.resume());
  const onAttachEditFiles = useStableCallback((files: File[]) => {
    void session.attachEditFiles(files);
  });
  const onAttachFiles = useStableCallback((files: File[]) => {
    void session.attachFiles(files);
  });
  const onSend = useStableCallback(() => void session.send());
  const onCancel = useStableCallback(() => session.cancel());
  const onSelectSession = useStableCallback((sessionId: string, threadId: string) => {
    void session.selectSession(sessionId, threadId);
  });
  const onSelectWorkspace = useStableCallback((workspaceId: string) => {
    void session.selectWorkspace(workspaceId);
  });
  const onSessionCreated = useStableCallback((sessionId: string, threadId: string) => {
    void session.activateNewSession(sessionId, threadId);
  });
  const onSendPrompt = useStableCallback((prompt: string) => {
    void session.send(prompt);
  });

  return (
    <div
      className="chat-shell"
      ref={panels.shellRef}
      style={panels.shellVars}
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
        onWidthPreview={(width) => panels.previewWidth("left", width)}
        onWidthCommit={panels.setLeftWidth}
        onResizeStart={beginLeftResize}
        onResizeEnd={panels.endResize}
      >
        <WorkspaceSidebar
          activeSessionId={session.sessionId}
          busy={session.busy}
          onSelectSession={onSelectSession}
          onSelectWorkspace={onSelectWorkspace}
          onSessionCreated={onSessionCreated}
          onOpenTrace={onOpenTraceForSession}
        />
      </ChatSidePanel>
      {/* 量到壳宽前吃剩余宽度；之后由 --chat-main-width 钉死（拖拽期只改变量，不重渲染） */}
      <div className={panels.mainWidth > 0 ? "chat-main chat-main--fitted" : "chat-main"}>
        <ChatStage
          empty={session.empty}
          messages={session.messages}
          scroller={session.scroller}
          stickNonce={session.stickNonce}
          busy={session.busy}
          sessionId={session.sessionId}
          workspaceId={session.workspaceId}
          onShortcut={onStageShortcut}
          onOpenModelSettings={onOpenModelSettings}
          onOpenTrace={onOpenTrace}
          onOpenFile={onOpenFile}
          onOpenPlan={onOpenPlan}
          onOpenTerminal={onOpenTerminal}
          onRestoreDeletedFile={onRestoreDeletedFile}
          onResume={onResume}
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
          onAttachEditFiles={onAttachEditFiles}
          onCancelUserEdit={session.cancelUserEdit}
        />
        <Composer
          draft={session.draft}
          onAttachFiles={onAttachFiles}
          attachments={session.draftAttachments}
          busy={session.busy}
          queued={session.queued}
          inputRef={session.inputRef}
          onDraftChange={session.setDraft}
          onKeyDown={session.onKeyDown}
          onSend={onSend}
          onCancel={onCancel}
          workspaceName={session.workspaceName}
          workspaceRoot={session.workspaceRoot}
          workspaceId={session.workspaceId}
          sessionId={session.sessionId}
          threadId={session.threadId}
          messages={session.messages}
          todos={session.todos}
          onClearCompletedTodos={session.clearCompletedTodos}
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
        onWidthPreview={(width) => panels.previewWidth("right", width)}
        onWidthCommit={panels.setRightWidth}
        onResizeStart={beginRightResize}
        onResizeEnd={panels.endResize}
      >
        <RightInspector
          workspaceId={session.workspaceId}
          pageActive={pageActive}
          onSendPrompt={onSendPrompt}
          pendingOpenPath={pendingOpenPath}
          onPendingOpenPathConsumed={onPendingOpenPathConsumed}
          pendingOpenPlan={pendingOpenPlan}
          onPendingOpenPlanConsumed={onPendingOpenPlanConsumed}
          activePlan={activePlan}
          busy={session.busy}
        />
      </ChatSidePanel>
    </div>
  );
}
