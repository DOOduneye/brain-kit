---
name: brain-dev
description: Knowledge-backed dev workflow. Two containers — docs/ for what stays true, work/ for what is in flight. Read before investigating, write findings back, hand off at the end. Use when working on any non-trivial dev task in a project that has a brain-kit knowledge base.
---

# Dev Workflow

Every session forgets. The vault is shared memory: read it before investigating,
write findings back before you finish, and the next session starts where this
one ended.

## Where things go

One question:

> **Will this still be true in six months regardless of what ships?**

Yes → `docs/`. No → `work/`.

That is the whole filing system. There are no issue IDs, no projects, no
kanban, and no status fields. A work item is a file that stops mattering, not a
record that must be closed.

```
docs/<topic>.md       how something works. Architecture, mechanisms,
                      permanent gotchas. No dates, no PR numbers.
work/<slug>.md        one thing in flight, with its accumulated context
work/todo.md          one-liners. Line order is priority.
archive/              brain done <name> moves finished work here
```

If a line in `todo.md` grows a paragraph, it has outgrown that file — make
`work/<slug>.md` and move it there.

## How to talk about the vault

This matters more than it sounds.

**Vault vocabulary is input, not output.** Filenames, paths, and slugs are how
*you* find things. They mean nothing to the person reading your answer. Do not
put them in an explanation unless you were asked about the vault itself. Say
what is true about their system, not where you read it.

**Articles are a starting hypothesis, not evidence.** They were true when
written. Verify against the code before acting on one, and say plainly when the
two disagree — a stale article that goes unchecked is worse than no article,
because it looks like knowledge.

Never let reading the vault substitute for reading the code. It narrows where
you look; it does not tell you what is there now.

## The loop

```bash
brain work                  # what's in flight — start here
brain query "<topic>"       # search before opening code
brain log "<finding>"       # non-obvious discoveries, as you make them
brain handoff [topic]       # end of session
```

Next session opens with `brain pickup`.

`brain log` is the habit that makes the rest work. A session that discovers
something and does not record it has spent the effort twice.

## Thinking in mechanisms

Every bug is a causal chain. Symptoms point at mechanisms. The mechanism is what
you fix — and it is what belongs in `docs/` afterwards.

The failure mode is answering the symptom:

```
symptom              the wrong question       the right question
───────────────────  ───────────────────────  ──────────────────────────────
slow query           "add an index?"          why is the query shaped this
                                              way? N round trips that should
                                              be one? fetching rows to count
                                              them in application code?

workflow stuck       "retry it?"              is this deterministic? what
                                              does this framework do with an
                                              error it does not recognise?

data wrong           "add validation?"        where does raw data enter, and
                                              what is not parsed at that
                                              boundary?

dependency failing   "add a retry?"           what happens to everything else
                                              while this one is down?
```

Name the mechanism first. Then investigate the code with that framing loaded.
Then, if the mechanism is durable, write it to `docs/` — that is the article
that saves the next session.

## What to write down, and what not to

Write:

- how a system works, once you actually understand it
- a gotcha that will still be true next year
- a general pattern, with the reasoning that makes it transferable

Do not write:

- inventories of flags, providers, endpoints — the code is the inventory and
  your copy goes stale immediately
- investigation logs and fix history — that is `work/`, and it is archived when
  the work is done
- roadmaps and "where this is going"
- anything you have not verified
