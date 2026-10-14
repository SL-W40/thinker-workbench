/**
 * 模型目录：公开视图、标签、旧设置迁移、路由与失败原因。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  buildModelCandidates,
  classifyModelSwitchReason,
  emptyModelCatalog,
  type ModelCatalog,
  type ModelEntry,
  migrateLegacyModelSettings,
  normalizeModelSelection,
  normalizeModelTags,
  resolveModelSettings,
  routeModelTag,
  toPublicModelCatalog,
} from "../../src/ipc/settings";

function entry(partial: Partial<ModelEntry> & Pick<ModelEntry, "id" | "tags">): ModelEntry {
  return {
    providerId: "prov_1",
    model: "m",
    label: partial.id,
    priority: 0,
    enabled: true,
    health: "ok",
    ...partial,
  };
}

describe("model catalog helpers", () => {
  it("密钥只留末四位；空目录与 selection 非法值回退 auto", () => {
    const catalog = emptyModelCatalog();
    catalog.providers.push({ id: "p", label: "P", apiKey: "sk-secret-1234", baseUrl: "https://x" });
    catalog.models.push(entry({ id: "m1", tags: ["general"] }));
    const pub = toPublicModelCatalog(catalog);
    assert.equal(pub.providers[0]?.apiKeyHint, "••••1234");
    assert.equal(pub.providers[0]?.hasApiKey, true);
    assert.equal("apiKey" in (pub.providers[0] ?? {}), false);
    assert.deepEqual(normalizeModelSelection(null), { mode: "auto" });
    assert.deepEqual(normalizeModelSelection({ mode: "manual", modelId: " m1 " }), {
      mode: "manual",
      modelId: "m1",
    });
    assert.deepEqual(normalizeModelTags(["coding", "nope", "coding"]), ["general", "coding"]);
  });

  it("旧单字段设置迁成一条 provider；空旧值仍是空目录", () => {
    assert.equal(migrateLegacyModelSettings({}).models.length, 0);
    const migrated = migrateLegacyModelSettings({
      apiKey: "sk",
      baseUrl: "https://api",
      model: "gpt",
      allowEmoji: true,
      contextWindow: 8.9,
    });
    assert.equal(migrated.providers[0]?.apiKey, "sk");
    assert.equal(migrated.selection.mode, "manual");
    assert.equal(migrated.models[0]?.contextWindow, 8);
    assert.equal(migrated.allowEmoji, true);
  });

  it("展开凭据时缺 provider 或缺 key 返回 null", () => {
    const catalog: ModelCatalog = {
      ...emptyModelCatalog(),
      providers: [{ id: "p", label: "P", apiKey: "  ", baseUrl: "" }],
      models: [entry({ id: "m1", tags: ["general"], providerId: "missing" })],
    };
    const model = catalog.models[0];
    const provider = catalog.providers[0];
    assert.ok(model);
    assert.ok(provider);
    assert.equal(resolveModelSettings(catalog, model), null);
    model.providerId = "p";
    assert.equal(resolveModelSettings(catalog, model), null);
    provider.apiKey = "sk";
    const settings = resolveModelSettings(catalog, model);
    assert.equal(settings?.apiKey, "sk");
    assert.equal(settings?.entryId, "m1");
  });

  it("路由：附图走 vision，代码走 coding，长文走 reasoning，短句走 fast", () => {
    assert.equal(routeModelTag("hi", [], { hasImages: true }), "vision");
    assert.equal(routeModelTag("see ```ts\n```"), "coding");
    assert.equal(routeModelTag("look at src/app.ts"), "coding");
    assert.equal(routeModelTag("请证明这个架构", []), "reasoning");
    assert.equal(routeModelTag("hi"), "fast");
    assert.equal(routeModelTag(""), "general");
  });

  it("Auto 只拿健康且带标签的模型；没有标签就退回全部健康模型", () => {
    const catalog: ModelCatalog = {
      ...emptyModelCatalog(),
      models: [
        entry({ id: "b", tags: ["general"], priority: 2 }),
        entry({ id: "a", tags: ["fast", "general"], priority: 1 }),
        entry({ id: "down", tags: ["fast"], health: "error", priority: 0 }),
        entry({ id: "off", tags: ["fast"], enabled: false, priority: 0 }),
      ],
    };
    const fast = buildModelCandidates(catalog, { mode: "auto" }, { userText: "hi" });
    assert.deepEqual(
      fast.map((m) => m.id),
      ["a"],
    );
    const manual = buildModelCandidates(catalog, { mode: "manual", modelId: "down" });
    assert.deepEqual(
      manual.map((m) => m.id),
      ["down"],
    );
    assert.deepEqual(buildModelCandidates(catalog, { mode: "manual", modelId: "nope" }), []);
  });

  it("失败原因按 HTTP 与网络文案归类", () => {
    assert.equal(classifyModelSwitchReason(new Error("OpenAI HTTP 401")), "auth");
    assert.equal(classifyModelSwitchReason(new Error("model not found")), "not_found");
    assert.equal(classifyModelSwitchReason("rate limit"), "rate_limit");
    assert.equal(classifyModelSwitchReason(new Error("OpenAI HTTP 503")), "server");
    assert.equal(classifyModelSwitchReason(new Error("fetch failed")), "network");
    assert.equal(classifyModelSwitchReason(null), "other");
  });
});
