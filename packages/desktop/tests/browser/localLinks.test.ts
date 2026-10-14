import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { isLocalHostUrl } from "../../src/browser/localLinks";

describe("isLocalHostUrl", () => {
  it("识别 localhost / 环回", () => {
    assert.equal(isLocalHostUrl("http://localhost:5173"), true);
    assert.equal(isLocalHostUrl("https://127.0.0.1/"), true);
    assert.equal(isLocalHostUrl("http://example.com"), false);
  });
});
