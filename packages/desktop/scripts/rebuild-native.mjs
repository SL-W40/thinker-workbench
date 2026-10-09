/**
 * 重建 Electron native 模块（better-sqlite3 + node-pty）。
 * Windows 上通过 ForceImportBeforeCppTargets 关闭 Spectre，避免 MSB8040。
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const props = path.join(__dirname, "disable-spectre.props");
const env = { ...process.env };
if (process.platform === "win32") {
  env.ForceImportBeforeCppTargets = props;
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
  { stdio: "inherit", env, shell: true },
);

process.exit(result.status ?? 1);
