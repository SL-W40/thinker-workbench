---
name: create-skills
description: Create Thinker Workbench skills (SKILL.md, discovery paths, slash menu). Use when asked to create a skill, write SKILL.md, add /slash skills, or mentions create-skills / 创建 skill.
disable-model-invocation: false
---

# Create Thinker Skills

Author Agent Skills that Thinker Workbench can discover, list under Composer `/`, and activate via `/skill-name`.

## Discovery paths (later overrides same name)

| Priority | Path | Scope |
|---|---|---|
| 1 | `<dataDir>/skills/<name>/SKILL.md` | Thinker user / global (default dataDir `~/.thinker`) |
| 2 | `<workspace>/.thinker/skills/<name>/SKILL.md` | Thinker workspace |

### Where to write (ask if unclear)

- **This repo / shared with git** → `.thinker/skills/`
- **All Thinker workspaces on this machine** → `<dataDir>/skills/` (usually `~/.thinker/skills/`)

## Required layout

```
<skills-root>/
  my-skill-name/
    SKILL.md          # required
    reference.md      # optional, progressive disclosure
    scripts/          # optional
```

- Folder name ≈ skill `name` (lowercase, hyphens).
- File must be named `SKILL.md` (case-insensitive on scan).
- Keep `SKILL.md` concise; link out for long reference.

## Frontmatter (Thinker parser)

```markdown
---
name: my-skill-name
description: >-
  Third-person WHAT + WHEN. Include trigger keywords (EN/中文 OK).
  Max ~1024 chars. Required — empty description → skill ignored at runtime.
disable-model-invocation: true
paths:
  - "**/*.ts"
globs:
  - "packages/**"
---

# Title

Instructions for the agent…
```

| Field | Required | Notes |
|---|---|---|
| `name` | yes | `[a-z0-9-]+` after normalize; used as `/name` |
| `description` | **yes** | Non-empty string. Supports `>`, `>-`, `\|` block scalars |
| `disable-model-invocation` | no | `true` = slash-only (`/name`); omit/`false` = may auto-attach when paths/text match |
| `paths` / `globs` | no | Glob list; if set, auto-activation needs a match against latest user text |

### Description rules

- Third person (“Reviews MRs…”, not “I review…”).
- Include **what** + **when** + trigger terms users will type.
- Prefer `description: >-` for multi-line.

### Invocation

- Slash: user types `/my-skill-name` (Composer menu inserts this).
- Auto: only if `disable-model-invocation` is not true **and** (`paths`/`globs` empty or match).

## Workflow

1. Confirm **name**, **scope/path**, **slash-only vs auto**, **triggers**.
2. Create `<root>/<name>/SKILL.md` with valid frontmatter + body.
3. Verify:
   - `name` matches folder
   - `description` non-empty
   - no secrets in the skill body
4. Tell user to open Composer and type `/` — new skill should appear (may need app refresh if just synced).

## Minimal template

Copy and fill:

```markdown
---
name: example-skill
description: >-
  Does X when the user asks about Y. Triggers: example-skill, Y, 相关中文词.
disable-model-invocation: true
---

# Example Skill

## Instructions

1. …
2. …

## Output

Describe the expected deliverable format.
```

## Thinker-specific pitfalls

- Missing `description` → listed maybe, **not loaded** into agent context.
- `description: >-` must have indented continuation lines (Thinker supports `>`, `>-`, `|`, `|-`).
- Bundled/app skills live under dataDir after sync; **do not** edit `packages/desktop/resources/skills/` unless changing the product built-in.
- Prefer Chinese comments in repo **code**; skill **body** may be English (agent-facing) with Chinese triggers in `description`.
