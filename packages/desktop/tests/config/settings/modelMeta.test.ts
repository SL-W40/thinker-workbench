/**
 * 估算路径的模型元数据：快照（无明文 key）也要解析出 contextWindow。
 *
 * 回归点：contextUsage 走「不解锁密钥」的快照，若拿不到窗口会回退默认 128K，
 * 面板就会显示与设置不符的上限。
 *
 * 只用内存目录，不写磁盘 / 不设 THINKER_HOME：多个测试文件并发改同一环境变量会互相踩。
 */
import assert from "node:assert/strict";
import { describe, it, vi } from "vitest";
import { type ModelCatalog, type ModelSelection } from "@thinker-workbench/shared";

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) => Buffer.from(`enc:${text}`, "utf8"),
    decryptString: (buf: Buffer) => buf.toString("utf8").slice(4),
  },
}));

const { resolvePrimaryModelMeta } = await import("../../../src/config/settings/modelCatalog");

/** 只有密文的 provider + 带 1M 窗口的模型，模拟真实设置文件的内存形态。 */
function catalog(contextWindow?: number): ModelCatalog {
  return {
    providers: [
      { id: "prov_1", label: "Default", apiKey: "", baseUrl: "https://api.example.com" },
    ],
    models: [
      {
        id: "mdl_1",
        providerId: "prov_1",
        model: "deep-test",
        label: "Test",
        tags: ["general"],
        priority: 0,
        enabled: true,
        health: "ok",
        ...(contextWindow ? { contextWindow } : {}),
      },
    ],
    selection: { mode: "auto" } as ModelSelection,
    allowEmoji: true,
  };
}

describe("resolvePrimaryModelMeta（估算路径）", () => {
  it("无明文 key 时仍解析出模型的 contextWindow 与 emoji 偏好", () => {
    const meta = resolvePrimaryModelMeta(catalog(1_049_000));
    assert.equal(meta.contextWindow, 1_049_000);
    assert.equal(meta.allowEmoji, true);
    // 估算路径不得依赖明文密钥
    assert.equal(meta.apiKey, "");
    assert.equal(meta.model, "deep-test");
  });

  it("按会话选用解析：manual 覆盖优先", () => {
    const withSecond: ModelCatalog = {
      ...catalog(128_000),
      models: [
        ...catalog(128_000).models,
        {
          id: "mdl_2",
          providerId: "prov_1",
          model: "kimi-test",
          label: "Kimi",
          tags: ["general"],
          priority: 0,
          enabled: true,
          health: "ok",
          contextWindow: 1_049_000,
        },
      ],
    };
    const meta = resolvePrimaryModelMeta(withSecond, { mode: "manual", modelId: "mdl_2" });
    assert.equal(meta.model, "kimi-test");
    assert.equal(meta.contextWindow, 1_049_000);
  });

  it("模型未配窗口时不臆造，交给调用方回退默认", () => {
    assert.equal(resolvePrimaryModelMeta(catalog()).contextWindow, undefined);
  });
});
