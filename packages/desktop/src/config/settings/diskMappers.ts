/**
 * 设置磁盘形态 ↔ 内存形态映射（读入宽松归一、写出密文保留）。
 */
import fs from "node:fs";
import path from "node:path";
import {
  createId,
  isRecord,
  type ModelEntry,
  type ModelHealth,
  normalizeGeneral,
  normalizeModelSelection,
  normalizeModelTags,
  normalizeShortcuts,
} from "@thinker-workbench/shared";
import { encryptSecret } from "../secretCrypto";
import {
  type DiskModelCatalog,
  type DiskModelEntry,
  type DiskProvider,
  type DiskSettings,
  emptyStoredCatalog,
  type StoredModelCatalog,
  type StoredProvider,
  type StoredSettings,
} from "./state";

function readProviderFromDisk(raw: DiskProvider): StoredProvider {
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : createId("prov");
  const label = typeof raw.label === "string" ? raw.label : "Provider";
  const baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl : "";
  const apiKeyEnc = typeof raw.apiKeyEnc === "string" ? raw.apiKeyEnc.trim() : "";
  // 延迟解密：启动只带上密文，真正用钥时再 unlock
  return { id, label, apiKey: "", apiKeyEnc, baseUrl };
}

function readEntryFromDisk(raw: DiskModelEntry, index: number): ModelEntry {
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : createId("mdl");
  const providerId =
    typeof raw.providerId === "string" && raw.providerId.trim() ? raw.providerId.trim() : "";
  const model = typeof raw.model === "string" ? raw.model : "";
  const label =
    typeof raw.label === "string" && raw.label.trim() ? raw.label : model || `Model ${index + 1}`;
  const health: ModelHealth = raw.health === "error" ? "error" : "ok";
  const contextWindow =
    typeof raw.contextWindow === "number" &&
    Number.isFinite(raw.contextWindow) &&
    raw.contextWindow > 0
      ? Math.floor(raw.contextWindow)
      : undefined;
  const lastCheckedAt =
    typeof raw.lastCheckedAt === "number" && Number.isFinite(raw.lastCheckedAt)
      ? Math.floor(raw.lastCheckedAt)
      : undefined;
  const lastError =
    typeof raw.lastError === "string" && raw.lastError.trim() ? raw.lastError.trim() : undefined;

  return {
    id,
    providerId,
    model,
    label,
    tags: normalizeModelTags(raw.tags),
    priority:
      typeof raw.priority === "number" && Number.isFinite(raw.priority)
        ? Math.floor(raw.priority)
        : index,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    health,
    ...(contextWindow != null ? { contextWindow } : {}),
    ...(lastError ? { lastError } : {}),
    ...(lastCheckedAt != null ? { lastCheckedAt } : {}),
  };
}

/** 从磁盘 model 段还原内存目录（含密文）。 */
function readModelFromDisk(raw: unknown): StoredModelCatalog {
  if (!raw || typeof raw !== "object") {
    return emptyStoredCatalog();
  }
  const obj = raw as DiskModelCatalog;
  const providers: StoredProvider[] = (obj.providers ?? []).map((p) =>
    readProviderFromDisk(p ?? {}),
  );
  const models = (obj.models ?? []).map((e, i) => readEntryFromDisk(e ?? {}, i));
  return {
    providers,
    models,
    selection: normalizeModelSelection(obj.selection),
    allowEmoji: typeof obj.allowEmoji === "boolean" ? obj.allowEmoji : false,
  };
}

function providerToDisk(provider: StoredProvider): DiskProvider {
  const key = provider.apiKey.trim();
  if (!key) {
    return {
      id: provider.id,
      label: provider.label,
      apiKeyEnc: provider.apiKeyEnc.trim(),
      baseUrl: provider.baseUrl,
    };
  }
  const enc = encryptSecret(key);
  if (enc === null) {
    return {
      id: provider.id,
      label: provider.label,
      apiKeyEnc: provider.apiKeyEnc,
      baseUrl: provider.baseUrl,
    };
  }
  provider.apiKeyEnc = enc;
  return {
    id: provider.id,
    label: provider.label,
    apiKeyEnc: enc,
    baseUrl: provider.baseUrl,
  };
}

function entryToDisk(entry: ModelEntry): DiskModelEntry {
  return {
    id: entry.id,
    providerId: entry.providerId,
    model: entry.model,
    label: entry.label,
    tags: entry.tags,
    priority: entry.priority,
    enabled: entry.enabled,
    health: entry.health,
    ...(typeof entry.contextWindow === "number" ? { contextWindow: entry.contextWindow } : {}),
    ...(entry.lastError ? { lastError: entry.lastError } : {}),
    ...(typeof entry.lastCheckedAt === "number" ? { lastCheckedAt: entry.lastCheckedAt } : {}),
  };
}

/** 将内存 catalog 转为磁盘形态。 */
function modelToDisk(model: StoredModelCatalog): DiskModelCatalog {
  return {
    providers: model.providers.map(providerToDisk),
    models: model.models.map(entryToDisk),
    selection: model.selection,
    allowEmoji: model.allowEmoji,
  };
}

function toDiskPayload(next: StoredSettings): DiskSettings {
  return {
    model: modelToDisk(next.model),
    shortcuts: next.shortcuts,
    general: next.general,
  };
}

function writeSettingsFile(file: string, disk: DiskSettings): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(disk, null, 2)}\n`, "utf8");
}

function parseDiskFile(file: string): StoredSettings | null {
  try {
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as DiskSettings;
    if (!isRecord(parsed)) return null;
    return {
      model: readModelFromDisk(parsed.model),
      shortcuts: normalizeShortcuts(parsed.shortcuts),
      general: normalizeGeneral(parsed.general),
    };
  } catch (err) {
    console.error("[settings] failed to load", file, err);
    return null;
  }
}

export {
  entryToDisk,
  modelToDisk,
  parseDiskFile,
  providerToDisk,
  readEntryFromDisk,
  readModelFromDisk,
  readProviderFromDisk,
  toDiskPayload,
  writeSettingsFile,
};
