/**
 * McpSettingsForm 草稿纯函数（drafts.ts）。
 */
import assert from "node:assert/strict";
import type { McpServerConfig } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import {
  draftFromConfig,
  emptyDraft,
  parseKv,
  sameScope,
  shortToolLabel,
  statusVariant,
  toUpsert,
} from "../../../src/features/settings/McpSettingsForm/drafts";

describe("shortToolLabel", () => {
  it("strips known server prefixes", () => {
    assert.equal(shortToolLabel("mcp__fs__read", "fs"), "read");
    assert.equal(shortToolLabel("mcp_fs_read", "fs"), "read");
    assert.equal(shortToolLabel("fs__read", "fs"), "read");
    assert.equal(shortToolLabel("fs_read", "fs"), "read");
  });

  it("falls back to generic mcp_ regex and raw name", () => {
    assert.equal(shortToolLabel("mcp__other__read", "fs"), "read");
    assert.equal(shortToolLabel("plain_tool", "fs"), "plain_tool");
  });
});

describe("emptyDraft", () => {
  it("defaults to stdio and enabled", () => {
    const d = emptyDraft();
    assert.equal(d.transport, "stdio");
    assert.equal(d.enabled, true);
    assert.equal(d.id, "");
  });
});

describe("draftFromConfig", () => {
  it("maps stdio config", () => {
    const c: McpServerConfig = {
      id: "s1",
      name: "FS",
      transport: "stdio",
      command: "npx",
      args: ["-y", "server"],
      env: { A: "1", B: "2" },
      cwd: "/tmp",
      enabled: false,
    };
    const d = draftFromConfig(c);
    assert.equal(d.command, "npx");
    assert.equal(d.argsText, "-y\nserver");
    assert.equal(d.envText, "A=1\nB=2");
    assert.equal(d.cwd, "/tmp");
    assert.equal(d.enabled, false);
    assert.equal(d.url, "");
  });

  it("maps http config with headers", () => {
    const c: McpServerConfig = {
      id: "s2",
      name: "HTTP",
      transport: "http",
      url: "https://mcp.example.com",
      headers: { Authorization: "Bearer x" },
      enabled: true,
    };
    const d = draftFromConfig(c);
    assert.equal(d.transport, "http");
    assert.equal(d.url, "https://mcp.example.com");
    assert.equal(d.headersText, "Authorization=Bearer x");
    assert.equal(d.command, "");
  });
});

describe("parseKv", () => {
  it("parses pairs, skips blanks / comments / invalid", () => {
    // 注意：键会 trim，值保持等号后原文（含前导空格）
    const env = parseKv("# comment\n\nA=1\n B = 2 \nNOEQ\n=empty\nC=x=y");
    assert.deepEqual(env, { A: "1", B: " 2", C: "x=y" });
  });
});

describe("toUpsert", () => {
  it("builds stdio upsert with trimmed args and null cwd", () => {
    const d = {
      ...emptyDraft(),
      id: " s1 ",
      name: " ",
      command: " npx ",
      argsText: " -y \n\n server ",
      envText: "A=1",
      cwd: "  ",
    };
    const up = toUpsert(d, { kind: "user" });
    assert.equal(up.id, "s1");
    assert.equal(up.name, "s1");
    assert.equal(up.transport, "stdio");
    assert.equal(up.transport === "stdio" && up.command, "npx");
    assert.deepEqual(up.transport === "stdio" && up.args, ["-y", "server"]);
    assert.deepEqual(up.transport === "stdio" && up.env, { A: "1" });
    assert.equal(up.transport === "stdio" && up.cwd, null);
  });

  it("builds http upsert with parsed headers", () => {
    const d = {
      ...emptyDraft(),
      id: "s2",
      transport: "http" as const,
      url: " https://x ",
      headersText: "K=V",
    };
    const up = toUpsert(d, { kind: "workspace", workspaceId: "w1" });
    assert.equal(up.transport, "http");
    assert.equal(up.transport === "http" && up.url, "https://x");
    assert.deepEqual(up.transport === "http" && up.headers, { K: "V" });
    assert.deepEqual(up.scope, { kind: "workspace", workspaceId: "w1" });
  });
});

describe("statusVariant", () => {
  it("maps states to badge variants", () => {
    assert.equal(statusVariant("ready"), "success");
    assert.equal(statusVariant("error"), "danger");
    assert.equal(statusVariant("starting"), "accent");
    assert.equal(statusVariant("stopped"), "neutral");
    assert.equal(statusVariant(undefined), "neutral");
  });
});

describe("sameScope", () => {
  it("treats missing scope as user and compares workspace ids", () => {
    assert.equal(sameScope(undefined, { kind: "user" }), true);
    assert.equal(sameScope(undefined, { kind: "workspace", workspaceId: "w1" }), false);
    assert.equal(sameScope({ kind: "user" }, { kind: "user" }), true);
    assert.equal(
      sameScope({ kind: "workspace", workspaceId: "w1" }, { kind: "workspace", workspaceId: "w1" }),
      true,
    );
    assert.equal(
      sameScope({ kind: "workspace", workspaceId: "w1" }, { kind: "workspace", workspaceId: "w2" }),
      false,
    );
    assert.equal(sameScope({ kind: "user" }, { kind: "workspace", workspaceId: "w1" }), false);
  });
});
