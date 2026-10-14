/**
 * Skill 路径 glob：星号、问号、字符类；不对整段用户文做子串命中。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "vitest";
import { globMatch, loadSkills } from "../../src/skills/loadSkills";

describe("globMatch", () => {
  it("支持 * ** ? 与字符类", () => {
    assert.equal(globMatch("src/*.ts", "src/a.ts"), true);
    assert.equal(globMatch("src/*.ts", "src/nested/a.ts"), false);
    assert.equal(globMatch("**/*.ts", "src/nested/a.ts"), true);
    assert.equal(globMatch("file?.md", "file1.md"), true);
    assert.equal(globMatch("file?.md", "file12.md"), false);
    assert.equal(globMatch("src/[ab].ts", "src/b.ts"), true);
    assert.equal(globMatch("src/[ab].ts", "src/c.ts"), false);
  });
});

describe("loadSkills paths", () => {
  let tmp: string;

  afterEach(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  function writeSkill(pathsLine: string): void {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tw-skill-glob-"));
    const dir = path.join(tmp, "skills", "ts-skill");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      [
        "---",
        "name: ts-skill",
        "description: TypeScript files.",
        pathsLine,
        "---",
        "",
        "Body.",
        "",
      ].join("\n"),
      "utf8",
    );
  }

  it("上下文路径命中才激活", () => {
    writeSkill("paths: ['**/*.ts']");
    const hit = loadSkills(tmp, null, "看一下这个文件", ["src/app.ts"]);
    assert.deepEqual(hit.activatedNames, ["ts-skill"]);
  });

  it("用户文里的路径片段可以命中", () => {
    writeSkill("globs: ['src/*.ts']");
    const hit = loadSkills(tmp, null, "请改 src/main.ts");
    assert.deepEqual(hit.activatedNames, ["ts-skill"]);
  });

  it("整段用户文的子串不再误激活", () => {
    writeSkill("paths: ['**/*.ts']");
    const miss = loadSkills(tmp, null, "typescript 很好用");
    assert.deepEqual(miss.activatedNames, []);
  });
});
