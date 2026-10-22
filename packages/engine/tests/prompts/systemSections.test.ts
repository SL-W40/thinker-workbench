/**
 * system 分块拼接。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { joinSystemSections } from "../../src/prompts/systemSections";

describe("joinSystemSections", () => {
  it("按顺序用空行拼接，并跳过空白块", () => {
    const text = joinSystemSections([
      { id: "base", text: "base" },
      { id: "environment", text: "  " },
      { id: "rules", text: "rules" },
    ]);
    assert.equal(text, "base\n\nrules");
  });
});
