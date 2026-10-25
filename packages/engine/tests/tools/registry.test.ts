/**
 * shell 工具 schema：await / exec_mode / shell_write。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { getTool, listTools } from "../../src/tools/registry";

describe("shell tool specs", () => {
  it("注册 shell / shell_await / shell_write", () => {
    const names = new Set(listTools().map((t) => t.name));
    assert.ok(names.has("shell"));
    assert.ok(names.has("shell_await"));
    assert.ok(names.has("shell_write"));
  });

  it("shell 参数含 await 与 exec_mode", () => {
    const shell = getTool("shell");
    assert.ok(shell);
    assert.ok(shell?.parameters.properties.await);
    assert.equal(shell?.parameters.properties.await.type, "boolean");
    assert.ok(shell?.parameters.properties.exec_mode);
  });

  it("shell_write 支持 secret", () => {
    const w = getTool("shell_write");
    assert.ok(w);
    assert.ok(w?.parameters.properties.secret);
    assert.equal(w?.parameters.properties.secret.type, "boolean");
  });
});
