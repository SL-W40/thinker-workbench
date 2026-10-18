# 测试编写与同步

## 何时必须碰测试

改 `packages/*/src/**` 的行为、边界或公共 API 时，**同一改动里**同步更新或新增对应测试；不要只改实现留下过期断言。纯文案 / 样式 / 与逻辑无关的注释可跳过。

完成相关逻辑后本地跑：`pnpm test`（全量）或 `pnpm --filter @thinker-workbench/<pkg> test`。

## 放哪里

- 目录：`packages/<pkg>/tests/`，**镜像** `src/` 相对路径  
  例：`packages/engine/src/model/retry.ts` → `packages/engine/tests/model/retry.test.ts`
- 命名：仅 `*.test.ts`；**不要**放在 `src/` 旁，不要用 `*.spec.ts`
- 有测的包：`markdown` / `engine` / `desktop` / `renderer`；其它包按同样约定新建 `tests/`

## 怎么写

- 框架：**Vitest** + `node:assert/strict`（根目录 `vitest.config.ts`）
- 从 `vitest` 导入 `describe` / `it` / hooks（勿用 `node:test`）
- 导入生产代码：相对路径进 `src`（按镜像深度，如 `../../src/model/retry`）；workspace 包名不变
- 覆盖：主路径 + 至少一个失败 / 边界；夹具尽量小；注释用中文（见 chinese-comments）
- 报告（可选）：`pnpm test:report` → Vitest 官方 HTML + JUnit + v8 coverage（`test-results/report/`）

```ts
// ❌ BAD — 测文件仍贴在 src 旁
// packages/engine/src/model/retry.test.ts

// ✅ GOOD
// packages/engine/tests/model/retry.test.ts
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { isCancelError } from "../../src/model/retry";
```
