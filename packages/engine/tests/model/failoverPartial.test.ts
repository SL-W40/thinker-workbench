/**
 * chatWithFailover：取消路径冒烟（详细 failover 见其它 catalog 测）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { chatWithFailover } from "../../src/model/catalog";

describe("chatWithFailover cancel", () => {
  it("无 catalog 时调用会失败（配置未就绪）", async () => {
    const ac = new AbortController();
    await assert.rejects(
      () =>
        chatWithFailover({ messages: [{ role: "user", content: "hi" }], system: "s" }, ac.signal),
      /./,
    );
  });
});
