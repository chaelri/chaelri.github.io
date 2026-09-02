# shell-monitor

A curses dashboard for whatever Claude Code is running in the background.

Claude's background shells write to `<session>/tasks/<id>.output` and otherwise happen out
of sight: the transcript says *"running in background"* and then nothing until it finishes.
For a multi-minute Salesforce deploy or an ffmpeg render that means staring at a dead
terminal. This fills a window with what those jobs are doing **while** they do it.

## Run

Terminal dashboard (the default — this is the one to use):

```bash
./launch.sh --all --cwd ~/racv-sit1
```

That opens a dedicated Terminal.app window and forces it **opaque**. Profiles like "Pro"
ship with transparency, which lets whatever is behind the window bleed through the log text
and makes the dashboard unreadable; `launch.sh` overrides opacity for that window only and
leaves the profile alone.

To run it in the current terminal instead:

```bash
python3 tui.py --all --cwd ~/racv-sit1
```

| Key | |
|---|---|
| `q` / Esc | quit |
| `j` / `k`, arrows | scroll |
| `space` / PgDn | page down |
| `g` / `G` | top / bottom |
| `p` | pause refreshing |

There is also a browser version, kept because it is easier to leave on a second monitor:

```bash
python3 -u serve.py --cwd ~/racv-sit1 --all
```

It prints a tokenised localhost URL and opens it.

| Flag | Meaning |
|---|---|
| `--cwd <dir>` | project whose sessions to watch (default: current directory) |
| `--all` | every project and session, not just the one |
| `--port N` | starting port, default 8770 (walks up if taken) |
| `--no-open` | don't launch a browser |

**Use `python3 -u`.** Without it stdout is buffered and the URL line never appears, so the
token can't be read back — which matters when Claude starts it as a background task rather
than a person starting it in a terminal.

## What it shows

- **Live processes** — the real command, unwrapped from Claude's `zsh -c … eval '…'` shell
  wrapper, with elapsed time and PID.
- **Task panes** — the last 40 lines of each `*.output`, newest first, with a braille
  spinner while the file is still being appended to.
- **A progress bar**, derived from the job's own output. Recognises `Components: 3/5`
  (Salesforce deploys), a bare `42%`, and a generic `17/120`.
- **Signal chips** — lines worth acting on pulled out of the noise: `Status: Succeeded`,
  `Passing: 11`, `Failing: 2`, `Traceback`, `exited with code 1`. Failures go red, successes
  green.

Everything polls once a second. Nothing is written; it only reads.

## Notes

- Stdlib `/usr/bin/python3` (3.9) only — `curses` ships with macOS. No pip, no venv, no
  build step, same constraints as `diskscope/` in this repo.
- `core.py` holds the reading logic (session discovery, process unwrapping, progress
  parsing); `tui.py` and `serve.py` are both thin front ends over it, so they cannot
  disagree about what is running.
- Body text uses the terminal's own foreground dimmed with an attribute rather than a colour.
  An earlier version used blue, which is unreadable on a dark background in Terminal's
  default palette.
- Security follows diskscope: bound to `127.0.0.1`, a per-run random token on `/` and every
  `/api` call, and `Host`/`Origin` must be localhost so a web page can't reach it by DNS
  rebinding.
- Sessions are discovered under `/private/tmp/claude-$UID/<flattened-cwd>/<session-id>/tasks/`.
  Claude flattens the project path into the directory name, so `/Users/x/repo` becomes
  `-Users-x-repo`.
- A task counts as *writing* if its output file was touched in the last 8 seconds. That is a
  heuristic — a job that goes quiet mid-run (a slow network call, a Salesforce test run that
  buffers) reads as idle until it prints again.
- Local only. There is nothing to deploy and it is deliberately not on GitHub Pages: the
  page is useless without the Python half and the files it reads are on this machine.
