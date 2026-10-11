/**
 * Monorepo 单元测试：Vitest 官方 HTML / JUnit / v8 覆盖率。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const report = process.argv.includes("--coverage") || process.env.TW_TEST_REPORT === "1";

export default defineConfig({
  resolve: {
    alias: {
      "@thinker-workbench/shared": path.resolve(repoRoot, "packages/shared/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: [
      "packages/markdown/tests/**/*.test.ts",
      "packages/engine/tests/**/*.test.ts",
      "packages/desktop/tests/**/*.test.ts",
      "packages/renderer/tests/**/*.test.ts",
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
