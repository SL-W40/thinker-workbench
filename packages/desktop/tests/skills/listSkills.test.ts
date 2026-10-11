/**
 * Composer `/` 摘要列表须正确解析 `description: >-` 块标量。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "vitest";
import { listSkillSummaries } from "../../src/skills/listSkills";

describe("listSkillSummaries frontmatter", () => {
  let tmp: string;

  afterEach(() => {
    if (tmp) {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it("解析 description: >- 多行块标量，不把 >- 当成描述", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tw-list-skills-"));
    const dir = path.join(tmp, ".thinker", "skills", "create-rule");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      [
        "---",
        "name: create-rule",
        "description: >-",
        "  Create Thinker project rules for persistent agent guidance.",
        "  Use when asked to create a rule.",
        "disable-model-invocation: false",
        "---",
        "",
        "# Create",
        "",
      ].join("\n"),
      "utf8",
    );

    const items = listSkillSummaries(tmp);
    const skill = items.find((s) => s.name === "create-rule");
    assert.ok(skill);
    assert.match(skill.description, /Create Thinker/);
    assert.match(skill.description, /create a rule/);
    assert.notEqual(skill.description, ">-");
    assert.notEqual(skill.description, ">");
  });
});
