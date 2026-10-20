/**
 * buildRuntimeSettings：hello/run/resume 共用块的逐字段映射（收口自 desktop 三处 + shellSettingsPayload）。
 * 钉住 13 项限额、shell 访问字段、trace.enabled 与 shell 透传，防止字段漂移。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { DEFAULT_GENERAL_SETTINGS } from "../../src/ipc/general";
import type { ShellProfile } from "../../src/ipc/terminal";
import { buildRuntimeSettings } from "../../src/ipc/utilityPayload";

// ShellProfile 形状与测试无关，仅验证透传；用最小对象即可
const shell = { id: "pwsh", path: "C:\\pwsh.exe" } as unknown as ShellProfile;

describe("buildRuntimeSettings", () => {
  it("13 项限额逐字段取自 general", () => {
    const general = {
      ...DEFAULT_GENERAL_SETTINGS,
      maxAgentSteps: 111,
      maxSubagentSteps: 22,
      modelRetryMaxAttempts: 4,
      modelRetryBaseDelayMs: 500,
      toolCallMinGapMs: 7,
      defaultShellBlockUntilMs: 800,
      shellOutputCap: 1234,
      mcpConnectTimeoutMs: 3001,
      mcpCallTimeoutMs: 60_002,
      contextFilesMaxFileBytes: 1003,
      contextFilesMaxTotalBytes: 2004,
      readFileDefaultMaxChars: 9995,
    };
    const s = buildRuntimeSettings(general, shell);
    assert.equal(s.maxAgentSteps, 111);
    assert.equal(s.maxSubagentSteps, 22);
    assert.equal(s.modelRetryMaxAttempts, 4);
    assert.equal(s.modelRetryBaseDelayMs, 500);
    assert.equal(s.toolCallMinGapMs, 7);
    assert.equal(s.defaultShellBlockUntilMs, 800);
    assert.equal(s.shellOutputCap, 1234);
    assert.equal(s.mcpConnectTimeoutMs, 3001);
    assert.equal(s.mcpCallTimeoutMs, 60_002);
    assert.equal(s.contextFilesMaxFileBytes, 1003);
    assert.equal(s.contextFilesMaxTotalBytes, 2004);
    assert.equal(s.readFileDefaultMaxChars, 9995);
  });

  it("shell 访问字段取自 general；shell 引用原样透传", () => {
    const general = {
      ...DEFAULT_GENERAL_SETTINGS,
      allowAiShell: true,
      allowAiBrowser: false,
      allowAiDeleteFiles: true,
      loggingEnabled: true,
      shellAllowlist: ["git", "pnpm"],
      shellBlocklist: ["rm", "curl"],
    };
    const s = buildRuntimeSettings(general, shell);
    assert.equal(s.allowAiShell, true);
    assert.equal(s.allowAiBrowser, false);
    assert.equal(s.allowAiDeleteFiles, true);
    assert.equal(s.loggingEnabled, true);
    assert.deepEqual(s.shellAllowlist, ["git", "pnpm"]);
    assert.deepEqual(s.shellBlocklist, ["rm", "curl"]);
    assert.equal(s.shell, shell);
    // 枚举类字段原样拷贝（值随 DEFAULT，验证透传而非硬编码）
    assert.equal(s.aiLocale, general.aiLocale);
    assert.equal(s.workspaceAccess, general.workspaceAccess);
    assert.equal(s.shellApprovalMode, general.shellApprovalMode);
    assert.equal(s.httpCompatibilityMode, general.httpCompatibilityMode);
  });

  it("trace.enabled = observabilityEnabled !== false", () => {
    const on = buildRuntimeSettings(
      { ...DEFAULT_GENERAL_SETTINGS, observabilityEnabled: true },
      shell,
    );
    assert.deepEqual(on.trace, { enabled: true });
    const off = buildRuntimeSettings(
      { ...DEFAULT_GENERAL_SETTINGS, observabilityEnabled: false },
      shell,
    );
    assert.deepEqual(off.trace, { enabled: false });
  });
});
