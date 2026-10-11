/**
 * Monaco 模型路径：Windows 盘符须变成 file:///，否则语言服务挂不上。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";

/** 与 FileEditor 内 toMonacoModelPath 保持一致（单测镜像）。 */
function toMonacoModelPath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "inmemory:///untitled";
  if (/^(inmemory|file|untitled):/i.test(trimmed)) return trimmed;
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
    const normalized = trimmed.replace(/\\/g, "/");
    return `file:///${normalized}`;
  }
  if (trimmed.startsWith("/")) {
    return `file://${trimmed}`;
  }
  return trimmed;
}

describe("toMonacoModelPath", () => {
  it("Windows 绝对路径转为 file URI", () => {
    assert.equal(
      toMonacoModelPath("C:\\Users\\wangs\\proj\\a.ts"),
      "file:///C:/Users/wangs/proj/a.ts",
    );
  });

  it("POSIX 绝对路径转为 file URI", () => {
    assert.equal(toMonacoModelPath("/home/u/a.tsx"), "file:///home/u/a.tsx");
  });

  it("已是 URI 时原样返回", () => {
    assert.equal(toMonacoModelPath("inmemory:///tab-1"), "inmemory:///tab-1");
    assert.equal(toMonacoModelPath("file:///C:/x.ts"), "file:///C:/x.ts");
  });
});
