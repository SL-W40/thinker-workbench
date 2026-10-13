/**
 * OSC / plain done 标记：包装、解析、清洗。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  hasDoneMarker,
  looksLikeCommandSettled,
  parseDoneExitCode,
  stripDoneMarkers,
  wrapWithDoneMarker,
} from "../../src/terminal/shellMarkers";

describe("shellMarkers", () => {
  it("parseDoneExitCode 识别 OSC 与 plain", () => {
    assert.equal(parseDoneExitCode("\x1b]666;done;0\x07"), 0);
    assert.equal(parseDoneExitCode("out\n__TW_DONE__42\n"), 42);
    assert.equal(parseDoneExitCode("no marker"), null);
  });

  it("stripDoneMarkers 去掉标记", () => {
    const raw = "hello\x1b]666;done;0\x07world";
    assert.equal(stripDoneMarkers(raw), "helloworld");
    assert.ok(!hasDoneMarker(stripDoneMarkers(raw)));
  });

  it("wrapWithDoneMarker：pwsh / bash / fish 各用对应收尾", () => {
    const ps = wrapWithDoneMarker("pwsh", "echo hi");
    assert.match(ps, /try \{/);
    assert.match(ps, /finally/);
    assert.match(ps, /666;done/);

    const bash = wrapWithDoneMarker("bash", "echo hi");
    assert.match(bash, /trap/);
    assert.match(bash, /666;done/);

    assert.match(wrapWithDoneMarker("cmd", "echo hi"), /__TW_DONE__/);

    const fish = wrapWithDoneMarker({ id: "shell", path: "/opt/homebrew/bin/fish" }, "echo hi");
    assert.match(fish, /fish_exit/);
    assert.match(fish, /666;done/);
    assert.doesNotMatch(fish, /trap '/);
  });

  it("looksLikeCommandSettled 识别中断与提示符", () => {
    assert.equal(
      looksLikeCommandSettled("Serving...\nKeyboard interrupt received, exiting.\n"),
      true,
    );
    assert.equal(
      looksLikeCommandSettled("\nPS C:\\Users\\wangs\\Desktop\\thinker-workbench> "),
      true,
    );
    assert.equal(looksLikeCommandSettled("Serving HTTP on :: port 8765"), false);
  });
});
