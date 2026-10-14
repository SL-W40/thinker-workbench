/**
 * 开发态父进程监视：解析 PID、存活探测、父死后退出。
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import {
  isProcessAlive,
  parseDevParentPid,
  startDevParentWatch,
} from "../../src/window/devParentWatch";

const stops: Array<() => void> = [];

afterEach(() => {
  while (stops.length) stops.pop()?.();
});

describe("parseDevParentPid", () => {
  it("合法正整数", () => {
    assert.equal(parseDevParentPid("12345"), 12345);
  });

  it("空 / 非法 → null", () => {
    assert.equal(parseDevParentPid(undefined), null);
    assert.equal(parseDevParentPid(""), null);
    assert.equal(parseDevParentPid("0"), null);
    assert.equal(parseDevParentPid("-1"), null);
    assert.equal(parseDevParentPid("1.5"), null);
    assert.equal(parseDevParentPid("abc"), null);
  });
});

describe("isProcessAlive", () => {
  it("当前进程存活", () => {
    assert.equal(isProcessAlive(process.pid), true);
  });

  it("极不可能存在的 PID → false", () => {
    assert.equal(isProcessAlive(2_147_483_647), false);
  });
});

describe("startDevParentWatch", () => {
  it("打包态或无环境变量时不轮询", () => {
    let exited = false;
    stops.push(
      startDevParentWatch(
        {},
        {
          isPackaged: true,
          exitApp: () => {
            exited = true;
          },
        },
      ),
    );
    stops.push(
      startDevParentWatch(
        { TW_DEV_PARENT_PID: "" },
        {
          isPackaged: false,
          exitApp: () => {
            exited = true;
          },
        },
      ),
    );
    assert.equal(exited, false);
  });

  it("父进程探测失败则退出应用", async () => {
    let exited = false;
    stops.push(
      startDevParentWatch(
        { TW_DEV_PARENT_PID: "4242" },
        {
          isPackaged: false,
          intervalMs: 20,
          checkAlive: () => false,
          exitApp: () => {
            exited = true;
          },
        },
      ),
    );
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(exited, true);
  });

  it("父进程仍存活则不退出", async () => {
    let exited = false;
    stops.push(
      startDevParentWatch(
        { TW_DEV_PARENT_PID: String(process.pid) },
        {
          isPackaged: false,
          intervalMs: 20,
          checkAlive: () => true,
          exitApp: () => {
            exited = true;
          },
        },
      ),
    );
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(exited, false);
  });
});
