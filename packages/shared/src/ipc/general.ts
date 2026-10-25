/**
 * 通用应用设置：通知、托盘、语言、主题、字体大小档位、工作区访问、AI 删文件与恢复缓存 TTL、引导完成态、数据目录与日志策略。
 * 持久化于主进程设置文件；经 IPC 与 renderer 同步。
 *
 * 本文件只做转发：真正的实现按子域拆在 `general/` 下（theme / locale / fontScale /
 * workspaceAccess / settings / http / shellPolicy / limits / defaults / api / normalize），
 * 保留同名 barrel 是为了不打断既有 `../ipc/general` 导入路径。
 *
 * `dataDir` 不走 `setGeneral` 即时生效，须经 `previewDataDirChange` / `applyDataDirChange`。
 */
export * from "./general/index";
