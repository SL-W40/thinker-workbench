/**
 * 审批卡要写出命令在做什么，而不是只说「将在工作区执行」。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  explainShellClauses,
  formatShellPurpose,
} from "../../../src/features/chat/shared/explainShellCommand";
import { translate } from "../../../src/ui/i18n/translate";

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string>) =>
  translate("zh", key, vars);

describe("explainShellCommand", () => {
  it("cd 后接 tsc 类型检查", () => {
    const command = "cd packages/renderer && npx tsc --noEmit --skipLibCheck";
    assert.deepEqual(explainShellClauses(command), [
      { op: "cd", dir: "packages/renderer" },
      { op: "tsc", noEmit: true, skipLibCheck: true },
    ]);
    assert.equal(
      formatShellPurpose(command, t),
      "切换到 packages/renderer，然后用 tsc 做类型检查，不写出文件，并跳过依赖库检查。",
    );
  });

  it("引号里的 && 不拆开；认不出的命令保留原文", () => {
    const command = 'echo "a && b"';
    assert.deepEqual(explainShellClauses(command), [{ op: "raw", text: 'echo "a && b"' }]);
    assert.equal(formatShellPurpose(command, t), '执行 echo "a && b"。');
  });
});
