/**
 * 剥离终端 ANSI / CSI / OSC 转义序列，供时间线纯文本展示。
 * 保留可见字符与换行。
 */

/** ESC / C1 CSI / OSC 等常见控制序列。 */
const ANSI_RE =
  // eslint-disable-next-line no-control-regex -- 刻意匹配 ESC / CSI / OSC
  /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|[@-Z\\-_])|\u009b[0-?]*[ -/]*[@-~]/g;

/** 返回去掉转义后的纯文本。 */
export function stripAnsi(input: string): string {
  if (!input) return "";
  return input.replace(ANSI_RE, "");
}
