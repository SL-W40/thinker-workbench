/**
 * Skills frontmatter：块标量 description（`>-`）须解析为完整文案。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "vitest";
import { loadSkills } from "../../src/skills/loadSkills";

describe("loadSkills frontmatter", () => {
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

  it("解析 description: >- 多行块标量", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tw-skills-"));
    const dir = path.join(tmp, "customize", "skills", "create-skills");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      [
        "---",
        "name: create-skills",
        "description: >-",
        "  Create Thinker skills that follow project conventions.",
        "  Use when asked to create a skill.",
        "disable-model-invocation: false",
        "---",
        "",
        "# Create",
        "",
        "Body.",
        "",
      ].join("\n"),
      "utf8",
    );

    const loaded = loadSkills(tmp, null, "");
    const skill = loaded.skills.find((s) => s.name === "create-skills");
    assert.ok(skill);
    assert.match(skill.description, /Create Thinker skills/);
    assert.match(skill.description, /create a skill/);
    assert.notEqual(skill.description, ">-");
  });
});
