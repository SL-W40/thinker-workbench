/**
 * Git 写操作：路径安全校验与 stash 列表解析（纯函数部分）。
 *
 * 真正跑 git 的部分依赖外部二进制，放在集成环境验证；这里锁住「入参校验」与
 * 「输出解析」这两块最容易出错的纯逻辑。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { parseStashList, sanitizeGitPaths } from "../../src/workspace/gitWrite";

describe("sanitizeGitPaths", () => {
  it("非数组或空数组被拒绝", () => {
    assert.equal(sanitizeGitPaths(undefined), null);
    assert.equal(sanitizeGitPaths("a.ts"), null);
    assert.equal(sanitizeGitPaths([]), null);
  });

  it("接受相对路径并统一分隔符", () => {
    assert.deepEqual(sanitizeGitPaths(["src/a.ts", "src\\b.ts"]), ["src/a.ts", "src/b.ts"]);
    assert.deepEqual(sanitizeGitPaths(["/src/a.ts"]), ["src/a.ts"]);
  });

  it("越界路径被拒绝（.. / 绝对路径 / 盘符）", () => {
    assert.equal(sanitizeGitPaths(["../secret"]), null);
    assert.equal(sanitizeGitPaths(["a/../../b"]), null);
    assert.equal(sanitizeGitPaths(["C:/Windows"]), null);
  });

  it("空串与非字符串被拒绝", () => {
    assert.equal(sanitizeGitPaths(["a.ts", ""]), null);
    assert.equal(sanitizeGitPaths(["a.ts", 1]), null);
  });

  it("超过数量上限被拒绝，避免误传整棵树", () => {
    const many = Array.from({ length: 401 }, (_, i) => `f${i}.ts`);
    assert.equal(sanitizeGitPaths(many), null);
    assert.ok(sanitizeGitPaths(many.slice(0, 400))?.length === 400);
  });
});

describe("parseStashList", () => {
  it("解析常规条目：序号 / 分支 / 说明", () => {
    const stdout = [
      "stash@{0}: On main: 随手暂存",
      "stash@{1}: On feature/x: WIP on something",
      "",
    ].join("\n");
    assert.deepEqual(parseStashList(stdout), [
      { index: 0, branch: "main", message: "随手暂存" },
      { index: 1, branch: "feature/x", message: "WIP on something" },
    ]);
  });

  it("没有分支前缀时 branch 为空串", () => {
    assert.deepEqual(parseStashList("stash@{0}: 无分支信息\n"), [
      { index: 0, branch: "", message: "无分支信息" },
    ]);
  });

  it("空输出返回空列表，非法行被跳过", () => {
    assert.deepEqual(parseStashList(""), []);
    assert.deepEqual(parseStashList("garbage line"), []);
  });
});
