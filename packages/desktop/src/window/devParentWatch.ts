/**
 * 开发态：监视 `run-electron.mjs` 父进程是否还在。
 *
 * nodemon / concurrently 若用 SIGKILL 杀掉包装进程，exit 钩子来不及杀 Electron，
 * 子进程会变孤儿并占住单实例锁。父 PID 消失则主动退出。
 */
import { app } from "electron";

const POLL_MS = 1500;

/**
 * 解析环境变量中的父进程 PID；非法则返回 null。
 * @param raw `TW_DEV_PARENT_PID`
 */
export function parseDevParentPid(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * 探测 PID 是否仍存活（`kill(pid, 0)`；无权限也视为仍在）。
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : "";
    // EPERM：进程存在但无权发信号，仍算存活
    if (code === "EPERM") return true;
    return false;
  }
}

/**
 * 非打包且设置了 `TW_DEV_PARENT_PID` 时开始轮询；父进程消失则 `app.exit(0)`。
 * @returns 停止函数（测试或手动停用）
 */
export function startDevParentWatch(
  env: NodeJS.ProcessEnv = process.env,
  deps: {
    isPackaged?: boolean;
    checkAlive?: (pid: number) => boolean;
    exitApp?: () => void;
    intervalMs?: number;
  } = {},
): () => void {
  const isPackaged = deps.isPackaged ?? app.isPackaged;
  if (isPackaged) return () => undefined;

  const ppid = parseDevParentPid(env.TW_DEV_PARENT_PID);
  if (ppid == null) return () => undefined;

  const checkAlive = deps.checkAlive ?? isProcessAlive;
  const exitApp = deps.exitApp ?? (() => app.exit(0));
  const intervalMs = deps.intervalMs ?? POLL_MS;

  const timer = setInterval(() => {
    if (!checkAlive(ppid)) {
      clearInterval(timer);
      exitApp();
    }
  }, intervalMs);
  timer.unref?.();

  return () => clearInterval(timer);
}
