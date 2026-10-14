/**
 * defineTool：字符串结果视为成功，抛错变成 ok:false，ok:false 原样保留。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { defineTool } from "../../src/tools/defineTool";
import type { ToolContext } from "../../src/tools/types";

const ctx: ToolContext = { workspaceRoot: "C:/ws", signal: new AbortController().signal };

describe("defineTool", () => {
  it("包装成功字符串、带 ui 的对象，以及异常", async () => {
    const ok = defineTool({
      name: "demo",
      description: "d",
      parameters: { type: "object", properties: {} },
      execute: async () => "done",
    });
    assert.deepEqual(await ok.run({}, ctx), { ok: true, output: "done" });

    const withUi = defineTool({
      name: "demo",
      description: "d",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ output: "x", ui: { path: "a.txt" }, ok: false }),
    });
    assert.deepEqual(await withUi.run({}, ctx), {
      ok: false,
      output: "x",
      ui: { path: "a.txt" },
    });

    const boom = defineTool({
      name: "demo",
      description: "d",
      parameters: { type: "object", properties: {} },
      execute: async () => {
        throw "nope";
      },
    });
    assert.deepEqual(await boom.run({}, ctx), { ok: false, output: "nope" });
  });
});
