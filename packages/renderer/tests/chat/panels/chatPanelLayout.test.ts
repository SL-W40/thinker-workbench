/**
 * 侧栏宽度分配：保证中间聊天列不被挤没。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  allocateMainWidth,
  CHAT_LAYOUT_SLACK_PX,
  effectivePanelMinWidth,
  fitChatPanelWidths,
  MIN_CHAT_MAIN_WIDTH,
  maxSidePanelWidth,
  resizeSidePanel,
} from "../../../src/features/chat/panels/chatPanelLayout";

describe("allocateMainWidth", () => {
  it("main = shell - left - right", () => {
    assert.equal(
      allocateMainWidth({
        shellWidth: 1200,
        leftOpen: true,
        rightOpen: true,
        leftWidth: 240,
        rightWidth: 400,
      }),
      560,
    );
  });

  it("关闭的侧栏按 0 计", () => {
    assert.equal(
      allocateMainWidth({
        shellWidth: 800,
        leftOpen: false,
        rightOpen: true,
        leftWidth: 260,
        rightWidth: 300,
      }),
      500,
    );
  });

  it("壳宽未量到时为 0", () => {
    assert.equal(
      allocateMainWidth({
        shellWidth: 0,
        leftOpen: true,
        rightOpen: true,
        leftWidth: 240,
        rightWidth: 400,
      }),
      0,
    );
  });
});

describe("fitChatPanelWidths", () => {
  it("空间足够时不改宽度", () => {
    const next = fitChatPanelWidths({
      shellWidth: 1200,
      leftOpen: true,
      rightOpen: true,
      leftWidth: 240,
      rightWidth: 400,
      minLeft: 180,
      maxLeft: 360,
      minRight: 300,
      maxRight: 1200,
    });
    assert.equal(next.leftWidth, 240);
    assert.equal(next.rightWidth, 400);
  });

  it("不足时先压右侧再压左侧，并为 slack 留空", () => {
    const next = fitChatPanelWidths({
      shellWidth: 900,
      leftOpen: true,
      rightOpen: true,
      leftWidth: 300,
      rightWidth: 500,
      minLeft: 180,
      maxLeft: 360,
      minRight: 300,
      maxRight: 1200,
    });
    const used = next.leftWidth + next.rightWidth;
    assert.ok(used <= 900 - MIN_CHAT_MAIN_WIDTH - CHAT_LAYOUT_SLACK_PX);
    assert.ok(next.rightWidth <= 500);
    assert.ok(next.leftWidth <= 300);
  });

  it("仅右侧打开时只压右侧", () => {
    const next = fitChatPanelWidths({
      shellWidth: 700,
      leftOpen: false,
      rightOpen: true,
      leftWidth: 260,
      rightWidth: 500,
      minLeft: 180,
      maxLeft: 360,
      minRight: 300,
      maxRight: 1200,
    });
    assert.equal(next.leftWidth, 260);
    assert.equal(next.rightWidth, 700 - MIN_CHAT_MAIN_WIDTH - CHAT_LAYOUT_SLACK_PX);
  });
});

describe("maxSidePanelWidth", () => {
  it("按壳宽与对侧占用计算上限（含 slack）", () => {
    assert.equal(
      maxSidePanelWidth({
        shellWidth: 1000,
        otherTaken: 260,
        maxWidth: 1200,
      }),
      1000 - 260 - MIN_CHAT_MAIN_WIDTH - CHAT_LAYOUT_SLACK_PX,
    );
  });

  it("可用小于名义范围时仍返回 allowed", () => {
    assert.equal(
      maxSidePanelWidth({
        shellWidth: 800,
        otherTaken: 260,
        maxWidth: 1200,
      }),
      800 - 260 - MIN_CHAT_MAIN_WIDTH - CHAT_LAYOUT_SLACK_PX,
    );
  });

  it("壳宽未知时退回静态 max", () => {
    assert.equal(
      maxSidePanelWidth({
        shellWidth: 0,
        otherTaken: 260,
        maxWidth: 1200,
      }),
      1200,
    );
  });

  it("对侧让位时 otherTaken 传对侧 min", () => {
    assert.equal(
      maxSidePanelWidth({
        shellWidth: 1000,
        otherTaken: 180,
        maxWidth: 1200,
      }),
      1000 - 180 - MIN_CHAT_MAIN_WIDTH - CHAT_LAYOUT_SLACK_PX,
    );
  });
});

describe("effectivePanelMinWidth", () => {
  it("max 低于名义 min 时跟着收", () => {
    assert.equal(effectivePanelMinWidth(300, 180), 180);
    assert.equal(effectivePanelMinWidth(300, 400), 300);
  });
});

describe("resizeSidePanel", () => {
  const base = {
    shellWidth: 1000,
    leftOpen: true,
    rightOpen: true,
    leftWidth: 260,
    rightWidth: 380,
    minLeft: 180,
    maxLeft: 360,
    minRight: 300,
    maxRight: 1200,
  } as const;

  it("中间仍有余量时只动本侧", () => {
    const next = resizeSidePanel({
      ...base,
      leftWidth: 200,
      rightWidth: 300,
      side: "right",
      nextWidth: 350,
    });
    assert.equal(next.rightWidth, 350);
    assert.equal(next.leftWidth, 200);
  });

  it("中间已到下限时拖宽本侧，对侧让位", () => {
    const next = resizeSidePanel({ ...base, side: "right", nextWidth: 450 });
    assert.equal(next.rightWidth, 450);
    assert.equal(next.leftWidth, 186);
    assert.equal(
      next.leftWidth + next.rightWidth,
      1000 - MIN_CHAT_MAIN_WIDTH - CHAT_LAYOUT_SLACK_PX,
    );
  });

  it("对侧已到 min 时不再让，钳制本侧", () => {
    const next = resizeSidePanel({
      ...base,
      leftWidth: 180,
      rightWidth: 456,
      side: "right",
      nextWidth: 600,
    });
    assert.equal(next.leftWidth, 180);
    assert.equal(next.rightWidth, 1000 - 180 - MIN_CHAT_MAIN_WIDTH - CHAT_LAYOUT_SLACK_PX);
  });

  it("对侧关闭时不改对侧宽度状态", () => {
    const next = resizeSidePanel({
      ...base,
      leftOpen: false,
      side: "right",
      nextWidth: 500,
    });
    assert.equal(next.leftWidth, 260);
    assert.equal(next.rightWidth, 500);
  });
});
