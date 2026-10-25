/**
 * 展示类控件：状态类名、进度语义与可选区块的渲染条件。
 */
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "vitest";
import { Badge } from "../../src/components/Badge/Badge";
import { Callout } from "../../src/components/Callout/Callout";
import { ChoiceCard } from "../../src/components/ChoiceCard/ChoiceCard";
import { EmptyState } from "../../src/components/EmptyState/EmptyState";
import { IconButton } from "../../src/components/IconButton/IconButton";
import { Progress } from "../../src/components/Progress/Progress";
import { Separator } from "../../src/components/Separator/Separator";

function html(el: ReactElement): string {
  return renderToStaticMarkup(el);
}

describe("Badge", () => {
  it("falls back to the neutral variant", () => {
    const markup = html(createElement(Badge, null, "只读"));
    assert.match(markup, /tw-badge--neutral/);
    assert.match(markup, /只读/);
  });

  it("applies the requested variant", () => {
    const markup = html(createElement(Badge, { variant: "danger" }, "错误"));
    assert.match(markup, /tw-badge--danger/);
    assert.doesNotMatch(markup, /tw-badge--neutral/);
  });
});

describe("Callout", () => {
  it("defaults to the note role with a title", () => {
    const markup = html(createElement(Callout, { title: "注意" }, "正文"));
    assert.match(markup, /role="note"/);
    assert.match(markup, /tw-callout--info/);
    assert.match(markup, /正文/);
  });

  it("renders the action block only when provided", () => {
    const withAction = html(
      createElement(
        Callout,
        { tone: "warning", action: createElement("button", null, "重试") },
        "正文",
      ),
    );
    assert.match(withAction, /tw-callout--warning/);
    assert.match(withAction, /has-action/);
    assert.match(withAction, /tw-callout__action/);
    assert.match(withAction, /重试/);

    const plain = html(createElement(Callout, null, "正文"));
    assert.doesNotMatch(plain, /has-action/);
    assert.doesNotMatch(plain, /tw-callout__action/);
  });

  it("omits the strong title when none is given", () => {
    const markup = html(createElement(Callout, null, "正文"));
    assert.doesNotMatch(markup, /tw-callout__title/);
  });
});

describe("ChoiceCard", () => {
  it("exposes option role and selected state", () => {
    const markup = html(
      createElement(
        ChoiceCard,
        { selected: true, onSelect: () => undefined, "aria-label": "浅色" },
        "浅色",
      ),
    );
    assert.match(markup, /role="option"/);
    assert.match(markup, /aria-selected="true"/);
    assert.match(markup, /is-selected/);
  });

  it("renders the swatch only when supplied", () => {
    const withSwatch = html(
      createElement(
        ChoiceCard,
        {
          selected: false,
          onSelect: () => undefined,
          swatch: createElement("span", null, ""),
        },
        "浅色",
      ),
    );
    assert.match(withSwatch, /tw-choice-card__swatch/);
    assert.match(withSwatch, /aria-selected="false"/);

    const plain = html(
      createElement(ChoiceCard, { selected: false, onSelect: () => undefined }, "浅色"),
    );
    assert.doesNotMatch(plain, /tw-choice-card__swatch/);
  });
});

describe("EmptyState", () => {
  it("renders title, description and action together", () => {
    const markup = html(
      createElement(EmptyState, {
        title: "还没有文件",
        description: "打开一个开始",
        action: createElement("button", null, "新建"),
      }),
    );
    assert.match(markup, /tw-empty/);
    assert.match(markup, /tw-empty__title/);
    assert.match(markup, /tw-empty__desc/);
    assert.match(markup, /tw-empty__action/);
    assert.match(markup, /新建/);
  });

  it("drops the optional blocks when absent", () => {
    const markup = html(createElement(EmptyState, { title: "空" }));
    assert.doesNotMatch(markup, /tw-empty__desc/);
    assert.doesNotMatch(markup, /tw-empty__action/);
    assert.doesNotMatch(markup, /tw-empty__icon/);
  });
});

describe("IconButton", () => {
  it("requires an accessible name and applies modifiers", () => {
    const markup = html(
      createElement(
        IconButton,
        { "aria-label": "关闭", variant: "ghost", size: "sm" },
        createElement("span", null, "×"),
      ),
    );
    assert.match(markup, /aria-label="关闭"/);
    assert.match(markup, /tw-icon-btn--ghost/);
    assert.match(markup, /tw-icon-btn--sm/);
    assert.match(markup, /type="button"/);
  });

  it("defaults to the ghost variant and medium size", () => {
    const markup = html(
      createElement(IconButton, { "aria-label": "更多" }, createElement("span", null, "…")),
    );
    assert.match(markup, /tw-icon-btn--ghost/);
    assert.match(markup, /tw-icon-btn--md/);
  });
});

describe("Progress", () => {
  it("reports value, min and max", () => {
    const markup = html(createElement(Progress, { value: 40, "aria-label": "进度" }));
    assert.match(markup, /role="progressbar"/);
    assert.match(markup, /aria-valuemin="0"/);
    assert.match(markup, /aria-valuemax="100"/);
    assert.match(markup, /aria-valuenow="40"/);
  });

  it("clamps out-of-range values", () => {
    assert.match(html(createElement(Progress, { value: 250 })), /aria-valuenow="100"/);
    assert.match(html(createElement(Progress, { value: -5 })), /aria-valuenow="0"/);
  });

  it("falls back to max 100 when max is not positive", () => {
    const markup = html(createElement(Progress, { value: 50, max: 0 }));
    assert.match(markup, /aria-valuemax="100"/);
  });

  it("drops the numeric semantics while indeterminate", () => {
    const markup = html(createElement(Progress, { indeterminate: true }));
    assert.match(markup, /is-indeterminate/);
    assert.doesNotMatch(markup, /aria-valuenow/);
    assert.doesNotMatch(markup, /aria-valuemax/);
  });
});

describe("Separator", () => {
  it("is decorative by default", () => {
    const markup = html(createElement(Separator, null));
    assert.match(markup, /tw-separator--horizontal/);
    assert.match(markup, /aria-hidden="true"/);
    assert.doesNotMatch(markup, /aria-orientation/);
  });

  it("exposes orientation when semantic", () => {
    const markup = html(createElement(Separator, { decorative: false, orientation: "vertical" }));
    assert.match(markup, /tw-separator--vertical/);
    assert.match(markup, /aria-orientation="vertical"/);
    assert.doesNotMatch(markup, /aria-hidden/);
  });
});
