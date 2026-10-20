/**
 * 过程说明：只写工具行给不了的结论、转向或需要用户动作，并限一句。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { SYSTEM_PROMPT } from "../../src/prompts/system";

describe("SYSTEM_PROMPT 过程说明", () => {
  it("调工具前给一句 [NEXT] 小结（打算/结论/方向变化/用户动作），限一句且不预告工具名", () => {
    assert.match(SYSTEM_PROMPT, /\[NEXT\]/);
    assert.match(SYSTEM_PROMPT, /conclusion/i);
    assert.match(SYSTEM_PROMPT, /change of direction/i);
    assert.match(SYSTEM_PROMPT, /when the user must act/i);
    assert.match(SYSTEM_PROMPT, /one sentence/i);
    assert.match(SYSTEM_PROMPT, /40 Chinese characters or 12 English words/);
    assert.match(SYSTEM_PROMPT, /Do not announce the next tool/i);
  });

  it("画图优先用 mermaid 围栏块，禁用 ASCII / SVG 等替代画法", () => {
    assert.match(SYSTEM_PROMPT, /```mermaid/);
    assert.match(SYSTEM_PROMPT, /renders it as a real picture/i);
    assert.match(SYSTEM_PROMPT, /ASCII/i);
    assert.match(SYSTEM_PROMPT, /SVG/i);
  });
});
