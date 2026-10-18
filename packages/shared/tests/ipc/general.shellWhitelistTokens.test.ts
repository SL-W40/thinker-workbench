/**
 * 「允许并加入白名单」按命令链收集命令名，已加白和硬拒绝不再列入。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { shellCommandsToAllowlist, shellWhitelistTokens } from "../../src/ipc/general";

describe("shellWhitelistTokens", () => {
  it("拆开 && 链，取每段命令名", () => {
    assert.deepEqual(
      shellWhitelistTokens("cd packages/renderer && npx tsc --noEmit --skipLibCheck"),
      ["cd", "npx"],
    );
  });

  it("引号内的 && 不拆；已加白与黑名单不计入将写入的名单", () => {
    assert.deepEqual(shellWhitelistTokens('echo "a && b"'), ["echo"]);
    assert.deepEqual(
      shellCommandsToAllowlist("cd packages/renderer && npx tsc --noEmit", ["npx"], ["rm"]),
      ["cd"],
    );
    assert.deepEqual(shellCommandsToAllowlist("cd x && rm -rf y", [], ["rm"]), ["cd"]);
  });
});
