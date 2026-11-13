/**
 * Composer mention 芯片标记：手打字面量 vs 面板选中。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  COMPOSER_CHIP_MARK,
  extractContextPaths,
  extractSlashSkillNames,
  formatAtPathToken,
  formatSlashSkillToken,
} from "../../src/skills/composerChip";

describe("formatSlashSkillToken", () => {
  it("appends the chip mark after the name", () => {
    assert.equal(formatSlashSkillToken("Write-Tests"), `/write-tests${COMPOSER_CHIP_MARK}`);
  });
});

describe("formatAtPathToken", () => {
  it("marks plain and spaced paths", () => {
    assert.equal(formatAtPathToken("src/a.ts"), `@src/a.ts${COMPOSER_CHIP_MARK}`);
    assert.equal(formatAtPathToken("my dir/x"), `@\`my dir/x\`${COMPOSER_CHIP_MARK}`);
  });
});

describe("extractSlashSkillNames", () => {
  it("ignores hand-typed /skill without the mark", () => {
    assert.deepEqual(extractSlashSkillNames("please /write-tests now"), []);
  });

  it("extracts marked /skill chips only", () => {
    const text = `run ${formatSlashSkillToken("write-tests")} and /bare-name`;
    assert.deepEqual(extractSlashSkillNames(text), ["write-tests"]);
  });
});

describe("extractContextPaths", () => {
  it("ignores hand-typed @path without the mark", () => {
    assert.deepEqual(extractContextPaths("see @src/a.ts please"), []);
  });

  it("extracts marked @path chips and strips trailing slash", () => {
    assert.deepEqual(extractContextPaths(`see ${formatAtPathToken("src/")} `), ["src"]);
    assert.deepEqual(extractContextPaths(`see ${formatAtPathToken("my dir/")} please`), ["my dir"]);
  });
});
