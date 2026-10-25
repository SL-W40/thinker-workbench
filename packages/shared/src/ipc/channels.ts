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
  /** 取消单个后台 Task（不停止父 run）。 */
  agentCancelTask: "agent:cancelTask",
  /** 从中断点恢复运行。 */
  agentResume: "agent:resume",
  /** 用户答复 HITL。 */
  agentHitlRespond: "agent:hitlRespond",
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
  /** 对指定模型做连通性测试。 */
  settingsProbeModel: "settings:probeModel",
  /** 发消息前解锁已存 API key（safeStorage / 钥匙串）。 */
  settingsUnlockModelSecrets: "settings:unlockModelSecrets",
  /** 读取会话级模型选择覆盖。 */
  settingsGetSessionModelSelection: "settings:getSessionModelSelection",
  /** 写入会话级模型选择覆盖。 */
  settingsSetSessionModelSelection: "settings:setSessionModelSelection",
  /** 读取会话级 ChatMode。 */
  settingsGetSessionChatMode: "settings:getSessionChatMode",
  /** 写入会话级 ChatMode。 */
  settingsSetSessionChatMode: "settings:setSessionChatMode",
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
  /** 会话 ChatMode 变更广播（工具请求切模式后，各处的模式选择器同步）。 */
  settingsSessionChatModeChanged: "settings:sessionChatModeChanged",
  /** 预览系统通知或完成提示音。 */
  settingsPreviewAttention: "settings:previewAttention",
  /** 选择目录（数据 / 日志路径）。 */
  settingsPickDirectory: "settings:pickDirectory",
  /** 另存为文本文件（系统保存对话框 + 写入）。 */
  settingsSaveTextFile: "settings:saveTextFile",
  /** 将 dataDir 配置串解析为绝对路径（空=默认 ~/.thinker）。 */
  settingsResolveDataDir: "settings:resolveDataDir",
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
  /** 全量写回会话待办（会话级状态）。 */
  chatSessionsSetTodos: "chatSessions:setTodos",
  /** 将用户附图写入工作空间 images 目录。 */
  chatImagesSave: "chatImages:save",
  /** 读取已落盘附图预览（data URL）。 */
  chatImagesReadPreview: "chatImages:readPreview",
  /** 落盘外部附件（dataDir/attachments）。 */
  chatAttachmentsSave: "chatAttachments:save",
  /** 读取外部附件预览（图片 dataUrl / 文档解析文本）。 */
  chatAttachmentsRead: "chatAttachments:read",
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

  /** 跨会话全文检索（FTS5）。 */
  chatSessionsSearch: "chatSessions:search",
  /** 导出单个会话（Markdown / JSON）。 */
  chatSessionsExport: "chatSessions:export",
  /** 导入会话 JSON（落为目标工作区的新会话）。 */
  chatSessionsImport: "chatSessions:import",

  /** Git 暂存。 */
  workspaceGitStage: "workspaceGit:stage",
  /** Git 取消暂存。 */
  workspaceGitUnstage: "workspaceGit:unstage",
  /** Git 放弃工作区改动。 */
  workspaceGitDiscard: "workspaceGit:discard",
  /** Git 提交。 */
  workspaceGitCommit: "workspaceGit:commit",
  /** Git 检出（分支切换 / 文件还原）。 */
  workspaceGitCheckout: "workspaceGit:checkout",
  /** Git 分支列表。 */
  workspaceGitBranchList: "workspaceGit:branchList",
  /** Git push。 */
  workspaceGitPush: "workspaceGit:push",
  /** Git pull。 */
  workspaceGitPull: "workspaceGit:pull",
  /** Git stash push。 */
  workspaceGitStashPush: "workspaceGit:stashPush",
  /** Git stash pop。 */
  workspaceGitStashPop: "workspaceGit:stashPop",

  /** 读取 Checkpoint 保留策略。 */
  checkpointsRetentionGet: "checkpoints:retentionGet",
  /** 写入 Checkpoint 保留策略补丁。 */
  checkpointsRetentionSet: "checkpoints:retentionSet",
  /** 读取 Checkpoint 占用统计。 */
  checkpointsStats: "checkpoints:stats",
  /** 立即按策略裁剪。 */
  checkpointsPruneNow: "checkpoints:pruneNow",
  /** 变更条目处置（回滚 / 采纳）。 */
  changesDisposition: "changes:disposition",

  /** 读取更新状态。 */
  appUpdateState: "app:updateState",
  /** 检查更新。 */
  appUpdateCheck: "app:updateCheck",
  /** 下载更新。 */
  appUpdateDownload: "app:updateDownload",
  /** 安装并重启。 */
  appUpdateInstall: "app:updateInstall",
  /** 主进程推送更新状态。 */
  appUpdateEvent: "app:updateEvent",

  /** 列出工作空间目录树。 */
  workspaceFsTree: "workspaceFs:tree",
  /** 读取工作空间内文本文件。 */
  workspaceFsRead: "workspaceFs:read",
  /** 写入工作空间内文本文件。 */
  workspaceFsWrite: "workspaceFs:write",
  /** 新建目录。 */
  workspaceFsMkdir: "workspaceFs:mkdir",
  /** 重命名 / 同工作空间内移动。 */
  workspaceFsRename: "workspaceFs:rename",
  /** 删除文件或目录（优先系统回收站）。 */
  workspaceFsRemove: "workspaceFs:remove",
  /** 在系统文件管理器中显示。 */
  workspaceFsReveal: "workspaceFs:reveal",
  /** Git status。 */
  workspaceGitStatus: "workspaceGit:status",
  /** 单文件 Git diff。 */
  workspaceGitDiff: "workspaceGit:diff",
  /** 读取工作空间内文件经解析层抽取的纯文本（文档悬停预览）。 */
  workspaceFsParseText: "workspaceFs:parseText",
  /** `git init`。 */
  workspaceGitInit: "workspaceGit:init",

  /** 列出终端会话。 */
  terminalList: "terminal:list",
  /** 列出本机 shell profiles。 */
  terminalListShellProfiles: "terminal:listShellProfiles",
  /** 新建交互式终端会话。 */
  terminalCreate: "terminal:create",
  /** 向 PTY 写入。 */
  terminalWrite: "terminal:write",
  /** 调整 PTY 尺寸。 */
  terminalResize: "terminal:resize",
  /** 杀掉终端会话。 */
  terminalKill: "terminal:kill",
  /** 读取会话已缓冲的输出（打开终端时回放）。 */
  terminalGetOutput: "terminal:getOutput",
  /** 主进程推送终端事件。 */
  terminalEvent: "terminal:event",

  /** 读取内置浏览器状态。 */
  browserGetState: "browser:getState",
  /** 导航到 URL。 */
  browserNavigate: "browser:navigate",
  /** 后退。 */
  browserGoBack: "browser:goBack",
  /** 前进。 */
  browserGoForward: "browser:goForward",
  /** 刷新。 */
  browserReload: "browser:reload",
  /** 渲染层上报 <webview> 的 webContents id（面板挂载时）。 */
  browserAttachWebview: "browser:attachWebview",
  /** 渲染层上报 <webview> 卸载（切 tab / 关面板）。 */
  browserDetachWebview: "browser:detachWebview",
  /** 上报 <webview> 视口尺寸（CSS px）。 */
  browserSetViewport: "browser:setViewport",
  /** 显示 / 隐藏内置浏览器视图。 */
  browserSetVisible: "browser:setVisible",
  /** 用户接管（解除 AI 锁定）。 */
  browserTakeControl: "browser:takeControl",
  /** 读取 browser-screenshots 下截图为 data URL（时间线展开预览）。 */
  browserReadScreenshot: "browser:readScreenshot",
  /** 主进程推送浏览器事件。 */
  browserEvent: "browser:event",

  /** 列出 skills 摘要（Composer `/`）。 */
  skillsList: "skills:list",
  skillsListDetailed: "skills:listDetailed",
  skillsUpsert: "skills:upsert",
  skillsRemove: "skills:remove",
  skillsCopyToScope: "skills:copyToScope",
  rulesList: "rules:list",
  rulesUpsert: "rules:upsert",
  rulesRemove: "rules:remove",
  rulesCopyToScope: "rules:copyToScope",
  agentsList: "agents:list",
  agentsUpsert: "agents:upsert",
  agentsRemove: "agents:remove",
  agentsCopyToScope: "agents:copyToScope",

  traceListSessions: "trace:listSessions",
  traceGetSessionSpans: "trace:getSessionSpans",
  traceGetPayload: "trace:getPayload",
  traceStartSpan: "trace:startSpan",
  traceEndSpan: "trace:endSpan",
  traceDeleteSession: "trace:deleteSession",
  traceExportSession: "trace:exportSession",

  /** 列出 MCP server 配置与状态。 */
  mcpList: "mcp:list",
  /** 新建 / 更新 MCP server。 */
  mcpUpsert: "mcp:upsert",
  /** 删除 MCP server。 */
  mcpRemove: "mcp:remove",
  /** 启用 / 禁用 MCP server。 */
  mcpSetEnabled: "mcp:setEnabled",
  /** 临时测试连接。 */
  mcpTest: "mcp:test",
  /** 从 mcp.json 导入。 */
  mcpImportFile: "mcp:importFile",
  /** 导出 mcp.json。 */
  mcpExportFile: "mcp:exportFile",
  /** 主进程推送 MCP 运行时状态。 */
  mcpStatus: "mcp:status",
} as const;

/** `IpcChannels` 中任一通道字符串字面量类型。 */
export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];
