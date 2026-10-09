/**
 * 包对外导出面。
 * 正常运行走 entry → UtilityHost；这里给测试或其它 Node 宿主直接创建 runtime 用。
 */
export { createAgentRuntime, AgentRuntime } from "./runtime/AgentRuntime";
export type { AgentRuntimeOptions, RunRequest } from "./runtime/types";
export { buildGraph } from "./graph/buildGraph";
