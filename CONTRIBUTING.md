# Contributing to Thinker Workbench

**English** | [简体中文](./CONTRIBUTING.zh-CN.md)

Thanks for contributing. Product overview, setup, scripts, and architecture are in [README.md](./README.md). Deferred backlog: [TODOS.md](./TODOS.md).

## Ground rules

- License: [Apache-2.0](./LICENSE). Contributions are under the same terms.
- Prefer small, single-concern PRs. Keep discussion respectful and on-topic.
- Do not commit secrets, `.env`, or anything under `~/.thinker`.
- **pnpm only** (version pinned by `packageManager` in the root `package.json`).

## Workflow

1. Branch from the default branch (`feat/…`, `fix/…`, `docs/…`, `refactor/…`, `test/…`).
2. Keep the diff scoped.
3. Before opening a PR, run:

```bash
pnpm run check
pnpm test
```

CI (`.github/workflows/check.yml`) runs `pnpm check` on push and pull requests.

4. Open a PR with a short **Summary** (what / why) and a **Test plan** (commands or manual checks).

## Coding standards

These match the repo’s existing conventions:

| Area | Expectation |
|---|---|
| Comments / JSDoc | **中文** — identifiers, IPC names, i18n strings, and model prompts stay as they are |
| UI (`packages/renderer`) | Prefer `@thinker-workbench/design/react`; shared controls live in `packages/design` (catalog: `#/components`) |
| User-facing copy | i18n: `messages/en.ts` + `zh.ts` |
| Lint / format | Biome via `pnpm run check` |

### Tests

Changing behavior, boundaries, or public API under `packages/*/src/**` means updating or adding tests in the **same change**.

- Path: `packages/<pkg>/tests/` mirroring `src/` (e.g. `src/model/retry.ts` → `tests/model/retry.test.ts`)
- Name: `*.test.ts` only (not beside `src/`, not `*.spec.ts`)
- Stack: Vitest + `node:assert/strict`
- Cover the happy path and at least one failure / edge case

Pure copy / style / comment-only edits may skip tests.

### Commits

- Prefer conventional subjects: `feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:`.
- Explain **why** in the body when the change is non-obvious.
- Do not force-push shared default branches or skip hooks unless a maintainer asks.
- Do not commit generated `artifacts/` or `release/`.

## Issues

Search existing issues first. Bug reports need: repro steps, expected vs actual, OS, Node/pnpm versions, and whether it happens under `pnpm run dev` or a packaged build.

For security-sensitive reports, prefer contacting maintainers privately — never post secrets in public issues.

## Questions

If this guide conflicts with scripts or CI, trust the repo, then open a docs PR.