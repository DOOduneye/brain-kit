# External Comms, PRs, Commits

The agent's only external output to *other people* is opening a PR. GitHub/Slack conversations happen in the user's voice, not the agent's.

## Never act on the user's behalf

### GitHub — conversation

- Don't reply to review comments (Greptile, reviewers, bots). Surface the feedback in the terminal; fix the code; tell the user what changed. They decide how/whether to reply on GitHub.
- Don't mark review threads resolved.
- Don't leave emoji reactions on comments or PRs.
- Don't edit other people's comments or PR bodies.

### GitHub — state changes

- Don't approve PRs, request changes, or dismiss reviews.
- Don't merge (any method), close, or reopen PRs.
- Don't close or reopen issues.
- Don't add/remove labels, assignees, milestones, projects.
- Don't request reviewers.

### GitHub — CI management is fine

Re-running workflows, dispatching workflows, canceling runs — this is useful and welcome. The agent can manage CI freely, including via `/loop` to babysit failing checks. That's operational, not conversational.

### Slack and other messaging

- Never send messages. Never reply in threads. Never react.
- Drafting is okay when the user explicitly asks — save as draft only, don't send.

### Knowledge base

- Expected and desired. Edit KB articles, append to sessions, update issues, move kanban cards, run `brain` commands freely. This is the user's own workspace.

### Email, calendar, other external comms

- Never.

### The only external "voice" output

`gh pr create`, after the user asks for a PR. That's it. Everything else the PR triggers — comments, checks, threads — is the user's to reply to.

## Branch names

Short, descriptive, `<your-prefix>/<what-changed>`. 2–4 kebab-case words. No issue IDs, no dates, no ticket prefixes, no stack-position suffixes (`-v2`, `-part-1`, `-stack-2`), no area prefixes that duplicate what the diff already shows.

✅
- `you/metric-filter-validation`
- `you/account-finder-routing`
- `you/audience-filters`

❌
- `you/proj-031-broadcasts-metric-filters-v2`
- `you/fix-2026-04-23-broadcast-bug`
- `you/claude-auto-generated-pr-for-bug-fix`
- `you/feature/metric-filters`

## Commits

`<type>: <what changed>` subject, short body explaining *why*.

- Types: `fix`, `feat`, `refactor`, `perf`, `chore`, `test`.
- No AI attribution. No `Co-Authored-By: Claude`. No `Generated with Claude Code`. No emoji.
- Body is optional. When present, motivation — not a restatement of the diff.

✅
```
fix: ACL enforcement on SQL account search

The SQL path skipped the public-only filter the Elastic path applied.
Gate SQL results through the Elastic lookup so non-public accounts
drop before result construction.
```

❌
```
Update account.py

- modify _execute_via_sql
- modify _fetch_company_name_domain

Co-Authored-By: Claude <noreply@anthropic.com>
🤖 Generated with Claude Code
```

## The two failure modes

Write for a reviewer who knows the codebase generally but not this specific path. There are two ways to miss:

**Too vague.** `Improve perf`, `Fix SQL bug`, `Refactor runner`. Says *something happened* without saying *what*. Reviewer has no shape to evaluate.

**Too internal.** `Flip health-status-transitions CTE to PK-driven join`. Reads like a note-to-self — every word is a function/flag/table name. Looks specific but the reviewer has to grep before any of it parses. Internal jargon dressed as clarity.

The middle: **what user-visible or system-visible behavior is changing**, in plain language, with mechanism only as far as it earns its place.

| Too vague | Too internal | Right |
|---|---|---|
| Improve health query perf | Flip health-status-transitions CTE to PK-driven join | Stop the health timeline from timing out on large orgs |
| Fix SQL bug | Drop unused bind params from any-owned-by predicate | Fix 500 on views with an "any owned by" filter |
| Refactor parity runner | Per-filter activity + error classification in audit-filter-parity | Surface real signal in parity audits instead of pool-exhaustion noise |

Internal symbol names earn their place when the change *is* that symbol — a rename, a one-line bug in a specific function, a flag flip.

## PR body

**Lead with the user- or system-visible problem in one plain sentence**, then the fix shape, then mechanism only as far as the reviewer actually needs to approve the change. A reviewer doesn't need the JOIN filter SQL to evaluate a perf fix — they need to know what was timing out and that the new shape is bounded.

If you're writing a debugging journal — what you reproduced, what EXPLAIN ANALYZE said, which org, which filter — you're writing for yourself. That's a good *issue note*, not a PR description.

Trivial change: 1–2 sentences. Non-trivial: a short paragraph. Every line earns its place by reducing reviewer confusion, not by recording what you saw. No `## Summary`, `## Test plan`, headers, bullets, checkbox lists, `Co-Authored-By: Claude`, `🤖 Generated with Claude Code`.

✅ (trivial — system-visible behavior, not internal name)
```
Filters with no value support in the compiler were silently matching
every account in the org. Reject those rows instead.
```

✅ (perf fix — user-visible problem, then fix shape, mechanism last)
```
The health timeline was hitting the 60s statement timeout on large
orgs that use the SQL backend. The query was scanning per-property
rows for every accessible account; rewritten to look up properties by
primary key after the access check. 60s timeout → 459ms on the
failing case.
```

❌ (same fix, written from inside the code)
```
Health-status-transitions SQL path was hitting the 60s statement
timeout in prod after #21088 gated it behind SQL_VIEW_ACCOUNTS.
Reproduced with org_X + relationship=customer filter — planner
estimated `accessible` at 1 row and picked a Nested Loop whose Join
Filter was COALESCE(...). Restructured to drive from `accessible` →
expand to physical account ids → join LCP via the unique PK index.
```
Why it fails: every noun is an internal name. Reviewer can't tell what's user-visible without grepping.

## Responding to review feedback

1. Read the feedback.
2. Decide if it's valid. If it's wrong or stale, surface that to the user — don't dismiss it on GitHub.
3. If valid, fix the code.
4. Tell the user in the terminal what changed, which comment each fix addresses, the commit SHA.
5. Stop. Don't reply on GitHub. Don't mark threads resolved.
