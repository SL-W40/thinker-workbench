/**
 * 浮层与容器类控件：关闭态不泄漏 DOM、子组件使用边界的守卫、容器初始标记。
 *
 * 浮层 open=true 时走 createPortal，SSR 渲染器不支持 portal，
 * 故这里只锁「关闭态必须什么都不渲染」这条最容易回归的契约。
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";
import { ContextMenu } from "../../src/components/ContextMenu/ContextMenu";
import { Masonry } from "../../src/components/Masonry/Masonry";
import { Popover } from "../../src/components/Popover/Popover";
import { Table } from "../../src/components/Table/Table";

describe("ContextMenu", () => {
  it("renders nothing while closed", () => {
    const markup = renderToStaticMarkup(
      createElement(ContextMenu, {
        open: false,
        anchor: null,
        onClose: () => undefined,
        items: [{ label: "重命名", onSelect: () => undefined }],
      }),
    );
    assert.equal(markup, "");
  });

  it("renders nothing when open but without an anchor", () => {
    const markup = renderToStaticMarkup(
      createElement(ContextMenu, {
        open: true,
        anchor: null,
        onClose: () => undefined,
        items: [{ label: "删除", onSelect: () => undefined }],
      }),
    );
    assert.equal(markup, "");
  });
});

describe("Popover", () => {
  it("renders nothing while closed", () => {
    const markup = renderToStaticMarkup(
      createElement(Popover, { open: false, onClose: () => undefined }, "内容"),
    );
    assert.equal(markup, "");
  });

  it("renders nothing when open without any anchor", () => {
    const markup = renderToStaticMarkup(
      createElement(Popover, { open: true, onClose: () => undefined }, "内容"),
    );
    assert.equal(markup, "");
  });
});

describe("Masonry", () => {
  it("starts unready and keeps the gap on the container", () => {
    const markup = renderToStaticMarkup(
      createElement(Masonry, { gap: 12 }, createElement("div", null, "卡片")),
    );
    assert.match(markup, /tw-masonry/);
    assert.match(markup, /data-ready="0"/);
    assert.match(markup, /卡片/);
  });

  it("renders an empty container without children", () => {
    // 高度由 useLayoutEffect 写入，SSR 阶段不执行，故只锁初始未就绪标记。
    const markup = renderToStaticMarkup(createElement(Masonry, null));
    assert.match(markup, /tw-masonry/);
    assert.match(markup, /data-ready="0"/);
    assert.doesNotMatch(markup, /data-ready="1"/);
  });
});

describe("Table 子组件边界", () => {
  it("throws when a slot is used outside <Table>", () => {
    assert.throws(() => renderToStaticMarkup(createElement(Table.Row, null, "x")));
  });

  it("renders head and body inside the table shell", () => {
    const markup = renderToStaticMarkup(
      createElement(
        Table,
        { density: "compact", cellOverflow: "ellipsis" },
        createElement(
          Table.Head,
          null,
          createElement(Table.Row, null, createElement(Table.Header, null, "名称")),
        ),
        createElement(
          Table.Body,
          null,
          createElement(Table.Row, null, createElement(Table.Cell, null, "会话")),
        ),
      ),
    );
    assert.match(markup, /tw-table-wrap/);
    assert.match(markup, /tw-table--compact/);
    assert.match(markup, /tw-table--cell-ellipsis/);
    assert.match(markup, /scope="col"/);
    assert.match(markup, /名称/);
    assert.match(markup, /会话/);
  });
});
