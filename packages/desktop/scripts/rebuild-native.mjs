/**
 * 重建 Electron native 模块（better-sqlite3 + node-pty）。
 * Windows 上通过 ForceImportBeforeCppTargets 关闭 Spectre，避免 MSB8040。
 * macOS：必须在本机对当前 Electron ABI 重建；勿从 Windows 拷贝 node_modules。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const props = path.join(__dirname, "disable-spectre.props");
const env = { ...process.env };
if (process.platform === "win32") {
  env.ForceImportBeforeCppTargets = props;
}

/** @returns {string | null} */
function readElectronVersion() {
  try {
    const pkgPath = path.join(root, "node_modules", "electron", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return typeof pkg.version === "string" ? pkg.version : null;
  } catch {
    return null;
  }
}

const electronVersion = readElectronVersion();
const arch = process.arch;
const platform = process.platform;

console.log(
  `[rebuild-native] platform=${platform} arch=${arch}` +
    (electronVersion ? ` electron=${electronVersion}` : " electron=(missing)"),
);

if (platform === "darwin" && arch === "arm64") {
  console.log(
    "[rebuild-native] Apple Silicon：请确保未从 x64/Windows 机器拷贝 node_modules；" +
      "NODE_MODULE_VERSION 不匹配时重新执行本脚本。",
  );
}

if (!electronVersion) {
  console.error(
    "[rebuild-native] 未找到 electron 包。请先在仓库根目录执行 pnpm i，再跑 rebuild:native。",
  );
  process.exit(1);
}

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "electron-rebuild",
    "-f",
    "-w",
    "better-sqlite3",
    "-w",
    "node-pty",
    "--build-from-source",
  ],
  { stdio: "inherit", env, shell: true, cwd: path.join(root, "packages", "desktop") },
);

if ((result.status ?? 1) !== 0) {
  console.error(
    "[rebuild-native] 失败。若报 NODE_MODULE_VERSION 不符：删除 packages/desktop/node_modules 与根 node_modules 后 pnpm i，" +
      "再 pnpm --filter @thinker-workbench/desktop run rebuild:native。",
  );
}

process.exit(result.status ?? 1);
