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

Then open **Settings → Model** and set an OpenAI-compatible **API key**, **base URL**, and **model**. Keys are encrypted at rest with OS `safeStorage` under `~/.thinker/settings.json`.

| Script | Purpose |
|---|---|
| `pnpm run dev` | Product desktop stack (shared → logger → engine → desktop → renderer → Electron) |
| `pnpm run build` | Build all packages (including renderer) |
| `pnpm run build:node` | Build without renderer |
| `pnpm start` | Electron against the last build |
| `pnpm run check` | Biome lint + format check |
| `pnpm run format` / `pnpm run lint` | Format write / lint only |
| `pnpm run dev:logger:web` | Standalone log viewer → http://127.0.0.1:5181 |
| `pnpm run pack:zip` | Zip the repo (respects `.gitignore`) |

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

Bootstrap settings always live at **`~/.thinker/settings.json`** (even if you move the data dir). Default data root is **`~/.thinker`** (`general.dataDir`):

| Path | Contents |
|---|---|
| `catalog.db` | Workspace metadata |
| `workspaces/<id>/chat.db` | Per-workspace chats |
| `logs/` | SQLite log shards |
| `skills/`, `mcps/`, `rules/` | Global skills / MCP / rules |
| `workspace/` | Default on-disk workspace folder |

## Rules & skills

Loaded at runtime into agent context (later roots override same skill name):

| Kind | Search order |
|---|---|
| **Rules** | `<dataDir>/rules/` → `<workspace>/.thinker/rules/` → `<workspace>/.cursor/rules/` |
| **Skills** | `<dataDir>/skills/` → `<workspace>/.thinker/skills/` → `<workspace>/.cursor/skills/` |

Rules: `.md` / `.mdc` / `.txt`. Skills: Cursor-style `SKILL.md`.

Repo `.cursor/rules/` files are **contributor conventions** for this monorepo (e.g. Chinese source comments, design-system usage); they are not the app’s runtime rule roots unless copied into the paths above.

### Composer `/` and `@`

In the chat composer:

- Type `/` (after start of line or whitespace) to pick a **Skill**. Selecting inserts `/skill-name `; the engine already activates skills from that slash form.
- Type `@` to mention a **workspace file** (recent files + searchable paths). Selecting inserts `@path/to/file` (quoted if the path has spaces). On send, paths become `contextPaths` and the engine injects file contents into the run context (size-capped; binary/oversize files are skipped with a note).

## MCP (stdio)

Settings → **MCP** manages stdio servers. Config merge order (later wins same `id`):

1. `<dataDir>/mcps/*.json`
2. `<workspace>/.thinker/mcps/*.json`
3. Optional import from Cursor `mcp.json` (Settings → Import)

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
