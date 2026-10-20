/**
 * 应用设置持久化（目录 barrel）：保持 `config/settingsStore` 的既有导入路径与导出面不变。
 */
export type { UnlockModelSecretsResult } from "@thinker-workbench/shared";
export {
  getPublicModelSettings,
  markModelHealth,
  resolvePrimaryModelMeta,
  resolvePrimaryModelSettings,
  saveModelSettings,
} from "./modelCatalog";
export { bootstrapSettingsPath, describeDataDirPaths, settingsPath } from "./paths";
export { hasLockedModelSecrets, unlockModelSecretsForRun } from "./secrets";
export {
  commitDataDirSetting,
  getGeneralSettings,
  getModelCatalog,
  getModelCatalogSnapshot,
  getShortcutsSettings,
  loadSettings,
  saveGeneralSettings,
  saveShortcutsSettings,
} from "./settingsStore";
export { resetSettingsCacheForTests } from "./state";
