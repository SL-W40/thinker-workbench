/**
 * PTY 启动的统一入口。
 *
 * 强制走 conpty DLL 模式（`useConptyDll`）：默认模式下 WindowsTerminal.kill()
 * 会 fork 一个 conpty_console_list_agent 子进程，让它在自己身上挂
 * AttachConsole(shellPid)。壳已退出、或本进程已经占着控制台时（从终端里
 * `pnpm dev` 起应用就是这种），AttachConsole 必失败，那个子进程直接抛
 * `Error: AttachConsole failed` 崩掉 —— 每次 kill 一行，日志刷屏。
 * DLL 模式不 fork 那个 agent，kill() 只关输入、让 conpty 自己收尾。
 */
import type { IPtyForkOptions } from "node-pty";
import { loadNodePty } from "./loadNodePty";

/** 启动一个 PTY；DLL 模式不可用时退回 node-pty 默认实现。 */
export function spawnPty(file: string, args: string[], options: IPtyForkOptions) {
  const pty = loadNodePty();
  try {
    return pty.spawn(file, args, { ...options, useConptyDll: true });
  } catch {
    // 老系统或 conpty.dll 缺失：退回内置 conpty，功能不变（只是 kill 时会有上面那段噪音）
    return pty.spawn(file, args, options);
  }
}
