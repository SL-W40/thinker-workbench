import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import { browserCall } from "../../src/host/browserClient";
import { setAllowAiBrowser } from "../../src/workspace";

describe("browserCall allowAiBrowser", () => {
  afterEach(() => {
    setAllowAiBrowser(true);
  });

  it("关闭浏览器保护设置时拒绝调用", async () => {
    setAllowAiBrowser(false);
    await assert.rejects(() => browserCall("snapshot", {}), /Browser tools are disabled/i);
  });
});
