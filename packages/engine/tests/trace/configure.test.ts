/**
 * configureAgentTrace：采集开关。
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import { configureAgentTrace, getAgentTraceContext } from "../../src/trace/emit";

afterEach(() => {
  configureAgentTrace({ enabled: true });
});

describe("configureAgentTrace", () => {
  it("可关闭采集", () => {
    configureAgentTrace({ enabled: false });
    assert.equal(getAgentTraceContext().enabled, false);
  });

  it("可重新打开", () => {
    configureAgentTrace({ enabled: false });
    configureAgentTrace({ enabled: true });
    assert.equal(getAgentTraceContext().enabled, true);
  });
});
