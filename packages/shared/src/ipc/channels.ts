/**
 * Electron IPC 通道名常量。
 * renderer ↔ main（及必要时 main ↔ utility）共用这些字面量；改名需三端同步。
 */

/** 全部 IPC channel 名；值为实际 `ipcMain` / `ipcRenderer` 通道字符串。 */
export const IpcChannels = {
  /** 发起一次 agent 运行。 */
  agentRun: "agent:run",
  /** 取消指定（或当前）运行。 */
  agentCancel: "agent:cancel",
  /** 从中断点恢复运行。 */
  agentResume: "agent:resume",
  /** 估算当前会话上下文占用（与 assembleContext 同源）。 */
  contextUsage: "agent:contextUsage",
  /** 列出已知线程。 */
  agentListThreads: "agent:listThreads",
  /** 主进程向 renderer 推送 AgentEvent。 */
  agentEvent: "agent:event",
  /** 主进程向 renderer 推送跨进程 LogRecord（app/desktop/agent）。 */
  logEvent: "log:event",
  /** renderer 上报一条 LogRecord，由主进程写入 app.log。 */
  logRecord: "log:record",
  /** 读取模型设置（返回公开视图）。 */
  settingsGetModel: "settings:getModel",
  /** 写入模型设置补丁。 */
  settingsSetModel: "settings:setModel",
  /** 读取快捷键映射。 */
  settingsGetShortcuts: "settings:getShortcuts",
  /** 写入快捷键映射补丁。 */
  settingsSetShortcuts: "settings:setShortcuts",
  /** 渲染进程通知主进程是否正在录制快捷键（fire-and-forget）。 */
  settingsShortcutRecording: "settings:shortcutRecording",
  /** 异步读取通用设置。 */
  settingsGetGeneral: "settings:getGeneral",
  /** 同步读取通用设置（sendSync，供启动闪屏 / 首帧绘制）。 */
  settingsGetGeneralSync: "settings:getGeneralSync",
  /** 写入通用设置补丁。 */
  settingsSetGeneral: "settings:setGeneral",
  /** 主进程向其它窗口推送已保存的通用设置（主题 / 语言等跨窗同步）。 */
  settingsGeneralChanged: "settings:generalChanged",
  /** 预览系统通知或完成提示音。 */
  settingsPreviewAttention: "settings:previewAttention",
  /** 选择目录（数据 / 日志路径）。 */
  settingsPickDirectory: "settings:pickDirectory",
  /** 另存为文本文件（系统保存对话框 + 写入）。 */
  settingsSaveTextFile: "settings:saveTextFile",
  /** 预览数据目录变更（校验、列出迁移项、检查运行中会话）。 */
  settingsPreviewDataDirChange: "settings:previewDataDirChange",
  /** 应用数据目录变更（可选迁移历史数据）。 */
  settingsApplyDataDirChange: "settings:applyDataDirChange",
  /** 主进程推送数据目录迁移进度。 */
  settingsDataDirMigrateProgress: "settings:dataDirMigrateProgress",
  /** 读取 UI 会话快照。 */
  sessionGet: "session:get",
  /** 写入 UI 会话快照。 */
  sessionSet: "session:set",
  /** 最小化窗口。 */
  windowMinimize: "window:minimize",
  /** 最大化 / 还原窗口。 */
  windowMaximize: "window:maximize",
  /** 关闭窗口。 */
  windowClose: "window:close",
  /** 查询当前是否最大化。 */
  windowIsMaximized: "window:isMaximized",
  /** 主进程推送最大化状态变化。 */
  windowMaximized: "window:maximized",
  /** 打开或聚焦产品工具窗（Logs / Components）。 */
  windowToggleDevTools: "window:toggleDevTools",
  /** 打开或聚焦某页的辅助窗口（不存在则创建）。 */
  windowOpenOrFocusPage: "window:openOrFocusPage",
  /** 若该页辅助窗口已打开则聚焦，返回是否已聚焦。 */
  windowFocusPageIfOpen: "window:focusPageIfOpen",
  /** 聚焦主窗口。 */
  windowFocusMain: "window:focusMain",
  /** 同步读取当前窗口角色（main / aux）。 */
  windowGetRoleSync: "window:getRoleSync",
  /** 日志目录与文件列表。 */
  toolsLogsMeta: "tools:logsMeta",
  /** 近期 trace 摘要。 */
  toolsLogsTraces: "tools:logsTraces",
  /** 日志记录查询。 */
  toolsLogsQuery: "tools:logsQuery",
  /** 列出工作空间。 */
  workspacesList: "workspaces:list",
  /** 创建工作空间。 */
  workspacesCreate: "workspaces:create",
  /** 重命名工作空间。 */
  workspacesRename: "workspaces:rename",
  /** 置顶 / 取消置顶工作空间。 */
  workspacesSetPinned: "workspaces:setPinned",
  /** 重排工作空间。 */
  workspacesReorder: "workspaces:reorder",
  /** 删除工作空间。 */
  workspacesRemove: "workspaces:remove",
  /** 清空工作空间内全部会话。 */
  workspacesClear: "workspaces:clear",
  /** 在系统文件管理器中显示工作空间根目录。 */
  workspacesShowInFolder: "workspaces:showInFolder",
  /** 工作空间表变更广播。 */
  workspacesChanged: "workspaces:changed",
  /** 列出会话（可选按工作空间过滤）。 */
  chatSessionsList: "chatSessions:list",
  /** 创建会话。 */
  chatSessionsCreate: "chatSessions:create",
  /** 读取会话 + 消息。 */
  chatSessionsGet: "chatSessions:get",
  /** 重命名会话。 */
  chatSessionsRename: "chatSessions:rename",
  /** 置顶 / 取消置顶会话。 */
  chatSessionsSetPinned: "chatSessions:setPinned",
  /** 同一工作空间内重排会话。 */
  chatSessionsReorder: "chatSessions:reorder",
  /** 将会话移到另一工作空间。 */
  chatSessionsMove: "chatSessions:move",
  /** 删除会话。 */
  chatSessionsRemove: "chatSessions:remove",
  /** 落库会话消息。 */
  chatSessionsSaveMessages: "chatSessions:saveMessages",
  /** 设置当前活动会话 id。 */
  chatSessionsSetActive: "chatSessions:setActive",
  /** 读取当前活动会话 id。 */
  chatSessionsGetActive: "chatSessions:getActive",
  /** 读取最后选中的工作空间 id。 */
  chatSessionsGetLastWorkspace: "chatSessions:getLastWorkspace",
  /** 写入最后选中的工作空间 id。 */
  chatSessionsSetLastWorkspace: "chatSessions:setLastWorkspace",
  /** 读取折叠的工作空间 id 列表。 */
  chatSessionsGetCollapsed: "chatSessions:getCollapsed",
  /** 写入折叠的工作空间 id 列表。 */
  chatSessionsSetCollapsed: "chatSessions:setCollapsed",
  /** 会话 / 线程列表变更广播。 */
  threadsChanged: "threads:changed",

  /** 列出工作空间目录树。 */
  workspaceFsTree: "workspaceFs:tree",
  /** 读取工作空间内文本文件。 */
  workspaceFsRead: "workspaceFs:read",
  /** 写入工作空间内文本文件。 */
  workspaceFsWrite: "workspaceFs:write",
  /** Git status。 */
  workspaceGitStatus: "workspaceGit:status",
  /** 单文件 Git diff。 */
  workspaceGitDiff: "workspaceGit:diff",
  /** `git init`。 */
  workspaceGitInit: "workspaceGit:init",
} as const;

/** `IpcChannels` 中任一通道字符串字面量类型。 */
export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];
