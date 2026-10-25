/**
 * Git 工具注册：只读工具进入注册表并归入 git 分组。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { getTool, listTools } from "../../../src/tools/registry";

describe("git tool specs", () => {
  it("注册 git_status / git_diff", () => {
    const names = new Set(listTools().map((t) => t.name));
    assert.ok(names.has("git_status"));
    assert.ok(names.has("git_diff"));
  });

  it("两个工具都归入 git 分组", () => {
    assert.equal(getTool("git_status")?.group, "git");
    assert.equal(getTool("git_diff")?.group, "git");
  });

  it("git_diff 支持 paths / contextLines / maxChars", () => {
    const props = getTool("git_diff")?.parameters.properties ?? {};
    assert.ok(props.paths);
    assert.ok(props.contextLines);
    assert.ok(props.maxChars);
  });

  it("git_status 只暴露 maxChars，不提供任何写参数", () => {
    const props = Object.keys(getTool("git_status")?.parameters.properties ?? {});
    assert.deepEqual(props, ["maxChars"]);
    const diffProps = Object.keys(getTool("git_diff")?.parameters.properties ?? {});
    for (const forbidden of ["all", "amend", "commit", "push", "message"]) {
      assert.equal(diffProps.includes(forbidden), false);
    }
  });
});
