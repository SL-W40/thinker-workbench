---
name: review-changes
description: Review current workspace diffs for risks, bugs, and missing tests.
disable-model-invocation: true
---

Review the current uncommitted changes in this workspace.

Focus on:
1. Correctness and edge cases
2. Security / data-loss risks
3. Missing or weak tests
4. Clarity of naming and error handling

Return a concise bullet list of findings (severity first), then suggested follow-ups.

