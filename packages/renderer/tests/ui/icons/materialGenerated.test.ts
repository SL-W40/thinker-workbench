/**
 * 生成数据自洽性（packages/renderer/src/ui/icons/material/generated）。
 * 上游换版本后重新跑 `pnpm icons:gen`，这份测试能挡住「表里有 id、bodies 里没节点」的漏生成，
 * 以及 codegen 解析器产出结构不合法的节点（渲染时会静默变成空图标）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  MATERIAL_ICON_ELEMENTS,
  MATERIAL_ICON_VIEWBOX_DEFAULT,
  MATERIAL_ICON_VIEWBOXES,
  MATERIAL_SOURCE_VERSION,
} from "../../../src/ui/icons/material/generated/bodies";
import {
  MATERIAL_FILE_DEFAULT,
  MATERIAL_FILE_EXTENSIONS,
  MATERIAL_FILE_NAMES,
  MATERIAL_FOLDER,
  MATERIAL_FOLDER_NAMES,
  MATERIAL_FOLDER_OPEN,
  MATERIAL_KIND_FALLBACK,
  MATERIAL_LIGHT_FILE_EXTENSIONS,
  MATERIAL_LIGHT_FILE_NAMES,
  MATERIAL_LIGHT_FOLDER_NAMES,
} from "../../../src/ui/icons/material/generated/tables";
import type { IconNode } from "../../../src/ui/icons/material/iconNode";

/** 全部映射表：表名 -> 表，下面的用例遍历它们做一致性校验。 */
const TABLES: Array<[string, Record<string, string>]> = [
  ["MATERIAL_FILE_NAMES", MATERIAL_FILE_NAMES],
  ["MATERIAL_FILE_EXTENSIONS", MATERIAL_FILE_EXTENSIONS],
  ["MATERIAL_FOLDER_NAMES", MATERIAL_FOLDER_NAMES],
  ["MATERIAL_LIGHT_FILE_NAMES", MATERIAL_LIGHT_FILE_NAMES],
  ["MATERIAL_LIGHT_FILE_EXTENSIONS", MATERIAL_LIGHT_FILE_EXTENSIONS],
  ["MATERIAL_LIGHT_FOLDER_NAMES", MATERIAL_LIGHT_FOLDER_NAMES],
  ["MATERIAL_KIND_FALLBACK", MATERIAL_KIND_FALLBACK],
];

describe("material 生成数据", () => {
  it("记录了上游版本号，便于回溯数据来源", () => {
    assert.match(MATERIAL_SOURCE_VERSION, /^\d+\.\d+\.\d+/);
  });

  it("三张主表都不是空的（上游清单结构变了会在这里先炸）", () => {
    assert.ok(Object.keys(MATERIAL_FILE_NAMES).length > 500);
    assert.ok(Object.keys(MATERIAL_FILE_EXTENSIONS).length > 500);
    assert.ok(Object.keys(MATERIAL_FOLDER_NAMES).length > 100);
    assert.ok(Object.keys(MATERIAL_ICON_ELEMENTS).length > 500);
  });

  it("所有表里的图标 id 都有对应的节点树", () => {
    for (const [tableName, table] of TABLES) {
      for (const [key, id] of Object.entries(table)) {
        assert.ok(MATERIAL_ICON_ELEMENTS[id], `${tableName} 的 ${key} 指向了没有节点的图标 ${id}`);
      }
    }
    assert.ok(MATERIAL_ICON_ELEMENTS[MATERIAL_FILE_DEFAULT]);
    assert.ok(MATERIAL_ICON_ELEMENTS[MATERIAL_FOLDER]);
    assert.ok(MATERIAL_ICON_ELEMENTS[MATERIAL_FOLDER_OPEN]);
  });

  it("节点结构合法：标签名可渲染、属性成对、子节点非空", () => {
    for (const [id, nodes] of Object.entries(MATERIAL_ICON_ELEMENTS)) {
      assert.ok(nodes.length > 0, `${id} 没有任何节点`);
      const walk = (node: IconNode, path: string) => {
        const [tag, attrs, children] = node;
        assert.match(tag, /^[a-zA-Z][-\w:.]*$/, `${id} 的 ${path} 标签名非法：${tag}`);
        // 外层 svg 壳必须已被剥掉：片段里不该再出现 svg 之外的壳标签
        assert.notEqual(tag.toLowerCase(), "!doctype", `${id} 残留了 DOCTYPE`);
        if (attrs) {
          assert.equal(attrs.length % 2, 0, `${id} 的 ${path} 属性不是成对的`);
          for (let i = 0; i < attrs.length; i += 2) {
            assert.ok(attrs[i].length > 0, `${id} 的 ${path} 有空属性名`);
          }
        }
        if (children) {
          assert.ok(
            children.length > 0,
            `${id} 的 ${path} children 是空数组，序列化会多输出一对空标签`,
          );
          children.forEach((child, i) => {
            walk(child, `${path}>${tag}[${i}]`);
          });
        }
      };
      nodes.forEach((node, i) => {
        walk(node, `#${i}`);
      });
    }
  });

  it("viewBox 覆盖表里的 id 也都存在，且默认值本身合法", () => {
    assert.match(MATERIAL_ICON_VIEWBOX_DEFAULT, /^[\d.\s-]+$/);
    for (const id of Object.keys(MATERIAL_ICON_VIEWBOXES)) {
      assert.ok(MATERIAL_ICON_ELEMENTS[id], `viewBox 覆盖表里的 ${id} 没有对应节点`);
    }
  });

  it("每个特殊文件夹图标都有配套的展开态图标", () => {
    for (const [name, id] of Object.entries(MATERIAL_FOLDER_NAMES)) {
      assert.ok(MATERIAL_ICON_ELEMENTS[`${id}-open`], `文件夹 ${name}（${id}）缺少展开态图标`);
    }
  });
});
