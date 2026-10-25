# Follow-ups

**English** | [简体中文](./docs/TODOS.zh-CN.md)

Deferred product backlog from the multi-session parallel architecture. Not committed for the current release — tracked here for prioritization. See also [README](./README.md).

Shipped admission queue (no longer listed below): one global FIFO. A send queues only when every parallel slot is taken, and a non-empty queue accepts new sends at the tail only. Model, mode, shell, permissions, and the workspace root are read at dispatch, not frozen at enqueue. The turn payload stays in the main-process memory; after quit or crash a leftover `queued` row becomes failed and is not replayed. HITL stays `running` and keeps its slot.

Shipped shell blocklist (no longer listed below): `shellBlocklist` on GeneralSettings is sent on hello and every run/resume. The engine refuses a blocked first token before unrestricted, allowlist, AI review, and HITL. Confirmation cannot whitelist it. A token on both lists is dropped from the allowlist.

Shipped advisory path locks (no longer listed below, formerly item 1): mutating file tools (`write_file` / `edit_file` / `delete_file`) serialize per **normalized absolute path** inside the engine (`tools/shared/pathLock.ts`); read-only tools never queue. A second writer on the same path waits up to 5s and then fails with an explicit “another session is still writing” error instead of silently clobbering; different paths stay fully parallel. The lock has a single granularity with no nested acquisition, so it cannot deadlock, and it always releases on error.

---

*No remaining deferred items. New candidates: none.*
