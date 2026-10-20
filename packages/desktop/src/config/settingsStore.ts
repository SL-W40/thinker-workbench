/**
 * 应用设置持久化。
 *
 * - 权威文件：`<dataDir>/settings.json`（可在数据根；默认 dataDir 即 `~/.thinker`）
 * - 引导镜像：`~/.thinker/settings.json`（dataDir 非默认时同步一份，供下次启动解析 dataDir）
 *
 * 内存中 provider.apiKey 为明文；落盘时仅存 `apiKeyEnc`（safeStorage 密文）。
 *
 * 密文**不会**在 `loadSettings` / `getModelCatalogSnapshot` / contextUsage 时解密；
 * 仅在发消息、resume、探测模型等真正需要密钥时经 `ensureSecretsUnlocked` 解锁。
 *
 * 实现已按域拆分至 ./settings/，本文件仅保留 barrel 以维持既有导入路径与导出面。
 */
export * from "./settings/index";
