/**
 * computer PowerShell 辅助纯函数（engine/src/mcp/computer/powershell.ts）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { parseScreenInfo, psQuote, screenInfoText } from "../../../src/mcp/computer/powershell";

describe("psQuote", () => {
  it("wraps in single quotes and doubles embedded ones", () => {
    assert.equal(psQuote("abc"), "'abc'");
    assert.equal(psQuote("it's"), "'it''s'");
    assert.equal(psQuote(""), "''");
  });
});

describe("parseScreenInfo", () => {
  it("reads the last non-empty line of a six-tuple", () => {
    const info = parseScreenInfo("noise\r\n0,0,1920,1080,10,20\r\n");
    assert.deepEqual(info, { left: 0, top: 0, width: 1920, height: 1080, x: 10, y: 20 });
  });

  it("handles negative virtual desktop bounds", () => {
    const info = parseScreenInfo("-1920,0,3840,1080,-10,5");
    assert.equal(info?.left, -1920);
    assert.equal(info?.width, 3840);
  });

  it("returns null for empty / short / non-numeric output", () => {
    assert.equal(parseScreenInfo(""), null);
    assert.equal(parseScreenInfo("   \n  "), null);
    assert.equal(parseScreenInfo("0,0,1920"), null);
    assert.equal(parseScreenInfo("0,0,1920,1080,10,abc"), null);
  });
});

describe("screenInfoText", () => {
  it("formats geometry and cursor", () => {
    const text = screenInfoText({
      left: -1920,
      top: 0,
      width: 3840,
      height: 1080,
      x: 12,
      y: 34,
    });
    assert.equal(text, "screen 3840x1080 at (-1920,0); cursor at (12,34)");
  });
});
