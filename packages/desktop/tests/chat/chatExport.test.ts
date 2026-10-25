/**
 * 会话导出 / 导入的纯逻辑：Markdown 渲染、JSON 载荷、版本校验与文件名安全化。
 *
 * 涉及库读写与系统对话框的部分由环境集成验证，这里锁住可 deterministic 的部分。
 */
import assert from "node:assert/strict";
import { CHAT_EXPORT_VERSION, type ChatMessage } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import {
  buildExportPayload,
  renderSessionMarkdown,
  safeFileName,
  validateImportPayload,
} from "../../src/chat/chatExport";

function msg(role: string, text: string): ChatMessage {
  return { id: `m${Math.random()}`, role: role as ChatMessage["role"], text, createdAt: 1000 };
}

describe("renderSessionMarkdown", () => {
  it("包含标题、导出时间与角色小标题", () => {
    const md = renderSessionMarkdown("我的会话", [msg("user", "你好"), msg("assistant", "在的")]);
    assert.ok(md.includes("# 我的会话"));
    assert.ok(md.includes("User"));
    assert.ok(md.includes("Assistant"));
    assert.ok(md.includes("你好"));
  });

  it("未知角色退化为角色名本身", () => {
    const md = renderSessionMarkdown("t", [msg("tool", "x")]);
    assert.ok(md.includes("### tool") || md.includes("🔧"));
  });

  it("导出时把常见密钥整段打码", () => {
    const md = renderSessionMarkdown("t", [msg("user", "key is sk-abcdef123456")]);
    assert.ok(md.includes("[redacted]"));
    assert.ok(!md.includes("sk-abcdef123456"));
  });
});

describe("buildExportPayload", () => {
  it("带版本号与消息条目", () => {
    const payload = buildExportPayload(
      { id: "s1", threadId: "t1", title: "标题", workspaceId: "w1" },
      [msg("user", "hi")],
    );
    assert.equal(payload.version, CHAT_EXPORT_VERSION);
    assert.equal(payload.messages.length, 1);
    assert.equal(payload.messages[0]?.role, "user");
    assert.equal(payload.session.id, "s1");
  });
});

describe("safeFileName", () => {
  it("Windows 非法字符被替换", () => {
    assert.equal(safeFileName('a/b:c*d?e"f<g>h|i', "md"), "a_b_c_d_e_f_g_h_i.md");
  });

  it("空标题回退到 chat", () => {
    assert.equal(safeFileName("   ", "json"), "chat.json");
  });

  it("超长标题被截断到 80 字符", () => {
    const name = safeFileName("x".repeat(200), "md");
    assert.ok(name.length <= 84);
  });
});

describe("validateImportPayload", () => {
  const payload = {
    version: CHAT_EXPORT_VERSION,
    exportedAt: 1,
    session: { id: "s1", threadId: "t1", title: "t", workspaceId: "w1" },
    messages: [{ role: "user", text: "hi", createdAt: 1 }],
  };

  it("合法载荷通过", () => {
    const res = validateImportPayload(JSON.stringify(payload));
    assert.equal(res.ok, true);
    assert.equal(res.payload?.session.id, "s1");
  });

  it("非 JSON 直接拒", () => {
    const res = validateImportPayload("not json");
    assert.equal(res.ok, false);
    assert.match(res.error ?? "", /JSON/);
  });

  it("版本不认识一律拒绝（不做兼容猜测）", () => {
    const res = validateImportPayload(JSON.stringify({ ...payload, version: 999 }));
    assert.equal(res.ok, false);
    assert.match(res.error ?? "", /版本|version/);
  });

  it("缺少 messages 被拒", () => {
    const res = validateImportPayload(JSON.stringify({ ...payload, messages: undefined }));
    assert.equal(res.ok, false);
  });

  it("空对象被拒", () => {
    assert.equal(validateImportPayload("{}").ok, false);
    assert.equal(validateImportPayload("null").ok, false);
  });
});
