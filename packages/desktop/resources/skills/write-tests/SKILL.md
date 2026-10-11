---
name: write-tests
description: Add focused tests for the recent change or a named area.
disable-model-invocation: true
---

Write focused automated tests for the recent change (or the area I name).

## Conventions

- Runner: **Vitest** + `node:assert/strict` (`pnpm test`, config at repo-root `vitest.config.ts`).
- Location: put new files under the package’s `tests/` directory, mirroring the `src/` path (e.g. `packages/engine/src/model/retry.ts` → `packages/engine/tests/model/retry.test.ts`).
- Imports: `describe` / `it` / hooks from `vitest`; production code via relative `../../src/...`.
- Naming: `*.test.ts` only (no `*.spec.ts`, no tests under `src/`).
- Reports: use Vitest built-in HTML / coverage (`pnpm test:report`); do not invent a custom report UI.

Cover happy path plus one failure / edge case. Keep fixtures minimal. Prefer existing patterns in sibling tests under the same `tests/` tree.
