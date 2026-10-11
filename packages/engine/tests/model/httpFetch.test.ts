/**
 * HTTP 兼容模式配置冒烟测试。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  configureHttpCompatibilityMode,
  getHttpCompatibilityMode,
} from "../../src/model/httpFetch";

describe("configureHttpCompatibilityMode", () => {
  it("accepts http1 and restores default for invalid", () => {
    configureHttpCompatibilityMode("http1");
    assert.equal(getHttpCompatibilityMode(), "http1");

    configureHttpCompatibilityMode("http2");
    assert.equal(getHttpCompatibilityMode(), "http2");

    configureHttpCompatibilityMode(null);
    assert.equal(getHttpCompatibilityMode(), "http2");
  });
});
