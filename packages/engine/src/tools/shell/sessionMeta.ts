/**
 * 进程内 shell session → 原始命令缓存，供 shell_write 审批文案引用。
 */

const commands = new Map<string, string>();

/** 记录 agent shell 启动时的原始命令。 */
export function rememberShellSessionCommand(sessionId: string, command: string): void {
  const id = sessionId.trim();
  const cmd = command.trim();
  if (!id || !cmd) return;
  commands.set(id, cmd);
}

/** 取会话原始命令（未知则 undefined）。 */
export function getShellSessionCommand(sessionId: string): string | undefined {
  return commands.get(sessionId.trim());
}

/** 测试用：清空缓存。 */
export function clearShellSessionCommands(): void {
  commands.clear();
}
