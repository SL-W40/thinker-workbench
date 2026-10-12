# Follow-ups

Product-backlog items deferred from the multi-session parallel architecture. Not committed for the current release; tracked here for prioritization.

---

## 1. Same-workspace concurrent mutation conflicts

**Status:** Deferred  
**Context:** Parallel runs across sessions are allowed, including when they share one workspace root. File tools (`edit_file` / `write_file` / …) have no cross-run locking or isolation.

**Problem**

Two (or more) active runs bound to the same workspace can interleave read–modify–write on the same paths. Outcomes include lost updates, torn edits, and confusing diffs in the UI timeline. This is acceptable for v1 (failure mode is visible and rare for careful use) but is incorrect for “two agents coding the same repo at once.”

**Directions to evaluate (pick one product stance later)**

- **Advisory path locks** — serialize mutating tools per absolute path (or directory) within the engine / Governor; non-mutating tools stay concurrent.
- **Workspace-scoped run mutex** — at most one mutating Agent-mode run per workspace; Ask/Plan may still parallelize.
- **Isolation via git worktree / shadow checkout** — each concurrent run gets an isolated tree; merge/reconcile is a separate product flow (high cost; only if we explicitly sell “parallel agents on one repo”).

**Acceptance sketch**

- Concurrent mutating runs on the same path either serialize safely or are rejected with a clear error.
- UI surfaces which session holds / blocked on a contested path (or workspace).
- No silent overwrite of another run’s in-flight edit.

---

## 2. Session / run admission FIFO queue

**Status:** Deferred  
**Context:** `RunCoordinator` enforces `GeneralSettings.maxParallelRuns` (Settings → Permissions) and same-thread exclusivity by **rejecting** overflow with an explicit error. There is no global wait queue.

**Problem**

Users who hit the parallel cap (or a future resource gate) must stop a run or retry manually. A FIFO (or priority) queue would smooth bursts, but silent queuing obscures “is it running?”, cancel semantics, and model/mode changes made while waiting.

**Directions to evaluate**

- **Explicit queued state** — `runStatus: "queued"` (or equivalent) in session row + sidebar; user can cancel the queue entry without touching other runs.
- **Bounded queue** — max depth + timeout; overflow still fails visibly.
- **Admission policy** — FIFO by default; optional priority for foreground session or HITL-waiting runs.
- **No silent start** — dequeue must emit a clear transition (`queued` → `running`) and respect current session settings at start time (not at enqueue time), or freeze a settings snapshot at enqueue—document the chosen contract.

**Acceptance sketch**

- Over-cap send does not look like an active run until dequeued.
- Cancel while queued only drops that admission; does not cancel unrelated running sessions.
- Queue wait is observable (sidebar / toast / composer), with an upper bound and visible failure on expiry.
