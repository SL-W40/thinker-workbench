/**
 * 应用根组件（编排壳）：标题栏 + 页面栈（聊天 / 组件 / 控制台）+ 首次引导闸门。
 *
 * - 启动时优先恢复 Electron session 快照中的页面栈与设置分区；否则从 URL hash 引导
 * - 辅助窗口（`getRoleSync().kind === "aux"`）固定单页、精简标题栏、不写主 session、不弹引导
 * - 聊天页始终挂载（`hidden` + 离屏保布局，避免 display:none 把滚动高度清零）；控制台按 `visited` 懒挂载以保活
 * - `?tool=1` 嵌入时隐藏产品 chrome
 * - 产品控制台 `#/tools`：Settings / Customize / Trace / Components（旧 `#/settings` 映射至此）
 * - hash 与 session 双向同步，便于重启后回到上次视图
 *
 * 启动导航见 ./app/boot，聊天页三栏见 ./app/ChatShell。
 */

import { activePlanOf, type ChatPlan } from "@thinker-workbench/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ComponentsPane } from "../features/catalog/ComponentsPane";
import { useChatPanels, useChatSession } from "../features/chat";
import { HitlHost } from "../features/hitl/HitlHost";
import { parseHash, writeHash } from "../features/nav/locationHash";
import { type PageId, usePageStack } from "../features/nav/usePageStack";
import { OnboardingGate } from "../features/onboarding/OnboardingGate";
import { AppPalette } from "../features/palette/AppPalette";
import type { SettingsSectionId } from "../features/settings/sections";
import { useAppShortcuts } from "../features/shortcuts/useAppShortcuts";
import { normalizeToolTabId, ToolsPane, type ToolTabId } from "../features/tools/ToolsPane";
import { TitleBar } from "../features/window/TitleBar";
import { OPEN_BROWSER_EVENT, onBrowserEvent } from "../platform/ipc/browser";
import { OPEN_SUBAGENT_EVENT, RESTORE_SUBAGENT_TABS_EVENT } from "../platform/ipc/subagent";
import { requestOpenTerminal } from "../platform/ipc/terminal";
import { bootstrapAppLog } from "../platform/logging";
import { useT } from "../ui/i18n/useI18n";
import { isDevToolEmbed, readBoot, readWindowRole } from "./boot";
import { ChatShell } from "./ChatShell";

bootstrapAppLog();

export function App() {
  const t = useT();
  const [role] = useState(() => readWindowRole());
  const [boot] = useState(() => readBoot(role));
  const [toolEmbed] = useState(() => isDevToolEmbed());
  const nav = usePageStack(boot.stack);
  const panels = useChatPanels();
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>(boot.section);
  const [toolsTab, setToolsTab] = useState<ToolTabId>(() => normalizeToolTabId(boot.toolsTab));
  const [toolsVisited, setToolsVisited] = useState<Set<ToolTabId>>(
    () => new Set([normalizeToolTabId(boot.toolsTab)]),
  );
  /** 命令面板是否展开（Mod+K 切换）。 */
  const [paletteOpen, setPaletteOpen] = useState(false);
  /** 聊天 diff 点文件名 → 右侧 inspector 打开该路径 */
  const [pendingOpenPath, setPendingOpenPath] = useState<string | null>(null);
  /** 从聊天跳转 Trace 时聚焦的会话 id */
  const [traceFocusSessionId, setTraceFocusSessionId] = useState<string | null>(null);
  /** 对话计划卡片 → 右侧 inspector 打开计划文档预览 */
  const [pendingOpenPlan, setPendingOpenPlan] = useState<ChatPlan | null>(null);
  const isAux = role.kind === "aux";
  const hideChrome = isAux || toolEmbed;

  const onComponents = nav.current === "components";
  const onTools = nav.current === "tools";
  const onChat = nav.current === "chat";
  const session = useChatSession(onChat);

  /** 会话活跃计划：执行中 update_plan 会改写它，供右侧面板实时同步。*/
  const activePlan = useMemo(() => activePlanOf(session.messages), [session.messages]);

  function openWorkspaceFile(path: string) {
    if (!path.trim()) return;
    panels.setRightOpen(true);
    setPendingOpenPath(path);
  }

  /** 打开计划文档预览：内容随会话持久化，不落用户工作空间。*/
  function openPlan(plan: ChatPlan) {
    panels.setRightOpen(true);
    setPendingOpenPlan(plan);
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
    // panels 每次渲染都是新对象（含随宽度变化的字段），整对象进 deps 会让这个 effect
    // 每渲染一次就解绑重绑 IPC 订阅；这里只依赖稳定的 setter
  }, [panels.setRightOpen]);

  /** 压入新页面（前进栈截断）。 */
  function go(page: PageId) {
    nav.push(page);
  }

  // 稳定引用：hashchange 等 effect 依赖它，避免每渲染重绑
  const selectToolsTab = useCallback((tab: ToolTabId) => {
    setToolsTab(tab);
    setToolsVisited((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, []);

  /** 打开控制台（可选指定 tab / 设置分区）。 */
  function openConsole(tab: ToolTabId = "settings", section?: SettingsSectionId) {
    if (section) setSettingsSection(section);
    selectToolsTab(tab);
    if (nav.current !== "tools") go("tools");
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

  // 主窗：将页面栈与设置分区持久化到主进程 session；辅助窗 / 工具嵌入跳过
  // snapshot 每帧都是新对象（usePageStack 不 memo），用内容键 stackKey 做依赖，避免每渲染重写
  const stackKey = JSON.stringify(nav.snapshot);
  // biome-ignore lint/correctness/useExhaustiveDependencies: snapshot 每帧新引用，依赖用 stackKey 做内容级判定
  useEffect(() => {
    if (isAux || toolEmbed) return;
    const page = nav.current;
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
      stack: { ...nav.snapshot },
    });
    // snapshot 对象每帧都会变；用 stackKey 稳定内容后再写入
  }, [settingsSection, toolsTab, nav.current, isAux, toolEmbed, stackKey]);

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
      // 命令面板：跨会话 / 文件 / 设置 / 命令的统一跳转
      palette: () => {
        if (isAux || toolEmbed) return false;
        setPaletteOpen((prev) => !prev);
        return true;
      },
    },
    !hideChrome,
  );

  return (
    <div
      className="app"
      data-view={nav.current}
      data-window={role.kind}
      data-tool-embed={toolEmbed ? "1" : undefined}
    >
      <div className="atmosphere" aria-hidden="true" />
      {!toolEmbed ? (
        <TitleBar
          role={role}
          current={nav.current}
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
          <ChatShell
            panels={panels}
            session={session}
            pageActive={onChat}
            pendingOpenPath={pendingOpenPath}
            onPendingOpenPathConsumed={() => setPendingOpenPath(null)}
            pendingOpenPlan={pendingOpenPlan}
            onPendingOpenPlanConsumed={() => setPendingOpenPlan(null)}
            activePlan={activePlan}
            onOpenPlan={openPlan}
            onOpenFile={openWorkspaceFile}
            onOpenTerminal={openTerminal}
            onOpenConsole={openConsole}
            onOpenTrace={openTrace}
            onOpenTraceForSession={openTraceForSession}
          />
        ) : null}
        {nav.visited.has("components") ? <ComponentsPane active={onComponents} /> : null}
        {nav.visited.has("tools") ? (
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
      {/* 命令面板（Mod+K）：跨会话 / 文件 / 设置 / 命令的统一跳转 */}
      {!hideChrome ? (
        <AppPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onNewChat={() => {
            if (nav.current !== "chat") nav.reset("chat");
            void session.newChat();
          }}
          onOpenSettings={(section) => openConsole("settings", section as SettingsSectionId)}
          onOpenTools={(tab) => openConsole(tab as ToolTabId)}
          onSelectSession={(sessionId, threadId) => {
            void session.selectSession(sessionId, threadId);
          }}
          onOpenFile={(workspaceId, path) => {
            if (workspaceId !== session.workspaceId) void session.selectWorkspace(workspaceId);
            openWorkspaceFile(path);
          }}
        />
      ) : null}
    </div>
  );
}
