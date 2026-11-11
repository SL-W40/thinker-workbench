/** 主进程启动步骤失败，供侧栏提示。 */
export type StartupIssue = {
  step: string;
  message: string;
};
