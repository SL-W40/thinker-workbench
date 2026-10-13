/**
 * App Bundle Layout v1 — 与 `packaging/layout.mjs` 保持字段一致。
 * 打包态读 payload/layout.json；开发态用 DEFAULT_LAYOUT 拼 monorepo 路径。
 */
import fs from "node:fs";
import path from "node:path";

/** 与 packaging/layout.mjs 的 LAYOUT_VERSION 同步。 */
export const LAYOUT_VERSION = 1;

/** 安装包内 payload 目录名（相对 process.resourcesPath）。 */
export const PAYLOAD_DIR_NAME = "payload";

/** layout.json / 默认契约字段。 */
export type AppLayoutFile = {
  version: number;
  rendererIndex: string;
  engineEntry: string;
  bundledRoot: string;
};

/** 与 packaging/layout.mjs 的 LAYOUT_V1 同步。 */
export const DEFAULT_LAYOUT: AppLayoutFile = {
  version: LAYOUT_VERSION,
  rendererIndex: "renderer/index.html",
  engineEntry: "engine/entry.js",
  bundledRoot: "bundled",
};

/** 业务侧解析出的绝对路径集合。 */
export type AppPaths = {
  rendererIndexHtml: string;
  engineEntry: string;
  bundledRoot: string;
  iconSearchRoots: string[];
};

/**
 * 解析并校验 layout.json 内容。
 * @throws 版本或字段不合法时抛错
 */
export function parseAppLayout(raw: unknown): AppLayoutFile {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid app layout: expected object");
  }
  const o = raw as Record<string, unknown>;
  const version = o.version;
  if (version !== LAYOUT_VERSION) {
    throw new Error(
      `Unsupported app layout version: ${String(version)} (expected ${LAYOUT_VERSION})`,
    );
  }
  const rendererIndex = asNonEmptyString(o.rendererIndex, "rendererIndex");
  const engineEntry = asNonEmptyString(o.engineEntry, "engineEntry");
  const bundledRoot = asNonEmptyString(o.bundledRoot, "bundledRoot");
  return { version: LAYOUT_VERSION, rendererIndex, engineEntry, bundledRoot };
}

/** 从磁盘读取 payload/layout.json。 */
export function readAppLayoutFile(layoutPath: string): AppLayoutFile {
  const text = fs.readFileSync(layoutPath, "utf8");
  return parseAppLayout(JSON.parse(text) as unknown);
}

/**
 * 由 payload 根 + layout 拼出绝对路径。
 * @param extraIconRoots 额外图标搜索根（如 Shell asar 内图标）
 */
export function appPathsFromPayloadRoot(
  payloadRoot: string,
  layout: AppLayoutFile,
  extraIconRoots: string[] = [],
): AppPaths {
  const bundledRoot = path.join(payloadRoot, layout.bundledRoot);
  const iconSearchRoots = [path.join(bundledRoot, "icons"), ...extraIconRoots];
  return {
    rendererIndexHtml: path.join(payloadRoot, layout.rendererIndex),
    engineEntry: path.join(payloadRoot, layout.engineEntry),
    bundledRoot,
    iconSearchRoots,
  };
}

/**
 * 开发态：不造假 payload，直接指向 monorepo artifacts。
 * @param desktopArtifactsDir `packages/desktop/artifacts`（__dirname）
 * @param packagesRoot `packages/`
 */
export function monorepoAppPaths(desktopArtifactsDir: string, packagesRoot: string): AppPaths {
  const resourcesDir = path.join(desktopArtifactsDir, "..", "resources");
  return {
    rendererIndexHtml: path.join(packagesRoot, "renderer", "artifacts", "index.html"),
    engineEntry: path.join(packagesRoot, "engine", "artifacts", "entry.js"),
    // 内置资源：优先 artifacts（copy-desktop-resources），其次源 resources
    bundledRoot: desktopArtifactsDir,
    iconSearchRoots: [desktopArtifactsDir, resourcesDir],
  };
}

function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid app layout: ${field} must be a non-empty string`);
  }
  return value.trim();
}
