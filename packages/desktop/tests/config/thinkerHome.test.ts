/**
 * dataDir 路径解析：空配置回落默认根；自定义根时与引导 settings 分离。
 */
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";
import {
  bootstrapSettingsPath,
  describeDataDirPaths,
} from "../../src/config/settingsStore";
import {
  defaultDataDir,
  resolveDataDir,
} from "../../src/config/thinkerHome";

describe("resolveDataDir", () => {
  it("空串回落默认 ~/.thinker", () => {
    assert.equal(resolveDataDir(""), defaultDataDir());
    assert.equal(resolveDataDir("   "), defaultDataDir());
  });

  it("展开 ~ 为用户主目录", () => {
    assert.equal(resolveDataDir("~"), os.homedir());
    assert.equal(
      resolveDataDir(path.join("~", ".thinker-custom")),
      path.join(os.homedir(), ".thinker-custom"),
    );
  });

  it("绝对路径原样规范化", () => {
    const abs = path.resolve(os.tmpdir(), "tw-data-root");
    assert.equal(resolveDataDir(abs), abs);
  });
});

describe("describeDataDirPaths", () => {
  it("默认根时权威 settings 与引导同一文件", () => {
    const paths = describeDataDirPaths("");
    assert.equal(paths.dataDir, defaultDataDir());
    assert.equal(paths.settingsPath, bootstrapSettingsPath());
    assert.equal(paths.bootstrapSettingsPath, bootstrapSettingsPath());
    assert.equal(paths.sameAsBootstrap, true);
  });

  it("自定义根时权威 settings 在新目录，引导仍固定", () => {
    const custom = path.resolve(os.tmpdir(), "tw-custom-root");
    const paths = describeDataDirPaths(custom);
    assert.equal(paths.dataDir, custom);
    assert.equal(paths.settingsPath, path.join(custom, "settings.json"));
    assert.equal(paths.bootstrapSettingsPath, bootstrapSettingsPath());
    assert.equal(paths.sameAsBootstrap, false);
  });
});
