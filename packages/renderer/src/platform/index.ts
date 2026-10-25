/**
 * platform 层对外出口：Electron 宿主适配。
 *
 * 收录范围 —— 与宿主环境打交道且不依赖上层的一小层：
 * - `./ipc`：主进程 IPC 客户端（原 src/bridge）
 * - `./appearance`：主题与外观（原 src/theme，启动时的外观读取原 src/boot/readBootAppearance）
 * - `./dev`：仅开发态挂载的 HMR 兜底（原 src/hmr）
 * - `./logging`：渲染进程会话日志
 * - `./branding`：品牌图标等静态资源路径
 *
 * 本层不得反向依赖 ui / features；新加的宿主能力默认放这里，而不是散在 src 根目录。
 */
export { AppearanceProvider } from "./appearance/AppearanceProvider";
export { applyUiFontScale } from "./appearance/fontScale";
export { readBootAppearance } from "./appearance/readBootAppearance";
export { brandAppIconSrc, brandGlyphSrc } from "./branding";
export { installBlankRootRecovery } from "./dev";
export { OPEN_BROWSER_EVENT, onBrowserEvent } from "./ipc/browser";
export { windowApi } from "./ipc/thinker";
export { bootstrapAppLog } from "./logging";
