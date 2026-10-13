/**
 * App Bundle Layout v1 — stage 与运行时的共同契约。
 * 相对路径均相对 payload 根（安装包内 `Resources/payload/`）。
 */

/** 当前布局版本；运行时拒绝其它 version。 */
export const LAYOUT_VERSION = 1;

/** Payload 在 `process.resourcesPath` 下的目录名。 */
export const PAYLOAD_DIR_NAME = "payload";

/**
 * @typedef {{
 *   version: number;
 *   rendererIndex: string;
 *   engineEntry: string;
 *   bundledRoot: string;
 * }} AppLayoutV1
 */

/** @type {AppLayoutV1} */
export const LAYOUT_V1 = {
  version: LAYOUT_VERSION,
  rendererIndex: "renderer/index.html",
  engineEntry: "engine/entry.js",
  bundledRoot: "bundled",
};

/** 写入 `payload/layout.json` 的对象（浅拷贝）。 */
export function layoutJson() {
  return { ...LAYOUT_V1 };
}
