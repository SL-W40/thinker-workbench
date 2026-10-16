import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { ensureSvgXmlns } from "../../src/mermaid/svgExport";

describe("svgExport", () => {
  it("injects xmlns when missing", () => {
    const out = ensureSvgXmlns('<svg viewBox="0 0 10 10"></svg>');
    assert.match(out, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  });

  it("keeps existing xmlns", () => {
    const src = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    assert.equal(ensureSvgXmlns(src), src);
  });
});
