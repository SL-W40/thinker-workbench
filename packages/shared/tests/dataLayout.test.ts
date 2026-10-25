/**
 * dataDir 布局表：路径解析、自洽性与「表外不直拼」的源码护栏。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "vitest";
import {
  chatImageAllowed,
  DATA_LAYOUT,
  DEFAULT_WORKSPACE_ID,
  dataPath,
  listDataEntries,
} from "../src/dataLayout";

const ROOT = path.resolve(__dirname, "../../..");

describe("dataLayout", () => {
  it("解析工作区级落点并填充 workspaceId", () => {
    const dir = path.join(ROOT, "tmp-data");
    assert.equal(
      dataPath(dir, "wsChatDb", { workspaceId: "ws_1" }).replace(/\\/g, "/"),
      `${dir.replace(/\\/g, "/")}/workspaces/ws_1/chat.db`,
    );
    assert.equal(
      dataPath(dir, "wsTrace", { workspaceId: "ws_1" }).replace(/\\/g, "/"),
      `${dir.replace(/\\/g, "/")}/workspaces/ws_1/trace`,
    );
  });

  it("解析全局级落点（state / customize / cache）", () => {
    const dir = path.join(ROOT, "tmp-data");
    assert.ok(dataPath(dir, "catalogDb").replace(/\\/g, "/").endsWith("/state/catalog.db"));
    assert.ok(dataPath(dir, "sessionFile").replace(/\\/g, "/").endsWith("/state/session.json"));
    assert.ok(dataPath(dir, "customSkills").replace(/\\/g, "/").endsWith("/customize/skills"));
    assert.ok(
      dataPath(dir, "cacheBrowserScreenshots")
        .replace(/\\/g, "/")
        .endsWith("/cache/browser-screenshots"),
    );
    assert.ok(
      dataPath(dir, "cacheComputerImages").replace(/\\/g, "/").endsWith("/cache/computer/images"),
    );
  });

  it("工作区级落点缺 workspaceId 时报错（避免写出无归属数据）", () => {
    assert.throws(() => dataPath(ROOT, "wsChatDb"));
  });

  it("默认工作区 id 固定，根落在其 project 子目录", () => {
    assert.equal(DEFAULT_WORKSPACE_ID, "ws_default");
    assert.ok(
      dataPath(ROOT, "wsProject", { workspaceId: DEFAULT_WORKSPACE_ID })
        .replace(/\\/g, "/")
        .endsWith("/workspaces/ws_default/project"),
    );
  });

  it("表自洽：label / kind / purge 齐全，cache 类带保留参数", () => {
    const entries = listDataEntries();
    assert.ok(entries.length > 10);
    for (const entry of entries) {
      assert.ok(entry.label.trim(), entry.key);
      assert.ok(["config", "state", "workspace", "content", "cache"].includes(entry.kind));
      assert.ok(["never", "withWorkspace", "retention"].includes(entry.purge));
      if (entry.purge === "retention") {
        assert.ok(
          entry.retention && entry.retention.maxAgeDays > 0 && entry.retention.maxBytes > 0,
        );
      }
    }
    const cacheEntries = entries.filter((e) => e.kind === "cache");
    assert.ok(cacheEntries.length >= 2);
  });

  it("工作区级条目一律随工作区删除", () => {
    for (const entry of Object.values(DATA_LAYOUT)) {
      if (entry.rel.includes("{workspaceId}") && entry.kind === "workspace") {
        assert.equal(entry.purge, "withWorkspace", entry.rel);
      }
    }
  });

  it("会话附图白名单覆盖 workspaces 与 computer 截图目录", () => {
    const allowed = chatImageAllowed(path.join(ROOT, "tmp-data"));
    assert.ok(allowed.workspacesRoot.replace(/\\/g, "/").endsWith("/workspaces"));
    assert.deepEqual([...allowed.workspaceKinds], ["images", "attachments"]);
    assert.ok(allowed.computerImagesDir.replace(/\\/g, "/").endsWith("/cache/computer/images"));
  });

  it("源码护栏：不得再出现布局表之外的 dataDir 直拼", () => {
    // 只拦「路径拼接」形态；kind 名（skills / rules 等）作为标识符出现是允许的
    const forbidden: RegExp[] = [
      /session_memory\.sqlite/,
      /"catalog\.db"/,
      /getPath\("userData"\),\s*"checkpoints"/,
      /"computer",\s*"images"/,
      /path\.join\(\s*(?:getDataDir\(\)|dataDir)\s*,\s*"(?:workspaces|skills|rules|agents|mcps|trace|checkpoints|session\.json|catalog\.db)"/,
      /path\.join\(\s*dataDir\s*,\s*"computer"/,
      /"\.thinker",\s*"shell-output"/,
    ];
    const roots = [path.join(ROOT, "packages/desktop/src"), path.join(ROOT, "packages/engine/src")];
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith(".ts")) continue;
        const text = fs.readFileSync(full, "utf8");
        for (const pattern of forbidden) {
          const match = pattern.exec(text);
          if (match) hits.push(`${path.relative(ROOT, full)} -> ${match[0]}`);
        }
      }
    };
    for (const root of roots) walk(root);
    assert.deepEqual(hits, []);
  });
});
