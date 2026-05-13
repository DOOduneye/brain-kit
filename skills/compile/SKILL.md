---
name: compile
description: "Compile knowledge base articles from raw sources. Use when asked to research a topic, create a wiki article, compile knowledge, write a library article, or document a concept/tool/pattern/system. Triggers on: compile, wiki, knowledge base, KB article, research and document, library article."
---

# Compile Knowledge Base Article

Two-step compilation of raw sources into a structured library article. Never single-pass — it always produces surface-level output.

## When to Use

- User asks to research and document a topic
- User asks to compile a KB article
- User asks to write a library/wiki article
- User invokes `/compile`
- User says "time to save and document"

## The Pipeline

```
1. Check existing KB    →  brain query, brain status
2. Check raw/ vault     →  find raw sources already saved
3. Gather more sources  →  WebFetch for URLs, web search for gaps
4. Extract (Step 1)     →  Agent reads ALL sources, produces extraction report
5. Write (Step 2)       →  Agent writes article from extraction + format spec
6. Index                →  Update library/index.md, reindex any search index
```

**Every step is mandatory. Do not skip steps or combine 4+5 into one pass.**

## Step 1: Check What Exists

Before touching the web, check the vault:

```bash
brain query "<topic>"
brain find "*<topic-slug>*"
brain read library/index.md      # see existing categories
```

If an article already exists, this is an UPDATE not a CREATE. Read the existing article first.

## Step 2: Gather Raw Sources

Check `raw/` first — the user may have already clipped or bookmarked sources:

```bash
brain find "*<topic>*"           # checks the whole vault
```

Read every matching file. These are your primary sources.

Then supplement with web fetches for gaps. Use WebFetch on specific URLs the user provides or authoritative sources (official docs, Wikipedia, engineering blogs).

**Save raw sources** to the vault if they came from the web:

```
raw/clips/<slug>.md      # web clips
raw/articles/<slug>.md   # longer articles
```

With frontmatter:
```yaml
---
source_url: https://...
source_type: clip | article
ingested: YYYY-MM-DD
origin: web-fetch
tags_from_source: []
---
```

## Step 3: Extract (Mandatory Separate Step)

Dispatch an agent to read ALL raw sources and produce a structured extraction report. The agent prompt must demand these categories:

1. **The full mental model** — complete, not summarized
2. **Non-obvious interactions** — things scattered across sources
3. **Production gotchas** — things that bite you, not obvious from docs
4. **Configuration that matters** — where defaults are wrong
5. **The *why* behind design decisions** — enables reasoning about edge cases
6. **Connections to other concepts** — cross-links to existing library articles
7. **Mandatory patterns** — required for correct behavior, not best practices

The extraction output goes to `output/<topic>-extraction.md`.

**Quality bar**: aim for exhaustive, not concise. Long, structured extractions produce better articles. A canonical extraction is hundreds of lines with 15+ gotchas.

Pass the FULL text of all sources to the agent — don't summarize or truncate.

## Step 4: Write (Separate Agent, Uses Extraction)

Dispatch a second agent with:
- The full extraction report
- The article format spec (below)
- Instructions to write to `library/<category>/<slug>.md`

### Article Categories

| Category | When | Example |
|----------|------|---------|
| `concepts/` | General CS/engineering concept | event-sourcing, time-series, cap-theorem |
| `tools/` | Specific tool or framework | fastapi, clickhouse, redis |
| `patterns/` | Design pattern | circuit-breaker, bulkhead, retry |
| `systems/` | Large system/platform | temporal, kafka |
| `guides/` | Synthesized essay across concepts | thinking-in-data, thinking-in-systems |

### Article Format

```yaml
---
type: concept | tool | pattern | system | guide
tags: [relevant, tags]
sources:
  - raw/path/to/source1.md
  - raw/path/to/source2.md
related:
  - "[[concepts/existing-article]]"
  - "[[tools/related-tool]]"
updated: YYYY-MM-DD
---
```

**Structure** (use natural headings, not these labels):
1. **Quick Reference** — italic summary, quick-ref table, scannable in 10 seconds
2. **Core Concepts** — Wikipedia-depth. How it works, why it's designed that way
3. **How It Compares** — alternatives, tradeoffs, decision heuristics
4. **Patterns & Gotchas** — production gotchas woven into narrative, not listed as footnotes
5. **Connections** — cross-links to related library articles using `[[wiki-links]]`

**Style rules**:
- Lead with *why*, then *how*, then *what goes wrong*
- Prose that flows, not a reference dump
- Tables and code blocks embedded where contextually relevant
- Gotcha callout boxes (`> **Gotcha:**`) that prevent specific mistakes
- Cross-link every mention of a related concept
- ALL gotchas from the extraction must appear in the article
- Target: 400-800 lines for concepts, 800-1200 for systems/tools

### Writing Agent Prompt Template

```
You are writing a knowledge base article. Write to <path>.

Style: read library/concepts/<reference-article>.md for tone (first 50 lines is enough).

Format: [paste frontmatter template with filled values]

Rules:
- Lead with why, then how, then what goes wrong
- Prose flow, not reference dump
- Weave ALL N gotchas into narrative sections as callout boxes
- Cross-link with [[wiki-links]]
- Target M lines

Here is the extraction report:
[paste full extraction]
```

## Step 5: Index

After the article is written:

1. Update `library/index.md` — add one-line entry in the right category section
2. Stamp the extraction with its destination so drift detection is accurate. Add YAML frontmatter to `output/<topic>-extraction.md`:
   ```yaml
   ---
   type: extraction
   compiled_into: library/<category>/<slug>.md
   extracted: YYYY-MM-DD
   ---
   ```
3. If you use an external search index (qmd, etc.), trigger a reindex.

Also update the `related:` frontmatter of articles that should link back to this new one (check the extraction's "Connections" section).

## Parallel Compilation

When compiling multiple articles at once:
- Run Step 3 (extract) in parallel for all topics
- Run Step 4 (write) in parallel for all topics
- Run Step 5 (index) once at the end for all

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Single-pass (read sources → write article) | ALWAYS two-step: extract first, then write from extraction |
| WebFetch before checking vault | Check `raw/` and `brain query` FIRST |
| Summarizing sources for the agent | Pass FULL text of all sources |
| Listing gotchas in a separate section | Weave into narrative with callout boxes |
| Skipping the index update | Always update `library/index.md` |
| Not reading the SKILL.md | This is your process. Follow it exactly. |
