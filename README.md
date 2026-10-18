# Thinker Workbench

**English** | [简体中文](./docs/README.zh-CN.md)

License: [Apache-2.0](./LICENSE) · Deferred work: [TODOS](./TODOS.md)

## About

Thinker Workbench is a desktop AI coding app for local repositories. You chat in a workspace; the agent can read and edit files and run shell commands. Sessions, settings, and keys stay on your machine; models use whatever OpenAI-compatible endpoint you configure.

What it covers day to day:

- **Modes** — Agent edits code, Ask answers read-only, Plan drafts before changing anything
- **Parallel Tasks and subagents** — split larger jobs and follow progress on the timeline
- **Changes and diffs** — review edits beside the chat, not only the final reply
- **Skills, Rules, and MCP** — extend behavior globally or per workspace; `/` picks a skill, `@` mentions files
- **Local data** — default root `~/.thinker`; API keys via OS `safeStorage`

![Thinker Workbench — chat, agent tasks, and workspace changes](./docs/screenshot.jpg)

## Requirements

| | |
|---|---|
| **Node.js** | 22+ |
| **pnpm** | **11.12.0** (pinned by `packageManager` — do not use npm/yarn) |
| **OS** | Windows / macOS / Linux |
| **Electron** | 37 (via workspace dependency) |

`pnpm install` runs `postinstall` (macOS renames the Electron.app for local identity; desktop rebuilds natives such as `better-sqlite3`).

## Quick start

```bash
pnpm install
pnpm run dev
```

1. Wait for the desktop window (renderer at http://127.0.0.1:5179).
2. Open **Settings → Model** and set API key, base URL, and model.
3. Open or create a workspace, then chat.

Useful flags:

```bash
pnpm run dev -- --no-hot      # no Vite HMR / Electron auto-restart  (TW_DEV_NO_HOT=1)
pnpm run dev -- --devtools    # open DevTools on launch             (THINKER_OPEN_DEVTOOLS=1)
```

> Renderer-only (`pnpm --filter @thinker-workbench/renderer dev`) has no `window.thinker` bridge — use full `pnpm run dev` for chat.

## Common scripts

| Script | Purpose |
|---|---|
| `pnpm run dev` | Full stack: watchers + Electron |
| `pnpm run build` / `build:node` | Build all packages / skip renderer |
| `pnpm start` | Electron against the last build |
| `pnpm test` / `test:report` | Vitest (report → `test-results/report/`) |
| `pnpm run check` | Biome lint + format check |
| `pnpm run format` / `lint` | Format write / lint only |

| `pnpm run pack:zip` | Zip the repo (respects `.gitignore`) |
| `pnpm run stage:desktop` | Assemble `.stage/app` + `.stage/payload` (after `pnpm build`) |
| `pnpm run pack:desktop` | Build → stage → electron-builder for the current OS |
| `pnpm run pack:desktop:win` / `pack:desktop:mac` | Windows-only / macOS-only targets |
| `pnpm run pack:desktop:dir` | Same but `--dir` (unpacked app only) |

Desktop installers land in repo-root `release/`. Packaged layout: Shell in `app.asar`, Payload under `Resources/payload/` (`layout.json` + renderer/engine/bundled). `pack:zip` is source zip only — not a desktop installer.

CI: `.github/workflows/pack.yml` builds on `windows-latest` and `macos-latest` (manual `workflow_dispatch` or push `v*` tags). Artifacts: `thinker-workbench-win` / `thinker-workbench-mac`. Unsigned when no signing certs are configured.

**Windows packaging / signing toolchain:** `electron-builder` downloads `winCodeSign` (exe resource editing; Authenticode when a cert is present). That archive contains symlinks — if you see `Cannot create symbolic link` / privilege errors, enable **Settings → System → For developers → Developer Mode** (or run an elevated shell), delete `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign`, then re-run `pnpm run pack:desktop`. Without a code-signing cert the toolchain still runs for resource updates; ship with your own cert for production. macOS notarization: see `notarize-hint`.

Tests live under each package’s `tests/` (mirrors `src/`), named `*.test.ts`. Config: [`vitest.config.ts`](vitest.config.ts). Per-package: `pnpm --filter @thinker-workbench/<pkg> test`.

## Architecture

```
Renderer (React / Vite)
    │  preload → window.thinker
    ▼
Desktop (ipcMain) ── SQLite / settings / FS IPC
    │
    └── AgentBridge ── utilityProcess
                          └── engine/artifacts/entry.js
                                UtilityHost → AgentRuntime → LangGraph StateGraph
```

| Layer | Package | Role |
|---|---|---|
| UI | `renderer` | Chat, settings, tools pane |
| Shell | `desktop` | Electron main, preload, IPC, SQLite |
| Agent | `engine` | LangGraph graph, tools, model client |
| Kit | `design` / `markdown` | Shared UI + Markdown |
| Contracts | `shared` | IPC channels, commands, events |
| Observability | Built-in (Local) | Settings → Data toggle. LangSmith-style run tree / waterfall / IO in Console. No Docker or cloud. |

Default graph: LangGraph `START → agent ⇄ tools → END` in `packages/engine/src/graph/`. Checkpoint: SqliteSaver under `<dataDir>/checkpoints/langgraph.sqlite`. File tools operate on the **workspace root**, not the monorepo cwd. Prefer `@thinker-workbench/design/react` for UI; live catalog at `#/components`.

Build outputs go to each package’s `artifacts/` (gitignored). Cold start uses `scripts/dev-prepare.mjs` when they are missing.

## macOS Keychain prompt

API keys are encrypted with Electron `safeStorage` (item name **Thinker Workbench Safe Storage**). The OS may ask for your **login keychain password** when the app must decrypt a saved key (send / resume, or model probe). Startup, opening settings, and context-usage estimates do **not** touch the keychain.

Dev / unsigned builds often show “authenticity cannot be verified” because the app identity changes between rebuilds. **Always Allow** after you trust the local build; Deny only blocks decrypting stored keys.

## Data layout

Default root: **`~/.thinker`** (`general.dataDir`). Authoritative `settings.json` lives at that root; a customized `dataDir` still keeps a mirror at `~/.thinker/settings.json` so the next launch can find it.

| Path | Contents |
|---|---|
| `settings.json` | Settings (model keys, preferences, `dataDir`) |
| `state/catalog.db` | Workspace metadata |
| `state/session.json` | UI / window session |
| `checkpoints/` | Agent resume checkpoints |
| `workspaces/<id>/chat.db` | Per-workspace chats |
| `logs/` | SQLite log shards |
| `skills/`, `mcps/`, `rules/` | Global skills / MCP / rules |
| `workspace/` | Default on-disk workspace (under bootstrap `~/.thinker`) |

Changing the root **copies** history into the new folder (old root is left in place) and always writes `settings.json` there. Legacy Electron `userData/checkpoints` are migrated into `<dataDir>/checkpoints` on startup.

## Rules, skills, composer

| Kind | Search order (later overrides same name) |
|---|---|
| **Rules** | `<dataDir>/rules/` → `<workspace>/.thinker/rules/` |
| **Skills** | `<dataDir>/skills/` → `<workspace>/.thinker/skills/` |

Rules: `.md` / `.mdc` / `.txt`. Skills: folder + `SKILL.md` (YAML frontmatter).

In the composer:

- **`/`** — pick a skill; inserts `/skill-name ` (engine activates from that form).
- **`@`** — mention a workspace file or folder; on send, files go into context (folders: listing + a few small text files). Esc / Space dismisses and keeps a plain `@`.

## MCP (stdio)

**Settings → MCP**. Merge order (same `id`: later wins):

1. `<dataDir>/mcps/*.json`
2. `<workspace>/.thinker/mcps/*.json`
3. Optional import from `mcp.json` (`mcpServers` map)

Fields: `id`, `name`, `enabled`, `transport: "stdio"`, `command`, `args`, `env`, optional `cwd`. Tools appear as `mcp__{serverId}__{toolName}`.

On Windows, `npx` / `npm` / `node` resolve to `*.cmd` automatically.

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

Disable a server in Settings to drop its tools; quitting should leave no orphan MCP children.

## Contributing

How to branch, review, and land changes: **[CONTRIBUTING.md](./CONTRIBUTING.md)** ([简体中文](./docs/CONTRIBUTING.zh-CN.md)). Deferred backlog: [TODOS.md](./TODOS.md).
