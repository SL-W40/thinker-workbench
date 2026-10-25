/**
 * 会话全文检索索引（messagesSearch.ts）：查询构造、片段截取、FTS5 读写与幂等重建。
 */
import assert from "node:assert/strict";
import { DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT } from "@thinker-workbench/shared";
import Database from "better-sqlite3";
import { describe, it } from "vitest";
import {
  buildLikePattern,
  buildMatchQuery,
  buildSnippet,
  clampLimit,
  deleteSessionIndex,
  ensureSearchIndex,
  hasSearchIndex,
  indexSessionMessages,
} from "../../src/db/messagesSearch";
import { probeSqlite } from "./sqliteProbe";

/** 建一个带最小业务表的内存库，模拟 chat.db。 */
function memDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  return db;
}

describe("buildMatchQuery", () => {
  it("空查询返回空串", () => {
    assert.equal(buildMatchQuery(""), "");
    assert.equal(buildMatchQuery("   "), "");
  });

  it("多词转 AND 短语，双引号转义", () => {
    assert.equal(buildMatchQuery("hello"), '"hello"');
    assert.equal(buildMatchQuery("修复   构建"), '"修复" AND "构建"');
    assert.equal(buildMatchQuery('a"b'), '"a""b"');
  });

  it("超过 8 个词的部分被截断，避免超长 MATCH", () => {
    const q = buildMatchQuery("a b c d e f g h i j");
    assert.equal(q.split(" AND ").length, 8);
  });
});

describe("buildLikePattern", () => {
  it("两侧加 % 并转义通配符", () => {
    assert.equal(buildLikePattern("abc"), "%abc%");
    assert.equal(buildLikePattern("50%_\\x"), "%50\\%\\_\\\\x%");
  });
});

describe("buildSnippet", () => {
  it("空正文返回空片段且无命中区间", () => {
    assert.deepEqual(buildSnippet("", "abc"), { snippet: "", match: null });
  });

  it("未命中时返回开头片段", () => {
    const text = "这是一段很长的正文，里面没有关键词";
    const res = buildSnippet(text, "zzz", 20);
    assert.equal(res.match, null);
    assert.ok(res.snippet.length <= 20);
  });

  it("命中时窗口居中且区间指向命中处", () => {
    const text = `${"前".repeat(80)}关键词${"后".repeat(80)}`;
    const res = buildSnippet(text, "关键词", 60);
    assert.ok(res.match, "应定位到命中区间");
    if (res.match) {
      assert.equal(res.snippet.slice(res.match.from, res.match.to), "关键词");
    }
  });

  it("空白压缩成单空格，避免片段里出现换行", () => {
    const res = buildSnippet("a\n\n  b\t c", "b", 20);
    assert.equal(res.snippet, "a b c");
  });

  it("大小写不敏感命中", () => {
    const res = buildSnippet("Hello TypeScript", "TYPESCRIPT", 30);
    assert.ok(res.match);
    if (res.match) {
      assert.equal(res.snippet.slice(res.match.from, res.match.to), "TypeScript");
    }
  });
});

describe("clampLimit", () => {
  it("非法值走默认上限", () => {
    assert.equal(clampLimit(undefined), DEFAULT_SEARCH_LIMIT);
    assert.equal(clampLimit(0), DEFAULT_SEARCH_LIMIT);
    assert.equal(clampLimit(-5), DEFAULT_SEARCH_LIMIT);
    assert.equal(clampLimit(Number.NaN), DEFAULT_SEARCH_LIMIT);
  });

  it("超过硬上限被压到 MAX_SEARCH_LIMIT", () => {
    assert.equal(clampLimit(10_000), MAX_SEARCH_LIMIT);
    assert.equal(clampLimit(12.7), 12);
  });
});

// 需要真 SQLite 的分组：本机连不上原生产物时整体跳过（CI / Electron 环境照常执行）
describe.skipIf(!probeSqlite())("FTS5 索引读写", () => {
  it("建立虚拟表后可判断是否可用", () => {
    const db = memDb();
    assert.equal(hasSearchIndex(db), false);
    assert.equal(ensureSearchIndex(db), true);
    assert.equal(hasSearchIndex(db), true);
    db.close();
  });

  it("写入后可被 trigram MATCH 命中（含中文）", () => {
    const db = memDb();
    ensureSearchIndex(db);
    indexSessionMessages(db, "s1", [
      { seq: 0, role: "user", text: "修复构建失败的问题", createdAt: 100 },
      { seq: 1, role: "assistant", text: "unrelated english reply", createdAt: 200 },
    ]);
    const rows = db
      .prepare(
        "SELECT session_id, seq, role, text FROM chat_messages_fts WHERE chat_messages_fts MATCH ? ORDER BY rank",
      )
      .all(buildMatchQuery("构建失败")) as Array<{ seq: number; text: string }>;
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.seq, 0);
    db.close();
  });

  it("重复写入同一会话是幂等的（不会翻倍）", () => {
    const db = memDb();
    ensureSearchIndex(db);
    const rows = [{ seq: 0, role: "user", text: "重复索引测试文本", createdAt: 1 }];
    indexSessionMessages(db, "s1", rows);
    indexSessionMessages(db, "s1", rows);
    const count = db
      .prepare("SELECT COUNT(*) AS n FROM chat_messages_fts WHERE session_id = ?")
      .get("s1") as { n: number };
    assert.equal(count.n, 1);
    db.close();
  });

  it("空正文不入索引，避免噪声行", () => {
    const db = memDb();
    ensureSearchIndex(db);
    indexSessionMessages(db, "s1", [
      { seq: 0, role: "user", text: "   ", createdAt: 1 },
      { seq: 1, role: "user", text: "有内容的一句话", createdAt: 2 },
    ]);
    const count = db.prepare("SELECT COUNT(*) AS n FROM chat_messages_fts").get() as { n: number };
    assert.equal(count.n, 1);
    db.close();
  });

  it("删除会话索引后查不到（删会话 / 清空工作空间）", () => {
    const db = memDb();
    ensureSearchIndex(db);
    indexSessionMessages(db, "s1", [
      { seq: 0, role: "user", text: "将被清理的会话内容", createdAt: 1 },
    ]);
    indexSessionMessages(db, "s2", [
      { seq: 0, role: "user", text: "保留下来的会话内容", createdAt: 1 },
    ]);
    deleteSessionIndex(db, "s1");
    const left = db.prepare("SELECT DISTINCT session_id FROM chat_messages_fts").all() as Array<{
      session_id: string;
    }>;
    assert.deepEqual(
      left.map((r) => r.session_id),
      ["s2"],
    );
    db.close();
  });

  it("索引不可用时写入不抛错（降级路径）", () => {
    const db = memDb();
    // 不建虚拟表，模拟 FTS5 缺失
    assert.doesNotThrow(() => {
      indexSessionMessages(db, "s1", [{ seq: 0, role: "user", text: "x", createdAt: 1 }]);
      deleteSessionIndex(db, "s1");
    });
    db.close();
  });
});

describe.skipIf(!probeSqlite())("CHAT_SEARCH_SCHEMA_SQL", () => {
  it("多次执行幂等（可在每次开库时重复调用）", () => {
    const db = memDb();
    assert.equal(ensureSearchIndex(db), true);
    assert.equal(ensureSearchIndex(db), true);
    db.close();
  });
});
