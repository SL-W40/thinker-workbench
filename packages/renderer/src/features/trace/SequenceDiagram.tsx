/**
 * 会话 Trace 时序图：全程共用全局 7 泳道坐标；箭头落点对齐表头生命线。
 * 并行 par：展开=?Task 分块连排（避免按墙钟交织出现 AAA…BBB…AAA）；滑动=只看当前 Task。
 *
 * 实现已按域拆分至 ./SequenceDiagram/，本文件仅保留 barrel 以维持既有导入路径与导出面。
 */
export * from "./SequenceDiagram/index";
