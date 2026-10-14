/**
 * 进程内事件总线：订阅、取消、同步广播。
 */
import assert from "node:assert/strict";
import type { AgentEvent } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { EventBus } from "../../src/runtime/EventBus";

describe("EventBus", () => {
  it("emit 同步通知当前订阅者，取消后不再收到", () => {
    const bus = new EventBus();
    const seen: string[] = [];
    const off = bus.subscribe((event) => {
      seen.push(event.type);
    });
    const event = { type: "run_done", runId: "r", threadId: "t" } as AgentEvent;
    bus.emit(event);
    off();
    bus.emit(event);
    assert.deepEqual(seen, ["run_done"]);
  });
});
