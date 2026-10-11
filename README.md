# Thinker Workbench

**Local-First AI Workbench** — an Electron monorepo that runs a hand-rolled agent loop in a **`utilityProcess`**, not inside the renderer.

License: [Apache-2.0](./LICENSE).

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 22+** | Matches `@types/node`; no root `engines` field |
| **pnpm 11.12.0** | Pinned via `packageManager` — use pnpm, not npm/yarn |
| **OS** | Windows / macOS / Linux; Electron **34** |

`pnpm install` runs `postinstall` (macOS renames the Electron.app bundle for local identity; desktop rebuilds native modules such as `better-sqlite3`).

## Quick start

```bash
pnpm install
pnpm run dev            # Full stack: watchers + Electron
```

Then open **Settings → Model** and set an OpenAI-compatible **API key**, **base URL**, and **model**. Keys are encrypted at rest with OS `safeStorage` in `<dataDir>/settings.json` (default `~/.thinker/settings.json`).

| Script | Purpose |
|---|---|
| `pnpm run dev` | Product desktop stack (shared → logger → engine → desktop → renderer → Electron) |
| `pnpm run build` | Build all packages (including renderer) |
| `pnpm run build:node` | Build without renderer |
| `pnpm start` | Electron against the last build |
| `pnpm run check` | Biome lint + format check |
| `pnpm run format` / `pnpm run lint` | Format write / lint only |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:report` | Same + Vitest HTML / JUnit / v8 coverage → `test-results/report/` |
| `pnpm run dev:logger:web` | Standalone log viewer → http://127.0.0.1:5181 |
| `pnpm run pack:zip` | Zip the repo (respects `.gitignore`) |

Tests live under each package’s `tests/` tree (mirrors `src/`), named `*.test.ts`. Config: [`vitest.config.ts`](vitest.config.ts). Per-package: `pnpm --filter @thinker-workbench/<pkg> test`.

**Dev ports**

| URL | Service |
|---|---|
| http://127.0.0.1:5179 | Renderer (Vite) |
| http://127.0.0.1:5181 | Logger web UI |

Optional: `THINKER_OPEN_DEVTOOLS=1` opens DevTools on launch.

Renderer-only (`pnpm --filter @thinker-workbench/renderer dev`) has no `window.thinker` bridge — chat will echo a hint to run full `pnpm run dev`.

## Packages

| Package | Path | Role |
|---|---|---|
| `@thinker-workbench/shared` | `packages/shared` | Cross-process IPC contracts, commands, events, types |
| `@thinker-workbench/logger` | `packages/logger` | Structured logging (`./node` for main / utility) |
| `@thinker-workbench/logger-web` | `packages/logger/web` | Log / trace viewer (Vite + SQLite log shards) |
| `@thinker-workbench/design` | `packages/design` | Shared React design system (`/react`, Less tokens) |
| `@thinker-workbench/markdown` | `packages/markdown` | Homemade Markdown AST + React view |
| `@thinker-workbench/engine` | `packages/engine` | Agent graph, tools, model client (`artifacts/entry.js`) |
| `@thinker-workbench/desktop` | `packages/desktop` | Electron main, preload, IPC, SQLite |
| `@thinker-workbench/renderer` | `packages/renderer` | Product React UI (chat, settings, tools pane) |

Build outputs land in each package’s `artifacts/` (gitignored). Cold start uses `scripts/dev-prepare.mjs` when artifacts are missing.

## Architecture

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

- **Contracts**: `@thinker-workbench/shared` (`IpcChannels`, utility envelopes).
- **Default graph**: `packages/engine/src/graph/` — `start → agent ⇄ tools → end`. Customize nodes/edges there.
- **Tools**: `packages/engine/src/tools/*` (read/write/edit file, grep, list_dir, search_files, …). File tools use the **workspace root**, not the monorepo cwd.
- **UI kit**: prefer `@thinker-workbench/design/react`; live catalog in-app at `#/components`.

## Data layout

Default data root is **`~/.thinker`** (`general.dataDir`). Authoritative **`settings.json`** lives at the data root; when `dataDir` is customized, a mirror is also kept at **`~/.thinker/settings.json`** so the app can find `dataDir` on next launch.

| Path | Contents |
|---|---|
| `settings.json` | App settings (model keys, preferences, `dataDir`) |
| `state/catalog.db` | Workspace metadata |
| `state/session.json` | UI / window session |
| `checkpoints/` | Agent resume checkpoints (migrated with the data root) |
| `workspaces/<id>/chat.db` | Per-workspace chats |
| `logs/` | SQLite log shards |
| `skills/`, `mcps/`, `rules/` | Global skills / MCP / rules |
| `workspace/` | Default on-disk workspace folder (under bootstrap `~/.thinker`) |

Changing the root copies history into the new folder and always writes `settings.json` there; the previous root is left in place (copy, not delete). Older installs may still have checkpoints under Electron `userData/checkpoints` — those are moved into `<dataDir>/checkpoints` on startup.

## Rules & skills

Loaded at runtime into agent context (later roots override same skill name):

| Kind | Search order |
|---|---|
| **Rules** | `<dataDir>/rules/` → `<workspace>/.thinker/rules/` |
| **Skills** | `<dataDir>/skills/` → `<workspace>/.thinker/skills/` |

Rules: `.md` / `.mdc` / `.txt`. Skills: folder + `SKILL.md` with YAML frontmatter.

### Composer `/` and `@`

In the chat composer:

- Type `/` (after start of line or whitespace) to pick a **Skill**. Selecting inserts `/skill-name `; the engine already activates skills from that slash form.
- Type `@` to mention a **workspace file or folder** (recent + searchable paths, tree depth up to 12). Selecting inserts `@path` (folders keep a trailing `/`). On send, files are injected into context; folders contribute a listing plus a few small text files (size-capped). Esc or Space dismisses the picker and keeps a plain `@`.

## MCP (stdio)

Settings → **MCP** manages stdio servers. Config merge order (later wins same `id`):

1. `<dataDir>/mcps/*.json`
2. `<workspace>/.thinker/mcps/*.json`
3. Optional import from `mcp.json` (`mcpServers` map; Customize → Import)

Per-server fields: `id`, `name`, `enabled`, `transport: "stdio"`, `command`, `args`, `env`, optional `cwd`. Desktop pushes an enabled snapshot to the utility process; the engine connects with `@modelcontextprotocol/sdk` and exposes tools as `mcp__{serverId}__{toolName}`.

**Windows:** if the command is `npx` / `npm` / `node`, the app resolves `npx.cmd` (etc.) automatically; you can also enter `npx.cmd` explicitly.

Example filesystem server (via npx):

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

Disable a server in Settings to drop its tools; quitting the app should leave no orphan MCP child processes.

## Contributing

- Use **pnpm** only.
- Run `pnpm run check` before sending changes.
- Source comments / JSDoc in this repo should be **中文** (identifiers and i18n strings stay as they are).
