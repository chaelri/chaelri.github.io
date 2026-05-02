# Work Dashboard — Parked Plan

**Status:** Parked 2026-05-03. Resume by saying *"let's wire up the work dashboard"* or *"resume WORK_DASHBOARD_PLAN."*

## Goal

A daily morning brief, written to `chaelri.github.io/work-dashboard/YYYY-MM-DD.md` and git-pushed automatically. One glance gives:

- Slack DMs + @-mentions from last 24h
- Jira issues assigned to me / watched / updated
- Outlook unread / flagged / VIP emails
- Salesforce: latest Quotes, Cases, recent activity across CruxDev / CruxQA / CruxUAT / CruxPROD
- Bitbucket: open PRs assigned to me, review requests

## Architecture decision

**Local cron + `claude -p`** running on Charlie's Mac. NOT Anthropic Routines.

Why not Routines: they run on Anthropic cloud, can't see local `sf` CLI tokens, can't see laptop filesystem, can't run `acli`/`m365`/`slack` CLIs.

Why local cron wins:
- `sf` CLI already authenticated on disk → all 11 Salesforce orgs queryable
- Same pattern works for Jira/Bitbucket/Slack/Outlook with their own CLIs (auth once, persist)
- Filesystem write + `git push` to `chaelri.github.io` in the same script
- Survives lid closed via `caffeinate -i` for the run window

Tradeoff: laptop must be on (or wakeable) at fire time. Acceptable.

## Setup checklist (deferred)

### Phase 1 — Auth tokens on disk

- [ ] **Jira + Bitbucket:** install `acli`, generate API token at id.atlassian.com → Profile → Security, run `acli auth login`. ~5 min, one token covers both.
- [ ] **Outlook:** install `m365` CLI (`npm i -g @pnp/cli-microsoft365`), run `m365 login` (device code flow). ~10 min.
- [ ] **Slack:** create internal Slack app, scope it for `channels:history`, `im:history`, `users:read`, `groups:history`. Install to workspace, store user token (xoxp-…). ~30–60 min.
- [ ] **Salesforce:** already done — `sf` CLI authenticated for 11 orgs.

### Phase 2 — The script

- [ ] Write `~/bin/work-brief.sh` that runs `claude -p` with a structured prompt
- [ ] Prompt instructs Claude to call each CLI, summarize, write markdown to `chaelri.github.io/work-dashboard/$(date).md`
- [ ] Git commit + push at end (use existing `weddingbar` Firebase or just GH Pages publish)

### Phase 3 — Schedule

- [ ] `crontab -e`: `30 7 * * 1-5 caffeinate -i ~/bin/work-brief.sh >> ~/work-brief.log 2>&1`
- [ ] Verify it fires, debug for ~1 week, then trust it

## Open questions to resolve when resuming

- Where does the dashboard get *read*? Live URL on `chaelri.github.io`? Local file open via Raycast/Alfred? Email to self?
- Retention: keep all daily files forever or rotate after 30 days?
- Privacy: this commits work data (Jira ticket titles, Slack snippets) to a public GitHub repo. **Need a private branch or a separate private repo** before going live. **DO NOT skip this — would leak company data.**
- Slack scoping: read-only is enough; never grant `chat:write` to keep risk low.

## Security notes

- All tokens stored in `~/.config/...` or `~/.sfdx/`. Full-disk encryption (FileVault) is the line of defense.
- Never commit `.env` or token files. Add `~/bin/work-brief.sh` to a private location if it embeds anything sensitive.
- Revocation plan: each token revocable from its source (Atlassian → API tokens, Slack → app management, etc.).
