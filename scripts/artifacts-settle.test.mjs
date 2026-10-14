/**
 * artifacts-settle 单测（node:test，不依赖 vitest 配置）。
 * 运行：node --test scripts/artifacts-settle.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { artifactMtimeKey, waitForArtifactsSettle } from "./artifacts-settle.mjs";

describe("artifactMtimeKey", () => {
  it("缺失文件记为 -1", () => {
    assert.equal(artifactMtimeKey(["/no/such/file-a", "/no/such/file-b"]), "-1,-1");
  });
});

describe("waitForArtifactsSettle", () => {
  it("mtime 连续安静 quietMs 后 resolve", async () => {
    let t = 0;
    let key = "1,1,1";
    await waitForArtifactsSettle({
      files: ["a", "b", "c"],
      quietMs: 100,
      pollMs: 20,
      timeoutMs: 1000,
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
      keyOf: () => key,
    });
    assert.ok(t >= 100);
  });

  it("中途变化会重新计时", async () => {
    let t = 0;
    let polls = 0;
    let key = "1,1,1";
    const p = waitForArtifactsSettle({
      files: ["a"],
      quietMs: 100,
      pollMs: 50,
      timeoutMs: 5000,
      now: () => t,
      sleep: async (ms) => {
        t += ms;
        polls += 1;
        // 第二次轮询时改 key，迫使重新安静
        if (polls === 2) key = "2,2,2";
      },
      keyOf: () => key,
    });
    await p;
    // 至少经历一次变化后的第二段安静
    assert.ok(t >= 150);
  });

  it("超时抛错", async () => {
    let t = 0;
    await assert.rejects(
      () =>
        waitForArtifactsSettle({
          files: ["a"],
          quietMs: 500,
          pollMs: 100,
          timeoutMs: 250,
          now: () => t,
          sleep: async (ms) => {
            t += ms;
          },
          keyOf: () => "-1",
        }),
      /did not settle/,
    );
  });
});
