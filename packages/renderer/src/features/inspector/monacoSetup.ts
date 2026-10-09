/**
 * 用本地 monaco-editor 配置 @monaco-editor/react，避免 Electron / 离线时 CDN 一直 Loading。
 * Monaco 0.57 的 exports 把子路径映射到 `esm/vs/*`，故不要写 `monaco-editor/esm/vs/...`。
 */
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import cssWorker from "monaco-editor/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/language/html/html.worker?worker";
import jsonWorker from "monaco-editor/language/json/json.worker?worker";
import tsWorker from "monaco-editor/language/typescript/ts.worker?worker";

let configured = false;

/** 幂等：首次导入时配置 loader 与 worker。 */
export function ensureMonaco(): void {
  if (configured) return;
  configured = true;

  loader.config({ monaco });

  (globalThis as typeof globalThis & {
    MonacoEnvironment?: { getWorker: (workerId: string, label: string) => Worker };
  }).MonacoEnvironment = {
    getWorker(_workerId: string, label: string) {
      if (label === "json") return new jsonWorker();
      if (label === "css" || label === "scss" || label === "less") return new cssWorker();
      if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
      if (label === "typescript" || label === "javascript") return new tsWorker();
      return new editorWorker();
    },
  };
}

ensureMonaco();
