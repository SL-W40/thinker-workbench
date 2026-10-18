/**
 * 变更侧栏树：全量树构建（Changes 侧栏应为全量文件列表）。
 */
import assert from "node:assert/strict";
import type { WorkspaceNode } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import {
  buildChangeTree,
  buildFullTree,
  filterChangeTree,
} from "../../../src/features/inspector/changesTree";

const FULL_TREE: WorkspaceNode = {
  name: "repo",
  path: ".",
  type: "dir",
  children: [
    {
      name: "packages",
      path: "packages",
      type: "dir",
      children: [
        {
          name: "renderer",
          path: "packages/renderer",
          type: "dir",
          children: [{ name: "App.tsx", path: "packages/renderer/App.tsx", type: "file" }],
        },
        { name: "engine", path: "packages/engine", type: "dir", children: [] },
      ],
    },
    { name: "README.md", path: "README.md", type: "file" },
  ],
};

describe("buildFullTree", () => {
  it("全量展开：未改动文件也在树里", () => {
    const nodes = buildFullTree(FULL_TREE, []);
    assert.deepEqual(
      nodes.map((n) => `${n.kind}:${n.path}`),
      ["dir:packages", "file:README.md"],
    );
    const pkg = nodes[0];
    if (pkg?.kind !== "dir") assert.fail("expected dir");
    assert.deepEqual(
      pkg.children.map((c) => `${c.kind}:${c.path}`),
      ["dir:packages/renderer", "dir:packages/engine"],
    );
  });

  it("改动文件带 +/- 统计，其余为 0", () => {
    const nodes = buildFullTree(FULL_TREE, [
      { path: "packages/renderer/App.tsx", status: "M", added: 12, removed: 3 },
    ]);
    const pkg = nodes[0];
    if (pkg?.kind !== "dir") assert.fail("expected dir");
    const renderer = pkg.children[0];
    if (renderer?.kind !== "dir") assert.fail("expected dir");
    const app = renderer.children[0];
    if (app?.kind !== "file") assert.fail("expected file");
    assert.equal(app.added, 12);
    assert.equal(app.removed, 3);
    assert.equal(app.status, "M");
    const readme = nodes[1];
    if (readme?.kind !== "file") assert.fail("expected file");
    assert.equal(readme.added, 0);
    assert.equal(readme.removed, 0);
  });

  it("保持 listTree 自然序（目录在前），不按改动量重排", () => {
    const nodes = buildFullTree(FULL_TREE, [
      { path: "README.md", status: "M", added: 100, removed: 50 },
    ]);
    assert.equal(nodes[0]?.path, "packages");
    assert.equal(nodes[1]?.path, "README.md");
  });

  it("空目录也保留", () => {
    const nodes = buildFullTree(FULL_TREE, []);
    const pkg = nodes[0];
    if (pkg?.kind !== "dir") assert.fail("expected dir");
    assert.ok(pkg.children.some((c) => c.path === "packages/engine"));
  });
});

describe("filterChangeTree 对全量树", () => {
  it("按名/路径过滤并给出展开路径", () => {
    const nodes = buildFullTree(FULL_TREE, []);
    const { nodes: filtered, expandPaths } = filterChangeTree(nodes, "app");
    // 过滤保留祖先目录链：顶层目录 + 中间目录 + 命中的文件
    assert.equal(filtered.length, 1);
    const dir = filtered[0];
    if (dir?.kind !== "dir") assert.fail("expected ancestor dir");
    assert.equal(dir.path, "packages");
    const renderer = dir.children[0];
    if (renderer?.kind !== "dir") assert.fail("expected ancestor dir");
    assert.equal(renderer.path, "packages/renderer");
    assert.equal(renderer.children[0]?.path, "packages/renderer/App.tsx");
    assert.ok(expandPaths.has("packages"));
    assert.ok(expandPaths.has("packages/renderer"));
  });
});

describe("buildChangeTree（仅改动，回归）", () => {
  it("只包含改动文件且按改动量排序", () => {
    const nodes = buildChangeTree([
      { path: "a.txt", status: "M", added: 1, removed: 1 },
      { path: "src/b.ts", status: "M", added: 50, removed: 0 },
    ]);
    // 顶层：目录 src（子树改动量 50）排在文件 a.txt（2）前
    assert.equal(nodes[0]?.path, "src");
    assert.equal(nodes[1]?.path, "a.txt");
  });
});
