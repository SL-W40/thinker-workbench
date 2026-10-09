/**
 * utilityProcess 生命周期钩子绑定。
 *
 * 统一监听 spawn / exit / error，交给调用方处理 ready、退出码与启动失败。
 */
import type { UtilityProcess } from "electron";

/** 子进程生命周期回调集合。 */
export type LifecycleHandlers = {
  /** 进程 spawn 事件（真正 ready 仍以 postMessage 握手为准）。 */
  onReady: () => void;
  /** 进程退出。 */
  onExit: (code: number | null) => void;
  /** spawn 失败等错误。 */
  onSpawnError: (error: Error) => void;
};

/**
 * 将 handlers 挂到 child 的 spawn / exit / error。
 * 部分 Electron 版本在 spawn 失败时会发 `error` 事件。
 */
export function attachLifecycle(child: UtilityProcess, handlers: LifecycleHandlers): void {
  child.on("spawn", () => {
    // ready 以 postMessage 握手为准；此处仅占位保持与 handlers 对称
  });

  child.on("exit", (code) => {
    handlers.onExit(code);
  });

  // 部分 Electron 版本在 spawn 失败时会发出 error
  const maybe = child as UtilityProcess & {
    on: (event: string, listener: (...args: unknown[]) => void) => void;
  };
  maybe.on("error", (...args: unknown[]) => {
    const err = args[0] instanceof Error ? args[0] : new Error(String(args[0]));
    handlers.onSpawnError(err);
  });
}
