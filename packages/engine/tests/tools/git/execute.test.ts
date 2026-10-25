/**
 * Git 工具执行体：路径过滤、截断提示、宿主响应配对。
 *
 * 宿主请求用 vi.mock 替换为真·stub，避免测试真的去 postMessage。
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it, vi } from "vitest";

const calls: Array<{ action: string; options: Record<string, unknown> }> = [];
let nextResult: { output: string; truncated: boolean } = { output: "", truncated: false };

// 模块级 stub：记录入参并返回可控结果
vi.mock("../../../src/host/gitClient", () => ({
  gitInspect: (action: string, options: Record<string, unknown> = {}) => {
    calls.push({ action, options });
    return Promise.resolve(nextResult);
  },
}));

const { gitDiffTool } = await import("../../../src/tools/git_diff/execute");
const { gitStatusTool } = await import("../../../src/tools/git_status/execute");

describe("gitStatusTool", () => {
  beforeEach(() => {
    calls.length = 0;
    nextResult = { output: "Branch: main", truncated: false };
  });

  it("调用 status 动作并原样返回输出", async () => {
    const res = await gitStatusTool({});
    assert.equal(calls[0]?.action, "status");
    assert.equal(res.output, "Branch: main");
  });

  it("maxChars 透传给宿主（由主进程做实际截断）", async () => {
    await gitStatusTool({ maxChars: 1234 });
    assert.equal(calls[0]?.options.maxChars, 1234);
  });

  it("宿主标记截断时补一句提示", async () => {
    nextResult = { output: "partial", truncated: true };
    const res = await gitStatusTool({});
    assert.ok(res.output.includes("truncated"));
  });
});

describe("gitDiffTool", () => {
  beforeEach(() => {
    calls.length = 0;
    nextResult = { output: "diff --git a/x b/x", truncated: false };
  });

  it("不带 paths 时不限制目标（宿主取全部改动）", async () => {
    await gitDiffTool({});
    assert.equal(calls[0]?.action, "diff");
    assert.equal(calls[0]?.options.paths, undefined);
  });

  it("过滤绝对路径 / 越界路径 / 非字符串", async () => {
    await gitDiffTool({ paths: ["/abs/a.ts", "../escape.ts", "  ", 42, "src/ok.ts"] });
    assert.deepEqual(calls[0]?.options.paths, ["src/ok.ts"]);
  });

  it("路径数量超过 20 被截断", async () => {
    const many = Array.from({ length: 25 }, (_, i) => `f${i}.ts`);
    await gitDiffTool({ paths: many });
    assert.equal((calls[0]?.options.paths as string[] | undefined)?.length, 20);
  });

  it("contextLines 钳制到 0-30", async () => {
    await gitDiffTool({ contextLines: 999 });
    assert.equal(calls[0]?.options.contextLines, 30);
    await gitDiffTool({ contextLines: -5 });
    assert.equal(calls[1]?.options.contextLines, 0);
  });

  it("全部路径被过滤时退回「全部改动」语义", async () => {
    await gitDiffTool({ paths: ["/only-abs.ts"] });
    assert.equal(calls[0]?.options.paths, undefined);
  });

  it("截断时提示用 paths 缩小范围", async () => {
    nextResult = { output: "d", truncated: true };
    const res = await gitDiffTool({});
    assert.ok(res.output.includes("paths"));
  });
});
