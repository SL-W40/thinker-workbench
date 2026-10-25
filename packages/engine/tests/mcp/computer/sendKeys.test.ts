/**
 * 内置 Computer MCP：键串翻译与 SendKeys 转义（纯函数）。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { escapeSendKeysText, toSendKeys } from "../../../src/mcp/computer/sendKeys";

describe("toSendKeys", () => {
  it("单字符直接发送", () => {
    assert.equal(toSendKeys("a"), "a");
    assert.equal(toSendKeys("A"), "a");
  });

  it("命名键映射", () => {
    assert.equal(toSendKeys("enter"), "{ENTER}");
    assert.equal(toSendKeys("return"), "{ENTER}");
    assert.equal(toSendKeys("tab"), "{TAB}");
    assert.equal(toSendKeys("escape"), "{ESC}");
    assert.equal(toSendKeys("space"), " ");
    assert.equal(toSendKeys("up"), "{UP}");
    assert.equal(toSendKeys("f5"), "{F5}");
    assert.equal(toSendKeys("f12"), "{F12}");
  });

  it("修饰键组合", () => {
    assert.equal(toSendKeys("ctrl+c"), "^c");
    assert.equal(toSendKeys("ctrl+shift+esc"), "^+{ESC}");
    assert.equal(toSendKeys("alt+tab"), "%{TAB}");
    assert.equal(toSendKeys("shift+tab"), "+{TAB}");
    assert.equal(toSendKeys("ctrl+alt+delete"), "^%{DEL}");
  });

  it("win 键无法表达返回 null", () => {
    assert.equal(toSendKeys("win+d"), null);
    assert.equal(toSendKeys("cmd+r"), null);
  });

  it("空串 / 纯修饰键 / 未知键返回 null", () => {
    assert.equal(toSendKeys(""), null);
    assert.equal(toSendKeys("   "), null);
    assert.equal(toSendKeys("ctrl"), null);
    assert.equal(toSendKeys("ctrl+shift"), null);
    assert.equal(toSendKeys("f42"), null);
    assert.equal(toSendKeys("hyperkey"), null);
  });
});

describe("escapeSendKeysText", () => {
  it("特殊字符包花括号按字面发送", () => {
    assert.equal(escapeSendKeysText("a+b"), "a{+}b");
    assert.equal(escapeSendKeysText("100%"), "100{%}");
    assert.equal(escapeSendKeysText("(x)"), "{(}x{)}");
    assert.equal(escapeSendKeysText("{k}"), "{{}k{}}");
    assert.equal(escapeSendKeysText("a^b~c"), "a{^}b{~}c");
    assert.equal(escapeSendKeysText("[1]"), "{[}1{]}");
  });

  it("普通文本原样", () => {
    assert.equal(escapeSendKeysText("hello 世界 123"), "hello 世界 123");
  });
});
