/**
 * TerminalPane 默认壳解析纯函数（profile.ts）。
 */
import assert from "node:assert/strict";
import type { ShellProfile } from "@thinker-workbench/shared";
import { describe, it } from "vitest";
import { resolveDefaultProfile } from "../../../src/features/terminal/TerminalPane/profile";

function profile(id: string, name = id): ShellProfile {
  return { id, name, command: id, args: [], path: `/bin/${id}` } as ShellProfile;
}

const profiles = [profile("bash"), profile("powershell"), profile("shell")];

describe("resolveDefaultProfile", () => {
  it("returns null when no profiles", () => {
    assert.equal(resolveDefaultProfile([], "default"), null);
    assert.equal(resolveDefaultProfile([], undefined), null);
  });

  it("prefers powershell, then shell, then first on default", () => {
    assert.equal(resolveDefaultProfile(profiles, "default")?.id, "powershell");
    assert.equal(resolveDefaultProfile(profiles, undefined)?.id, "powershell");
    assert.equal(resolveDefaultProfile(profiles, "  ")?.id, "powershell");
    assert.equal(resolveDefaultProfile(profiles, "")?.id, "powershell");
    assert.equal(
      resolveDefaultProfile([profile("bash"), profile("shell")], "default")?.id,
      "shell",
    );
    assert.equal(resolveDefaultProfile([profile("bash")], "default")?.id, "bash");
  });

  it("honours explicit id and falls back to first when missing", () => {
    assert.equal(resolveDefaultProfile(profiles, "bash")?.id, "bash");
    assert.equal(resolveDefaultProfile(profiles, "nope")?.id, "bash");
  });
});
