/**
 * 兜底解析器：text/* MIME 与常见文本/代码扩展名直接按 UTF-8 解码。
 * priority 最低（0），任何专用 parser 都会优先于它。
 */
import type { FileParser } from "../types";

const TEXT_EXTS = new Set([
  "txt",
  "text",
  "md",
  "markdown",
  "mdx",
  "rst",
  "adoc",
  "org",
  "json",
  "jsonl",
  "ndjson",
  "csv",
  "tsv",
  "log",
  "xml",
  "html",
  "htm",
  "css",
  "scss",
  "less",
  "svg",
  "yml",
  "yaml",
  "toml",
  "ini",
  "cfg",
  "env",
  "properties",
  "conf",
  "sql",
  "graphql",
  "gql",
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "vue",
  "svelte",
  "py",
  "rb",
  "php",
  "go",
  "rs",
  "java",
  "kt",
  "kts",
  "swift",
  "scala",
  "c",
  "h",
  "cpp",
  "cc",
  "cxx",
  "hpp",
  "hxx",
  "cu",
  "cs",
  "fs",
  "fsx",
  "sh",
  "bash",
  "zsh",
  "ps1",
  "bat",
  "cmd",
  "makefile",
  "mk",
  "cmake",
  "dockerfile",
  "gitignore",
  "npmignore",
  "lua",
  "r",
  "jl",
  "dart",
  "ex",
  "exs",
]);

function isTextMime(mime: string): boolean {
  if (mime.startsWith("text/")) return true;
  // 部分常见非 text/ 前缀仍按文本处理
  return (
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/x-yaml" ||
    mime === "application/javascript" ||
    mime === "application/typescript"
  );
}

export const textParser: FileParser = {
  id: "text",
  label: "纯文本",
  priority: 0,
  supports(mime, ext) {
    if (isTextMime(mime)) return true;
    return TEXT_EXTS.has(ext);
  },
  async parse(input) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(input.bytes);
    return { text, kind: "text" };
  },
};
