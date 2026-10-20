/**
 * 文件图标族判定（icons/fileGlyph.ts）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { glyphKind } from "../../../src/features/inspector/icons/fileGlyph";

describe("glyphKind", () => {
  it("maps common extensions", () => {
    assert.equal(glyphKind("a.ts"), "ts");
    assert.equal(glyphKind("a.tsx"), "ts");
    assert.equal(glyphKind("a.py"), "py");
    assert.equal(glyphKind("a.md"), "md");
    assert.equal(glyphKind("a.png"), "image");
    assert.equal(glyphKind("a.unknownxyz"), "text");
  });

  it("strips directories and normalizes separators", () => {
    assert.equal(glyphKind("src/util/a.ts"), "ts");
    assert.equal(glyphKind("src\\util\\a.ts"), "ts");
    assert.equal(glyphKind("dir.with.dots/a.json"), "json");
  });

  it("prefers special whole names over extensions", () => {
    assert.equal(glyphKind("Dockerfile"), "sh");
    assert.equal(glyphKind("dockerfile.prod"), "sh");
    assert.equal(glyphKind("Makefile"), "sh");
    assert.equal(glyphKind("gemfile.lock"), "lock");
  });

  it("applies rule-based families", () => {
    assert.equal(glyphKind(".env.local"), "config");
    assert.equal(glyphKind("yarn.lock"), "lock");
    assert.equal(glyphKind("bun.lockb"), "lock");
    // 常见锁文件名整名命中优先于扩展名表
    assert.equal(glyphKind("pnpm-lock.yaml"), "lock");
    assert.equal(glyphKind("id_rsa"), "key");
    assert.equal(glyphKind("server.key"), "key");
    // 整名表命中：README 归 md 而非无扩展默认 text
    assert.equal(glyphKind("README"), "md");
  });

  it("matches compound extensions before the last dot", () => {
    assert.equal(glyphKind("types.d.ts"), "ts");
    assert.equal(glyphKind("app.test.js"), "js");
    assert.equal(glyphKind("archive.tar.gz"), "zip");
    assert.equal(glyphKind("bundle.min.js"), "js");
  });
});
