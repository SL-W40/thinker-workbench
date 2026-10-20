/**
 * 工作空间 / 会话 / 消息 CRUD。
 * catalog.db 存元数据；每工作空间 chat.db 存会话与消息。
 * 实现已按域拆分至 ./workspacesStore/，本文件仅保留 barrel 以维持既有导入路径与导出面。
 */
export * from "./workspacesStore/index";
