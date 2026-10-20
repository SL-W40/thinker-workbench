/**
 * OpenAI 兼容 Chat Completions 客户端（经 modelFetch，尊重 HTTP 兼容模式）。
 *
 * - 配置来自主进程 hello / 每次 run 的 ModelSettings
 * - 有 onToken 时走 SSE 流式；部分网关忽略 stream 时回退解析普通 JSON
 * - tool_calls 在流式过程中按 index 累加，结束后再交给图
 * - 每个网络读块后 yield 事件循环，避免长时间占满 utility 线程影响 IPC
 *
 * 实现已按域拆分至 ./openai/（config / messages / sse / client），
 * 本文件仅保留 barrel 以维持既有导入路径与导出面。
 */
export * from "./openai/index";
