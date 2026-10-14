import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import { createDataBroadcastBatcher } from "../../src/terminal/dataBroadcastBatcher";

describe("createDataBroadcastBatcher", () => {
  const timers: ReturnType<typeof setTimeout>[] = [];

  afterEach(() => {
    for (const t of timers) clearTimeout(t);
    timers.length = 0;
  });

  it("同会话多 chunk 在时间窗内合并为一次 send", async () => {
    const sent: Array<{ sessionId: string; data: string }> = [];
    const batcher = createDataBroadcastBatcher((sessionId, data) => {
      sent.push({ sessionId, data });
    }, 20);

    batcher.enqueue("a", "hel");
    batcher.enqueue("a", "lo");
    assert.equal(sent.length, 0);

    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 30);
      timers.push(t);
    });

    assert.deepEqual(sent, [{ sessionId: "a", data: "hello" }]);
    batcher.dispose();
  });

  it("不同会话各自合并，flush 可提前刷出", () => {
    const sent: Array<{ sessionId: string; data: string }> = [];
    const batcher = createDataBroadcastBatcher((sessionId, data) => {
      sent.push({ sessionId, data });
    }, 50);

    batcher.enqueue("a", "1");
    batcher.enqueue("b", "2");
    batcher.enqueue("a", "3");
    batcher.flush("a");

    assert.deepEqual(sent, [{ sessionId: "a", data: "13" }]);
    batcher.flush();
    assert.deepEqual(sent, [
      { sessionId: "a", data: "13" },
      { sessionId: "b", data: "2" },
    ]);
    batcher.dispose();
  });

  it("空 chunk 不入队；dispose 会刷空", () => {
    const sent: string[] = [];
    const batcher = createDataBroadcastBatcher((_id, data) => {
      sent.push(data);
    }, 50);

    batcher.enqueue("a", "");
    batcher.enqueue("a", "x");
    assert.equal(sent.length, 0);
    batcher.dispose();
    assert.deepEqual(sent, ["x"]);
  });
});
