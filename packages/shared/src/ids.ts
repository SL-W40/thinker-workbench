/**
 * 运行时标识符工厂。
 * 生成带前缀、时间戳与随机后缀的短 id，供线程 / 运行等实体使用。
 */

/**
 * 按前缀生成唯一 id。
 * 格式：`{prefix}_{base36时间戳}_{随机片段}`。
 */
export function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** 生成会话线程 id（前缀 `thread`）。 */
export function createThreadId(): string {
  return createId("thread");
}

/** 生成单次 agent 运行 id（前缀 `run`）。 */
export function createRunId(): string {
  return createId("run");
}

/** 生成端到端会话追踪 id（前缀 `trace`；一次用户发送共用一个）。 */
export function createTraceId(): string {
  return createId("trace");
}

/** 生成工作空间 id（前缀 `ws`）。 */
export function createWorkspaceId(): string {
  return createId("ws");
}

/** 生成聊天会话 id（前缀 `session`）。 */
export function createSessionId(): string {
  return createId("session");
}
