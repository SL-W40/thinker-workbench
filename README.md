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

Default graph: LangGraph `START → agent ⇄ tools → END` in `packages/engine/src/graph/`. Checkpoint: SqliteSaver under `<dataDir>/workspaces/<id>/checkpoints/langgraph.sqlite`. File tools operate on the **workspace root**, not the monorepo cwd. Prefer `@thinker-workbench/design/react` for UI; live catalog at `#/components`.

Build outputs go to each package’s `artifacts/` (gitignored). Cold start uses `scripts/dev-prepare.mjs` when they are missing.

## macOS Keychain prompt

API keys are encrypted with Electron `safeStorage` (item name **Thinker Workbench Safe Storage**). The OS may ask for your **login keychain password** when the app must decrypt a saved key (send / resume, or model probe). Startup, opening settings, and context-usage estimates do **not** touch the keychain.

Dev / unsigned builds often show “authenticity cannot be verified” because the app identity changes between rebuilds. **Always Allow** after you trust the local build; Deny only blocks decrypting stored keys.

## Data layout

Default root: **`~/.thinker`** (`general.dataDir`). Authoritative `settings.json` lives at that root; a customized `dataDir` still keeps a mirror at `~/.thinker/settings.json` so the next launch can find it.

Paths are declared once in `packages/shared/src/dataLayout.ts` (desktop + engine share it): each entry records a relative path plus a kind (`config` / `state` / `workspace` / `content` / `cache`) and a purge policy, which drives the migration list, cleanup tasks and tests.

| Path | Kind | Contents |
|---|---|---|
| `settings.json` | config | Settings (model keys, preferences, `dataDir`) |
| `state/catalog.db` | state | Workspace metadata |
| `state/session.json` | state | UI / window session |
| `workspaces/<id>/chat.db` | workspace | Per-workspace chats |
| `workspaces/<id>/images/`, `attachments/` | workspace | Chat images / external file attachments |
| `workspaces/<id>/shell-output/` | workspace | Large terminal output spills |
| `workspaces/<id>/checkpoints/` | workspace | Agent resume checkpoints |
| `workspaces/<id>/memory.sqlite` | workspace | Session memory |
| `workspaces/<id>/trace/` | workspace | Trace index db + session payload jsonl |
| `workspaces/ws_default/project/` | content | Built-in default workspace root (fixed id) |
| `customize/{rules,skills,agents,mcps}/` | content | Global rules / skills / subagents / MCP |
| `cache/browser-screenshots/`, `cache/computer/images/` | cache | Regenerable screenshots (pruned by age + size) |

Deleting a workspace removes `workspaces/<id>/` entirely (chats, images, attachments, checkpoints, trace, memory). The default workspace (`ws_default`) cannot be deleted—only cleared.

Changing the root **copies** history into the new folder (old root is left in place) and always writes `settings.json` there.

## Checkpoints: branching & rollback

A **checkpoint** is the full restorable state of one agent run, in two layers:

| Layer | Storage | Written by | Restored by |
|---|---|---|---|
| Conversation | `workspaces/<id>/checkpoints/langgraph.sqlite` + `threads.json` | engine (LangGraph SqliteSaver) | engine (`resume`, optionally from a mid-run `checkpoint_id`) |
| Files (tracked) | `workspaces/<id>/checkpoints/files/<runId>/` | engine (before-image captured before the first write) | desktop (temp file + rename) |
| Files (git fallback) | temporary git ref (`git stash create`) | desktop (at run start) | desktop (git first, then before-images) |

A **turn** is one user message plus its assistant reply — one agent run. The timeline aggregates turns (prompt, model, tokens, duration, status, tool count, file badge); each turn expands into superstep snapshots that can be resumed from the middle.

| Action | Meaning | Destructive |
|---|---|---|
| **Fork** | Copy turns 1–N into a new session (new thread); the original is untouched | No |
| **Undo** | Restore that turn's files and rewind the conversation to before it | Yes (type-to-confirm) |
| **Compare** | Align two same-origin branches turn by turn (line-level text + usage delta + totals) | Read-only |

Coverage: file tools (`write_file` / `edit_file` / `delete_file`) capture before-images; git repos additionally get a full ref covering shell / MCP edits. Files over 5MB, anything under `.git/`, and symlinks are skipped and recorded as `skipped` in the manifest.

Retention is configurable in **Settings → Data → Checkpoint retention** (runs / days / total size / per-file size; defaults: 30 runs per workspace, 14 days, 256MB total, 5MB per file), including a **Prune now** action. Strictest of the three wins. **Never pruned**: the running run, a session's pending-resume run, and the newest run of each session. Conversation snapshots are deleted through the engine child process (deleting the sqlite directly from the main process fails silently on Windows file locks); file before-images are plain data files and are deleted by desktop.

Entry points: open the **Timeline** tab from the `+` menu in the right inspector's tab strip, then use the `⋯` menu on each turn to fork or undo, or the **Compare** button in the panel header. For single-file review, use **Changes**: each row offers revert / keep, backed by the before-image above (git checkout is the fallback when no snapshot exists).

## Rules, skills, composer

| Kind | Search order (later overrides same name) |
|---|---|
| **Rules** | `<dataDir>/customize/rules/` → `<workspace>/.thinker/rules/` |
| **Skills** | `<dataDir>/customize/skills/` → `<workspace>/.thinker/skills/` |

Rules: `.md` / `.mdc` / `.txt`. Skills: folder + `SKILL.md` (YAML frontmatter).

In the composer:

- **`/`** — pick a skill; inserts `/skill-name ` (engine activates from that form).
- **`@`** — mention a workspace file or folder; on send, files go into context (folders: listing + a few small text files). Esc / Space dismisses and keeps a plain `@`.

## Searching, changes, git, transfer, updates

| Capability | Where | Notes |
|---|---|---|
| **History search** | Sidebar filter box | Local filter by workspace / chat title, plus SQLite FTS5 full-text search across every chat (trigram tokenizer, so CJK works). Type ≥2 chars to search message bodies; press Enter on a hit to jump to that chat. |
| **Change review** | Inspector → Changes | Per-row **revert / keep**, batch actions, and a commit box. Revert restores the before-image captured before the agent's first write; inside git repos it falls back to `git checkout -- <path>`. "Keep" drops the snapshot, after which that file can no longer be rolled back. |
| **Git write actions** | Inspector → Changes | stage / unstage / discard / commit / checkout / branch / push / pull / stash. No credential storage: remote failures surface git's own message so you can finish in your terminal. |
| **Read-only git tools for the agent** | `git_status` / `git_diff` | The model can see branch, ahead/behind, and diffs — never write access. Toggle with `allowAiGit` (default on); output is capped to protect the context budget. |
| **Concurrent writes** | automatic | Write tools serialize per absolute path (5s wait, then an explicit "another session is writing" error), so parallel runs on the same workspace cannot silently clobber each other. Read-only tools stay fully parallel. |
| **Export / import chats** | Settings → Data | Markdown for reading, JSON for lossless round-trip. Imports always create a new chat and never overwrite an existing one. |
| **Command palette** | `Mod+K` | Jump to any chat, workspace file, settings section, or command; rebind it under Settings → Shortcuts. |
| **Desktop updates** | Settings → Data | electron-updater against GitHub Releases; development builds report the updater as unavailable. Publish with `pnpm run pack:desktop:release` (`GH_OWNER` / `GH_REPO` / `GH_TOKEN` required). The default `electron-builder.yml` keeps `publish: null` so token-less CI still produces installers. |

## MCP (stdio)

**Settings → MCP**. Merge order (same `id`: later wins):

1. `<dataDir>/customize/mcps/*.json`
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
