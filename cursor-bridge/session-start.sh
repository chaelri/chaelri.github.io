#!/bin/bash
# Cursor sessionStart: loads the shared memory in every folder, plus the stale-knowledge count.
export PATH="/opt/homebrew/bin:/usr/bin:/bin:$PATH"
cat >/dev/null
msg="Charlie's standing rules live in shared memory at /Users/charliecayno/.claude/projects/-Users-charliecayno-chaelri-github-io/memory/. Do not read it upfront; open MEMORY.md and the relevant linked file only when a task touches one of the topics below or something you are unsure about. Save new memories there in the same format. Work the way Charlie works with Claude Code: reply in English even if he writes Taglish, keep replies short, no emoji. Show a visible markdown TODO list for 3+ items and update it as you go. Every draft for Teams, Jira, Confluence, Gmail or similar goes in the drafts tab (see drafts-tab-in-vscode.md and charlie-message-voice.md), never in the reply and never pbcopy. Commit and push finished work in this repo (see push-after-changes.md); in salesforce2, before any branch, commit or PR, read salesforce2-pr-workflow.md, racv-minimal-pr.md, racv-never-push-without-asking.md and bitbucket-keyboard-shortcuts.md: raise the PR yourself in Chrome, target the epic, swap Bitbucket's default reviewers for the 5 listed, and never put any AI attribution in commits or PR text. Long jobs get live progress (see show-progress-for-long-jobs.md)."
stale="$HOME/chaelri.github.io/.claude/knowledge-stale.md"
if [ -s "$stale" ]; then
  msg="$msg Knowledge MDs: $(grep -c '^## ' "$stale") edit(s) pending review in .claude/knowledge-stale.md (run /sync-knowledge only when Charlie asks)."
fi
jq -n --arg m "$msg" '{additional_context:$m}'
