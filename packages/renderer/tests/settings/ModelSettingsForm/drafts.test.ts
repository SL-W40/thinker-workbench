/**
 * ModelSettingsForm 草稿纯函数（drafts.ts）。
 */
import assert from "node:assert/strict";
import type { ModelCatalogPublic, ModelEntry } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import {
  mergeModelHealth,
  normalizeFormTags,
  parseContextWindow,
  SAVE_DEBOUNCE_MS,
  selectionValue,
  toProviderDrafts,
} from "../../../src/features/settings/ModelSettingsForm/drafts";

const catalog: ModelCatalogPublic = {
  providers: [
    { id: "p1", label: "Default", hasApiKey: true, apiKeyHint: "••••", baseUrl: "https://x" },
    { id: "p2", label: "Other", hasApiKey: false, apiKeyHint: "", baseUrl: "" },
  ],
  models: [],
  selection: { mode: "auto" },
  allowEmoji: false,
};

function entry(over: Partial<ModelEntry>): ModelEntry {
  return {
    id: "m1",
    providerId: "p1",
    model: "gpt",
    label: "GPT",
    tags: ["general"],
    priority: 0,
    enabled: true,
    health: "ok",
    ...over,
  };
}

describe("toProviderDrafts", () => {
  it("maps public providers with empty local apiKey", () => {
    const drafts = toProviderDrafts(catalog);
    assert.equal(drafts.length, 2);
    assert.deepEqual(drafts[0], {
      id: "p1",
      label: "Default",
      baseUrl: "https://x",
      apiKey: "",
      hasApiKey: true,
      apiKeyHint: "••••",
    });
    assert.equal(drafts[1].hasApiKey, false);
  });
});

describe("selectionValue", () => {
  it("returns auto or manual modelId", () => {
    assert.equal(selectionValue({ mode: "auto" }), "auto");
    assert.equal(selectionValue({ mode: "manual", modelId: "m9" }), "m9");
  });
});

describe("normalizeFormTags", () => {
  it("prepends general when missing and keeps order otherwise", () => {
    assert.deepEqual(normalizeFormTags(["vision"]), ["general", "vision"]);
    assert.deepEqual(normalizeFormTags(["general", "vision"]), ["general", "vision"]);
  });
});

describe("parseContextWindow", () => {
  it("floors valid numbers and falls back otherwise", () => {
    assert.equal(parseContextWindow("8192", 4096), 8192);
    assert.equal(parseContextWindow("8192.9", 4096), 8192);
    assert.equal(parseContextWindow("0", 4096), 4096);
    assert.equal(parseContextWindow("-5", 4096), 4096);
    assert.equal(parseContextWindow("abc", 4096), 4096);
  });
});

describe("mergeModelHealth", () => {
  it("keeps local rows and merges health fields", () => {
    const local = [entry({ id: "m1", label: "本地名", health: "ok" })];
    const incoming = [
      entry({ id: "m1", label: "主进程名", health: "error", lastError: "boom", lastCheckedAt: 99 }),
    ];
    const merged = mergeModelHealth(local, incoming);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].label, "本地名");
    assert.equal(merged[0].health, "error");
    assert.equal(merged[0].lastError, "boom");
    assert.equal(merged[0].lastCheckedAt, 99);
  });

  it("clones new entries and copies tags", () => {
    const local: ModelEntry[] = [];
    const incoming = [entry({ id: "new", tags: ["general", "vision"] })];
    const merged = mergeModelHealth(local, incoming);
    assert.equal(merged[0].id, "new");
    assert.notEqual(merged[0].tags, incoming[0].tags);
    assert.deepEqual(merged[0].tags, ["general", "vision"]);
  });
});

describe("SAVE_DEBOUNCE_MS", () => {
  it("is a positive debounce", () => {
    assert.ok(SAVE_DEBOUNCE_MS > 0);
  });
});
