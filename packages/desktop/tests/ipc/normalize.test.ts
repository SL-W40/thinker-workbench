/**
 * IPC 入参归一化：渲染进程传来的值不可信，边界都要收敛成安全形状。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  normalizeContextPaths,
  normalizeLimit,
  normalizeLogsQuery,
  slugify,
  toBytes,
} from "../../src/ipc/normalize";

describe("slugify", () => {
  it("转小写并保留下划线/连字符", () => {
    assert.equal(slugify("My Server"), "my-server");
    assert.equal(slugify("  A__b-c  "), "a__b-c");
  });

  it("把连续非法字符折叠成单个连字符", () => {
    assert.equal(slugify("a@@@b"), "a-b");
    assert.equal(slugify("fs/read file"), "fs-read-file");
  });

  it("去掉首尾连字符", () => {
    assert.equal(slugify("--x--"), "x");
    assert.equal(slugify("###abc###"), "abc");
  });

  it("无可用字符时回退 server", () => {
    assert.equal(slugify("中文 名称"), "server");
    assert.equal(slugify(""), "server");
    assert.equal(slugify("   "), "server");
    assert.equal(slugify(null), "server");
    assert.equal(slugify(undefined), "server");
  });
});

describe("toBytes", () => {
  it("Uint8Array 原样返回（不复制）", () => {
    const src = new Uint8Array([1, 2]);
    assert.equal(toBytes(src), src);
  });

  it("包装 ArrayBuffer", () => {
    const buf = new Uint8Array([3, 4]).buffer;
    assert.deepEqual(Array.from(toBytes(buf)), [3, 4]);
  });

  it("其它类型退化为空数组", () => {
    assert.equal(toBytes("x").length, 0);
    assert.equal(toBytes(null).length, 0);
    assert.equal(toBytes([1, 2]).length, 0);
  });
});

describe("normalizeLimit", () => {
  it("接受有限数字", () => {
    assert.equal(normalizeLimit(10), 10);
    assert.equal(normalizeLimit(0), 0);
    assert.equal(normalizeLimit(-3), -3);
  });

  it("非数字或非有限值回退 60", () => {
    assert.equal(normalizeLimit("10"), 60);
    assert.equal(normalizeLimit(Number.NaN), 60);
    assert.equal(normalizeLimit(Number.POSITIVE_INFINITY), 60);
    assert.equal(normalizeLimit(undefined), 60);
  });

  it("可指定回退值", () => {
    assert.equal(normalizeLimit(null, 5), 5);
  });
});

describe("normalizeLogsQuery", () => {
  it("file 缺失或空白时退化为 all", () => {
    assert.deepEqual(normalizeLogsQuery({}), { file: "all" });
    assert.deepEqual(normalizeLogsQuery({ file: "   " }), { file: "all" });
    assert.deepEqual(normalizeLogsQuery({ file: 42 }), { file: "all" });
  });

  it("保留有效 file 与其它字段", () => {
    assert.deepEqual(normalizeLogsQuery({ file: "main.ts", level: "warn" }), {
      file: "main.ts",
      level: "warn",
    });
  });

  it("非对象输入退化为空查询", () => {
    assert.deepEqual(normalizeLogsQuery(null), { file: "all" });
    assert.deepEqual(normalizeLogsQuery("x"), { file: "all" });
  });
});

describe("normalizeContextPaths", () => {
  it("过滤空串与非字符串", () => {
    assert.deepEqual(normalizeContextPaths(["a.ts", "", "  ", 3, "b.ts"]), ["a.ts", "b.ts"]);
  });

  it("非数组返回 undefined（代表未提供该维度）", () => {
    assert.equal(normalizeContextPaths(undefined), undefined);
    assert.equal(normalizeContextPaths("a.ts"), undefined);
  });

  it("空数组返回空数组，与未提供区分", () => {
    assert.deepEqual(normalizeContextPaths([]), []);
  });
});
