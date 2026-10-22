/**
 * 过程说明：只写工具行给不了的结论、转向或需要用户动作，并限一句。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { SYSTEM_PROMPT } from "../../src/prompts/system";

describe("SYSTEM_PROMPT 过程说明", () => {
  it("只覆盖结论、方向变化、需要用户动作，并限制为一句", () => {
    assert.match(SYSTEM_PROMPT, /conclusion the tool rows do not already show/i);
    assert.match(SYSTEM_PROMPT, /change of direction/i);
    assert.match(SYSTEM_PROMPT, /something the user must do/i);
    assert.match(SYSTEM_PROMPT, /one sentence/i);
    assert.match(SYSTEM_PROMPT, /40 Chinese characters or 12 English words/);
    assert.match(SYSTEM_PROMPT, /Do not announce the next tool/i);
  });
});
