# Follow-ups

**English** | [简体中文](./docs/TODOS.zh-CN.md)

Deferred product backlog from the multi-session parallel architecture. Not committed for the current release — tracked here for prioritization. See also [README](./README.md).

Shipped admission queue (no longer listed below): one global FIFO. A send queues only when every parallel slot is taken, and a non-empty queue accepts new sends at the tail only. Model, mode, shell, permissions, and the workspace root are read at dispatch, not frozen at enqueue. The turn payload stays in the main-process memory; after quit or crash a leftover `queued` row becomes failed and is not replayed. HITL stays `running` and keeps its slot.

Shipped shell blocklist (no longer listed below): `shellBlocklist` on GeneralSettings is sent on hello and every run/resume. The engine refuses a blocked first token before unrestricted, allowlist, AI review, and HITL. Confirmation cannot whitelist it. A token on both lists is dropped from the allowlist.

---

## 1. Same-workspace concurrent mutation conflicts

| | |
|---|---|
| **Status** | Deferred |
| **Context** | Parallel runs across sessions are allowed, including when they share one workspace root. File tools (`edit_file` / `write_file` / …) have no cross-run locking or isolation. |

### Problem

Two (or more) active runs bound to the same workspace can interleave read–modify–write on the same paths. Outcomes include lost updates, torn edits, and confusing diffs in the UI timeline. Acceptable for v1 (failure mode is visible and rare for careful use), but incorrect for “two agents coding the same repo at once.”

### Directions to evaluate

Pick one product stance later:

- **Advisory path locks** — serialize mutating tools per absolute path (or directory) within the engine / Governor; non-mutating tools stay concurrent.
- **Workspace-scoped run mutex** — at most one mutating Agent-mode run per workspace; Ask/Plan may still parallelize.
- **Isolation via git worktree / shadow checkout** — each concurrent run gets an isolated tree; merge/reconcile is a separate product flow (high cost; only if we explicitly sell “parallel agents on one repo”).

### Acceptance sketch

- Concurrent mutating runs on the same path either serialize safely or are rejected with a clear error.
- UI surfaces which session holds / blocked on a contested path (or workspace).
- No silent overwrite of another run’s in-flight edit.
