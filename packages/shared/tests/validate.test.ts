/**
 * validate：运行时类型守卫（外部 / 持久化数据的第一道防线）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  asArray,
  asBoolean,
  asNumber,
  asRecord,
  asString,
  asStringArray,
  isRecord,
  parseJsonObject,
} from "../src/validate";

describe("isRecord", () => {
  it("仅普通对象为真", () => {
    assert.equal(isRecord({}), true);
    assert.equal(isRecord({ a: 1 }), true);
    assert.equal(isRecord([]), false);
    assert.equal(isRecord(null), false);
    assert.equal(isRecord(undefined), false);
    assert.equal(isRecord(1), false);
    assert.equal(isRecord("x"), false);
  });
});

describe("asString / asNumber / asBoolean / asArray", () => {
  it("按类型取值，否则 undefined", () => {
    assert.equal(asString("a"), "a");
    assert.equal(asString(1), undefined);
    assert.equal(asNumber(3), 3);
    assert.equal(asNumber(Number.NaN), undefined);
    assert.equal(asNumber(Number.POSITIVE_INFINITY), undefined);
    assert.equal(asNumber("3"), undefined);
    assert.equal(asBoolean(true), true);
    assert.equal(asBoolean(0), undefined);
    assert.deepEqual(asArray([1, 2]), [1, 2]);
    assert.equal(asArray({}), undefined);
  });
});

describe("asRecord / asStringArray", () => {
  it("对象字段与字符串数组字段", () => {
    assert.deepEqual(asRecord({ a: 1 }), { a: 1 });
    assert.equal(asRecord([]), undefined);
    assert.deepEqual(asStringArray(["a", "b"]), ["a", "b"]);
    assert.equal(asStringArray(["a", 1]), undefined);
    assert.equal(asStringArray("a"), undefined);
  });
});

describe("parseJsonObject", () => {
  it("对象 JSON 返回记录", () => {
    assert.deepEqual(parseJsonObject('{"a":1}'), { a: 1 });
  });

  it("标量 / 数组 / 非法 JSON 均返回 undefined", () => {
    assert.equal(parseJsonObject("123"), undefined);
    assert.equal(parseJsonObject('"str"'), undefined);
    assert.equal(parseJsonObject("[1,2]"), undefined);
    assert.equal(parseJsonObject("null"), undefined);
    assert.equal(parseJsonObject("{bad"), undefined);
  });
});
