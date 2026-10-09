import type { LogContext } from "./types";

/**
 * 同步栈上下文（浏览器与 Node 均可）。
 * Node 侧可用 `@thinker-workbench/logger/node` 的 ALS 在 await 后仍保持上下文。
 */
let stack: LogContext[] = [];
let alsGet: (() => LogContext | undefined) | null = null;

/** 由 node 入口注册 AsyncLocalStorage 读取器。 */
export function bindAlsGetter(getter: (() => LogContext | undefined) | null): void {
  alsGet = getter;
}

export function getLogContext(): LogContext {
  const fromAls = alsGet?.();
  if (fromAls && Object.keys(fromAls).length > 0) {
    const top = stack[stack.length - 1];
    return top ? { ...fromAls, ...top } : { ...fromAls };
  }
  const top = stack[stack.length - 1];
  return top ? { ...top } : {};
}

/**
 * 在 fn 执行期间合并上下文（同步）。
 * 异步请优先用 node 的 `withLogContextAsync`，或把 traceId 绑进 `logger.child`。
 */
export function withLogContext<T>(ctx: LogContext, fn: () => T): T {
  stack.push({ ...getLogContext(), ...ctx });
  try {
    return fn();
  } finally {
    stack.pop();
  }
}
