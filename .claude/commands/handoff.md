---
description: Write HANDOFF.md so another session (Cursor or Claude Code) can take over cold
---

# /handoff

Write `HANDOFF.md` in the root of the folder we're working in, replacing any old one. Keep it short and specific:

- **Goal:** what Charlie asked for, in his terms.
- **Done:** what's finished and verified, with commits or file paths.
- **Next step:** the exact next action.
- **Commands:** the exact commands, args and paths needed to continue.
- **Gotchas:** dead ends, failed attempts, anything that isn't obvious from the code.
- **Rules that matter here:** the memory rules this task touches.
- **Transcript:** the newest `.jsonl` for this project under `~/.claude/projects/`, if there is one.

Then commit it if the folder is a repo where direct commits are allowed. In salesforce2 never commit it; add it to `.git/info/exclude` instead.
