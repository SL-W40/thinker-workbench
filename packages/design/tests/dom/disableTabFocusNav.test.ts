/**
 * Tab 不再移动焦点：只拦截 Tab，重复安装不加监听。
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import { disableTabFocusNav } from "../../src/dom/disableTabFocusNav";

describe("disableTabFocusNav", () => {
  const listeners: Array<(event: { key: string; preventDefault: () => void }) => void> = [];

  afterEach(() => {
    listeners.length = 0;
    Reflect.deleteProperty(globalThis, "window");
  });

  it("没有 window 时什么都不做；装上后只 preventDefault Tab", () => {
    disableTabFocusNav();

    Object.assign(globalThis, {
      window: {
        addEventListener: (_type: string, fn: (typeof listeners)[number]) => {
          listeners.push(fn);
        },
      },
    });
    disableTabFocusNav();
    disableTabFocusNav();
    assert.equal(listeners.length, 1);

    let prevented = 0;
    const tab = {
      key: "Tab",
      preventDefault: () => {
        prevented += 1;
      },
    };
    listeners[0]?.(tab);
    listeners[0]?.({
      key: "a",
      preventDefault: () => {
        prevented += 1;
      },
    });
    assert.equal(prevented, 1);
  });
});
