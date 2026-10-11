---
name: create-rule
description: >-
  Create Thinker project rules (.md / .mdc) for persistent agent guidance.
  Use when asked to create a rule, add coding standards, set up conventions,
  configure alwaysApply / globs, edit .thinker/rules, or AGENTS.md.
  Triggers: create-rule, 创建规则, rules, .mdc, alwaysApply.
disable-model-invocation: false
---

# Create Thinker Rules

Author rules that Thinker injects into the agent context.

## Discovery paths (engine load order)

| Priority | Path | Scope |
|---|---|---|
| 1 | `<dataDir>/rules/` | Thinker user / global (default dataDir `~/.thinker`) |
| 2 | `<workspace>/.thinker/rules/` | Thinker workspace |

Engine recursively loads `.md` / `.mdc` / `.txt` and concatenates them into the system prompt (always-on for a session).

Do **not** put Thinker product built-ins by hand-editing only the installed dataDir copy — change `packages/desktop/resources/rules/` when shipping a new default rule with the app.

### Where to write (ask if unclear)

- **This repo / shared with git** → `.thinker/rules/`
- **All Thinker workspaces on this machine** → `<dataDir>/rules/` (usually `~/.thinker/rules/`)
- **Editable in Thinker Customize → Rules UI** → prefer **`.md`** under user/workspace Thinker roots (UI scanner is `.md` only)

## File formats

### `.mdc` with frontmatter

```
.thinker/rules/
  my-convention.mdc
```

```markdown
---
description: Short summary
globs: "packages/**/*.ts"
alwaysApply: false
---

# Title

Actionable instructions for the agent…
```

| Field | Required | Notes |
|---|---|---|
| `description` | recommended | What the rule enforces |
| `alwaysApply` | no | `true` = every session; `false` / omit = file-scoped via `globs` |
| `globs` | when not always | File pattern(s) for file-scoped rules |

Thinker currently **concatenates rule file bodies** into context (frontmatter stays in the text). Keep bodies self-contained and short.

### Thinker Customize `.md`

```
.thinker/rules/
  my-convention.md
```

Plain markdown (optional YAML frontmatter). Writable via Customize → Rules. Extension must be `.md` for the Customize list/upsert API.

## Gather requirements

Before writing:

1. **Purpose** — what to enforce or teach
2. **Scope** — always on vs file-specific
3. **Globs** — if file-specific, which patterns

### Infer from context

If the chat already decided scope/patterns, do **not** re-ask. Create multiple focused rules when topics differ.

### Ask when missing

- Always apply vs specific files?
- If specific: which globs (e.g. `packages/renderer/**/*.tsx`)?

## Best practices

- **Under ~50 lines** of body; one concern per file
- Actionable (“do / don’t”), not essay
- Prefer concrete BAD / GOOD examples
- Comments in **code** stay Chinese per project rules; rule **body** may be Chinese or English — prefer Chinese for this product’s team conventions

## Workflow

1. Confirm **name**, **path/scope**, **alwaysApply vs globs**, **triggers/topics**.
2. Create the file with correct extension and frontmatter (for `.mdc`).
3. Verify:
   - filename is descriptive (`tests.mdc`, not `rule1.mdc`)
   - `alwaysApply: true` **or** non-empty `globs`
   - no secrets
4. Tell the user to start a new chat / refresh Customize if the rule does not appear yet.

## Minimal templates

### Always-on

```markdown
---
description: Core standard that always applies
alwaysApply: true
---

# Title

- Do …
- Do not …
```

### File-scoped

```markdown
---
description: Conventions for matching files
globs: "packages/**/*.ts"
alwaysApply: false
---

# Title

## Examples

\`\`\`ts
// BAD
…

// GOOD
…
\`\`\`
```

## Thinker-specific pitfalls

- Customize Rules UI lists/edits **`.md` only**; `.mdc` under `.thinker/rules` still loads in the agent via `loadRules`, but won’t show as writable Customize items.
- Bundled default rules ship from `packages/desktop/resources/rules/` into dataDir; don’t document those as the place for user project rules.
- Prefer small rules over one giant AGENTS.md; if the user asks for AGENTS.md, keep it a short pointer and put details in `.thinker/rules/`.
