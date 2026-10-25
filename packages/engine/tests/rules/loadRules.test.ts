/**
 * Rules 加载：全局与工作区目录按相对路径拼接，空文件与点文件跳过。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";
import { loadRules } from "../../src/rules/loadRules";

describe("loadRules", () => {
  it("没有目录时返回空块", () => {
    assert.deepEqual(loadRules("  ", null), { text: "", fileCount: 0 });
    assert.deepEqual(loadRules(null, "   "), { text: "", fileCount: 0 });
  });

  it("同名文件两处都保留，按相对路径排序，忽略空文件和点文件", () => {
    const data = fs.mkdtempSync(path.join(os.tmpdir(), "tw-rules-data-"));
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "tw-rules-ws-"));
    // 全局 Rules 落点在 <dataDir>/customize/rules
    const globalRules = path.join(data, "customize", "rules");
    fs.mkdirSync(path.join(globalRules, "sub"), { recursive: true });
    fs.mkdirSync(path.join(ws, ".thinker", "rules"), { recursive: true });
    fs.writeFileSync(path.join(globalRules, "b.md"), "global-b\n", "utf8");
    fs.writeFileSync(path.join(globalRules, "sub", "a.txt"), "nested\n", "utf8");
    fs.writeFileSync(path.join(globalRules, "skip.json"), "nope", "utf8");
    fs.writeFileSync(path.join(globalRules, ".hidden.md"), "hidden", "utf8");
    fs.writeFileSync(path.join(globalRules, "empty.md"), "  \n", "utf8");
    fs.writeFileSync(path.join(ws, ".thinker", "rules", "b.mdc"), "local-b\n", "utf8");

    const loaded = loadRules(data, ws);
    assert.equal(loaded.fileCount, 3);
    assert.match(loaded.text, /^## Rules\n\nFollow these project rules:\n/);
    const b = loaded.text.indexOf("### global:b.md");
    const nested = loaded.text.indexOf("### global:sub/a.txt");
    const local = loaded.text.indexOf("### thinker:b.mdc");
    assert.ok(b >= 0 && nested > b && local > nested);
    assert.match(loaded.text, /global-b/);
    assert.match(loaded.text, /local-b/);
    assert.doesNotMatch(loaded.text, /hidden|nope/);
  });
});
