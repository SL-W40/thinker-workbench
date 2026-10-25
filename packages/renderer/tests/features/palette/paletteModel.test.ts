/**
 * 命令面板数据层：模糊匹配、排序、去重与文件过滤。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  dedupePaletteItems,
  fileItems,
  fuzzyScore,
  isIgnoredFilePath,
  type PaletteItem,
  rankPaletteItems,
  sessionItems,
} from "../../../src/features/palette/paletteModel";

function item(id: string, title: string, group: PaletteItem["group"] = "file"): PaletteItem {
  return { id, group, title };
}

describe("fuzzyScore", () => {
  it("相等最优先，其次前缀，其次子串", () => {
    assert.equal(fuzzyScore("home.tsx", "home.tsx"), 0);
    assert.ok((fuzzyScore("home.tsx", "home") ?? Number.POSITIVE_INFINITY) < 10);
    assert.ok((fuzzyScore("src/home.tsx", "home") ?? Number.NEGATIVE_INFINITY) > 10);
  });

  it("大小写不敏感", () => {
    assert.ok(fuzzyScore("Outline.tsx", "outline") !== null);
  });

  it("支持顺序字符匹配（ott → outline.ts）", () => {
    assert.ok(fuzzyScore("outline.ts", "ott") !== null);
  });

  it("完全无关返回 null", () => {
    assert.equal(fuzzyScore("abc", "xyz"), null);
  });

  it("空查询返回 -1（归类为「无条件命中」）", () => {
    assert.equal(fuzzyScore("abc", ""), -1);
  });
});

describe("rankPaletteItems", () => {
  const items = [
    item("f:src/app/home.tsx", "home.tsx"),
    item("f:src/app/about.tsx", "about.tsx"),
    item("c:new", "新建会话", "command"),
  ];

  it("空查询按类别顺序返回（命令在前）", () => {
    const out = rankPaletteItems(items, "");
    assert.equal(out[0]?.id, "c:new");
    assert.equal(out.length, items.length);
  });

  it("命中关键字的文件排在前面", () => {
    const out = rankPaletteItems(items, "home");
    assert.equal(out[0]?.id, "f:src/app/home.tsx");
  });

  it("未命中的条目被过滤掉", () => {
    const out = rankPaletteItems(items, "zzzz");
    assert.deepEqual(out, []);
  });

  it("受 limit 约束", () => {
    const many = Array.from({ length: 50 }, (_, i) => item(`f:${i}`, `file${i}`));
    assert.equal(rankPaletteItems(many, "", 10).length, 10);
  });
});

describe("dedupePaletteItems", () => {
  it("同 id 只保留一条", () => {
    const out = dedupePaletteItems([item("a", "x"), item("a", "y"), item("b", "z")]);
    assert.deepEqual(
      out.map((i) => i.id),
      ["a", "b"],
    );
    assert.equal(out[0]?.title, "x");
  });
});

describe("isIgnoredFilePath", () => {
  it("排除常见的重目录", () => {
    for (const path of ["node_modules/x.ts", "src/node_modules/y.ts", ".git/config", "dist/a.js"]) {
      assert.equal(isIgnoredFilePath(path), true, path);
    }
  });

  it("正常路径不被排除", () => {
    assert.equal(isIgnoredFilePath("src/app/page.tsx"), false);
  });
});

describe("fileItems / sessionItems", () => {
  it("文件候选跳过忽略目录并受上限约束", () => {
    const out = fileItems(["node_modules/a.ts", "src/b.ts", "src/c.ts"], "demo", 5);
    assert.deepEqual(
      out.map((i) => i.id),
      ["file:demo:src/b.ts", "file:demo:src/c.ts"],
    );
  });

  it("会话候选带工作区副标题，空标题回退", () => {
    const out = sessionItems([
      { id: "s1", threadId: "t1", title: "", workspaceName: "demo" },
      { id: "s2", threadId: "t2", title: "修复构建", workspaceName: "demo" },
    ]);
    assert.equal(out[0]?.title, "未命名会话");
    assert.equal(out[1]?.subtitle, "demo");
  });
});
