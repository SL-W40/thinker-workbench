/**
 * 表单类控件：受控状态反映、禁用传播与无障碍属性。
 *
 * 与 library.test.ts 一致用 SSR 静态标记断言契约——不引 DOM 测试库，
 * 只锁「渲染出来的语义」这一层（role / aria-* / 状态类）。
 */
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";
import { Checkbox } from "../../src/components/Checkbox/Checkbox";
import { Field } from "../../src/components/Field/Field";
import { Input } from "../../src/components/Input/Input";
import { RadioGroup } from "../../src/components/RadioGroup/RadioGroup";
import { SegmentedControl } from "../../src/components/SegmentedControl/SegmentedControl";
import { Select } from "../../src/components/Select/Select";
import { Switch } from "../../src/components/Switch/Switch";
import { TextArea } from "../../src/components/TextArea/TextArea";

function html(el: ReactElement): string {
  return renderToStaticMarkup(el);
}

describe("Checkbox", () => {
  it("reflects checked through aria-checked", () => {
    const on = html(
      createElement(Checkbox, { checked: true, onChange: () => undefined, "aria-label": "启用" }),
    );
    assert.match(on, /role="checkbox"/);
    assert.match(on, /aria-checked="true"/);
    assert.match(on, /aria-label="启用"/);

    const off = html(createElement(Checkbox, { checked: false, onChange: () => undefined }));
    assert.match(off, /aria-checked="false"/);
  });

  it("marks disabled state", () => {
    const markup = html(
      createElement(Checkbox, { checked: true, onChange: () => undefined, disabled: true }),
    );
    assert.match(markup, /is-disabled/);
    assert.match(markup, /disabled/);
  });
});

describe("Switch", () => {
  it("exposes switch role with the checked state", () => {
    const on = html(
      createElement(Switch, { checked: true, onChange: () => undefined, "aria-label": "深色" }),
    );
    assert.match(on, /role="switch"/);
    assert.match(on, /aria-checked="true"/);
    assert.match(on, /tw-switch__thumb/);
  });

  it("leaves checked false untouched", () => {
    const off = html(createElement(Switch, { checked: false, onChange: () => undefined }));
    assert.match(off, /aria-checked="false"/);
    assert.doesNotMatch(off, /disabled/);
  });
});

describe("RadioGroup", () => {
  const options = [
    { value: "a", label: "紧凑" },
    { value: "b", label: "标准" },
    { value: "c", label: "宽松", disabled: true },
  ];

  it("selects exactly one option", () => {
    const markup = html(
      createElement(RadioGroup, {
        name: "density",
        value: "b",
        options,
        onChange: () => undefined,
        "aria-label": "密度",
      }),
    );
    assert.match(markup, /role="radiogroup"/);
    assert.match(markup, /aria-label="密度"/);
    const selected = markup.match(/aria-checked="true"/g) ?? [];
    assert.equal(selected.length, 1);
    assert.match(markup, /is-selected/);
  });

  it("disables the whole group", () => {
    const markup = html(
      createElement(RadioGroup, {
        name: "density",
        value: "a",
        options,
        onChange: () => undefined,
        disabled: true,
      }),
    );
    assert.match(markup, /tw-radio-group is-disabled/);
  });

  it("disables a single option without disabling the group", () => {
    const markup = html(
      createElement(RadioGroup, {
        name: "density",
        value: "a",
        options,
        onChange: () => undefined,
      }),
    );
    assert.match(markup, /宽松/);
    // 单项禁用只落在该行的 label 上，整组不带 is-disabled
    assert.match(markup, /tw-radio is-disabled/);
    assert.doesNotMatch(markup, /tw-radio-group is-disabled/);
  });
});

describe("SegmentedControl", () => {
  it("marks the active segment", () => {
    const markup = html(
      createElement(SegmentedControl, {
        value: "preview",
        options: [
          { value: "preview", label: "预览" },
          { value: "edit", label: "编辑" },
        ],
        onChange: () => undefined,
        "aria-label": "模式",
      }),
    );
    assert.match(markup, /role="radiogroup"/);
    assert.match(markup, /role="radio"/);
    const selected = markup.match(/aria-checked="true"/g) ?? [];
    assert.equal(selected.length, 1);
    assert.match(markup, /is-selected/);
  });
});

describe("Select", () => {
  it("keeps the listbox closed and reports the collapsed state", () => {
    const markup = html(
      createElement(Select, {
        value: "a",
        options: [
          { value: "a", label: "选项 A" },
          { value: "b", label: "选项 B" },
        ],
        onChange: () => undefined,
        "aria-label": "选择",
      }),
    );
    assert.match(markup, /aria-haspopup="listbox"/);
    assert.match(markup, /aria-expanded="false"/);
    assert.match(markup, /选项 A/);
    assert.doesNotMatch(markup, /role="listbox"/);
  });

  it("disables the trigger", () => {
    const markup = html(
      createElement(Select, {
        value: "a",
        options: [{ value: "a", label: "选项 A" }],
        onChange: () => undefined,
        disabled: true,
      }),
    );
    assert.match(markup, /disabled/);
  });
});

describe("Input", () => {
  it("mirrors invalid into aria-invalid", () => {
    const invalid = html(createElement(Input, { invalid: true, "aria-label": "名称" }));
    assert.match(invalid, /is-invalid/);
    assert.match(invalid, /aria-invalid="true"/);

    const plain = html(createElement(Input, { "aria-label": "名称" }));
    assert.doesNotMatch(plain, /aria-invalid/);
    assert.doesNotMatch(plain, /is-invalid/);
  });

  it("applies size and adornment modifiers", () => {
    const markup = html(
      createElement(Input, {
        size: "sm",
        startAdornment: createElement("span", null, "¥"),
        "aria-label": "金额",
      }),
    );
    assert.match(markup, /tw-input--sm/);
    assert.match(markup, /has-start/);
    assert.match(markup, /tw-input__control/);
  });
});

describe("TextArea", () => {
  it("defaults to three rows and no spellcheck", () => {
    const markup = html(createElement(TextArea, { "aria-label": "备注" }));
    assert.match(markup, /rows="3"/);
    assert.match(markup, /spellcheck="false"/i);
    assert.match(markup, /tw-textarea/);
  });

  it("mirrors invalid into aria-invalid", () => {
    const markup = html(createElement(TextArea, { invalid: true }));
    assert.match(markup, /is-invalid/);
    assert.match(markup, /aria-invalid="true"/);
  });
});

describe("Field", () => {
  it("wires the label to the control and marks required", () => {
    const markup = html(
      createElement(
        Field,
        { label: "名称", htmlFor: "name", required: true },
        createElement("input", { id: "name" }),
      ),
    );
    assert.match(markup, /is-required/);
    assert.match(markup, /for="name"/);
    assert.match(markup, /tw-field__required/);
  });

  it("omits the label element when label is absent", () => {
    const markup = html(createElement(Field, { description: "可选" }, createElement("input", {})));
    assert.doesNotMatch(markup, /tw-field__label/);
    assert.match(markup, /可选/);
  });

  it("renders the error text", () => {
    const markup = html(
      createElement(Field, { label: "名称", error: "不能为空" }, createElement("input", {})),
    );
    assert.match(markup, /不能为空/);
  });
});
