/**
 * 重建 Electron native 模块（better-sqlite3 + node-pty）。
 * Windows 上通过 ForceImportBeforeCppTargets 关闭 Spectre，避免 MSB8040。
 * macOS：必须在本机对当前 Electron ABI 重建；勿从 Windows 拷贝 node_modules。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
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

/**
 * `--build-from-source` 只产出 .node，不带 conpty 运行时
 * （conpty.dll + OpenConsole.exe 只在 prebuilds/<platform>-<arch>/conpty 里）。
 * 缺了它们 PTY 只能走非 DLL 模式，而那条路每次 kill() 都会 fork
 * conpty_console_list_agent 去 AttachConsole(shellPid)，失败时子进程直接抛
 * `Error: AttachConsole failed` 崩掉、日志刷屏。把运行时补到 conpty.node 旁边，
 * spawnPty 才能用上 DLL 模式。
 */
function copyConptyRuntime() {
  if (platform !== "win32") return;
  let nodePtyDir;
  try {
    const require = createRequire(import.meta.url);
    // 走符号链接的真实路径，写入 .pnpm 里的实际目录
    nodePtyDir = path.dirname(fs.realpathSync(path.dirname(require.resolve("node-pty"))));
  } catch {
    console.log("[rebuild-native] 未找到 node-pty，跳过 conpty 运行时拷贝。");
    return;
  }

  const from = path.join(nodePtyDir, "prebuilds", `${platform}-${arch}`, "conpty");
  if (!fs.existsSync(from)) return;

  for (const config of ["Release", "Debug"]) {
    const to = path.join(nodePtyDir, "build", config, "conpty");
    // 没有对应 .node 就不必拷（node-pty 不会从这里加载）
    if (!fs.existsSync(path.join(nodePtyDir, "build", config, "conpty.node"))) continue;
    fs.mkdirSync(to, { recursive: true });
    for (const file of fs.readdirSync(from)) {
      fs.copyFileSync(path.join(from, file), path.join(to, file));
    }
    console.log(`[rebuild-native] conpty 运行时已就位: ${path.relative(root, to)}`);
  }
}

copyConptyRuntime();

process.exit(result.status ?? 1);
