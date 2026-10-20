/**
 * UtilityHost 处理器共用依赖（runtime 懒创建 / 取消）。
 */
import type { AgentRuntime } from "../runtime/AgentRuntime";

export type HostContext = {
  /** 懒创建并返回唯一 AgentRuntime；checkpointDir 仅首次生效。 */
  ensureRuntime: (checkpointDir?: string) => AgentRuntime;
  /** 取消指定 run（未创建 runtime 时为空操作）。 */
  cancel: (runId: string) => void;
};
