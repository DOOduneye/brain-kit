# Knowledge Base

Shared memory across agent sessions. Read by any agent CLI that follows the
`AGENTS.md` convention.

## Where things go

One question decides it:

> **Will this still be true in six months regardless of what ships?**

```
yes  →  docs/          how something works. Architecture, mechanisms,
                       permanent gotchas. No dates, no PR numbers.

no   →  work/          one file per thing in flight, named by slug:
                       work/drag-sensor-crash.md
        work/todo.md   one-liners that don't need a file yet.
                       Line order is priority.
```

Everything else:

```
archive/    finished work. `brain done <name>` moves it here.
journal/    the user's notes, not yours.
sessions/   your session logs and handoff docs.
raw/        clipped sources, input to /compile.
output/     extraction reports and scratch query results.
```

There are no issue IDs, no projects, no kanban, and no status fields. A work
item is a file that stops mattering, not a record that must be closed.

## Talking about this vault

Filenames and paths here are **input, not vocabulary**. Do not put slugs, file
paths, or vault structure into an explanation unless the user asked about the
vault itself. Say what is true about their system, not where you read it.

Articles are a **starting hypothesis, not evidence**. Verify against the code
before acting on one, and say so when they disagree. A stale article that goes
unchecked is worse than no article.

## Session loop

```bash
brain work                     # what's in flight, oldest flagged
brain query "<topic>"          # search before opening code
brain log "<finding>"          # non-obvious discoveries, as you make them
brain handoff                  # end of session
brain pickup                   # start of the next one
```

Write findings back. A session that discovers something and doesn't record it
has spent the effort twice.

Full help: `brain --help`.
