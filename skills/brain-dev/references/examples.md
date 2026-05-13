# Worked Examples

Three sessions showing how each mode plays out. The specifics are illustrative — replace project names, IDs, and file paths with your own.

---

## Example 1: Backfill an attribute (Mode 3)

**Trigger:** User named a specific issue and said "just do a backfill."

### Flow

1. **Brief + pick issue** — `brain brief` showed PROJ-015 in-progress with branch `you/dual-write-attachments`. Read it with `brain issue PROJ-015`. Status was already in-progress, so this was a resume.

2. **KB context** — `brain query "attachments flatten"` found the project article with architecture notes. Project article loaded the relevant gotchas.

3. **Investigate** — DB read-only query to check production scope. User pivoted: "help me figure out all the functions I need to update." Switched to `Grep("AttachmentModel")` — 9 files, then `Read` on each to map callers.

4. **Plan** — Wrote the plan. Dispatched two parallel agents for code structure + test patterns. Wrote the plan, exited plan mode for approval.

5. **Session ended at plan gate** — implementation deferred to next session.

### Key decisions
- Skipped brainstorming — user specified the approach
- Parallel agents during planning — code structure + test patterns simultaneously
- Explicit scope deferral — noted that follow-up cleanup was a separate PR

---

## Example 2: Speed up investigation phase (Mode 1)

**Trigger:** "context gathering is always slow for this process, how can we speed it up?"

### Flow

1. **Receive context** — Parsed inline. The problem: the Investigate phase was entirely sequential.

2. **Investigate** — Read the skill itself. One exploration agent found prior patterns. Collapsed investigation and planning into one step — the sequential ceremony was exactly the problem.

3. **Plan** — Two-wave parallel structure: Wave 1 launches 2-3 exploration agents simultaneously, Wave 2 launches parallel production checks. Total time: ~2.5 minutes.

### Key decisions
- No KB interaction — this was a meta-problem about the skill itself
- Single exploration agent — needed pattern research, not code tracing
- Stayed in plan mode — task was "redesign the skill" not "implement it"

---

## Example 3: Skill bug (Mode 2)

**Trigger:** "what's wrong with this skill, why does it not create worktrees?"

### Flow

1. **Investigate the skill** — Loaded the skill file. Confirmed the built-in tool exists. **Root cause:** skill referenced a manual worktree pattern instead of the built-in `EnterWorktree` tool.

2. **KB context** — `brain query "worktree"` found no prior articles. This was a new discovery.

3. **Draft** — First draft was too narrow. User rejected it, clarifying three distinct modes: (1) do it, (2) draft an issue, (3) work an existing issue as a living document.

4. **Revised draft** — Three-mode architecture. Replace manual worktree with the built-in tool. Rename skill. Broader triggers.

### Key decisions
- No production investigation — skill design bug, not production data
- User feedback drove revision — first draft rejected, second became the architecture
- Filed learning — the built-in vs manual worktree distinction was documented for future sessions
