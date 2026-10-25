/**
 * assembleContext 的 system 与分块拼接结果一致。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { assembleContext } from "../../src/context/assembleContext";
import { joinSystemSections } from "../../src/prompts/systemSections";

describe("assembleContext system sections", () => {
  it("分块按原顺序拼回 system", async () => {
    const ctx = await assembleContext({
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

  it("memory 段位于 systemSections 末尾，不抢在 base/mode 之前", async () => {
    const ctx = await assembleContext({
      messages: [{ role: "user", content: "hi" }],
      aiLocale: "en",
      allowEmoji: false,
      dataDir: null,
      workspaceRoot: null,
      chatMode: "agent",
      projectMemory: "PM",
      sessionMemory: "## Session Summary\n- earlier turns",
    });
    const ids = ctx.systemSections.map((s) => s.id);
    const memoryIdx = ids.indexOf("memory");
    assert.ok(memoryIdx > 0, "memory 段应存在");
    assert.equal(memoryIdx, ids.length - 1, "memory 段应是最后一个 system 段");
    assert.ok(ids.indexOf("base") < memoryIdx);
    assert.ok(ids.indexOf("mode") < memoryIdx);
  });
});
