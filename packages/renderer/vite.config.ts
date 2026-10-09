import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const designSrc = path.resolve(__dirname, "../design/src");
const markdownSrc = path.resolve(__dirname, "../markdown/src");
const logSrc = path.resolve(__dirname, "../logger/src");
const logWebSrc = path.resolve(__dirname, "../logger/web/src");

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    // Prefer `.ts` over stale deleted `src/**/*.js` left in Vite's module graph.
    extensions: [".mjs", ".ts", ".tsx", ".js", ".jsx", ".json"],
    alias: {
      "@thinker-workbench/shared": path.resolve(__dirname, "../shared/src/index.ts"),
      // CJS artifacts break Vite named imports — resolve log from source like shared.
      "@thinker-workbench/logger/node": path.resolve(logSrc, "node/index.ts"),
      "@thinker-workbench/logger": path.resolve(logSrc, "index.ts"),
      "@thinker-workbench/logger-web": logWebSrc,
      "@thinker-workbench/design/react": path.resolve(designSrc, "react/index.ts"),
      "@thinker-workbench/design/styles.less": path.resolve(designSrc, "styles/design.less"),
      "@thinker-workbench/design/controls.less": path.resolve(designSrc, "styles/controls.less"),
      "@thinker-workbench/design/notes.less": path.resolve(markdownSrc, "styles/notes.less"),
      "@thinker-workbench/design": path.resolve(designSrc, "index.ts"),
      "@thinker-workbench/markdown/react": path.resolve(markdownSrc, "react/index.ts"),
      "@thinker-workbench/markdown/styles.less": path.resolve(markdownSrc, "styles/markdown.less"),
      "@thinker-workbench/markdown/notes.less": path.resolve(markdownSrc, "styles/notes.less"),
      "@thinker-workbench/markdown": path.resolve(markdownSrc, "index.ts"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5179,
    strictPort: true,
    fs: { allow: [path.resolve(__dirname, "../..")] },
  },
  build: {
    outDir: path.resolve(__dirname, "artifacts"),
    emptyOutDir: true,
  },
});
