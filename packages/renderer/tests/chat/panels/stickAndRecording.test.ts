/**
 * 录制门闩与贴底滚动：录制中通知主进程；贴底且没有划词才跟随。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  distanceFromBottom,
  isNearBottom,
  STICK_BOTTOM_THRESHOLD_PX,
  scrollToBottomIfStuck,
} from "../../../src/features/chat/panels/chatStickScroll";
import {
  isShortcutRecording,
  setShortcutRecording,
} from "../../../src/features/shortcuts/recordingGate";

describe("recording gate", () => {
  it("状态没变不通知；变化时告诉 preload", () => {
    const calls: boolean[] = [];
    Object.assign(globalThis, {
      window: {
        thinker: {
          settings: {
            setShortcutRecording: (active: boolean) => {
              calls.push(active);
            },
          },
        },
      },
    });
    setShortcutRecording(false);
    assert.equal(isShortcutRecording(), false);
    setShortcutRecording(true);
    setShortcutRecording(true);
    setShortcutRecording(false);
    assert.deepEqual(calls, [true, false]);
  });
});

describe("stick scroll", () => {
  it("距底不超过阈值算贴底；没贴住或正在划词就不滚", () => {
    const el = {
      scrollHeight: 500,
      scrollTop: 400,
      clientHeight: 80,
      contains: () => false,
      scrollTo: (_opts: { top: number }) => {
        el.scrollTop = 500;
      },
    };
    assert.equal(distanceFromBottom(el as unknown as HTMLElement), 20);
    assert.equal(isNearBottom(el as unknown as HTMLElement), true);
    assert.equal(STICK_BOTTOM_THRESHOLD_PX, 80);

    Object.assign(globalThis, {
      window: {
        getSelection: () => ({ isCollapsed: false, rangeCount: 1, anchorNode: {} }),
      },
    });
    el.contains = () => true;
    assert.equal(scrollToBottomIfStuck(el as unknown as HTMLElement, true), false);

    el.contains = () => false;
    assert.equal(scrollToBottomIfStuck(el as unknown as HTMLElement, true), true);
    assert.equal(scrollToBottomIfStuck(el as unknown as HTMLElement, false), false);
  });
});
