/**
 * App Bundle Layout：解析、版本校验、payload / monorepo 路径拼装。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "vitest";
import {
  appPathsFromPayloadRoot,
  DEFAULT_LAYOUT,
  LAYOUT_VERSION,
  monorepoAppPaths,
  parseAppLayout,
  readAppLayoutFile,
} from "../../src/packaging/appLayout";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function mkTemp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tw-layout-"));
  tempDirs.push(dir);
  return dir;
}

describe("parseAppLayout", () => {
  it("accepts LAYOUT_V1 shaped objects", () => {
    const layout = parseAppLayout({ ...DEFAULT_LAYOUT });
    assert.equal(layout.version, LAYOUT_VERSION);
    assert.equal(layout.rendererIndex, "renderer/index.html");
    assert.equal(layout.engineEntry, "engine/entry.js");
    assert.equal(layout.bundledRoot, "bundled");
  });

  it("rejects unsupported version", () => {
    assert.throws(
      () => parseAppLayout({ ...DEFAULT_LAYOUT, version: 99 }),
      /Unsupported app layout version/,
    );
  });

  it("rejects missing fields", () => {
    assert.throws(() => parseAppLayout({ version: 1 }), /rendererIndex/);
  });
});

describe("appPathsFromPayloadRoot", () => {
  it("joins layout relatives under the payload root", () => {
    const root = path.join(mkTemp(), "payload");
    const paths = appPathsFromPayloadRoot(root, DEFAULT_LAYOUT, [path.join(root, "..", "shell")]);
    assert.equal(paths.rendererIndexHtml, path.join(root, "renderer", "index.html"));
    assert.equal(paths.engineEntry, path.join(root, "engine", "entry.js"));
    assert.equal(paths.bundledRoot, path.join(root, "bundled"));
    assert.deepEqual(paths.iconSearchRoots, [
      path.join(root, "bundled", "icons"),
      path.join(root, "..", "shell"),
    ]);
  });
});

describe("monorepoAppPaths", () => {
  it("points at package artifacts directories", () => {
    const packagesRoot = path.join(mkTemp(), "packages");
    const desktopArtifacts = path.join(packagesRoot, "desktop", "artifacts");
    const paths = monorepoAppPaths(desktopArtifacts, packagesRoot);
    assert.equal(
      paths.rendererIndexHtml,
      path.join(packagesRoot, "renderer", "artifacts", "index.html"),
    );
    assert.equal(paths.engineEntry, path.join(packagesRoot, "engine", "artifacts", "entry.js"));
    assert.equal(paths.bundledRoot, desktopArtifacts);
    assert.ok(paths.iconSearchRoots.includes(desktopArtifacts));
  });
});

describe("readAppLayoutFile", () => {
  it("loads layout.json from disk", () => {
    const dir = mkTemp();
    const file = path.join(dir, "layout.json");
    fs.writeFileSync(file, JSON.stringify(DEFAULT_LAYOUT), "utf8");
    const layout = readAppLayoutFile(file);
    assert.equal(layout.version, LAYOUT_VERSION);
  });
});
