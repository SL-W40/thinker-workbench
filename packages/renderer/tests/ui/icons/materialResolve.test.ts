/**
 * 文件 / 文件夹图标 id 解析（icons/material/resolve.ts）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  MATERIAL_FILE_DEFAULT,
  MATERIAL_FILE_NAMES,
  MATERIAL_FOLDER,
  MATERIAL_FOLDER_OPEN,
} from "../../../src/ui/icons/material/generated/tables";
import { resolveFileIconId, resolveFolderIconId } from "../../../src/ui/icons/material/resolve";

describe("resolveFileIconId", () => {
  it("整文件名优先于扩展名", () => {
    assert.equal(resolveFileIconId("package.json", "dark"), "nodejs");
    assert.equal(resolveFileIconId("readme.md", "dark"), "readme");
    assert.equal(resolveFileIconId(".gitignore", "dark"), "git");
    assert.equal(resolveFileIconId(".env.production", "dark"), "tune");
    // 整名表只认最后一段，路径前缀不影响命中
    assert.equal(
      resolveFileIconId("apps/web/package.json", "dark"),
      MATERIAL_FILE_NAMES["package.json"],
    );
  });

  it("归一化路径分隔符与大小写", () => {
    assert.equal(resolveFileIconId("src\\util\\a.ts", "dark"), resolveFileIconId("a.ts", "dark"));
    assert.equal(resolveFileIconId("A.TS", "dark"), resolveFileIconId("a.ts", "dark"));
  });

  it("扩展名从右最长匹配，覆盖复合扩展", () => {
    assert.equal(resolveFileIconId("a.ts", "dark"), "typescript");
    assert.equal(resolveFileIconId("types.d.ts", "dark"), "typescript-def");
    assert.equal(resolveFileIconId("bundle.js.map", "dark"), "javascript-map");
  });

  it("清单没覆盖的规则走自有族兜底", () => {
    // min.js 不在 material 清单里，按族落到 javascript
    assert.equal(resolveFileIconId("bundle.min.js", "dark"), "javascript");
    // 私钥是清单里没有的自有规则（material 只认 .key 扩展名，不认 id_rsa 这种无扩展名）
    assert.equal(resolveFileIconId("id_rsa", "dark"), "key");
    assert.equal(resolveFileIconId("server.key", "dark"), "key");
  });

  it("完全没命中时回落到通用文件图标", () => {
    assert.equal(resolveFileIconId("a.unknownxyz", "dark"), MATERIAL_FILE_DEFAULT);
    assert.equal(resolveFileIconId("notes", "dark"), MATERIAL_FILE_DEFAULT);
  });

  it("亮色主题用 _light 变体，暗色主题用默认图标", () => {
    assert.equal(resolveFileIconId("pnpm-lock.yaml", "dark"), "pnpm");
    assert.equal(resolveFileIconId("pnpm-lock.yaml", "light"), "pnpm_light");
  });
});

describe("resolveFolderIconId", () => {
  it("特殊文件夹名命中对应图标，展开态取配套的 -open 图标", () => {
    assert.equal(resolveFolderIconId("src", false, "dark"), "folder-src");
    assert.equal(resolveFolderIconId("src", true, "dark"), "folder-src-open");
    assert.equal(resolveFolderIconId("node_modules", false, "dark"), "folder-node");
  });

  it("折叠掉的装饰别名能反查回来", () => {
    assert.equal(
      resolveFolderIconId("__rust__", false, "dark"),
      resolveFolderIconId("rust", false, "dark"),
    );
    assert.equal(
      resolveFolderIconId(".git", false, "dark"),
      resolveFolderIconId("git", false, "dark"),
    );
  });

  it("未知文件夹名与缺省名字都回落到通用文件夹图标", () => {
    assert.equal(resolveFolderIconId("zzz-unknown-folder", false, "dark"), MATERIAL_FOLDER);
    assert.equal(resolveFolderIconId("zzz-unknown-folder", true, "dark"), MATERIAL_FOLDER_OPEN);
    assert.equal(resolveFolderIconId(undefined, false, "dark"), MATERIAL_FOLDER);
    assert.equal(resolveFolderIconId(undefined, true, "dark"), MATERIAL_FOLDER_OPEN);
  });

  it("路径只取最后一段", () => {
    assert.equal(resolveFolderIconId("apps/web/src", false, "dark"), "folder-src");
    assert.equal(resolveFolderIconId("apps\\web\\src\\", false, "dark"), "folder-src");
  });
});
