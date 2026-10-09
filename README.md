# Thinker Workbench

**Local-First AI Workbench** — Electron monorepo for hand-rolling an agent loop in a **utilityProcess**.

## Packages

| Package | Role |
|---|---|
| `@thinker-workbench/shared` | Cross-process contracts |
| `@thinker-workbench/markdown` | Homemade Markdown AST + React view |
| `@thinker-workbench/engine` | Graph engine (utilityProcess) |
| `@thinker-workbench/desktop` | Electron shell + bridge |
| `@thinker-workbench/renderer` | React UI (+ Tools window) |
| `@thinker-workbench/logger-web` | Log / trace viewer |

## Scripts

```bash
pnpm install
pnpm run dev            # Product desktop stack (watch + Electron)
pnpm run dev:logger:web # Logs → http://127.0.0.1:5181
pnpm run build
pnpm start              # Electron against last build
pnpm run check          # Biome lint + format check
```

Hand-write the graph under `packages/engine/src/graph/`.
