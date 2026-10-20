/**
 * settingsStore 磁盘映射纯函数（diskMappers.ts）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  entryToDisk,
  readEntryFromDisk,
  readModelFromDisk,
} from "../../../src/config/settings/diskMappers";

describe("readEntryFromDisk", () => {
  it("fills defaults and normalizes fields", () => {
    const entry = readEntryFromDisk({ model: "gpt-test" }, 2);
    assert.ok(entry.id.startsWith("mdl_"));
    assert.equal(entry.providerId, "");
    assert.equal(entry.model, "gpt-test");
    // label 回落 model；priority 回落 index
    assert.equal(entry.label, "gpt-test");
    assert.equal(entry.priority, 2);
    assert.equal(entry.enabled, true);
    assert.equal(entry.health, "ok");
  });

  it("normalizes health / floors numbers / trims lastError", () => {
    const entry = readEntryFromDisk(
      {
        id: "mdl_1",
        health: "error",
        contextWindow: 1234.9,
        lastCheckedAt: 99.7,
        lastError: "  boom  ",
        priority: 5.9,
      },
      0,
    );
    assert.equal(entry.health, "error");
    assert.equal(entry.contextWindow, 1234);
    assert.equal(entry.lastCheckedAt, 99);
    assert.equal(entry.lastError, "boom");
    assert.equal(entry.priority, 5);
  });

  it("drops invalid numbers and falls back label to Model N", () => {
    const entry = readEntryFromDisk(
      { id: "m", contextWindow: -1, lastCheckedAt: Number.NaN, priority: Number.NaN },
      3,
    );
    assert.equal(entry.contextWindow, undefined);
    assert.equal(entry.lastCheckedAt, undefined);
    assert.equal(entry.priority, 3);
    assert.equal(entry.label, "Model 4");
  });
});

describe("readModelFromDisk", () => {
  it("returns empty catalog for non-object", () => {
    const catalog = readModelFromDisk(null);
    assert.deepEqual(catalog.providers, []);
    assert.deepEqual(catalog.models, []);
    assert.equal(catalog.allowEmoji, false);
  });

  it("keeps allowEmoji flag and selection", () => {
    const catalog = readModelFromDisk({ allowEmoji: true, selection: { mode: "auto" } });
    assert.equal(catalog.allowEmoji, true);
    assert.deepEqual(catalog.selection, { mode: "auto" });
  });
});

describe("entryToDisk", () => {
  it("maps entry to disk shape, omitting absent optional fields", () => {
    const disk = entryToDisk({
      id: "mdl_1",
      providerId: "prov_1",
      model: "gpt-test",
      label: "Test",
      tags: ["general"],
      priority: 0,
      enabled: true,
      health: "ok",
    });
    assert.deepEqual(disk, {
      id: "mdl_1",
      providerId: "prov_1",
      model: "gpt-test",
      label: "Test",
      tags: ["general"],
      priority: 0,
      enabled: true,
      health: "ok",
    });
  });
});
