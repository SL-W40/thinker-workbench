/**
 * 代码高亮：基于 highlight.js 核心语言集，可注册扩展语言。
 */
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import shell from "highlight.js/lib/languages/shell";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

let ready = false;

function ensureHljs(): typeof hljs {
  if (!ready) {
    hljs.registerLanguage("javascript", javascript);
    hljs.registerLanguage("js", javascript);
    hljs.registerLanguage("typescript", typescript);
    hljs.registerLanguage("ts", typescript);
    hljs.registerLanguage("tsx", typescript);
    hljs.registerLanguage("jsx", javascript);
    hljs.registerLanguage("json", json);
    hljs.registerLanguage("css", css);
    hljs.registerLanguage("html", xml);
    hljs.registerLanguage("xml", xml);
    hljs.registerLanguage("svg", xml);
    hljs.registerLanguage("markdown", markdown);
    hljs.registerLanguage("md", markdown);
    hljs.registerLanguage("python", python);
    hljs.registerLanguage("py", python);
    hljs.registerLanguage("bash", bash);
    hljs.registerLanguage("shell", shell);
    hljs.registerLanguage("sh", bash);
    hljs.registerLanguage("yaml", yaml);
    hljs.registerLanguage("yml", yaml);
    hljs.registerLanguage("text", plaintext);
    hljs.registerLanguage("plaintext", plaintext);
    ready = true;
  }
  return hljs;
}

/** 由调用方注册额外的 highlight.js 语言。 */
export function registerLanguage(
  name: string,
  language: Parameters<typeof hljs.registerLanguage>[1],
): void {
  ensureHljs().registerLanguage(name, language);
}

/** 高亮代码，返回 HTML 片段与实际使用的语言名。 */
export function highlightCode(code: string, language?: string): { html: string; language: string } {
  const engine = ensureHljs();
  const lang = (language || "").toLowerCase();
  if (lang && engine.getLanguage(lang)) {
    return {
      html: engine.highlight(code, { language: lang, ignoreIllegals: true }).value,
      language: lang,
    };
  }
  try {
    const auto = engine.highlightAuto(code);
    return { html: auto.value, language: auto.language || "text" };
  } catch {
    return {
      html: code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
      language: lang || "text",
    };
  }
}
