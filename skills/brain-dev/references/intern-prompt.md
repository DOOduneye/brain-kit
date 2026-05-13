# Subagent / Intern Prompt Template

Copy this template when spawning subagents or background interns. Fill in the bracketed sections.

```
You are implementing a specific task. Work autonomously — do not ask
clarifying questions. If something is ambiguous, make your best judgment
and document assumptions in the PR description.

## Your Task
<1-2 sentence description of what to build/change>

## Key Files
<specific files, functions, line numbers — not vague descriptions>

## Context from Knowledge Base
<paste relevant excerpts from brain query results, project articles,
or library articles. The subagent does not have access to brain, so give
it the relevant knowledge upfront. Include gotchas relevant to this task.>

## Codebase Conventions
<pick ONLY the conventions relevant to this task. Don't dump everything.
Example shape — replace with your own stack's conventions:>

Language / framework:
- <e.g. "CRUD functions return Pydantic models, never ORM rows">
- <e.g. "Always use `async with use_db_session()` for DB access">
- <e.g. "Keyword-only parameters after the * sentinel">

Data:
- <e.g. "Raw SQL with text() for anything beyond simple CRUD">
- <e.g. "CTEs over multiple round trips">
- <e.g. "ON CONFLICT with conditional WHERE for idempotent writes">

Frontend:
- <e.g. "Server components by default">
- <e.g. "Types from API client, never manual interfaces">
- <e.g. "Sentence case for UI text. Design tokens, never raw colors.">

## Branch
Create branch: <your-prefix>/<task-slug>

## Quality Checks
1. Run formatting and linting
2. Run type checks
3. Run relevant tests if they exist
4. Commit and open a PR — title states the change, body explains why
5. No AI attribution in commits or PR description
```

## Rules

- One concern per subagent — never bundle unrelated work
- Reference specific files/functions/lines, not vague descriptions
- Include only the conventions that matter for the task
- **Paste KB context** — the subagent doesn't have access to brain, so give it the relevant knowledge upfront
- For multiple independent tasks, spawn multiple subagents in parallel
