/**
 * Monorepo 单元测试：Vitest 官方 HTML / JUnit / v8 覆盖率。
 * 按域隔离环境：renderer / design 走 jsdom（组件与 DOM API），
 * shared / engine / desktop / markdown 保持 node
 * （desktop 依赖 better-sqlite3，按 Electron ABI 编译，切 jsdom 会直接挂）。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const report = process.argv.includes("--coverage") || process.env.TW_TEST_REPORT === "1";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // 注意：Vite alias 为前缀匹配（@rollup/plugin-alias 语义），
    // 子路径（/react、*.less）必须排在包名前，否则会被包名条目抢先替换
    alias: {
      "@thinker-workbench/design/react": path.resolve(
        repoRoot,
        "packages/design/src/react/index.ts",
      ),
      "@thinker-workbench/design/styles.less": path.resolve(
        repoRoot,
        "packages/design/src/styles/design.less",
      ),
      "@thinker-workbench/design/controls.less": path.resolve(
        repoRoot,
        "packages/design/src/styles/controls.less",
      ),
      "@thinker-workbench/design/notes.less": path.resolve(
        repoRoot,
        "packages/markdown/src/styles/notes.less",
      ),
      "@thinker-workbench/design": path.resolve(repoRoot, "packages/design/src/index.ts"),
      "@thinker-workbench/markdown/react": path.resolve(
        repoRoot,
        "packages/markdown/src/react/index.ts",
      ),
      "@thinker-workbench/markdown/styles.less": path.resolve(
        repoRoot,
        "packages/markdown/src/styles/markdown.less",
      ),
      "@thinker-workbench/markdown/notes.less": path.resolve(
        repoRoot,
        "packages/markdown/src/styles/notes.less",
      ),
      "@thinker-workbench/markdown": path.resolve(repoRoot, "packages/markdown/src/index.ts"),
      "@thinker-workbench/shared": path.resolve(repoRoot, "packages/shared/src/index.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["packages/{shared,engine,desktop,markdown}/tests/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["packages/{renderer,design}/tests/**/*.test.ts"],
        },
      },
    ],
    reporters: report
      ? [
          "default",
          ["junit", { outputFile: "test-results/junit.xml" }],
          ["html", { outputFile: "test-results/report/index.html" }],
        ]
      : ["default"],
    coverage: {
      provider: "v8",
      // 只统计本次跑测实际加载到的源文件，避免整仓 src 刷 0%
      all: false,
      reportsDirectory: "test-results/report/coverage",
      reporter: ["text", "html", "lcov"],
      include: [
        "packages/shared/src/**/*.{ts,tsx}",
        "packages/design/src/**/*.{ts,tsx}",
        "packages/markdown/src/**/*.{ts,tsx}",
        "packages/engine/src/**/*.{ts,tsx}",
        "packages/desktop/src/**/*.{ts,tsx}",
        "packages/renderer/src/**/*.{ts,tsx}",
      ],
      exclude: [
        "**/*.test.ts",
        "**/tests/**",
        "**/node_modules/**",
        "**/artifacts/**",
        "**/*.d.ts",
      ],
    },
  },
});
