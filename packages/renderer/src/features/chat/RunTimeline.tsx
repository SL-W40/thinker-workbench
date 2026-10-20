/**
 * 助手气泡内的运行时间线：
 * Thinking / 叙述 / 工具 / 错误；探索类步骤默认收成 Explored；
 * 已完成且非本会话末条时，工具 / 思考 / 中间小结折成「Worked for …」，仅末尾正式答复外露。
 *
 * 实现已按域拆分至 ./RunTimeline/，本文件仅保留 barrel 以维持既有导入路径与导出面。
 */
export * from "./RunTimeline/index";
