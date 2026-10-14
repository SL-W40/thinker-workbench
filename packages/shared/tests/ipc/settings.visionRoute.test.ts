/**
 * vision 标签 Auto 路由。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { ModelCatalog } from "../../src/ipc/settings";
import { buildModelCandidates, routeModelTag } from "../../src/ipc/settings";

describe("routeModelTag vision", () => {
  it("有附图时返回 vision", () => {
    assert.equal(routeModelTag("看这张图", [], { hasImages: true }), "vision");
  });

  it("无附图时仍走文本启发式", () => {
    assert.equal(routeModelTag("hi", [], { hasImages: false }), "fast");
    assert.equal(routeModelTag("```ts\nconst x=1\n```", []), "coding");
  });
});

describe("buildModelCandidates vision", () => {
  const catalog: ModelCatalog = {
    providers: [{ id: "p1", label: "P", apiKey: "k", baseUrl: "https://example.com/v1" }],
    models: [
      {
        id: "m-general",
        providerId: "p1",
        model: "g",
        label: "G",
        tags: ["general"],
        priority: 1,
        enabled: true,
        health: "ok",
      },
      {
        id: "m-vision",
        providerId: "p1",
        model: "v",
        label: "V",
        tags: ["general", "vision"],
        priority: 0,
        enabled: true,
        health: "ok",
      },
    ],
    selection: { mode: "auto" },
    allowEmoji: false,
  };

  it("有图时优先 vision 标签模型", () => {
    const list = buildModelCandidates(
      catalog,
      { mode: "auto" },
      {
        userText: "描述图片",
        hasImages: true,
      },
    );
    assert.equal(list[0]?.id, "m-vision");
  });

  it("有图但无 vision 标签时回退全部健康模型", () => {
    const noVision: ModelCatalog = {
      ...catalog,
      models: catalog.models.filter((m) => m.id === "m-general"),
    };
    const list = buildModelCandidates(
      noVision,
      { mode: "auto" },
      {
        userText: "描述图片",
        hasImages: true,
      },
    );
    assert.equal(list[0]?.id, "m-general");
  });
});
