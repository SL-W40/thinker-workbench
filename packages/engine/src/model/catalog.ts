/**
 * 模型目录运行时：候选构建、故障切换包装。
 * 配置由 UtilityHost 每轮下发；chat 调用经 withModelFailover。
 *
 * 实现已按域拆分至 ./catalog/（usage / state / failover），
 * 本文件仅保留 barrel 以维持既有导入路径与导出面。
 */
export * from "./catalog/index";
