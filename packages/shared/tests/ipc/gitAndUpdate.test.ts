/**
 * Git / 更新契约助手：写操作回执构造、失败分类与进度钳制。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { classifyMutationFailure, failMutation, okMutation } from "../../src/ipc/git";
import { clampUpdatePercent, emptyUpdateState } from "../../src/ipc/update";

describe("Git 写操作回执", () => {
  it("成功回执只有 ok + code", () => {
    assert.deepEqual(okMutation(), { ok: true, code: "ok" });
  });

  it("失败回执截断超长诊断细节", () => {
    const long = "x".repeat(600);
    const res = failMutation("error", "失败", long);
    assert.equal(res.ok, false);
    assert.equal(res.code, "error");
    assert.equal(res.error, "失败");
    assert.equal(res.detail?.length, 401);
    assert.ok(res.detail?.endsWith("…"));
  });

  it("无细节时不带 detail 字段", () => {
    const res = failMutation("timeout", "超时");
    assert.equal(res.detail, undefined);
  });
});

describe("classifyMutationFailure", () => {
  function classify(
    stderr: string,
    code = 1,
    extra: Partial<{ notFound: boolean; cwdMissing: boolean }> = {},
  ) {
    return classifyMutationFailure({
      notFound: extra.notFound ?? false,
      cwdMissing: extra.cwdMissing ?? false,
      code,
      stderr,
    });
  }

  it("cwd 缺失优先于其它判定", () => {
    assert.equal(classify("anything", 1, { cwdMissing: true }), "cwd_missing");
  });

  it("git 未安装判为 not_found", () => {
    assert.equal(classify("spawn ENOENT", 1, { notFound: true }), "not_found");
  });

  it("超时码 124 判为 timeout", () => {
    assert.equal(classify("git timed out", 124), "timeout");
  });

  it("非仓库 / 无上游 / 空提交区分开", () => {
    assert.equal(classify("fatal: not a git repository"), "not_a_repo");
    assert.equal(classify("fatal: The current branch has no upstream branch"), "no_upstream");
    assert.equal(classify("nothing to commit, working tree clean"), "nothing_to_commit");
  });

  it("鉴权失败与冲突各有分类", () => {
    assert.equal(classify("fatal: Authentication failed"), "rejected");
    assert.equal(classify("error: Your local changes would be overwritten"), "conflict");
  });

  it("未知错误落到 error", () => {
    assert.equal(classify("something odd happened"), "error");
  });
});

describe("更新状态助手", () => {
  it("dev 构建初始为禁用态", () => {
    const state = emptyUpdateState("0.1.0", false);
    assert.equal(state.phase, "disabled");
    assert.equal(state.enabled, false);
    assert.equal(state.currentVersion, "0.1.0");
  });

  it("打包态初始为 idle", () => {
    assert.equal(emptyUpdateState("1.2.3", true).phase, "idle");
  });

  it("进度百分比钳制到 0-100 且取整", () => {
    assert.equal(clampUpdatePercent(-20), 0);
    assert.equal(clampUpdatePercent(150), 100);
    assert.equal(clampUpdatePercent(49.6), 50);
    assert.equal(clampUpdatePercent(Number.NaN), 0);
  });
});
