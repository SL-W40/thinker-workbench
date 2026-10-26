/**
 * 工作空间 Git：可执行文件定位与失败分类。
 * 重点回归：cwd 不存在时不能误报「Git 未安装」。
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "vitest";
import {
  getGitStatus,
  resetGitBinaryCacheForTests,
  resolveGitBinary,
} from "../../src/workspace/git";

let tmpRoots: string[] = [];

function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpRoots.push(dir);
  return dir;
}

function runGit(cwd: string, args: string[]): void {
  execFileSync(resolveGitBinary() ?? "git", args, { cwd, stdio: "ignore" });
}

beforeEach(() => {
  tmpRoots = [];
  resetGitBinaryCacheForTests();
});

afterEach(() => {
  for (const dir of tmpRoots) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  tmpRoots = [];
  resetGitBinaryCacheForTests();
});

describe("resolveGitBinary", () => {
  it("定位到的路径是存在的绝对路径", () => {
    const binary = resolveGitBinary();
    // 干净容器里可能没装 git：此时为空，不构成失败
    if (!binary) return;
    assert.equal(path.isAbsolute(binary), true);
    assert.equal(fs.existsSync(binary), true);
  });

  it("PATH 里没有 git 时回落到 Windows 常见安装位置", () => {
    // 只有 Windows 才有兜底目录；其它平台由系统 PATH 保证
    if (process.platform !== "win32") return;
    const savedPath = process.env.PATH;
    const savedPathLower = process.env.Path;
    delete process.env.Path;
    process.env.PATH = "";
    try {
      resetGitBinaryCacheForTests();
      const binary = resolveGitBinary();
      // 机器上没装在常见目录时为空，同样不构成失败
      if (!binary) return;
      assert.equal(path.isAbsolute(binary), true);
      assert.equal(fs.existsSync(binary), true);
    } finally {
      if (savedPath === undefined) delete process.env.PATH;
      else process.env.PATH = savedPath;
      if (savedPathLower !== undefined) process.env.Path = savedPathLower;
      resetGitBinaryCacheForTests();
    }
  });
});

describe("getGitStatus", () => {
  it("工作空间目录不存在时不误报 git 未安装", async () => {
    const missing = path.join(os.tmpdir(), `tw-git-missing-${Date.now()}-${Math.random()}`);
    const status = await getGitStatus(missing);

    assert.equal(status.gitAvailable, true);
    assert.equal(status.reason, "cwd_missing");
    assert.equal(status.isRepo, false);
    assert.match(status.detail ?? "", /workspace directory missing/);
  });

  it("非仓库目录不报 git 未安装", async () => {
    const dir = makeTmpDir("tw-git-plain-");
    const status = await getGitStatus(dir);

    assert.equal(status.gitAvailable, true);
    assert.notEqual(status.reason, "git_not_found");
  });

  it("非仓库目录归类为 not_a_repo（git 语言包是中文也要认出来）", async () => {
    const dir = makeTmpDir("tw-git-plain-reason-");
    // 子进程固定 C locale，所以这里无论系统语言是中文还是英文，分类都应一致
    const status = await getGitStatus(dir);

    assert.equal(status.reason, "not_a_repo");
    assert.equal(status.isRepo, false);
    // 能归类的失败不回传 stderr：面板只展示映射文案
    assert.equal(status.detail, undefined);
  });

  it("仓库内能列出未跟踪文件", async () => {
    const dir = makeTmpDir("tw-git-repo-");
    runGit(dir, ["init"]);
    fs.writeFileSync(path.join(dir, "a.txt"), "hello\n", "utf8");

    const status = await getGitStatus(dir);

    assert.equal(status.reason, "ok");
    assert.equal(status.isRepo, true);
    assert.equal(status.gitAvailable, true);
    assert.ok(
      status.files.some((file) => file.path === "a.txt"),
      `files=${JSON.stringify(status.files)}`,
    );
    assert.equal(status.detail, undefined);
  });

  it("未跟踪文件按行数算新增行，总数跟着走", async () => {
    const dir = makeTmpDir("tw-git-untracked-lines-");
    runGit(dir, ["init"]);
    // 三行（末行带换行）：新文件的所有行都算「新增」
    fs.writeFileSync(path.join(dir, "a.txt"), "one\ntwo\nthree\n", "utf8");
    // 没有结尾换行时最后一行也要算一行
    fs.writeFileSync(path.join(dir, "b.txt"), "only", "utf8");

    const status = await getGitStatus(dir);

    const a = status.files.find((file) => file.path === "a.txt");
    const b = status.files.find((file) => file.path === "b.txt");
    assert.equal(a?.status, "untracked");
    assert.equal(a?.added, 3);
    assert.equal(b?.added, 1);
    assert.equal(status.totals.added, 4);
    assert.equal(status.totals.removed, 0);
  });

  it("中文文件名（porcelain 引号路径）也能还原路径并数出新增行", async () => {
    const dir = makeTmpDir("tw-git-quoted-path-");
    runGit(dir, ["init"]);
    fs.writeFileSync(path.join(dir, "中文 说明.md"), "一\n二\n", "utf8");

    const status = await getGitStatus(dir);

    const file = status.files.find((f) => f.path === "中文 说明.md");
    assert.ok(file, `files=${JSON.stringify(status.files)}`);
    assert.equal(file.status, "untracked");
    assert.equal(file.added, 2);
  });

  it("改动文件很多时仍然带 +/- 行数（不再按文件数截断）", async () => {
    const dir = makeTmpDir("tw-git-many-files-");
    runGit(dir, ["init"]);
    const config = [
      "-c",
      "user.email=test@example.com",
      "-c",
      "user.name=test",
      "-c",
      "commit.gpgsign=false",
    ];
    const total = 401;
    for (let i = 0; i < total; i++) {
      fs.writeFileSync(path.join(dir, `f${i}.txt`), "base\n", "utf8");
    }
    runGit(dir, [...config, "add", "."]);
    runGit(dir, [...config, "commit", "-m", "init"]);
    for (let i = 0; i < total; i++) {
      fs.writeFileSync(path.join(dir, `f${i}.txt`), "base\nplus\n", "utf8");
    }

    const status = await getGitStatus(dir);

    assert.equal(status.files.length, total);
    const missing = status.files.filter((file) => file.added !== 1).slice(0, 5);
    assert.equal(
      missing.length,
      0,
      `没有 +1 的文件：${JSON.stringify(missing)} files=${status.files.length}`,
    );
    assert.equal(status.totals.added, total);
  });
});
