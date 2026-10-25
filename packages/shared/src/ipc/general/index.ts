/**
 * 通用应用设置子域出口。
 *
 * `ipc/general.ts` 原是一个 896 行的兜底抽屉（主题 / 语言 / 字体 / 工作区访问 /
 * 命令行审批 / 各类数值上限 / 出厂默认值 / IPC 接口 / 归一化函数），
 * 现在按职责拆到本目录；对外导入路径不变，仍走 `ipc/general`。
 *
 * 依赖关系单向递进：科学与工程其它子域都只依赖本目录下的常量与类型，
 * 只有 `normalize` 会汇总全部归一化函数。
 */
export * from "./api";
export * from "./defaults";
export * from "./fontScale";
export * from "./http";
export * from "./limits";
export * from "./normalize";
export * from "./settings";
export * from "./shellPolicy";
export * from "./theme";
export * from "./workspaceAccess";
