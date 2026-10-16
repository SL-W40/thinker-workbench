/**
 * Trace payload 按偏移读取，删会话时索引一起删。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "vitest";
import { resetSettingsCacheForTests } from "../../src/config/settingsStore";
import { appendPayload, readPayload, removeSessionJsonl } from "../../src/trace/sessionJsonl";
import { closeTraceDb, findPayloadIndex } from "../../src/trace/traceDb";

describe("payload index", () => {
  let tmp: string;
  let prevHome: string | undefined;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tw-payload-"));
    prevHome = process.env.THINKER_HOME;
    process.env.THINKER_HOME = tmp;
    closeTraceDb();
    resetSettingsCacheForTests();
  });

  afterEach(() => {
    closeTraceDb();
    resetSettingsCacheForTests();
    if (prevHome === undefined) delete process.env.THINKER_HOME;
    else process.env.THINKER_HOME = prevHome;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("追加后按 id 读到对应行，删除会话清掉索引", () => {
    const sessionId = "sess-payload";
    const first = appendPayload(sessionId, {
      runId: "sp1",
      side: "in",
      ts: 1,
      bytes: 1,
      truncated: false,
      json: { n: 1 },
    });
    const second = appendPayload(sessionId, {
      runId: "sp2",
      side: "out",
      ts: 2,
      bytes: 1,
      truncated: false,
      json: { n: 2 },
    });
    const loc = findPayloadIndex(sessionId, second);
    assert.ok(loc);
    assert.ok(loc.offset > 0);
    const firstPayload = readPayload(sessionId, first);
    const secondPayload = readPayload(sessionId, second);
    assert.ok(firstPayload);
    assert.ok(secondPayload);
    assert.equal((firstPayload.json as { n: number }).n, 1);
    assert.equal((secondPayload.json as { n: number }).n, 2);
    removeSessionJsonl(sessionId);
    assert.equal(findPayloadIndex(sessionId, first), null);
    assert.equal(readPayload(sessionId, first), null);
  });
});
