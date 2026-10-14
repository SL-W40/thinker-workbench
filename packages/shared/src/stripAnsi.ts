/**
 * 剥离终端 ANSI / CSI / OSC 与其它控制字符。
 * 保留制表符与换行，避免 ConPTY 垃圾进模型上下文或时间线。
 */
const ANSI_RE =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: 本意就是匹配 ESC / BEL / CSI 等控制字符
  /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|[@-Z\\-_])|\u009b[0-?]*[ -/]*[@-~]/g;

/** 其它常见控制字符（保留制表符与换行）。 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: 本意就是剥离 C0 控制字符
const CTRL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** 去掉转义与控制字符后的纯文本。 */
export function stripAnsi(input: string): string {
  if (!input) return "";
  return input.replace(ANSI_RE, "").replace(CTRL_RE, "");
}
