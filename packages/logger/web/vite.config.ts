import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { logsApiPlugin } from "./src/vite/logsApiPlugin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const designSrc = path.resolve(__dirname, "../../design/src");
const logSrc = path.resolve(__dirname, "../src");
const sharedSrc = path.resolve(__dirname, "../../shared/src");

export default defineConfig({
  root: path.resolve(__dirname, "src"),
  publicDir: path.resolve(__dirname, "../../renderer/public"),
  plugins: [react(), logsApiPlugin()],
  base: "./",
  resolve: {
    extensions: [".mjs", ".ts", ".tsx", ".js", ".jsx", ".json"],
    alias: {
      "@thinker-workbench/design/react": path.resolve(designSrc, "react/index.ts"),
      "@thinker-workbench/design/styles.less": path.resolve(designSrc, "styles/design.less"),
      "@thinker-workbench/design/controls.less": path.resolve(designSrc, "styles/controls.less"),
      "@thinker-workbench/design": path.resolve(designSrc, "index.ts"),
      "@thinker-workbench/logger": path.resolve(logSrc, "index.ts"),
      "@thinker-workbench/shared": path.resolve(sharedSrc, "index.ts"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5181,
    strictPort: true,
    fs: { allow: [path.resolve(__dirname, "../..")] },
  },
  build: {
    outDir: path.resolve(__dirname, "artifacts"),
    emptyOutDir: true,
  },
});
