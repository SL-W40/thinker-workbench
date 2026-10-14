/**
 * Customize 分组：缺省 scope 当 user，工作区根从登记表里找。
 */
import assert from "node:assert/strict";
import type { WorkspaceRecord } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import {
  buildScopeGroups,
  sameCustomizeScope,
  workspaceRootForScope,
} from "../../../src/features/customize/scopeHelpers";

const ws: WorkspaceRecord = {
  id: "ws1",
  name: "Demo",
  rootPath: "D:/demo",
  pinned: false,
  sortOrder: 0,
  createdAt: 0,
  updatedAt: 0,
  isDefault: false,
};

describe("scope helpers", () => {
  it("user 与 workspace 不相等；未知工作区没有根", () => {
    assert.equal(sameCustomizeScope(undefined, { kind: "user" }), true);
    assert.equal(sameCustomizeScope(undefined, { kind: "workspace", workspaceId: "ws1" }), false);
    assert.equal(
      sameCustomizeScope(
        { kind: "workspace", workspaceId: "ws1" },
        { kind: "workspace", workspaceId: "ws1" },
      ),
      true,
    );
    assert.equal(workspaceRootForScope({ kind: "user" }, [ws]), null);
    assert.equal(workspaceRootForScope({ kind: "workspace", workspaceId: "missing" }, [ws]), null);
    assert.equal(workspaceRootForScope({ kind: "workspace", workspaceId: "ws1" }, [ws]), "D:/demo");
  });

  it("分组先是用户，再是每个工作区", () => {
    const groups = buildScopeGroups([ws]);
    assert.equal(groups[0]?.key, "user");
    assert.equal(groups[1]?.key, "workspace:ws1");
    assert.equal(groups[1]?.name, "Demo");
  });
});
