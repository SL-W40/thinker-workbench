---
name: commit-message
description: >-
  Draft git commit messages following Conventional Commits
  (https://www.conventionalcommits.org/). Use when the user asks for a commit
  message, /commit-message, 写提交说明, 生成 commit, or reviews a diff to commit.
disable-model-invocation: true
---

# Commit message (Conventional Commits)

根据当前工作区 diff（优先 staged；否则 unstaged）起草提交说明。默认**只输出 message**，除非用户明确要求执行 `git commit`。

规范依据：[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)。

## 格式

```
<type>[optional scope][optional !]: <description>

[optional body]

[optional footer(s)]
```

### 硬性规则

- `type` 小写；与 description 之间为 `:` + **一个空格**
- `description`：祈使语气、现在时（add / fix / prevent，不是 added / fixed）；首字母小写（专有名词除外）；**结尾不加句号**
- Subject 行尽量 ≤72 字符；超出细节放 body
- Body 与 subject 之间空一行；正文按需换行（约 72–100 列）
- 破坏性变更：在 type/scope 后加 `!`，和/或 footer `BREAKING CHANGE: <说明>`
- Footer 常见：`Fixes #123`、`Refs #123`、`Signed-off-by:`（按需）
- 语言：与团队一致；无说明时用**英文**
- 禁止：WIP、update files、fixed bug、中英混杂的 type、把 file list 当正文

## type（常用）

| type | 含义 |
|---|---|
| `feat` | 新功能（可感知行为） |
| `fix` | 修复 bug |
| `docs` | 仅文档 |
| `style` | 仅格式（空格、分号等，不影响逻辑） |
| `refactor` | 既非 feat 也非 fix 的代码重构 |
| `perf` | 性能 |
| `test` | 增改测试 |
| `build` | 构建系统或外部依赖（webpack、npm、打包等） |
| `ci` | CI 配置与脚本 |
| `chore` | 其它杂项（不影响 src / test 的工具事务） |
| `revert` | 回滚；description 写被回滚 commit 的 header |

选**一个**主 type。修 bug 附带测试 → `fix`；纯加测 → `test`。

## scope（可选）

括号内短名，小写，表示影响面（模块、包、特性），如 `feat(api): ...`、`fix(auth): ...`。  
无清晰边界或改动过散时**省略** scope，勿编造。

## Body（可选）

- 解释 **为什么**、与旧行为的差异；不要复述 diff 文件名清单
- 可用空行分段；列表用 `- `
- 与 subject 矛盾时以 diff 为准，改 subject

## Footer（可选）

```
BREAKING CHANGE: consumers must pass `options.timeout` explicitly

Fixes #842
```

## 起草步骤

1. 阅读 `git diff --staged`（或 `git diff`）与近期 `git log --oneline`
2. 用一句话概括意图 → 选定 `type` / 可选 `scope` / `description`
3. 需要时补 body（动机、兼容性）；有破坏性则加 `!` 或 `BREAKING CHANGE`
4. 自检：type 是否夸大；description 是否祈使、无句号；格式是否 `type(scope): desc`

## 示例

```
feat(auth): support OAuth device flow

Allow headless clients to sign in without a local browser redirect.
```

```
fix: prevent crash when config file is missing

Fall back to defaults and log a warning instead of throwing on startup.
```

```
feat(api)!: remove deprecated /v1/orders endpoint

BREAKING CHANGE: use /v2/orders; /v1/orders now returns 410 Gone.
```

```
docs: clarify installation steps for Apple Silicon
```

```
chore: bump eslint to 9.x
```

```
revert: revert "feat(auth): support OAuth device flow"

This reverts commit 4f3e2d1.
```
