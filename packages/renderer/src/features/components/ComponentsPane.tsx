/**
 * 设计系统组件目录页：在应用内展示 `@thinker-workbench/design/react` 控件样例。
 * 点击卡片标题可打开弹窗，用自研 Markdown 渲染对应组件说明文档。
 * 路由一般为 `#/components`；非激活时 CSS hidden 保活。
 *
 * 实现已按域拆分至 ./ComponentsPane/，本文件仅保留 barrel 以维持既有导入路径与导出面。
 */
export * from "./ComponentsPane/index";
