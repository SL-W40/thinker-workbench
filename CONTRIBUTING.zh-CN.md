# 参与 Thinker Workbench 贡献

[English](./CONTRIBUTING.md) | **简体中文**

感谢贡献。产品说明、环境搭建、脚本与架构见 [README.zh-CN.md](./README.zh-CN.md)。暂缓事项：[TODOS.zh-CN.md](./TODOS.zh-CN.md)。

## 基本原则

- 许可证：[Apache-2.0](./LICENSE)。贡献以相同条款授权。
- 优先小而单一主题的 PR；讨论保持尊重、聚焦改动。
- 不要提交密钥、`.env` 或 `~/.thinker` 下的内容。
- **只用 pnpm**（版本由根目录 `package.json` 的 `packageManager` 固定）。

## 工作流

1. 从默认分支拉主题分支（`feat/…`、`fix/…`、`docs/…`、`refactor/…`、`test/…`）。
2. 改动范围尽量收窄。
3. 开 PR 前本地跑：

```bash
pnpm run check
pnpm test
```

CI（`.github/workflows/check.yml`）会在 push / PR 上跑 `pnpm check`。

4. PR 写清 **Summary**（改了什么 / 为什么）和 **Test plan**（命令或手工验证）。

## 编码约定

与仓库既有规则一致：

| 方面 | 要求 |
|---|---|
| 注释 / JSDoc | **中文** — 标识符、IPC 名、i18n 文案、模型 prompt 保持原样 |
| UI（`packages/renderer`） | 优先 `@thinker-workbench/design/react`；可复用控件放 `packages/design`（目录：`#/components`） |
| 用户可见文案 | i18n：`messages/en.ts` + `zh.ts` |
| Lint / 格式化 | Biome：`pnpm run check` |

### 测试

改 `packages/*/src/**` 的行为、边界或公共 API 时，**同一改动里**更新或补充测试。

- 目录：`packages/<pkg>/tests/`，镜像 `src/`（例：`src/model/retry.ts` → `tests/model/retry.test.ts`）
- 命名：仅 `*.test.ts`（不贴在 `src/` 旁，不用 `*.spec.ts`）
- 框架：Vitest + `node:assert/strict`
- 覆盖：主路径 + 至少一个失败 / 边界

纯文案 / 样式 / 与逻辑无关的注释可跳过测试。

### Commit

- 建议约定式标题：`feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:`。
- 非显而易见的改动在正文写清 **为什么**。
- 不要对共享默认分支强推；未经维护者要求不要跳过 hooks。
- 不要提交生成的 `artifacts/`、`release/`。

## Issue

开新 Issue 前先搜索。Bug 需包含：复现步骤、期望与实际、OS、Node/pnpm 版本，以及是 `pnpm run dev` 还是安装包环境。

安全相关问题尽量私下联系维护者，勿在公开 Issue 贴密钥。

## 疑问

若本文与仓库脚本 / CI 冲突，以脚本与 workflow 为准，再提文档 PR。