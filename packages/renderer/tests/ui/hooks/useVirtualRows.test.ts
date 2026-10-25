/**
 * 虚拟列表窗口：只渲染视口附近的行，滚动后窗口跟着走。
 * 行高量不到（jsdom 无布局）时按 estimate 占位，故偏移量可精确断言。
 */
import assert from "node:assert/strict";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, it } from "vitest";
import { useVirtualRows } from "../../../src/ui/hooks/useVirtualRows";

const ESTIMATE = 30;
const COUNT = 400;

function Harness({ count = COUNT }: { count?: number }) {
  const v = useVirtualRows({ count, estimate: ESTIMATE, overscan: 2 });
  return createElement(
    "div",
    { ref: v.scrollRef, "data-testid": "scroller" },
    createElement(
      "div",
      { "data-testid": "content", style: { height: v.contentHeight } },
      v.rows.map(({ index, offset }) =>
        createElement("div", {
          key: index,
          ref: v.measureRef(index),
          "data-index": index,
          "data-offset": offset,
        }),
      ),
    ),
  );
}

function rendered(): { index: number; offset: number }[] {
  const content = screen.getByTestId("content");
  return Array.from(content.children).map((el) => ({
    index: Number((el as HTMLElement).dataset.index),
    offset: Number((el as HTMLElement).dataset.offset),
  }));
}

/** 触发一次滚动并等 rAF 合并后的重渲染落地。 */
async function scrollTo(top: number) {
  const scroller = screen.getByTestId("scroller");
  await act(async () => {
    scroller.scrollTop = top;
    scroller.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
}

describe("useVirtualRows", () => {
  afterEach(() => cleanup());

  it("只渲染视口附近的行，而不是整表", () => {
    render(createElement(Harness));
    const rows = rendered();
    assert.ok(rows.length > 0, "至少要渲染第一行");
    assert.ok(rows.length < COUNT / 4, `渲染了 ${rows.length} 行，远少于 ${COUNT}`);
    assert.equal(rows[0].index, 0);
  });

  it("按估算高度累加出偏移与总高", () => {
    render(createElement(Harness));
    const rows = rendered();
    for (const row of rows) assert.equal(row.offset, row.index * ESTIMATE);
    const content = screen.getByTestId("content");
    assert.equal((content as HTMLElement).style.height, `${COUNT * ESTIMATE}px`);
  });

  it("滚动后窗口跟着移动", async () => {
    render(createElement(Harness));
    await scrollTo(ESTIMATE * 100);
    const rows = rendered();
    assert.ok(rows[0].index > 0, "滚到中段后不该还从 0 开始");
    assert.ok(
      rows.some((r) => r.index >= 100),
      "第 100 行附近应该在窗口里",
    );
  });
});
