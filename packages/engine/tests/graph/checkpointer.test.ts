/**
 * LangGraph MemorySaver 冒烟（生产用 SqliteSaver）。
 */
import assert from "node:assert/strict";
import { MemorySaver } from "@langchain/langgraph";
import { describe, it } from "vitest";
import { buildGraph } from "../../src/graph/buildGraph";

describe("langgraph checkpointer", () => {
  it("compiles with MemorySaver and runs a trivial stream config", async () => {
    const cp = new MemorySaver();
    const graph = buildGraph(cp);
    assert.ok(graph);
    const config = { configurable: { thread_id: "test-thread" } };
    // 空状态 getState 不抛
    const snap = await graph.getState(config);
    assert.ok(snap == null || typeof snap === "object");
  });
});
