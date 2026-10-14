/**
 * 新增控件的静态标记：忙碌按钮、可移除标签、标签页、设置行、折叠组、菜单项。
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";
import { Button } from "../../src/components/Button/Button";
import { Chip } from "../../src/components/Chip/Chip";
import { Disclosure } from "../../src/components/Disclosure/Disclosure";
import { Kbd } from "../../src/components/Kbd/Kbd";
import { MenuList } from "../../src/components/Menu/MenuList";
import { ModalBody, ModalFooter, ModalHeader } from "../../src/components/Modal/Modal";
import { SettingsRow } from "../../src/components/SettingsRow/SettingsRow";
import { Tabs } from "../../src/components/Tabs/Tabs";

describe("Button busy", () => {
  it("disables the control and exposes aria-busy", () => {
    const markup = renderToStaticMarkup(
      createElement(Button, { busy: true, busyLabel: "保存中" }, "保存"),
    );
    assert.match(markup, /aria-busy="true"/);
    assert.match(markup, /disabled/);
    assert.match(markup, /is-busy/);
    assert.match(markup, /tw-spinner/);
    assert.match(markup, /保存/);
    assert.doesNotMatch(markup, /tw-btn__busy-label/);
  });

  it("uses the busy label when there is no visible text", () => {
    const markup = renderToStaticMarkup(createElement(Button, { busy: true, busyLabel: "保存中" }));
    assert.match(markup, /tw-btn__busy-label">保存中/);
  });
});

describe("Chip", () => {
  it("renders a remove button only when onRemove is set", () => {
    const plain = renderToStaticMarkup(createElement(Chip, { tone: "danger" }, "只读"));
    assert.match(plain, /tw-chip--danger/);
    assert.doesNotMatch(plain, /tw-chip__remove/);

    const removable = renderToStaticMarkup(
      createElement(Chip, { removeLabel: "移除 rg", onRemove: () => undefined }, "rg"),
    );
    assert.match(removable, /aria-label="移除 rg"/);
  });
});

describe("Tabs", () => {
  it("marks the selected tab and the dirty dot", () => {
    const markup = renderToStaticMarkup(
      createElement(Tabs, {
        "aria-label": "面板",
        variant: "document",
        value: "a",
        onChange: () => undefined,
        onClose: () => undefined,
        tabs: [
          { id: "a", label: "笔记", dirty: true, closable: true, closeLabel: "关闭笔记" },
          { id: "b", label: "终端", disabled: true },
        ],
      }),
    );
    assert.match(markup, /aria-selected="true"/);
    assert.match(markup, /is-dirty/);
    assert.match(markup, /aria-label="关闭笔记"/);
    assert.match(markup, /disabled/);
  });
});

describe("SettingsRow", () => {
  it("stacks the control under the title", () => {
    const markup = renderToStaticMarkup(
      createElement(SettingsRow, {
        title: "备注",
        description: "可选",
        stack: true,
        htmlFor: "note",
      }),
    );
    assert.match(markup, /tw-settings-row--stack/);
    assert.match(markup, /for="note"/);
    assert.match(markup, /可选/);
  });
});

describe("Disclosure", () => {
  it("hides the panel while collapsed", () => {
    const closed = renderToStaticMarkup(
      createElement(
        Disclosure,
        {
          title: "工作区",
          count: 2,
          open: false,
          onOpenChange: () => undefined,
        },
        "正文",
      ),
    );
    assert.match(closed, /aria-expanded="false"/);
    assert.doesNotMatch(closed, /正文/);

    const open = renderToStaticMarkup(
      createElement(
        Disclosure,
        {
          title: "工作区",
          open: true,
          onOpenChange: () => undefined,
        },
        "正文",
      ),
    );
    assert.match(open, /aria-expanded="true"/);
    assert.match(open, /正文/);
  });
});

describe("Modal slots", () => {
  it("puts the title id on the heading", () => {
    const markup = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(ModalHeader, { title: "标题", titleId: "t" }),
        createElement(ModalBody, null, "正文"),
        createElement(ModalFooter, null, "确定"),
      ),
    );
    assert.match(markup, /id="t"/);
    assert.match(markup, /tw-modal__title">标题/);
    assert.match(markup, /tw-modal__body">正文/);
    assert.match(markup, /tw-modal__footer">确定/);
  });
});

describe("MenuList", () => {
  it("renders a check, a shortcut, and a submenu trigger", () => {
    const markup = renderToStaticMarkup(
      createElement(MenuList, {
        "aria-label": "操作",
        onClose: () => undefined,
        items: [
          { label: "置顶", checked: true, shortcut: "F2", onSelect: () => undefined },
          { label: "更多", items: [{ label: "重命名", onSelect: () => undefined }] },
          { label: "删除", danger: true, disabled: true, separatorBefore: true },
        ],
      }),
    );
    assert.match(markup, /role="menuitemcheckbox"/);
    assert.match(markup, /aria-checked="true"/);
    assert.match(markup, /tw-kbd--compact/);
    assert.match(markup, /F2/);
    assert.match(markup, /aria-haspopup="menu"/);
    assert.match(markup, /aria-expanded="false"/);
    assert.match(markup, /is-danger/);
    assert.doesNotMatch(markup, />重命名</);
  });
});

describe("Kbd compact", () => {
  it("adds the compact class", () => {
    const markup = renderToStaticMarkup(createElement(Kbd, { compact: true }, "Ctrl+K"));
    assert.match(markup, /tw-kbd--compact/);
  });
});
