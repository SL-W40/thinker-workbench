/**
 * 行内扫描原语：词字符判定、强调能否开标记、括号配对扫描。
 * 是所有行内子解析器的叶子依赖，不反向依赖任何东西。
 */

export function isWordChar(ch: string | undefined): boolean {
  return Boolean(ch && /[A-Za-z0-9\u00C0-\u024F\u4e00-\u9fff]/.test(ch));
}

/**
 * 是否可作为强调开标记。
 * `_` 遵守 CommonMark：词内（两侧皆 word）不开。
 */
export function canOpenEmphasis(s: string, i: number, marker: "*" | "_", run: number): boolean {
  const after = s[i + run];
  if (after === undefined || after === " " || after === "\t" || after === "\n") return false;
  if (marker === "_") {
    const before = i > 0 ? s[i - 1] : undefined;
    if (isWordChar(before) && isWordChar(after)) return false;
  }
  return true;
}

/** 扫描配对 `)`，支持目标 URL 内嵌套括号（如 `http://a.com/x(y)`）。 */
export function findClosingParen(s: string, openIndex: number): number {
  if (s[openIndex] !== "(") return -1;
  let depth = 0;
  for (let j = openIndex; j < s.length; j += 1) {
    if (s[j] === "\\" && j + 1 < s.length) {
      j += 1;
      continue;
    }
    if (s[j] === "(") depth += 1;
    else if (s[j] === ")") {
      depth -= 1;
      if (depth === 0) return j;
    }
  }
  return -1;
}
