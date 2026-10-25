/**
 * `@` 提及排序：文件名优先，空查询只看最近，目录命中略加权。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  rankFileMentions,
  scoreFilePath,
  splitFilePath,
  truncateDirLeft,
} from "../../../src/features/chat/composer/fileMentionRank";

describe("file mentions", () => {
  it("拆路径、左侧省略过长目录", () => {
    assert.deepEqual(splitFilePath("src\\chat\\Composer.tsx"), {
      name: "Composer.tsx",
      dir: "src/chat",
    });
    assert.deepEqual(splitFilePath("README.md"), { name: "README.md", dir: "" });
    assert.equal(truncateDirLeft("a/b", 10), "a/b");
    assert.equal(truncateDirLeft("abcdefghijklmnopqrstuvwxyz", 5), "…wxyz");
  });

  it("完全同名高于前缀；对不上的路径是负分", () => {
    assert.ok(
      scoreFilePath("src/app.ts", "app.ts", false) > scoreFilePath("src/app.ts", "app", false),
    );
    assert.equal(scoreFilePath("src/app.ts", "zzz", false), -1);
    assert.equal(scoreFilePath("src/app.ts", "", true), 1000);
    assert.equal(scoreFilePath("src/app.ts", "", false), 0);
  });

  it("空查询只列出最近；有查询时最近项加分并截断条数", () => {
    const entries = [
      { path: "src/app.ts", isDir: false },
      { path: "src/chat", isDir: true },
      { path: "README.md", isDir: false },
    ];
    const recentOnly = rankFileMentions(entries, ["README.md"], "", 10);
    assert.deepEqual(
      recentOnly.map((h) => h.path),
      ["README.md"],
    );

    const ranked = rankFileMentions(entries, ["src/app.ts"], "app", 1);
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]?.path, "src/app.ts");
    assert.equal(ranked[0]?.recent, true);

    const dirs = rankFileMentions(entries, [], "chat", 5);
    assert.equal(dirs[0]?.path, "src/chat");
    assert.equal(dirs[0]?.isDir, true);
  });
});
