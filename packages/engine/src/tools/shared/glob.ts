/**
 * 最小 glob → RegExp：支持 `*` / `?` / `**` 段；
 * win32 下忽略大小写。search_files 与 grep 的文件过滤共用。
 */

/** 把简易 glob 编译为匹配整个路径字符串的正则。 */
export function globToRegExp(glob: string): RegExp {
  const normalized = glob.replace(/\\/g, "/").replace(/^\.\//, "");
  let source = "^";
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]!;
    if (ch === "*" && normalized[i + 1] === "*") {
      const next = normalized[i + 2];
      if (next === "/" || next === undefined) {
        source += ".*";
        i += next === "/" ? 2 : 1;
        continue;
      }
    }
    if (ch === "*") {
      source += "[^/]*";
      continue;
    }
    if (ch === "?") {
      source += "[^/]";
      continue;
    }
    if ("+()[]{}^$|.".includes(ch)) {
      source += `\\${ch}`;
      continue;
    }
    source += ch;
  }
  source += "$";
  return new RegExp(source, process.platform === "win32" ? "i" : "");
}
