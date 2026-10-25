/**
 * gitRiskPolicy：子命令级风险判定——只读免确认，不可逆写操作必须确认。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { gitConfirmTargets, parseGitSegment } from "../../src/ipc/general";

/** 取判定结果里的 reason，便于断言。 */
function reasons(command: string): string[] {
  return gitConfirmTargets(command).map((target) => target.reason);
}

describe("gitConfirmTargets 只读命令免确认", () => {
  it("常见只读子命令不产生确认项", () => {
    for (const command of [
      "git status",
      "git -C packages/engine diff --stat",
      "git -c core.pager=cat log --oneline -5",
      "git show HEAD",
      "git rev-parse --abbrev-ref HEAD",
      "git ls-files",
      "git log | head",
    ]) {
      assert.deepEqual(gitConfirmTargets(command), [], command);
    }
  });

  it("非 git 命令与引号里的 git 不被误判", () => {
    assert.deepEqual(gitConfirmTargets("pnpm test"), []);
    assert.deepEqual(gitConfirmTargets('echo "git commit"'), []);
    assert.deepEqual(gitConfirmTargets("rg -n git packages"), []);
  });

  it("只有 git 主命令（打印帮助）按只读处理", () => {
    assert.deepEqual(gitConfirmTargets("git"), []);
    assert.deepEqual(gitConfirmTargets("git --version"), []);
  });
});

describe("gitConfirmTargets 不可逆写操作必须确认", () => {
  it("白名单里被整体加白的 commit / push 不再静默放行", () => {
    assert.deepEqual(reasons("git commit -m x"), ["git commit"]);
    assert.deepEqual(reasons('git commit -am "feat: x"'), ["git commit"]);
    assert.deepEqual(reasons("git push"), ["git push"]);
    assert.deepEqual(reasons("git push origin main"), ["git push"]);
  });

  it("全局选项、env 前缀、Windows 可执行名都能识别", () => {
    assert.deepEqual(reasons("git -C a commit -m x"), ["git commit"]);
    assert.deepEqual(reasons("git -c core.pager=cat commit -m x"), ["git commit"]);
    assert.deepEqual(reasons("git --git-dir=/tmp/x.git push"), ["git push"]);
    assert.deepEqual(reasons("Git.EXE push"), ["git push"]);
    assert.deepEqual(reasons('"C:\\Program Files\\Git\\bin\\git.exe" commit -m x'), ["git commit"]);
    assert.deepEqual(reasons("GIT_AUTHOR_DATE=2026-01-01 git commit -m x"), ["git commit"]);
  });

  it("命令链里只有命中段需要确认", () => {
    assert.deepEqual(reasons("git status && git commit -m x"), ["git commit"]);
    assert.deepEqual(reasons("pnpm t && git push"), ["git push"]);
    assert.deepEqual(reasons("git status; git reset --hard"), ["git reset"]);
  });

  it("破坏性变体按参数判定，普通变体不拦", () => {
    assert.deepEqual(reasons("git checkout -- ."), ["git checkout --"]);
    assert.deepEqual(reasons("git checkout -f main"), ["git checkout -f"]);
    assert.deepEqual(reasons("git branch -D feat"), ["git branch -D"]);
    assert.deepEqual(reasons("git tag -f v1"), ["git tag -f"]);
    assert.deepEqual(reasons("git stash clear"), ["git stash clear"]);
    assert.deepEqual(reasons("git worktree remove ../wt"), ["git worktree remove"]);

    assert.deepEqual(reasons("git checkout -b feat"), []);
    assert.deepEqual(reasons("git branch --show-current"), []);
    assert.deepEqual(reasons("git tag"), []);
    assert.deepEqual(reasons("git stash list"), []);
    assert.deepEqual(reasons("git switch feat"), []);
  });

  it("其余不可逆子命令全部拦截", () => {
    for (const command of [
      "git reset --hard",
      "git rebase -i HEAD~3",
      "git clean -fdx",
      "git restore .",
      "git revert abc",
      "git rm -r packages",
      "git mv a b",
      "git update-ref refs/heads/main abc",
      "git gc --prune=now",
      "git filter-branch --all",
    ]) {
      assert.equal(gitConfirmTargets(command).length, 1, command);
    }
  });

  it("未知子命令保守按需确认处理", () => {
    assert.equal(gitConfirmTargets("git lfs pull").length, 1);
  });

  it("config 只在写入时才确认", () => {
    assert.deepEqual(gitConfirmTargets("git config --get user.name"), []);
    assert.deepEqual(reasons("git config user.email a@b.c"), ["git config"]);
  });
});

describe("gitConfirmTargets severity", () => {
  it("影响远端的是 remote，其余是 destructive", () => {
    assert.equal(gitConfirmTargets("git push")[0]?.severity, "remote");
    assert.equal(gitConfirmTargets("git remote remove origin")[0]?.severity, "remote");
    assert.equal(gitConfirmTargets("git commit -m x")[0]?.severity, "destructive");
    assert.equal(gitConfirmTargets("git reset --hard")[0]?.severity, "destructive");
  });

  it("确认项带上原始命令段，便于回显给用户", () => {
    const target = gitConfirmTargets("git status && git push origin main")[0];
    assert.equal(target?.segment, "git push origin main");
  });
});

describe("parseGitSegment", () => {
  it("解析子命令与参数，非 git 返回 null", () => {
    assert.deepEqual(parseGitSegment("git -C a commit -m x"), {
      subcommand: "commit",
      args: ["-m", "x"],
      flags: ["-C"],
    });
    assert.deepEqual(parseGitSegment("git status --short"), {
      subcommand: "status",
      args: ["--short"],
      flags: [],
    });
    assert.equal(parseGitSegment("pnpm test"), null);
    assert.deepEqual(parseGitSegment("git"), { subcommand: "", args: [], flags: [] });
  });
});
