/**
 * 剥离终端 ANSI / CSI / OSC，避免 ConPTY 垃圾进模型上下文。
 */

// eslint-disable-next-line no-control-regex -- 刻意匹配 ESC / CSI / OSC
const ANSI_RE =
  /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|[@-Z\\-_])|\u009b[0-?]*[ -/]*[@-~]/g;

/** 其它常见控制字符（保留 \\t \\n \\r）。 */
// eslint-disable-next-line no-control-regex
const CTRL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** 去掉转义与控制字符后的纯文本。 */
export function stripAnsi(input: string): string {
  if (!input) return "";
  return input.replace(ANSI_RE, "").replace(CTRL_RE, "");
}
