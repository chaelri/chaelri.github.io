---
description: Review stale knowledge MDs and propose patches based on recent edits
---

# /sync-knowledge

Goal: keep `knowledge/**/*.md` in sync with the actual codebase by reviewing recent edits Charlie made and proposing patches to any MDs that reference the changed files.

## Steps

1. **Read the stale log.** Open `.claude/knowledge-stale.md`. If it doesn't exist or is empty, tell Charlie there's nothing to sync and exit.

2. **For each entry** (each `## <timestamp>` block):
   - Get the edited file path
   - Get the list of knowledge MDs that reference it
   - Run `git log -p --since="<timestamp>" -- <file_path>` to see what actually changed
   - Read each referenced knowledge MD

3. **Propose patches.** For each MD that's affected, identify specific lines/sections that may now be inaccurate. Output a unified diff showing the proposed change. Use real code/structure from the edited file — don't invent.

4. **Get approval.** For each proposed patch, ask Charlie "apply this patch?" Wait for explicit yes/no per patch (or "apply all" / "skip all").

5. **Apply approved patches** via Edit tool calls.

6. **Clear the stale log.** Once done, truncate `.claude/knowledge-stale.md` to empty (or rename to `.claude/knowledge-stale.md.archived-<date>` if Charlie wants history).

## Quality bar

- **Don't invent.** If you're unsure what a knowledge MD said vs. what the code now says, ask Charlie or mark the section as "unknown — verify before relying on this."
- **Cite line numbers** in proposed patches.
- **Keep patches minimal.** Don't rewrite whole sections; surgically fix the parts that drifted.
- **Bulk operations:** if many MDs reference the same file with the same drift, batch them ("apply this same fix to 5 MDs?").

## When to run

- Manually when Charlie types `/sync-knowledge`
- After a session of feature work (Charlie can run it as cleanup)
- After completing a significant refactor

## Cost

Each run scans recent diffs + reads the affected MDs + makes Edit calls. Should be fast (< $0.50 in Haiku tokens) for typical sessions.
