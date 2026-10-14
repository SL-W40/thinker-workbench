/**
 * 代码高亮语言注册。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { highlightCode } from "../src/highlight";

describe("highlightCode", () => {
  it("uses registered languages instead of auto-detect", () => {
    for (const lang of ["rust", "go", "java", "sql", "c", "cpp", "diff", "csharp"]) {
      const result = highlightCode("let x = 1;", lang);
      assert.equal(result.language, lang);
      assert.ok(result.html.length > 0);
    }
  });
});
