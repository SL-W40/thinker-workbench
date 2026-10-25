/**
 * 打包配置契约：默认不出发布产物，发布走独立的 release 配置。
 *
 * 这两条断言保护的是流水线行为：
 * - 没有 GH_TOKEN 的 CI 必须还能出本地安装包（故基础配置 `publish: null`）；
 * - 发布配置必须指向 GitHub Releases 且开启 Auto-update 元数据（latest.yml）。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "vitest";

const PACKAGING_DIR = path.resolve(__dirname, "..", "..", "packaging");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const BASE_CONFIG = path.join(PACKAGING_DIR, "electron-builder.yml");
const RELEASE_CONFIG = path.join(PACKAGING_DIR, "electron-builder.release.yml");

/** 读取 YAML 文本（不引解析器，只做关键字段断言，避免新增依赖）。 */
function readYaml(file: string): string {
  return fs.readFileSync(file, "utf8");
}

describe("packaging 配置", () => {
  it("基础配置不发布（publish: null），保证无 GH_TOKEN 的 CI 也能出包", () => {
    const text = readYaml(BASE_CONFIG);
    assert.ok(/^publish:\s*null\s*$/m.test(text), "基础配置应为 publish: null");
    assert.ok(!text.includes("provider: github"), "基础配置不应指向 GitHub Releases");
  });

  it("基础配置保留 winCodeSign 与 asarUnpack 的关键项", () => {
    const text = readYaml(BASE_CONFIG);
    assert.ok(text.includes("asarUnpack"), "必须解包原生模块");
    assert.ok(text.includes("better-sqlite3"), "sqlite 原生模块需解包");
    assert.ok(text.includes("win:"), "需要 Windows 打包目标");
  });

  it("发布配置继承基础配置并指向 GitHub Releases", () => {
    const text = readYaml(RELEASE_CONFIG);
    assert.ok(/^extends:\s*\.\/electron-builder\.yml\s*$/m.test(text), "发布配置应继承基础配置");
    assert.ok(text.includes("provider: github"), "发布目标应为 GitHub");
    assert.ok(text.includes("publishAutoUpdate: true"), "必须产出 Auto-update 元数据");
  });

  it("根 package.json 提供 release 打包脚本", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    assert.ok(pkg.scripts?.["pack:desktop:release"], "缺少 pack:desktop:release 脚本");
    assert.ok(pkg.scripts?.["pack:desktop:release:win"], "缺少 Windows 发布脚本");
    assert.ok(pkg.scripts?.["pack:desktop:release:mac"], "缺少 macOS 发布脚本");
  });
});
