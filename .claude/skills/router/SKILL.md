---
name: router
description: Pick the right model tier (prep cook / line cook / sous-chef / head chef) for a task and hand it off. Use at the start of EVERY task Charlie gives, before doing the work, and again when a task changes shape mid-session (e.g. a "quick fix" turns into a hard bug).
---

# Router: pick the cook by the order, not the brand

The main session runs on **Sonnet 5.5** (the line cook, set in `.claude/settings.json`). For each task, classify it, then either do it yourself or hand it to the cook agent for that tier. Do this silently; just print one line like `router: sous-chef (auth change)` before starting.

## Menu

| Tier | Agent | Model / effort | Orders |
|---|---|---|---|
| Prep cook | `prep-cook` | Haiku 5.5, low | search the codebase, "where is X", renames, boilerplate, transcribe/convert files, read logs, bulk mechanical edits, commit + push |
| Line cook | (you, inline) | Sonnet 5.5 | build a planned feature, normal UI/CSS work, routine bug fixes with a clear cause, write tests, ESP32 sketches, docs |
| Sous-chef | `sous-chef` | Opus 5.5, high | frontend UI with real design judgment, auth / payments / Firebase rules, a bug nobody can find, code review of your own diff, anything touching `weddingtest/` (live) or `guard-exit-interview/` (production) |
| Head chef | `head-chef` | Opus 5.5, max | plan a new feature or project, architecture decisions, security audit, a bug sous-chef already failed on |

## Rules

1. **Line cook work: do it yourself.** No agent; a spawn costs more than it saves.
2. **Prep cook work: delegate only if it is big** (many files, long output, a bulk sweep). A one-line grep or a single rename, just do it inline.
3. **Sous-chef / head chef work: always delegate.** Brief the agent fully (goal, files, what's ruled out, repo conventions it must follow: commit + push, dual-repo for guard-exit-interview, no emoji). It gets no conversation history, so paste what it needs.
4. **Code review = a different cook.** If you wrote the diff, review goes to `sous-chef`; if sous-chef wrote it, review it yourself.
5. **Escalate on failure.** Two failed attempts at a tier → move one tier up and say so.
6. **Relay results short.** The user does not see the agent's report; give the result + what to check.
7. If Charlie names a model or tier ("use opus for this"), that wins.
8. If the session is not on Sonnet (Charlie ran `/model`), the same table applies: delegate whatever is not your own tier, do your own tier inline.
