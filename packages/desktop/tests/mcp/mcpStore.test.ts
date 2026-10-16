/**
 * MCP 落盘：http 配置保留，导入可跳过或覆盖；list 不 mkdir。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "vitest";
import { resetSettingsCacheForTests } from "../../src/config/settingsStore";
import { importMcpJsonFile, listMcpConfigs, upsertMcpConfig } from "../../src/mcp/mcpStore";

describe("mcpStore", () => {
  let tmp: string;
  let prevHome: string | undefined;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tw-mcp-"));
    prevHome = process.env.THINKER_HOME;
    process.env.THINKER_HOME = tmp;
    resetSettingsCacheForTests();
  });

  afterEach(() => {
    resetSettingsCacheForTests();
    if (prevHome === undefined) delete process.env.THINKER_HOME;
    else process.env.THINKER_HOME = prevHome;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("http 配置不会被丢成 stdio", () => {
    upsertMcpConfig({
      id: "remote",
      transport: "http",
      url: "https://example.com/mcp",
      headers: { Authorization: "Bearer t" },
      scope: { kind: "user" },
    });
    const saved = listMcpConfigs(null).find((item) => item.id === "remote");
    assert.ok(saved);
    assert.equal(saved.transport, "http");
    if (saved.transport === "http") {
      assert.equal(saved.url, "https://example.com/mcp");
      assert.equal(saved.headers?.Authorization, "Bearer t");
    }
  });

  it("导入 skip 保留旧项，overwrite 覆盖", () => {
    upsertMcpConfig({
      id: "local",
      command: "old",
      scope: { kind: "user" },
    });
    const file = path.join(tmp, "mcp.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        mcpServers: {
          local: { command: "new", args: ["a"] },
          extra: { url: "https://example.com/extra" },
        },
      }),
      "utf8",
    );
    const skipped = importMcpJsonFile(file, "skip", { kind: "user" });
    assert.deepEqual(skipped.skipped, ["local"]);
    assert.deepEqual(skipped.imported, ["extra"]);
    const before = listMcpConfigs(null).find((item) => item.id === "local");
    assert.ok(before && before.transport === "stdio" && before.command === "old");

    importMcpJsonFile(file, "overwrite", { kind: "user" });
    const after = listMcpConfigs(null).find((item) => item.id === "local");
    assert.ok(after && after.transport === "stdio" && after.command === "new");
  });

  it("list 用户 scope 时不预先 mkdir mcps", () => {
    const mcps = path.join(tmp, "mcps");
    assert.equal(fs.existsSync(mcps), false);
    listMcpConfigs(null);
    assert.equal(fs.existsSync(mcps), false);
  });
});
