/**
 * tools 节点：执行上一轮 agent 留下的 pendingToolCalls，结果写回消息历史。
 * Resume：已有结果则跳过；已开工无结果则注入分类中断说明（不重放）。
 *
 * 实现已按域拆分至 ./tools/（args / runner / tools），
 * 本文件仅保留 barrel 以维持既有导入路径与导出面。
 */
export * from "./tools/index";
