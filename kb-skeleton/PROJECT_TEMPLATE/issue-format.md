# Issue Format

Issues must be agent-executable. An agent should be able to pick up an issue and implement it without asking clarifying questions.

The substitutable skeleton lives at `issue-template.md` — `brain issue-create` reads it and replaces `{{id}}`, `{{title}}`, `{{today}}`, `{{slug}}` placeholders. This file documents what the resulting issue should contain.

## Frontmatter

```yaml
id: PROJ-007                              # auto-assigned via brain next-id
title: Short descriptive title
status: backlog | todo | in-progress | blocked | done | wont-fix
priority: critical | high | medium | low
area: <subarea>                           # optional sub-area within the project
reported: 2026-04-07
assignee: name | null
tags: [bug, feature, refactor, etc.]
slack: https://slack-link-if-relevant     # optional, drop if not used
branch: you/branch-name-when-started
```

## Sections

### Problem
What's broken or missing, and why it matters. Not symptoms — the mechanism. Link to threads, screenshots, error logs.

### Solution
Specific enough to implement. Covers:
- Data model changes (new columns, new tables, migrations)
- Behavior per state (what happens when X, when Y)
- Data retention on changes (what happens to existing data)
- UI changes (high-level, not pixel-perfect)
- v1 scope — YAGNI, explicitly list what's deferred

### Files
Paths with line references and patterns to follow. Code pointers over prose.

### Boundaries
What's out of scope. What to ask the user before starting. What assumptions are being made.

### Acceptance Criteria
Concrete, testable checkboxes.

### Related
Wiki links to project articles, library patterns, other issues.

## Draft Process

When drafting a new issue (Mode 2):
1. Search KB first — `brain query` for prior issues, patterns, design decisions
2. Explore codebase — understand architecture before proposing
3. Ask design questions one at a time — granularity, defaults, modes/states
4. Force edge case answers — data retention on state change, toggle behavior, backfill
5. Propose with recommendation — 2-3 options with tradeoffs, lead with your pick
6. Keep v1 minimal — YAGNI, explicitly list what's deferred
