/**
 * assembleContext 的 system 与分块拼接结果一致。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { assembleContext } from "../../src/context/assembleContext";
import { joinSystemSections } from "../../src/prompts/systemSections";

describe("assembleContext system sections", () => {
  it("分块按原顺序拼回 system", () => {
    const ctx = assembleContext({
      messages: [{ role: "user", content: "hi" }],
      aiLocale: "en",
      allowEmoji: false,
      dataDir: null,
      workspaceRoot: null,
      chatMode: "agent",
    });
    assert.ok(ctx.systemSections.some((section) => section.id === "base"));
    assert.ok(ctx.systemSections.some((section) => section.id === "environment"));
    assert.ok(ctx.systemSections.some((section) => section.id === "mode"));
    assert.equal(ctx.system, joinSystemSections(ctx.systemSections));
  });
});
