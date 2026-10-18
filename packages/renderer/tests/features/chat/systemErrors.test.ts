/**
 * 系统错误识别：未配置密钥 vs 钥匙串拒绝。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { isMissingApiKeyError, isUnlockDeniedError } from "../../../src/features/chat/systemErrors";

describe("systemErrors", () => {
  it("区分 missing 与 unlock denied", () => {
    assert.equal(isMissingApiKeyError("MODEL_API_KEY_MISSING"), true);
    assert.equal(isUnlockDeniedError("MODEL_API_KEY_MISSING"), false);

    assert.equal(isUnlockDeniedError("MODEL_API_KEY_UNLOCK_DENIED"), true);
    assert.equal(isMissingApiKeyError("MODEL_API_KEY_UNLOCK_DENIED"), false);
  });

  it("前缀匹配错误码", () => {
    assert.equal(isMissingApiKeyError("MODEL_API_KEY_MISSING: no key"), true);
    assert.equal(isUnlockDeniedError("MODEL_API_KEY_UNLOCK_DENIED: denied"), true);
  });
});
