/**
 * 设置加载延迟解密：load / 公开视图不碰 safeStorage；getModelCatalog 才解锁。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it, vi } from "vitest";

const secretCounters = vi.hoisted(() => ({ decrypt: 0, encrypt: 0 }));

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) => {
      secretCounters.encrypt += 1;
      return Buffer.from(`enc:${text}`, "utf8");
    },
    decryptString: (buf: Buffer) => {
      secretCounters.decrypt += 1;
      const raw = buf.toString("utf8");
      if (!raw.startsWith("enc:")) {
        throw new Error(`bad ciphertext: ${JSON.stringify(raw)}`);
      }
      return raw.slice(4);
    },
  },
}));

describe("settingsStore lazy secrets", () => {
  let tmp: string;
  let prevHome: string | undefined;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tw-settings-"));
    prevHome = process.env.THINKER_HOME;
    process.env.THINKER_HOME = tmp;
    secretCounters.decrypt = 0;
    secretCounters.encrypt = 0;
  });

  afterEach(async () => {
    try {
      const { resetSettingsCacheForTests } = await import("../../../src/config/settingsStore");
      resetSettingsCacheForTests();
    } catch {
      /* ignore */
    }
    if (prevHome === undefined) delete process.env.THINKER_HOME;
    else process.env.THINKER_HOME = prevHome;
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("loadSettings / 公开视图不解密；getModelCatalog 才解密", async () => {
    // 与 mock 约定一致的 base64 密文（避免走真实 Electron safeStorage）
    const enc = Buffer.from("enc:sk-test-key-1234", "utf8").toString("base64");

    const settingsFile = path.join(tmp, "settings.json");
    fs.writeFileSync(
      settingsFile,
      `${JSON.stringify(
        {
          themeCatalogVersion: 2,
          model: {
            version: 2,
            providers: [
              {
                id: "prov_1",
                label: "Default",
                apiKeyEnc: enc,
                baseUrl: "https://api.example.com",
              },
            ],
            models: [
              {
                id: "mdl_1",
                providerId: "prov_1",
                model: "gpt-test",
                label: "Test",
                tags: ["general"],
                priority: 0,
                enabled: true,
                health: "ok",
              },
            ],
            selection: { mode: "auto" },
            allowEmoji: false,
          },
          shortcuts: {},
          general: {},
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const {
      loadSettings,
      getPublicModelSettings,
      getModelCatalogSnapshot,
      getModelCatalog,
      unlockModelSecretsForRun,
      resolvePrimaryModelMeta,
      resetSettingsCacheForTests,
      saveGeneralSettings,
    } = await import("../../../src/config/settingsStore");

    resetSettingsCacheForTests();
    const loaded = loadSettings();
    assert.equal(loaded.model.providers[0]?.id, "prov_1");
    assert.equal(loaded.model.providers[0]?.apiKey, "");
    assert.equal(secretCounters.decrypt, 0);

    const pub = getPublicModelSettings();
    assert.equal(pub.providers[0]?.hasApiKey, true);
    assert.equal(pub.providers[0]?.apiKeyHint, "••••");
    assert.equal(secretCounters.decrypt, 0);

    const snap = getModelCatalogSnapshot();
    assert.equal(snap.providers[0]?.apiKey, "");
    assert.equal(secretCounters.decrypt, 0);

    // contextUsage 用的元数据解析：不解密、不要求明文 key
    const meta = resolvePrimaryModelMeta(snap);
    assert.equal(meta.apiKey, "");
    assert.equal(meta.model, "gpt-test");
    assert.equal(secretCounters.decrypt, 0);

    // 改通用设置落盘不应丢掉密文，也不应解密
    saveGeneralSettings({ uiLocale: "zh" });
    assert.equal(secretCounters.decrypt, 0);
    const rewritten = JSON.parse(fs.readFileSync(settingsFile, "utf8")) as {
      model: { providers: Array<{ apiKeyEnc?: string }> };
    };
    assert.equal(rewritten.model.providers[0]?.apiKeyEnc, enc);

    const unlocked = unlockModelSecretsForRun();
    assert.equal(unlocked.ok, true);
    assert.ok(secretCounters.decrypt >= 1);
    assert.equal(getModelCatalog().providers[0]?.apiKey, "sk-test-key-1234");

    // 清空 Map 后仍能从磁盘补密文并解锁
    resetSettingsCacheForTests();
    secretCounters.decrypt = 0;
    const again = unlockModelSecretsForRun();
    assert.equal(again.ok, true);
    assert.ok(secretCounters.decrypt >= 1);

    // force：即使已有明文也再调 decrypt（Retry 路径）
    secretCounters.decrypt = 0;
    const forced = unlockModelSecretsForRun({ force: true });
    assert.equal(forced.ok, true);
    assert.equal(secretCounters.decrypt, 1);
    assert.equal(getModelCatalog().providers[0]?.apiKey, "sk-test-key-1234");
  });
});
