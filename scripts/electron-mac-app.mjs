/**
 * macOS 开发态：为 Electron 克隆带产品名与产品图标的 .app。
 * 未打包时系统通知 / 强制退出读的是 Electron.app 的 Info.plist 与 icns，
 * `app.setName()` / `app.dock.setIcon()` 改不到通知横幅左侧图标。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @typedef {{ appName: string, bundleId: string }} ElectronAppIdentity */

/** @type {Record<"product", ElectronAppIdentity>} */
export const MAC_ELECTRON_APPS = {
  product: {
    appName: "Thinker Workbench",
    bundleId: "com.thinker.workbench.dev",
  },
};

function electronDistDir() {
  return path.join(root, "node_modules", "electron", "dist");
}

function stockElectronApp() {
  return path.join(electronDistDir(), "Electron.app");
}

/** @param {string} appName */
export function macAppBundlePath(appName) {
  return path.join(electronDistDir(), `${appName}.app`);
}

/** @param {string} appName */
export function macElectronBinary(appName) {
  return path.join(macAppBundlePath(appName), "Contents", "MacOS", "Electron");
}

/**
 * 解析启动用二进制：macOS 优先具名 .app；其它平台走官方 electron CLI / exe。
 * @param {"product"} [_role]
 * @returns {{ bin: string, shell: boolean }}
 */
export function resolveElectronLaunch(_role = "product") {
  if (process.platform === "darwin") {
    ensureMacElectronApps();
    const { appName } = MAC_ELECTRON_APPS.product;
    const bin = macElectronBinary(appName);
    if (fs.existsSync(bin)) return { bin, shell: false };
  }
  if (process.platform === "win32") {
    const exe = path.join(electronDistDir(), "electron.exe");
    if (fs.existsSync(exe)) return { bin: exe, shell: false };
    return {
      bin: path.join(root, "node_modules", ".bin", "electron.cmd"),
      shell: true,
    };
  }
  return {
    bin: path.join(root, "node_modules", ".bin", "electron"),
    shell: false,
  };
}

/** @param {string} plist @param {string} key @param {string} value */
function plistSetOrAdd(plist, key, value) {
  // 值含空格时必须给 PlistBuddy 命令加引号
  const quoted = `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  try {
    execFileSync("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${quoted}`, plist], {
      stdio: "ignore",
    });
  } catch {
    execFileSync("/usr/libexec/PlistBuddy", ["-c", `Add :${key} string ${quoted}`, plist], {
      stdio: "ignore",
    });
  }
}

/**
 * 从官方 Electron.app 克隆（APFS 下 `cp -c` 几乎零拷贝），并写入 Bundle 显示名。
 * @param {ElectronAppIdentity} identity
 */
function ensureNamedApp(identity) {
  const stock = stockElectronApp();
  const dest = macAppBundlePath(identity.appName);
  const bin = macElectronBinary(identity.appName);
  const plist = path.join(dest, "Contents", "Info.plist");

  if (!fs.existsSync(stock)) {
    console.warn("[electron-mac] Electron.app missing; skip naming. Run pnpm i first.");
    return;
  }

  if (!fs.existsSync(bin)) {
    fs.rmSync(dest, { recursive: true, force: true });
    try {
      // -c：APFS clonefile，省空间；失败则普通递归复制
      execFileSync("cp", ["-cR", stock, dest], { stdio: "ignore" });
    } catch {
      execFileSync("cp", ["-R", stock, dest], { stdio: "inherit" });
    }
  }

  if (!fs.existsSync(plist)) {
    console.warn(`[electron-mac] Info.plist missing for ${identity.appName}`);
    return;
  }

  // 强制退出 / Dock 读这些键；空格无需额外引号（PlistBuddy 按参数传入）
  plistSetOrAdd(plist, "CFBundleName", identity.appName);
  plistSetOrAdd(plist, "CFBundleDisplayName", identity.appName);
  plistSetOrAdd(plist, "CFBundleIdentifier", identity.bundleId);
  applyProductIcon(dest, plist);
}

/** 产品 PNG 路径（与桌面 resources 共用）。 */
function productIconPng() {
  return path.join(root, "packages", "desktop", "resources", "icon.png");
}

/**
 * 把 icon.png 转成 icns，写入克隆 .app 的 CFBundleIconFile。
 * 转换结果缓存在 electron/dist，PNG 更新后才会重跑 sips/iconutil。
 * @param {string} destApp
 * @param {string} plist
 */
function applyProductIcon(destApp, plist) {
  const png = productIconPng();
  if (!fs.existsSync(png)) {
    console.warn("[electron-mac] packages/desktop/resources/icon.png missing; skip bundle icon.");
    return;
  }

  const cacheIcns = path.join(electronDistDir(), "ThinkerWorkbench.icns");
  try {
    if (shouldRebuildIcns(png, cacheIcns)) {
      writeIcnsFromPng(png, cacheIcns);
    }
    // 不用覆盖 electron.icns：克隆包可能与官方 Electron.app 共享 clonefile 块
    const icnsDest = path.join(destApp, "Contents", "Resources", "ThinkerWorkbench.icns");
    fs.copyFileSync(cacheIcns, icnsDest);
    plistSetOrAdd(plist, "CFBundleIconFile", "ThinkerWorkbench.icns");
    // 让 Launch Services 刷新图标缓存（系统通知左侧图标依赖 bundle icns）
    execFileSync("touch", [destApp], { stdio: "ignore" });
  } catch (err) {
    console.warn("[electron-mac] failed to apply product icon:", err instanceof Error ? err.message : err);
  }
}

/** @param {string} png @param {string} icns */
function shouldRebuildIcns(png, icns) {
  if (!fs.existsSync(icns)) return true;
  return fs.statSync(png).mtimeMs > fs.statSync(icns).mtimeMs;
}

/**
 * 用 sips + iconutil 从 PNG 生成 icns。
 * @param {string} pngPath
 * @param {string} icnsPath
 */
function writeIcnsFromPng(pngPath, icnsPath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "thinker-iconset-"));
  const iconset = path.join(tmp, "icon.iconset");
  fs.mkdirSync(iconset);

  /** @type {Array<[number, string]>} */
  const slices = [
    [16, "icon_16x16.png"],
    [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"],
    [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"],
    [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"],
    [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"],
    [1024, "icon_512x512@2x.png"],
  ];

  try {
    for (const [px, name] of slices) {
      execFileSync(
        "sips",
        ["-z", String(px), String(px), pngPath, "--out", path.join(iconset, name)],
        { stdio: "ignore" },
      );
    }
    execFileSync("iconutil", ["-c", "icns", iconset, "-o", icnsPath], { stdio: "inherit" });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** 确保产品具名 .app 就绪。 */
export function ensureMacElectronApps() {
  if (process.platform !== "darwin") return;
  ensureNamedApp(MAC_ELECTRON_APPS.product);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  ensureMacElectronApps();
  if (process.platform === "darwin") {
    console.log("[electron-mac] ready:", MAC_ELECTRON_APPS.product.appName);
  }
}
