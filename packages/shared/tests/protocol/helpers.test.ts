/**
 * 协议里的小纯函数：id、locale、chat mode、scope、窗口页、空上下文快照。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createRunId, createThreadId } from "../../src/ids";
import { normalizeChatMode } from "../../src/ipc/chatMode";
import { emptyContextUsageSnapshot } from "../../src/ipc/contextUsage";
import { customizeScopeKey, normalizeCustomizeScope } from "../../src/ipc/customize";
import { normalizeAiLocale, normalizeAppLocale } from "../../src/ipc/locale";
import { isAuxPageId } from "../../src/ipc/window";

describe("shared protocol helpers", () => {
  it("id 带前缀；非法语言与姿态回退默认", () => {
    assert.match(createThreadId(), /^thread_/);
    assert.match(createRunId(), /^run_/);
    assert.equal(normalizeAppLocale("zh"), "zh");
    assert.equal(normalizeAppLocale("fr", "zh"), "zh");
    assert.equal(normalizeAiLocale("en"), "en");
    assert.equal(normalizeAiLocale("nope"), "smart");
    assert.equal(normalizeChatMode("plan"), "plan");
    assert.equal(normalizeChatMode("chat"), "agent");
  });

  it("scope 缺省是 user；辅助页只认 settings 与 tools", () => {
    assert.deepEqual(normalizeCustomizeScope(null), { kind: "user" });
    assert.deepEqual(normalizeCustomizeScope({ kind: "workspace", workspaceId: " ws " }), {
      kind: "workspace",
      workspaceId: "ws",
    });
    assert.equal(customizeScopeKey({ kind: "user" }), "user");
    assert.equal(customizeScopeKey({ kind: "workspace", workspaceId: "ws" }), "workspace:ws");
    assert.equal(isAuxPageId("tools"), true);
    assert.equal(isAuxPageId("chat"), false);
  });

  it("空上下文快照五个分段都是 0", () => {
    const snap = emptyContextUsageSnapshot(1000);
    assert.equal(snap.limit, 1000);
    assert.equal(snap.used, 0);
    assert.deepEqual(
      snap.segments.map((s) => s.id),
      ["system", "tools", "rules", "skills", "contextFiles", "conversation"],
    );
  });
});
