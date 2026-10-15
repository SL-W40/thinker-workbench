# Thinker Workbench

[English](./README.md) | **简体中文**

许可证：[Apache-2.0](./LICENSE) · 暂缓事项：[TODOS](./TODOS.zh-CN.md)

## 项目说明

Thinker Workbench 是面向本地仓库的 AI 编程桌面端。你在工作区里对话，agent 可以读改文件、执行 Shell；会话、设置与密钥留在本机，模型走你自己配置的 OpenAI 兼容端点。

日常能力大致包括：

- **多模式**：Agent 改代码，Ask 只读答疑，Plan 先出方案再动手
- **并行 Task 与子代理**：把大任务拆开跑，时间线里跟进度
- **Changes 与 diff**：和聊天同屏核对改动，而不是只看最终文字
- **Skills、Rules、MCP**：按全局或工作区扩展行为；`/` 选 skill，`@` 引用文件
- **本机数据**：默认目录 `~/.thinker`，API key 经系统 `safeStorage` 保管

![Thinker Workbench — 对话、agent 任务与工作区变更](./docs/screenshot.jpg)

## 环境要求

| | |
|---|---|
| **Node.js** | 22+ |
| **pnpm** | **11.12.0**（由 `packageManager` 固定 — 不要用 npm/yarn） |
| **操作系统** | Windows / macOS / Linux |
| **Electron** | 37（workspace 依赖） |

`pnpm install` 会跑 `postinstall`（macOS 会重命名 Electron.app 以区分本地身份；desktop 会重建 `better-sqlite3` 等原生模块）。

## 快速开始

```bash
pnpm install
pnpm run dev
```

1. 等待桌面窗口出现（renderer：http://127.0.0.1:5179）。
2. 打开 **设置 → 模型**，填入 API key、base URL、model。
3. 打开或创建工作区，开始对话。

常用参数：

```bash
pnpm run dev -- --no-hot      # 关闭 Vite HMR / Electron 自动重启  (TW_DEV_NO_HOT=1)
pnpm run dev -- --devtools    # 启动时打开 DevTools              (THINKER_OPEN_DEVTOOLS=1)
```

> 仅跑 renderer（`pnpm --filter @thinker-workbench/renderer dev`）没有 `window.thinker` 桥 — 聊天请用完整的 `pnpm run dev`。

## 常用脚本

| 脚本 | 用途 |
|---|---|
| `pnpm run dev` | 全栈：watchers + Electron |
| `pnpm run build` / `build:node` | 构建全部包 / 跳过 renderer |
| `pnpm start` | 用最近一次构建启动 Electron |
| `pnpm test` / `test:report` | Vitest（报告 → `test-results/report/`） |
| `pnpm run check` | Biome lint + format 检查 |
| `pnpm run format` / `lint` | 仅格式化写入 / 仅 lint |
| `pnpm run dev:logger:web` | 日志查看器 → http://127.0.0.1:5181 |
| `pnpm run pack:zip` | 打包仓库 zip（遵循 `.gitignore`） |
| `pnpm run stage:desktop` | 组装 `.stage/app` + `.stage/payload`（需先 `pnpm build`） |
| `pnpm run pack:desktop` | build → stage → electron-builder 打当前 OS 目标 |
| `pnpm run pack:desktop:win` / `pack:desktop:mac` | 仅 Windows / 仅 macOS 目标 |
| `pnpm run pack:desktop:dir` | 同上但 `--dir`（只出未封装应用目录） |

安装包产物在仓库根目录 `release/`。打包布局：Shell 在 `app.asar`，Payload 在 `Resources/payload/`（`layout.json` + renderer/engine/bundled）。`pack:zip` 只是源码 zip，不是桌面安装包。

CI：`.github/workflows/pack.yml` 在 `windows-latest` / `macos-latest` 上分别打包，触发为 **手动 workflow_dispatch** 或推送 **`v*` tag**；产物以 Actions artifact 上传（`thinker-workbench-win` / `thinker-workbench-mac`）。未配置签名证书时产出未签名包。

**Windows 打包与签名工具链：** `electron-builder` 会下载并解压 `winCodeSign`（用于改 exe 资源，以及在有证书时做 Authenticode）。该压缩包含符号链接；若报 `Cannot create symbolic link` / 客户端没有所需特权，请开启 **设置 → 系统 → 开发者选项 → 开发人员模式**（或管理员终端），然后删除 `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign` 后重跑 `pnpm run pack:desktop`。未配置代码签名证书时仍会走该工具链写资源信息；正式分发请自行配置证书。macOS 公证见 `notarize-hint`。

测试在各包 `tests/`（镜像 `src/`），命名 `*.test.ts`。配置：[`vitest.config.ts`](vitest.config.ts)。单包：`pnpm --filter @thinker-workbench/<pkg> test`。

## 架构

```
Renderer (React / Vite)
    │  preload → window.thinker
    ▼
Desktop (ipcMain) ── SQLite / settings / FS IPC
    │
    └── AgentBridge ── utilityProcess
                          └── engine/artifacts/entry.js
                                UtilityHost → AgentRuntime → graph
```

| 层 | 包 | 职责 |
|---|---|---|
| UI | `renderer` | 聊天、设置、工具面板 |
| Shell | `desktop` | Electron main、preload、IPC、SQLite |
| Agent | `engine` | 图、工具、模型客户端 |
| Kit | `design` / `markdown` | 共享 UI + Markdown |
| 契约 | `shared` | IPC channel、命令、事件 |
| 可观测 | `logger`（+ `logger-web`） | 结构化日志 / 查看器 |

默认图：`packages/engine/src/graph/` 中的 `start → agent ⇄ tools → end`。文件工具作用在 **工作区根目录**，不是 monorepo cwd。UI 优先用 `@thinker-workbench/design/react`；应用内目录页 `#/components`。

构建产物在各包 `artifacts/`（已 gitignore）。冷启动缺产物时由 `scripts/dev-prepare.mjs` 准备。

## macOS 钥匙串弹窗

API Key 经 Electron `safeStorage` 加密，钥匙串条目名为 **Thinker Workbench Safe Storage**。系统会在**真正需要解密已存密钥**时（发消息 / Resume、探测模型）要求输入**登录钥匙串密码**。启动、打开设置、上下文占用估算**不会**触碰钥匙串。

开发态 / 未签名包常提示「不能验证真实性」，因为每次 rebuild 应用身份可能变化。信任本地构建可选 **始终允许**；**拒绝**则解不开已存 Key，模型调用会失败。

## 数据目录

默认根目录：**`~/.thinker`**（`general.dataDir`）。权威 `settings.json` 在该根下；自定义 `dataDir` 时仍会在 `~/.thinker/settings.json` 留镜像，以便下次启动找到它。

| 路径 | 内容 |
|---|---|
| `settings.json` | 设置（模型密钥、偏好、`dataDir`） |
| `state/catalog.db` | 工作区元数据 |
| `state/session.json` | UI / 窗口会话 |
| `checkpoints/` | Agent 恢复检查点 |
| `workspaces/<id>/chat.db` | 按工作区的聊天 |
| `logs/` | SQLite 日志分片 |
| `skills/`、`mcps/`、`rules/` | 全局 skills / MCP / rules |
| `workspace/` | 默认磁盘工作区（在引导用的 `~/.thinker` 下） |

更换根目录会把历史 **复制** 到新文件夹（旧根保留），并始终在该处写入 `settings.json`。旧版 Electron `userData/checkpoints` 会在启动时迁到 `<dataDir>/checkpoints`。

## Rules、Skills、输入框

| 类型 | 查找顺序（后者覆盖同名） |
|---|---|
| **Rules** | `<dataDir>/rules/` → `<workspace>/.thinker/rules/` |
| **Skills** | `<dataDir>/skills/` → `<workspace>/.thinker/skills/` |

Rules：`.md` / `.mdc` / `.txt`。Skills：目录 + `SKILL.md`（YAML frontmatter）。

聊天输入框：

- **`/`** — 选择 skill，插入 `/skill-name `（引擎按该形式激活）。
- **`@`** — 提及工作区文件或文件夹；发送时文件注入上下文（文件夹：列表 + 若干小文本）。Esc / 空格关闭选择器并保留普通 `@`。

## MCP（stdio）

**设置 → MCP**。合并顺序（同 `id` 后者覆盖）：

1. `<dataDir>/mcps/*.json`
2. `<workspace>/.thinker/mcps/*.json`
3. 可选从 `mcp.json` 导入（`mcpServers` map）

字段：`id`、`name`、`enabled`、`transport: "stdio"`、`command`、`args`、`env`、可选 `cwd`。工具名为 `mcp__{serverId}__{toolName}`。

Windows 下 `npx` / `npm` / `node` 会自动解析为 `*.cmd`。

```json
{
  "id": "filesystem",
  "name": "Filesystem",
  "enabled": true,
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:/path/to/workspace"],
  "env": {}
}
```

在设置中禁用服务器即可卸掉其工具；退出后不应留下孤儿 MCP 子进程。

## 贡献

分支、评审与合入约定见 **[CONTRIBUTING.zh-CN.md](./CONTRIBUTING.zh-CN.md)**（[English](./CONTRIBUTING.md)）。暂缓项：[TODOS.zh-CN.md](./TODOS.zh-CN.md)。
