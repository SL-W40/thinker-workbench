/**
 * 设置分区 id、变更树、文件树多选。
 */
import assert from "node:assert/strict";
import type { GitChangedFile, WorkspaceNode } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { buildChangeTree, filterChangeTree } from "../../../src/features/inspector/changesTree";
import {
  applyTreeSelection,
  selectionJoinFlags,
  sortTreeNodes,
  visibleTreePaths,
} from "../../../src/features/inspector/treeSelection";
import {
  isSettingsSection,
  normalizeSettingsSection,
  SETTINGS_SECTIONS,
} from "../../../src/features/settings/sections";

describe("settings sections", () => {
  it("旧 general 迁到 appearance，非法值用默认，侧栏八个分区都能认", () => {
    assert.equal(normalizeSettingsSection("general"), "appearance");
    assert.equal(normalizeSettingsSection("mcp"), "appearance");
    assert.equal(normalizeSettingsSection("shortcuts"), "shortcuts");
    assert.equal(isSettingsSection("general"), false);
    assert.equal(SETTINGS_SECTIONS.length, 8);
  });
});

describe("change tree", () => {
  it("按改动量把目录排前，查询命中时展开祖先", () => {
    const files: GitChangedFile[] = [
      { path: "src/a.ts", status: "M", added: 1, removed: 0 },
      { path: "src/b.ts", status: "M", added: 10, removed: 0 },
      { path: "readme.md", status: "A", added: 3, removed: 1 },
    ];
    const tree = buildChangeTree(files);
    assert.equal(tree[0]?.kind, "dir");
    if (tree[0]?.kind === "dir") {
      assert.equal(tree[0].children[0]?.name, "b.ts");
    }
    const filtered = filterChangeTree(tree, "b.ts");
    assert.equal(filtered.expandPaths.has("src"), true);
    assert.equal(filtered.nodes.length, 1);
  });
});

describe("tree selection", () => {
  const root: WorkspaceNode = {
    name: "",
    path: ".",
    type: "dir",
    children: [
      {
        name: "src",
        path: "src",
        type: "dir",
        children: [
          { name: "b.ts", path: "src/b.ts", type: "file" },
          { name: "a.ts", path: "src/a.ts", type: "file" },
        ],
      },
      { name: "readme.md", path: "readme.md", type: "file" },
    ],
  };

  it("目录优先；展开后的可见行按名排序；Shift 选范围", () => {
    const sorted = sortTreeNodes(root.children ?? []);
    assert.deepEqual(
      sorted.map((n) => n.name),
      ["src", "readme.md"],
    );
    const visible = visibleTreePaths(root, new Set(["src"]));
    assert.deepEqual(visible, ["src", "src/a.ts", "src/b.ts", "readme.md"]);

    const range = applyTreeSelection({
      visible,
      selected: [],
      anchor: "src/a.ts",
      path: "readme.md",
      toggle: false,
      range: true,
    });
    assert.deepEqual(range.selected, ["src/a.ts", "src/b.ts", "readme.md"]);

    const toggled = applyTreeSelection({
      visible,
      selected: range.selected,
      anchor: range.anchor,
      path: "src/a.ts",
      toggle: true,
      range: false,
    });
    assert.deepEqual(toggled.selected, ["src/b.ts", "readme.md"]);

    const flags = selectionJoinFlags(visible, new Set(["src/b.ts", "readme.md"]));
    assert.equal(flags.get("src/b.ts")?.joinBelow, true);
    assert.equal(flags.get("readme.md")?.joinAbove, true);
  });
});
