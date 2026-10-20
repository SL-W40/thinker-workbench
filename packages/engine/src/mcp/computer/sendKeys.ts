/**
 * SendKeys 文本转义与键串翻译（computer_type / computer_key 用）。
 */

/** SendKeys 命名键映射（小写入参 → SendKeys 令牌）。 */
const SEND_KEYS_NAMED: Record<string, string> = {
  enter: "{ENTER}",
  return: "{ENTER}",
  tab: "{TAB}",
  escape: "{ESC}",
  esc: "{ESC}",
  backspace: "{BACKSPACE}",
  delete: "{DEL}",
  del: "{DEL}",
  insert: "{INS}",
  space: " ",
  up: "{UP}",
  down: "{DOWN}",
  left: "{LEFT}",
  right: "{RIGHT}",
  home: "{HOME}",
  end: "{END}",
  pageup: "{PGUP}",
  pagedown: "{PGDN}",
  capslock: "{CAPSLOCK}",
  printscreen: "{PRTSC}",
};

/** SendKeys 需要转义的特殊字符。 */
const SEND_KEYS_SPECIAL = /[+^%~(){}[\]]/g;

/**
 * 转义 SendKeys 文本字面量（`computer_type` 用）。
 * 特殊字符包花括号后按字面发送，不被当修饰键。
 */
export function escapeSendKeysText(text: string): string {
  return text.replace(SEND_KEYS_SPECIAL, (ch) => `{${ch}}`);
}

/**
 * 把 `ctrl+c` / `alt+tab` / `f5` 之类键串翻译成 SendKeys 语法。
 * @returns null 表示无法表达（如 win 键）
 */
export function toSendKeys(combo: string): string | null {
  const parts = combo
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return null;
  let prefix = "";
  const keys: string[] = [];
  for (const part of parts) {
    if (part === "ctrl" || part === "control") {
      prefix += "^";
      continue;
    }
    if (part === "alt") {
      prefix += "%";
      continue;
    }
    if (part === "shift") {
      prefix += "+";
      continue;
    }
    if (part === "win" || part === "cmd" || part === "super") return null;
    const f = /^f([1-9]|1[0-9]|2[0-4])$/.exec(part);
    if (f) {
      keys.push(`{${part.toUpperCase()}}`);
      continue;
    }
    const named = SEND_KEYS_NAMED[part];
    if (named) {
      keys.push(named);
      continue;
    }
    if (part.length === 1) {
      keys.push(part);
      continue;
    }
    return null;
  }
  if (keys.length === 0) return null;
  return `${prefix}${keys.join("")}`;
}
