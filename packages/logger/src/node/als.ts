import { AsyncLocalStorage } from "node:async_hooks";
import { bindAlsGetter } from "../context";
import type { LogContext } from "../types";

const storage = new AsyncLocalStorage<LogContext>();

let installed = false;

/** 安装 ALS，使 await 之后仍能读到 trace / run 上下文。 */
export function installLogAls(): void {
  if (installed) return;
  installed = true;
  bindAlsGetter(() => storage.getStore());
}

/**
 * 在异步调用链上合并日志上下文。
 * 需先 `installLogAls()`。
 */
export function withLogContextAsync<T>(ctx: LogContext, fn: () => Promise<T>): Promise<T> {
  installLogAls();
  const parent = storage.getStore() ?? {};
  return storage.run({ ...parent, ...ctx }, fn);
}
