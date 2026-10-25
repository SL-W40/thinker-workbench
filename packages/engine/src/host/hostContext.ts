/**
 * UtilityHost 处理器共用依赖（runtime 懒创建 / 取消）。
 */
import type { AgentRuntime } from "../runtime/AgentRuntime";

export type HostContext = {
  /**
   * 按 checkpointDir 取（懒创建）AgentRuntime；同一目录复用同一实例。
   * checkpoint 随工作区走，故一个 engine 进程可服务多个工作区。
   */
  ensureRuntime: (checkpointDir?: string) => AgentRuntime;
  /** 全部已创建的 runtime（checkpoint 清理等需遍历）。 */
  listRuntimes: () => AgentRuntime[];
  /** 取消指定 run（未创建 runtime 时为空操作）。 */
  cancel: (runId: string) => void;
};
