/**
 * hello / run / resume 使用同一 shell 载荷，硬拒绝名单随快照下发。
 */
import assert from "node:assert/strict";
import type {
  ShellProfile,
  UtilityHello,
  UtilityResume,
  UtilityRun,
} from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { shellSettingsPayload } from "../../src/utility/shellSettingsPayload";

const shell: ShellProfile = {
  id: "pwsh",
  name: "PowerShell",
  path: "pwsh",
  args: ["-NoLogo"],
};

describe("shellSettingsPayload", () => {
  it("hello、run、resume 都带上 shellBlocklist", () => {
    const payload = shellSettingsPayload(
      {
        allowAiShell: true,
        allowAiBrowser: false,
        shellApprovalMode: "unrestricted",
        shellAllowlist: ["git"],
        shellBlocklist: ["rm", "format"],
      },
      shell,
    );

    const hello: UtilityHello = { channel: "utility", kind: "hello", ...payload };
    const run: UtilityRun = {
      channel: "utility",
      kind: "run",
      runId: "run_1",
      threadId: "thread_1",
      traceId: "trace_1",
      command: { message: "hi", threadId: "thread_1", traceId: "trace_1" },
      ...payload,
    };
    const resume: UtilityResume = {
      channel: "utility",
      kind: "resume",
      runId: "run_1",
      command: { threadId: "thread_1", traceId: "trace_1" },
      ...payload,
    };

    assert.deepEqual(hello.shellBlocklist, ["rm", "format"]);
    assert.deepEqual(run.shellBlocklist, ["rm", "format"]);
    assert.deepEqual(resume.shellBlocklist, ["rm", "format"]);
    assert.equal(hello.shellApprovalMode, "unrestricted");
    assert.deepEqual(run.shellAllowlist, ["git"]);
    assert.equal(resume.allowAiBrowser, false);
    assert.equal(hello.shell?.id, "pwsh");
  });
});
