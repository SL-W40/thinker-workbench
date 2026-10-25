/**
 * 模型目录写入成功后应通知同窗口的选择器。
 */
import assert from "node:assert/strict";
import type { ModelCatalogPublic } from "@thinker-workbench/shared";
import { afterEach, describe, it } from "vitest";
import {
  MODEL_SETTINGS_CHANGED,
  probeModel,
  setModelSettings,
} from "../../../src/platform/ipc/thinker";

const catalog: ModelCatalogPublic = {
  providers: [{ id: "p1", label: "QWEN", hasApiKey: true, apiKeyHint: "sk-…", baseUrl: "" }],
  models: [],
  selection: { mode: "auto" },
  allowEmoji: false,
};

type WindowStub = {
  thinker?: {
    settings?: {
      setModel?: (patch: unknown) => Promise<ModelCatalogPublic>;
      probeModel?: (request: unknown) => Promise<{ ok: boolean; catalog: ModelCatalogPublic }>;
    };
  };
  dispatchEvent: (event: Event) => boolean;
};

function installWindow(settings: NonNullable<WindowStub["thinker"]>["settings"]): CustomEvent[] {
  const events: CustomEvent[] = [];
  const stub: WindowStub = {
    thinker: { settings },
    dispatchEvent(event: Event) {
      events.push(event as CustomEvent);
      return true;
    },
  };
  (globalThis as { window?: WindowStub }).window = stub;
  return events;
}

afterEach(() => {
  delete (globalThis as { window?: WindowStub }).window;
});

describe("model settings change event", () => {
  it("setModelSettings 成功后派发最新目录", async () => {
    const events = installWindow({
      setModel: async () => catalog,
    });
    const saved = await setModelSettings({ allowEmoji: true });
    assert.equal(saved, catalog);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.type, MODEL_SETTINGS_CHANGED);
    assert.equal(events[0]?.detail, catalog);
  });

  it("写入失败时不派发", async () => {
    const events = installWindow({
      setModel: async () => {
        throw new Error("save failed");
      },
    });
    await assert.rejects(() => setModelSettings({}), /save failed/);
    assert.equal(events.length, 0);
  });

  it("probeModel 成功后用返回目录派发", async () => {
    const events = installWindow({
      probeModel: async () => ({ ok: false, catalog }),
    });
    const result = await probeModel({ modelId: "m1" });
    assert.equal(result.ok, false);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.type, MODEL_SETTINGS_CHANGED);
    assert.equal(events[0]?.detail, catalog);
  });
});
