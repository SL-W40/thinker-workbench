/**
 * 用本地 monaco-editor 配置 @monaco-editor/react，避免 Electron / 离线时 CDN 一直 Loading。
 * Monaco 0.57：包入口为 `esm/vs/index.js`；TS/JSON 语言服务在顶层 `monaco.typescript` /
 * `monaco.json`（不再挂在 `languages.*`）。子路径仍映射到 `esm/vs/*`。
 */
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/editor/editor.worker?worker";
import cssWorker from "monaco-editor/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/language/html/html.worker?worker";
import jsonWorker from "monaco-editor/language/json/json.worker?worker";
import tsWorker from "monaco-editor/language/typescript/ts.worker?worker";

let configured = false;

/**
 * 为 TS / JS 打开补全与 JSX；为 JSON 打开校验。
 * 不做语义诊断：内置 worker 看不到 node_modules / tsconfig / 工作区其它文件，
 * 「Cannot find module 'react-dom'」一类报错均为假阳性。
 */
function configureLanguageServices(m: typeof monaco): void {
  const ts = m.typescript;
  if (!ts?.typescriptDefaults || !ts.ScriptTarget) {
    console.warn("[monacoSetup] monaco.typescript unavailable; skip TS language defaults");
  } else {
    const compilerOptions: monaco.typescript.CompilerOptions = {
      target: ts.ScriptTarget.ESNext,
      allowNonTsExtensions: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      module: ts.ModuleKind.ESNext,
      noEmit: true,
      esModuleInterop: true,
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.ReactJSX,
      reactNamespace: "React",
      allowSyntheticDefaultImports: true,
    };

    ts.typescriptDefaults.setCompilerOptions(compilerOptions);
    ts.javascriptDefaults.setCompilerOptions(compilerOptions);

    const syntaxOnly = {
      noSemanticValidation: true,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: true,
      // 若将来打开语义诊断，仍忽略模块解析类假阳性
      diagnosticCodesToIgnore: [2307, 2792, 7016],
    };
    ts.typescriptDefaults.setDiagnosticsOptions(syntaxOnly);
    ts.javascriptDefaults.setDiagnosticsOptions(syntaxOnly);

    ts.typescriptDefaults.setEagerModelSync(true);
    ts.javascriptDefaults.setEagerModelSync(true);
  }

  const json = m.json;
  if (!json?.jsonDefaults) {
    console.warn("[monacoSetup] monaco.json unavailable; skip JSON language defaults");
  } else {
    json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: true,
      schemas: [],
      enableSchemaRequest: false,
    });
  }
}

/** 幂等：首次导入时配置 loader、worker 与语言服务。 */
export function ensureMonaco(): void {
  if (configured) return;
  configured = true;

  loader.config({ monaco });
  configureLanguageServices(monaco);

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
