import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const designSrc = path.resolve(__dirname, "../design/src");
const markdownSrc = path.resolve(__dirname, "../markdown/src");
const logSrc = path.resolve(__dirname, "../logger/src");
const logWebSrc = path.resolve(__dirname, "../logger/web/src");

/** `pnpm run dev -- --no-hot` 时由 scripts/dev.mjs 注入。 */
const noHot = process.env.TW_DEV_NO_HOT === "1" || process.env.TW_DEV_NO_HOT === "true";

export default defineConfig({
  // --no-hot 时必须关掉 Fast Refresh：否则仍注入 /@react-refresh，入口模块加载失败、闪屏卡死
  plugins: [react({ fastRefresh: !noHot })],
  base: "./",
  resolve: {
    // Prefer `.ts` over stale deleted `src/**/*.js` left in Vite's module graph.
    extensions: [".mjs", ".ts", ".tsx", ".js", ".jsx", ".json"],
    alias: {
      "@thinker-workbench/shared": path.resolve(__dirname, "../shared/src/index.ts"),
      // CJS 产物会破坏 Vite 的命名导入——像 shared 一样改为从源码解析 log。
      "@thinker-workbench/logger/node": path.resolve(logSrc, "node/index.ts"),
      "@thinker-workbench/logger": path.resolve(logSrc, "index.ts"),
      "@thinker-workbench/logger-web": logWebSrc,
      "@thinker-workbench/design/react": path.resolve(designSrc, "react/index.ts"),
      "@thinker-workbench/design/styles.less": path.resolve(designSrc, "styles/design.less"),
      "@thinker-workbench/design/controls.less": path.resolve(designSrc, "styles/controls.less"),
      "@thinker-workbench/design": path.resolve(designSrc, "index.ts"),
      "@thinker-workbench/markdown/react": path.resolve(markdownSrc, "react/index.ts"),
      "@thinker-workbench/markdown/styles.less": path.resolve(markdownSrc, "styles/markdown.less"),
      "@thinker-workbench/markdown/notes.less": path.resolve(markdownSrc, "styles/notes.less"),
      "@thinker-workbench/markdown": path.resolve(markdownSrc, "index.ts"),
    },
  },
  // Monaco 0.57 入口含大量 side-effect 注册；预打包会裁掉 typescript/json 语言服务，
  // 导致运行时 `monaco.typescript` 为空、闪屏卡死。改为走源码模块图。
  optimizeDeps: {
    exclude: ["monaco-editor"],
  },
  server: {
    host: "127.0.0.1",
    port: 5179,
    strictPort: true,
    // Electron 加载固定端口；显式 HMR 避免偶发连错导致更新后白屏。
    // --no-hot：关 HMR，运行中窗口不随改动刷新（仍可手动 reload）。
    hmr: noHot
      ? false
      : {
          protocol: "ws",
          host: "127.0.0.1",
          port: 5179,
          clientPort: 5179,
        },
    fs: { allow: [path.resolve(__dirname, "../..")] },
  },
  build: {
    outDir: path.resolve(__dirname, "artifacts"),
    emptyOutDir: true,
  },
});
