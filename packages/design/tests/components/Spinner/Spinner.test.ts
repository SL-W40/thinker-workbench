/**
 * Spinner 无障碍名称：status 靠文本播报，不使用 aria-label。
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";
import { Spinner } from "../../../src/components/Spinner/Spinner";

function html(props?: { label?: string; decorative?: boolean }) {
  return renderToStaticMarkup(createElement(Spinner, props));
}

describe("Spinner", () => {
  it("exposes the label as status text without aria-label", () => {
    const markup = html({ label: "Loading" });
    assert.match(markup, /role="status"/);
    assert.match(markup, /tw-spinner__label">Loading</);
    assert.doesNotMatch(markup, /aria-label/);
  });

  it("omits the status name when decorative", () => {
    const markup = html({ decorative: true, label: "Loading" });
    assert.match(markup, /aria-hidden="true"/);
    assert.doesNotMatch(markup, /role="status"/);
    assert.doesNotMatch(markup, /tw-spinner__label/);
    assert.doesNotMatch(markup, /aria-label/);
  });
});
