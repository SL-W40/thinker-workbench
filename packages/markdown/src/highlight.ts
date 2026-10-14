/**
 * 代码高亮：基于 highlight.js 核心语言集，可注册扩展语言。
 */
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import plaintext from "highlight.js/lib/languages/plaintext";
import powershell from "highlight.js/lib/languages/powershell";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
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
    hljs.registerLanguage("c", c);
    hljs.registerLanguage("h", c);
    hljs.registerLanguage("cpp", cpp);
    hljs.registerLanguage("cc", cpp);
    hljs.registerLanguage("cxx", cpp);
    hljs.registerLanguage("hpp", cpp);
    hljs.registerLanguage("c++", cpp);
    hljs.registerLanguage("csharp", csharp);
    hljs.registerLanguage("cs", csharp);
    hljs.registerLanguage("diff", diff);
    hljs.registerLanguage("patch", diff);
    hljs.registerLanguage("dockerfile", dockerfile);
    hljs.registerLanguage("docker", dockerfile);
    hljs.registerLanguage("go", go);
    hljs.registerLanguage("golang", go);
    hljs.registerLanguage("ini", ini);
    hljs.registerLanguage("java", java);
    hljs.registerLanguage("kotlin", kotlin);
    hljs.registerLanguage("kt", kotlin);
    hljs.registerLanguage("php", php);
    hljs.registerLanguage("powershell", powershell);
    hljs.registerLanguage("ps1", powershell);
    hljs.registerLanguage("ruby", ruby);
    hljs.registerLanguage("rb", ruby);
    hljs.registerLanguage("rust", rust);
    hljs.registerLanguage("rs", rust);
    hljs.registerLanguage("sql", sql);
    hljs.registerLanguage("swift", swift);
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
