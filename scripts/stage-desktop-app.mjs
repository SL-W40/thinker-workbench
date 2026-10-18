/**
 * 按 App Bundle Layout v1 组装 electron-builder 暂存目录：
 *   packages/desktop/.stage/app      → Shell（main/preload/原生模块）
 *   packages/desktop/.stage/payload  → Payload（renderer/engine/bundled + layout.json）
 *
 * 用法（仓库根）：node scripts/stage-desktop-app.mjs
 * 须先 `pnpm build`，且 desktop 已 rebuild:native。
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LAYOUT_V1, layoutJson, PAYLOAD_DIR_NAME } from "../packages/desktop/packaging/layout.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const desktopDir = path.join(root, "packages", "desktop");
const stageDir = path.join(desktopDir, ".stage");
const appDir = path.join(stageDir, "app");
const payloadDir = path.join(stageDir, PAYLOAD_DIR_NAME);

const require = createRequire(import.meta.url);

/** @param {string} msg */
function fail(msg) {
  console.error(`[stage-desktop-app] ${msg}`);
  process.exit(1);
}

/** @param {string} file */
function requireFile(file, label) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    fail(`缺少 ${label}: ${file}（请先 pnpm build）`);
  }
}

/** 递归复制（跟随 symlink 拷实体）。 */
function copyTree(src, dest) {
  const st = fs.lstatSync(src);
  if (st.isSymbolicLink()) {
    const real = fs.realpathSync(src);
    copyTree(real, dest);
    return;
  }
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      if (name === "." || name === "..") continue;
      copyTree(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  if (st.isFile()) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

/**
 * 解析包名到真实安装路径（兼容 pnpm），再整包拷到 destNodeModules（递归传递依赖）。
 * @param {string} pkgName
 * @param {string} destNodeModules
 * @param {{ resolveFrom?: string[]; seen?: Set<string>; required?: boolean }} [opts]
 */
function copyPackageTree(pkgName, destNodeModules, opts = {}) {
  const resolveFrom = opts.resolveFrom ?? [desktopDir, root];
  const seen = opts.seen ?? new Set();
  const required = opts.required ?? false;
  if (seen.has(pkgName) || pkgName.startsWith("@types/")) return;
  seen.add(pkgName);

  let resolved;
  try {
    resolved = require.resolve(`${pkgName}/package.json`, { paths: resolveFrom });
  } catch {
    if (required) {
      fail(`无法解析依赖 ${pkgName}；请在 packages/desktop 下确认已安装并 rebuild:native`);
    }
    console.warn(`[stage-desktop-app] skip missing dep ${pkgName}`);
    return;
  }
  const pkgRoot = path.dirname(resolved);
  const dest = path.join(destNodeModules, ...pkgName.split("/"));
  if (!fs.existsSync(dest)) {
    console.log(`[stage-desktop-app] copy ${pkgName} ← ${pkgRoot}`);
    copyTree(pkgRoot, dest);
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(dest, "package.json"), "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.optionalDependencies };
  for (const dep of Object.keys(deps ?? {})) {
    copyPackageTree(dep, destNodeModules, {
      resolveFrom: [pkgRoot, desktopDir, root],
      seen,
      required: false,
    });
  }
}

function main() {
  const desktopArtifacts = path.join(desktopDir, "artifacts");
  const mainJs = path.join(desktopArtifacts, "main.js");
  const preloadJs = path.join(desktopArtifacts, "preload.js");
  const rendererIndex = path.join(root, "packages", "renderer", "artifacts", "index.html");
  const engineEntry = path.join(root, "packages", "engine", "artifacts", "entry.js");

  requireFile(mainJs, "desktop main.js");
  requireFile(preloadJs, "desktop preload.js");
  requireFile(rendererIndex, "renderer index.html");
  requireFile(engineEntry, "engine entry.js");

  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(appDir, { recursive: true });
  fs.mkdirSync(payloadDir, { recursive: true });

  // —— Shell ——
  fs.copyFileSync(mainJs, path.join(appDir, "main.js"));
  fs.copyFileSync(preloadJs, path.join(appDir, "preload.js"));

  const rootPkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const desktopPkg = JSON.parse(fs.readFileSync(path.join(desktopDir, "package.json"), "utf8"));
  const stagePkg = {
    name: "thinker-workbench",
    version: rootPkg.version ?? desktopPkg.version ?? "0.1.0",
    productName: rootPkg.productName ?? "Thinker Workbench",
    description: rootPkg.description ?? "",
    author: rootPkg.author ?? "",
    license: rootPkg.license ?? "Apache-2.0",
    private: true,
    main: "main.js",
    dependencies: {
      "better-sqlite3": desktopPkg.dependencies["better-sqlite3"],
      "node-pty": desktopPkg.dependencies["node-pty"],
    },
  };
  fs.writeFileSync(path.join(appDir, "package.json"), `${JSON.stringify(stagePkg, null, 2)}\n`);

  // Shell 侧图标（窗口早期可用；含 win/mac 分平台目录）
  for (const name of ["logo-glyph.png", "logo-glyph.ico"]) {
    const from = path.join(desktopArtifacts, name);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(appDir, name));
  }
  for (const platform of ["win", "mac"]) {
    const from = path.join(desktopArtifacts, platform);
    if (fs.existsSync(from)) copyTree(from, path.join(appDir, platform));
  }

  const nm = path.join(appDir, "node_modules");
  fs.mkdirSync(nm, { recursive: true });
  const seen = new Set();
  copyPackageTree("better-sqlite3", nm, { required: true, seen });
  copyPackageTree("node-pty", nm, { required: true, seen });

  // —— Payload ——
  const rendererSrc = path.join(root, "packages", "renderer", "artifacts");
  const rendererDest = path.join(payloadDir, "renderer");
  copyTree(rendererSrc, rendererDest);

  const engineDestDir = path.join(payloadDir, "engine");
  fs.mkdirSync(engineDestDir, { recursive: true });
  fs.copyFileSync(engineEntry, path.join(engineDestDir, "entry.js"));

  // engine entry 外置 better-sqlite3（esbuild --external），payload 内须自带可解析副本
  const payloadNm = path.join(payloadDir, "node_modules");
  fs.mkdirSync(payloadNm, { recursive: true });
  copyPackageTree("better-sqlite3", payloadNm, { required: true, seen: new Set() });

  const bundledRoot = path.join(payloadDir, LAYOUT_V1.bundledRoot);
  fs.mkdirSync(bundledRoot, { recursive: true });

  for (const folder of ["skills", "rules", "agents", "mcps"]) {
    const fromArtifacts = path.join(desktopArtifacts, folder);
    const fromResources = path.join(desktopDir, "resources", folder);
    const from = fs.existsSync(fromArtifacts) ? fromArtifacts : fromResources;
    if (!fs.existsSync(from)) continue;
    copyTree(from, path.join(bundledRoot, folder));
  }

  const iconsDest = path.join(bundledRoot, "icons");
  fs.mkdirSync(iconsDest, { recursive: true });
  for (const name of ["logo-glyph.png", "logo-glyph.ico"]) {
    const from = path.join(desktopArtifacts, name);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(iconsDest, name));
  }
  for (const platform of ["win", "mac"]) {
    const from = path.join(desktopArtifacts, platform);
    if (fs.existsSync(from)) copyTree(from, path.join(iconsDest, platform));
  }

  const layoutPath = path.join(payloadDir, "layout.json");
  fs.writeFileSync(layoutPath, `${JSON.stringify(layoutJson(), null, 2)}\n`);

  // 校验
  requireFile(path.join(payloadDir, LAYOUT_V1.rendererIndex), "payload renderer index");
  requireFile(path.join(payloadDir, LAYOUT_V1.engineEntry), "payload engine entry");
  requireFile(layoutPath, "payload layout.json");
  requireFile(path.join(payloadNm, "better-sqlite3", "package.json"), "payload better-sqlite3");
  requireFile(path.join(appDir, "main.js"), "stage app main.js");
  requireFile(path.join(nm, "better-sqlite3", "package.json"), "staged better-sqlite3");
  requireFile(path.join(nm, "node-pty", "package.json"), "staged node-pty");

  console.log(`[stage-desktop-app] ok → ${stageDir}`);
}

main();
