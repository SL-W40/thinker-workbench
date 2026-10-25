/**
 * 侧栏筛选纯函数（sidebarFilter.ts）：过滤语义与片段切分。
 */
import assert from "node:assert/strict";
import type { ThreadMeta, WorkspaceRecord } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import {
  countSessions,
  filterSidebarGroups,
  type SidebarGroup,
  splitSnippetMatch,
} from "../../../../src/features/chat/panels/sidebarFilter";

function ws(id: string, name: string): WorkspaceRecord {
  return {
    id,
    name,
    rootPath: `e:/${id}`,
    pinned: false,
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
    isDefault: false,
  };
}

function thread(sessionId: string, workspaceId: string, title: string): ThreadMeta {
  return {
    id: `t-${sessionId}`,
    sessionId,
    workspaceId,
    title,
    updatedAt: 1,
    pinned: false,
    sortOrder: 0,
    runStatus: "idle",
  };
}

const groups: SidebarGroup[] = [
  {
    workspace: ws("w1", "引擎"),
    sessions: [thread("s1", "w1", "修复构建"), thread("s2", "w1", "写测试")],
  },
  {
    workspace: ws("w2", "文档"),
    sessions: [thread("s3", "w2", "补 README"), thread("s4", "w2", "写 another 测试")],
  },
];

describe("filterSidebarGroups", () => {
  it("空关键词原样返回", () => {
    assert.equal(filterSidebarGroups(groups, ""), groups);
    assert.deepEqual(filterSidebarGroups(groups, "   "), groups);
  });

  it("工作空间名命中时保留该组全部会话", () => {
    const out = filterSidebarGroups(groups, "引擎");
    assert.equal(out.length, 1);
    assert.equal(out[0]?.sessions.length, 2);
  });

  it("会话标题命中时只保留命中会话", () => {
    const out = filterSidebarGroups(groups, "readme");
    assert.equal(out.length, 1);
    assert.deepEqual(
      out[0]?.sessions.map((s) => s.sessionId),
      ["s3"],
    );
  });

  it("工作空间名与会话标题都命中时不重复该组", () => {
    const out = filterSidebarGroups(groups, "文档");
    assert.equal(out.length, 1);
    assert.equal(out[0]?.workspace.id, "w2");
    // 整组保留（含未直接命中的兄弟会话）
    assert.deepEqual(
      out[0]?.sessions.map((s) => s.sessionId),
      ["s3", "s4"],
    );
  });

  it("大小写无关", () => {
    assert.equal(filterSidebarGroups(groups, "README")?.[0]?.workspace.id, "w2");
  });

  it("无命中返回空数组而不是 undefined", () => {
    assert.deepEqual(filterSidebarGroups(groups, "不存在的东西"), []);
  });

  it("多个组同时命中时按原顺序保留，且每组只留命中会话", () => {
    const out = filterSidebarGroups(groups, "测试");
    assert.deepEqual(
      out.map((g) => g.workspace.id),
      ["w1", "w2"],
    );
    assert.deepEqual(
      out[0]?.sessions.map((s) => s.sessionId),
      ["s2"],
    );
    assert.deepEqual(
      out[1]?.sessions.map((s) => s.sessionId),
      ["s4"],
    );
  });
});

describe("countSessions", () => {
  it("统计所有分组下的会话数", () => {
    assert.equal(countSessions(groups), 4);
    assert.equal(countSessions([]), 0);
  });
});

describe("splitSnippetMatch", () => {
  it("无命中区间时整段作为前缀", () => {
    assert.deepEqual(splitSnippetMatch("abcdef", null), {
      before: "abcdef",
      hit: "",
      after: "",
    });
  });

  it("按命中区间切成三段", () => {
    assert.deepEqual(splitSnippetMatch("abcdef", { from: 2, to: 4 }), {
      before: "ab",
      hit: "cd",
      after: "ef",
    });
  });

  it("区间越界被钳制，不会抛错", () => {
    assert.deepEqual(splitSnippetMatch("abc", { from: 5, to: 9 }), {
      before: "abc",
      hit: "",
      after: "",
    });
    assert.deepEqual(splitSnippetMatch("abc", { from: -3, to: 2 }), {
      before: "",
      hit: "ab",
      after: "c",
    });
  });

  it("空片段返回空三段", () => {
    assert.deepEqual(splitSnippetMatch("", { from: 0, to: 1 }), {
      before: "",
      hit: "",
      after: "",
    });
  });
});
