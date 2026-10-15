/**
 * 应用根组件：标题栏 + 页面栈（聊天 / 组件 / 控制台）+ 首次引导闸门。
 *
 * - 启动时优先恢复 Electron session 快照中的页面栈与设置分区；否则从 URL hash 引导
 * - 辅助窗口（`getRoleSync().kind === "aux"`）固定单页、精简标题栏、不写主 session、不弹引导
 * - 聊天页始终挂载（`hidden` + 离屏保布局，避免 display:none 把滚动高度清零）；控制台按 `visited` 懒挂载以保活
 * - `?tool=1` 嵌入时隐藏产品 chrome
 * - 产品控制台 `#/tools`：Settings / Customize / Trace / Components（旧 `#/settings` 映射至此）
 * - hash 与 session 双向同步，便于重启后回到上次视图
 */

import type { PageStackSnapshot, WindowRole } from "@thinker-workbench/shared";
import { useEffect, useState } from "react";
import { OPEN_BROWSER_EVENT, onBrowserEvent } from "./bridge/browser";
import { OPEN_SUBAGENT_EVENT, RESTORE_SUBAGENT_TABS_EVENT } from "./bridge/subagent";
import { requestOpenTerminal } from "./bridge/terminal";
import { ChatSidePanel } from "./features/chat/ChatSidePanel";
import { ChatStage } from "./features/chat/ChatStage";
import { Composer } from "./features/chat/Composer";
import { useChatPanels } from "./features/chat/useChatPanels";
import { useChatSession } from "./features/chat/useChatSession";
import { WorkspaceSidebar } from "./features/chat/WorkspaceSidebar";
import { ComponentsPane } from "./features/components/ComponentsPane";
import { HitlHost } from "./features/hitl/HitlHost";
import { RightInspector } from "./features/inspector/RightInspector";
import { ensureHash, parseHash, writeHash } from "./features/nav/locationHash";
import { type PageId, usePageStack } from "./features/nav/usePageStack";
import { OnboardingGate } from "./features/onboarding/OnboardingGate";
import { normalizeSettingsSection, type SettingsSectionId } from "./features/settings/sections";
import { useAppShortcuts } from "./features/shortcuts/useAppShortcuts";
import { ToolsPane, type ToolTabId } from "./features/tools/ToolsPane";
import { TitleBar } from "./features/window/TitleBar";
import { useT } from "./i18n/useI18n";
import { bootstrapAppLog } from "./log/sessionLog";

bootstrapAppLog();

/** 同步读取本窗口角色；浏览器预览视为主窗。 */
function readWindowRole(): WindowRole {
  return window.thinker?.window?.getRoleSync?.() ?? { kind: "main" };
}

/** 工具嵌入（`?tool=1`）隐藏产品标题栏，避免双层 chrome。 */
function isDevToolEmbed(): boolean {
  return new URLSearchParams(location.search).get("tool") === "1";
}

/** 将旧 `settings` 页规范为控制台 `tools`。 */
function normalizePage(page: PageId): PageId {
  return page === "settings" ? "tools" : page;
}

/**
 * 读取启动导航状态：辅助窗固定单页；主窗 session 快照优先，否则用规范化后的 hash。
 */
function readBoot(role: WindowRole): {
  stack: PageStackSnapshot;
  section: SettingsSectionId;
  toolsTab: ToolTabId;
} {
  const fromHash = ensureHash();
  if (role.kind === "aux") {
    const page = normalizePage(role.page as PageId);
    return {
      stack: {
        entries: [page],
        index: 0,
        visited: [page],
      },
      section: fromHash.section,
      toolsTab: fromHash.tab,
    };
  }
  const saved = window.thinker?.session?.getSnapshot?.() ?? null;
  if (saved?.stack?.entries?.length) {
    // 优先用 session 里的 hash 恢复控制台 tab / 设置分区（勿只用 location，HMR 时可能不准）
    const fromSaved = saved.hash ? parseHash(saved.hash) : fromHash;
    const section = normalizeSettingsSection(
      saved.settingsSection ?? fromSaved.section ?? fromHash.section,
    );
    const entries = saved.stack.entries.map((p) => normalizePage(p as PageId)) as PageId[];
    const visited = (saved.stack.visited ?? entries).map((p) =>
      normalizePage(p as PageId),
    ) as PageId[];
    const current = normalizePage(
      (entries[saved.stack.index] ?? fromSaved.page ?? fromHash.page) as PageId,
    );
    const onTools = current === "tools" || current === "settings";
    return {
      stack: {
        ...saved.stack,
        entries,
        visited,
      },
      section,
      toolsTab: onTools ? fromSaved.tab : "settings",
    };
  }
  return {
    stack: {
      entries: [fromHash.page],
      index: 0,
      visited: [fromHash.page],
    },
    section: fromHash.section,
    toolsTab: fromHash.tab,
  };
}

export function App() {
  const t = useT();
  const [role] = useState(() => readWindowRole());
  const [boot] = useState(() => readBoot(role));
  const [toolEmbed] = useState(() => isDevToolEmbed());
  const nav = usePageStack(boot.stack);
  const panels = useChatPanels();
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>(boot.section);
  const [toolsTab, setToolsTab] = useState<ToolTabId>(boot.toolsTab);
  const [toolsVisited, setToolsVisited] = useState<Set<ToolTabId>>(() => new Set([boot.toolsTab]));
  /** 聊天 diff 点文件名 → 右侧 inspector 打开该路径 */
  const [pendingOpenPath, setPendingOpenPath] = useState<string | null>(null);
  /** 从聊天跳转 Trace 时聚焦的会话 id */
  const [traceFocusSessionId, setTraceFocusSessionId] = useState<string | null>(null);
  const isAux = role.kind === "aux";
  const hideChrome = isAux || toolEmbed;

  const onComponents = nav.current === "components";
  const onTools = nav.current === "tools" || nav.current === "settings";
  const onChat = nav.current === "chat";
  const session = useChatSession(onChat);

  function openWorkspaceFile(path: string) {
    if (!path.trim()) return;
    panels.setRightOpen(true);
    setPendingOpenPath(path);
  }

  function openTerminal(detail?: { sessionId?: string; previewOutput?: string; title?: string }) {
    panels.setRightOpen(true);
    requestOpenTerminal(detail);
  }

  // Markdown / 主进程导航 / agent / 子代理：打开右侧栏
  useEffect(() => {
    function onOpen() {
      panels.setRightOpen(true);
    }
    function onRestore(e: Event) {
      const detail = (e as CustomEvent<{ activeTaskId?: string | null }>).detail;
      // 刷新前正在看 Task tab → 保持右侧栏打开
      if (detail?.activeTaskId) panels.setRightOpen(true);
    }
    window.addEventListener(OPEN_BROWSER_EVENT, onOpen);
    window.addEventListener(OPEN_SUBAGENT_EVENT, onOpen);
    window.addEventListener(RESTORE_SUBAGENT_TABS_EVENT, onRestore);
    const off = onBrowserEvent((event) => {
      if (event.type === "reveal") panels.setRightOpen(true);
    });
    return () => {
      window.removeEventListener(OPEN_BROWSER_EVENT, onOpen);
      window.removeEventListener(OPEN_SUBAGENT_EVENT, onOpen);
      window.removeEventListener(RESTORE_SUBAGENT_TABS_EVENT, onRestore);
      off();
    };
  }, [panels]);

  /** 压入新页面（前进栈截断）。 */
  function go(page: PageId) {
    nav.push(normalizePage(page));
  }

  function selectToolsTab(tab: ToolTabId) {
    setToolsTab(tab);
    setToolsVisited((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }

  /** 打开控制台（可选指定 tab / 设置分区）。 */
  function openConsole(tab: ToolTabId = "settings", section?: SettingsSectionId) {
    if (section) setSettingsSection(section);
    selectToolsTab(tab);
    if (nav.current !== "tools" && nav.current !== "settings") go("tools");
  }

  /** 打开控制台 Trace，聚焦当前聊天会话（气泡上的 traceId 仅作提示，列表键是 sessionId）。 */
  function openTrace(_traceId?: string) {
    const sid = session.sessionId?.trim();
    if (sid) setTraceFocusSessionId(sid);
    openConsole("logs");
  }

  /** 侧栏右键：打开 Trace 并聚焦指定会话。 */
  function openTraceForSession(sessionId: string) {
    const sid = sessionId.trim();
    if (sid) setTraceFocusSessionId(sid);
    openConsole("logs");
  }

  // 辅助窗把 document.title 写成「Thinker Workbench - Console」等
  useEffect(() => {
    if (role.kind !== "aux") return;
    document.title = t("nav.auxWindowTitle", { page: t("nav.tools") });
  }, [role, t]);

  // 当前页 / 设置分区 / 控制台 tab 变化时写回 hash（replace，不堆浏览器历史）
  useEffect(() => {
    writeHash(nav.current, settingsSection, toolsTab);
  }, [nav.current, settingsSection, toolsTab]);

  const _stackKey = JSON.stringify(nav.snapshot);
  // 主窗：将页面栈与设置分区持久化到主进程 session；辅助窗 / 工具嵌入跳过
  useEffect(() => {
    if (isAux || toolEmbed) return;
    const page = normalizePage(nav.current);
    window.thinker?.session?.setSnapshot?.({
      hash:
        page === "tools"
          ? toolsTab === "settings"
            ? `#/tools/settings/${settingsSection}`
            : `#/tools/${toolsTab}`
          : page === "chat"
            ? "#/chat"
            : `#/${page}`,
      settingsSection,
      stack: {
        ...nav.snapshot,
        entries: nav.snapshot.entries.map((p) => normalizePage(p as PageId)),
        visited: nav.snapshot.visited.map((p) => normalizePage(p as PageId)),
      },
    });
    // snapshot 对象每帧都会变；用 stackKey 稳定内容后再写入
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsSection, toolsTab, nav.current, isAux, toolEmbed, nav.snapshot]);

  // 响应浏览器/外部改 hash：替换当前栈顶页，并同步设置分区与控制台 tab
  useEffect(() => {
    if (toolEmbed) return;
    const onHash = () => {
      const loc = parseHash();
      if (!isAux) nav.replaceCurrent(loc.page);
      setSettingsSection(loc.section);
      selectToolsTab(loc.tab);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
    // replaceCurrent 闭包依赖稳定；勿把 nav 整对象塞进 deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAux, toolEmbed, selectToolsTab, nav.replaceCurrent]);

  /** 打开聊天页并聚焦输入框。 */
  function focusComposer() {
    if (!onChat) nav.reset("chat");
    // reset 为异步 setState：下一 macrotask 再 focus，避免仍 inert/hidden
    window.setTimeout(() => {
      session.inputRef.current?.focus();
    }, 0);
  }

  // 主窗产品快捷键（辅助窗 / 工具嵌入不注册）
  useAppShortcuts(
    {
      newChat: () => {
        if (!onChat) nav.reset("chat");
        void session.newChat();
      },
      focusComposer,
      stopRun: () => {
        if (!session.busy && !session.queued) return false;
        session.cancel();
        return true;
      },
      toggleLeftPanel: panels.toggleLeft,
      toggleRightPanel: panels.toggleRight,
      openConsole: () => {
        if (onTools) nav.reset("chat");
        else openConsole(toolsTab);
      },
      goChat: () => nav.reset("chat"),
      navBack: () => {
        if (nav.canBack) nav.back();
      },
      navForward: () => {
        if (nav.canForward) nav.forward();
      },
    },
    !hideChrome,
  );

  return (
    <div
      className="app"
      data-view={normalizePage(nav.current)}
      data-window={role.kind}
      data-tool-embed={toolEmbed ? "1" : undefined}
    >
      <div className="atmosphere" aria-hidden="true" />
      {!toolEmbed ? (
        <TitleBar
          role={role}
          current={normalizePage(nav.current)}
          leftPanelOpen={panels.leftOpen}
          rightPanelOpen={panels.rightOpen}
          onGoHome={() => nav.reset("chat")}
          onToggleLeftPanel={panels.toggleLeft}
          onToggleRightPanel={panels.toggleRight}
          toolsTab={toolsTab}
          onToolsTabChange={(tab) => openConsole(tab)}
        />
      ) : null}
      <main className="app-body">
        {!hideChrome ? (
          <div
            className="chat-shell"
            ref={panels.shellRef}
            hidden={!onChat}
            inert={!onChat || undefined}
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
                onOpenTrace={openTraceForSession}
              />
            </ChatSidePanel>
            <div
              className="chat-main"
              style={
                panels.mainWidth > 0 ? { flex: `0 0 ${panels.mainWidth}px` } : undefined
              }
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
                onOpenModelSettings={() => openConsole("settings", "model")}
                onOpenTrace={openTrace}
                onOpenFile={openWorkspaceFile}
                onOpenTerminal={openTerminal}
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
                onCancelUserEdit={session.cancelUserEdit}
              />
              <Composer
                draft={session.draft}
                draftImages={session.draftImages}
                onAttachImages={(files) => void session.attachImageFiles(files)}
                onRemoveImage={session.removeDraftImage}
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
                onOpenTerminal={openTerminal}
              />
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
                onSendPrompt={(prompt) => void session.send(prompt)}
                pendingOpenPath={pendingOpenPath}
                onPendingOpenPathConsumed={() => setPendingOpenPath(null)}
              />
            </ChatSidePanel>
          </div>
        ) : null}
        {nav.visited.has("components") ? <ComponentsPane active={onComponents} /> : null}
        {nav.visited.has("tools") || nav.visited.has("settings") ? (
          <ToolsPane
            active={onTools}
            tab={toolsTab}
            visited={toolsVisited}
            settingsSection={settingsSection}
            onSettingsSectionChange={setSettingsSection}
            focusSessionId={traceFocusSessionId}
          />
        ) : null}
      </main>
      {!hideChrome ? <OnboardingGate /> : null}
      {!hideChrome ? <HitlHost /> : null}
    </div>
  );
}
