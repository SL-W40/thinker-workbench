/**
 * 启动步骤失败的记录。
 * 日志模块在这些步骤之后才配置，所以先记下，配置完成后再刷到控制台。
 */
import type { StartupIssue } from "@thinker-workbench/shared";
import { desktopLog } from "../log/setup";

const issues: StartupIssue[] = [];
let flushed = 0;

/** 记下一步失败。同一进程内累积，供侧栏读取。 */
export function recordStartupIssue(step: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  issues.push({ step, message });
}

/** 跑一步启动工作。失败记下来，不挡住后面的步骤。 */
export function runStartupStep(step: string, fn: () => void): void {
  try {
    fn();
  } catch (error) {
    recordStartupIssue(step, error);
  }
}

export function listStartupIssues(): StartupIssue[] {
  return issues.map((issue) => ({ ...issue }));
}

/** configureDesktopLog 之后调用。只写还没刷过的失败。 */
export function flushStartupIssuesToLog(): void {
  const pending = issues.slice(flushed);
  flushed = issues.length;
  const log = desktopLog("startup");
  for (const issue of pending) {
    log.error(issue.step, { message: issue.message });
  }
}
