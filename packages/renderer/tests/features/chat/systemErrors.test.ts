/**
 * 系统错误识别：未配置密钥 vs 钥匙串拒绝。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  isMissingApiKeyError,
  isUnlockDeniedError,
} from "../../../src/features/chat/systemErrors";

describe("systemErrors", () => {
  it("区分 missing 与 unlock denied", () => {
    assert.equal(isMissingApiKeyError("MODEL_API_KEY_MISSING"), true);
    assert.equal(isUnlockDeniedError("MODEL_API_KEY_MISSING"), false);

    assert.equal(isUnlockDeniedError("MODEL_API_KEY_UNLOCK_DENIED"), true);
    assert.equal(isMissingApiKeyError("MODEL_API_KEY_UNLOCK_DENIED"), false);
  });

  it("兼容旧英文文案", () => {
    assert.equal(isMissingApiKeyError("API key is not set"), true);
    assert.equal(isUnlockDeniedError("Failed to unlock the saved API key"), true);
    assert.equal(isMissingApiKeyError("Failed to unlock the saved API key"), false);
  });
});
