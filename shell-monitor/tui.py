#!/usr/bin/env python3
"""
shell-monitor — a curses dashboard for whatever Claude Code is running in the background.

Claude's background shells write to <session>/tasks/<id>.output and otherwise happen out of
sight: the transcript says "running in background" and then nothing until it finishes. This
fills a terminal window with what those jobs are doing while they do it.

    python3 tui.py                  # newest sessions for the current project
    python3 tui.py --all            # every project
    python3 tui.py --cwd ~/racv-sit1

    q / Ctrl-C   quit          j / k or arrows   scroll
    space        page down     g / G             top / bottom

Stdlib only (/usr/bin/python3, 3.9) — curses ships with macOS, nothing to install.
"""

import argparse, curses, os, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import core

FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
REFRESH = 1.0          # seconds between rereads
TAIL = 12              # output lines shown per task

C_RUN, C_DIM, C_ACC, C_BAD, C_OK, C_HEAD, C_BAR = range(1, 8)


def init_colors():
    """Blue on black is unreadable in Terminal's default palette, so body text stays the
    terminal's own foreground and is dimmed with an attribute instead of a colour."""
    curses.start_color()
    curses.use_default_colors()
    curses.init_pair(C_RUN, curses.COLOR_GREEN, -1)
    curses.init_pair(C_DIM, -1, -1)          # inherit fg; callers add A_DIM
    curses.init_pair(C_ACC, curses.COLOR_CYAN, -1)
    curses.init_pair(C_BAD, curses.COLOR_RED, -1)
    curses.init_pair(C_OK, curses.COLOR_GREEN, -1)
    curses.init_pair(C_HEAD, curses.COLOR_BLACK, curses.COLOR_GREEN)
    curses.init_pair(C_BAR, curses.COLOR_GREEN, -1)


def dim():
    return curses.color_pair(C_DIM) | curses.A_DIM


def label():
    """Section headings: readable, not shouting."""
    return curses.color_pair(C_DIM) | curses.A_BOLD


class Screen:
    """Builds the whole view as a list of (text, attr) lines, then draws a window onto it.

    Rendering to a buffer first is what makes scrolling and resizing trivial: the view does
    not need to know how tall the terminal is, and a redraw after a resize is just a reslice.
    """

    def __init__(self):
        self.lines = []

    def add(self, text="", attr=0):
        self.lines.append((text, attr))

    def rule(self, width, ch="─"):
        self.add(ch * width, curses.color_pair(C_DIM))


def bar(pct: int, width: int) -> str:
    filled = round(width * pct / 100)
    return "█" * filled + "░" * (width - filled)


def clip(s: str, width: int) -> str:
    s = s.replace("\t", "    ")
    return s if len(s) <= width else s[: max(0, width - 1)] + "…"


def build(state, width, tick) -> Screen:
    scr = Screen()
    spin = FRAMES[tick % len(FRAMES)]
    procs = state["processes"]

    # ---- live processes -------------------------------------------------
    if procs:
        scr.add(f" LIVE PROCESSES ({len(procs)})", label())
        scr.rule(width)
        for p in procs:
            scr.add(f" {spin} pid {p['pid']}  {p['elapsed']}",
                    curses.color_pair(C_RUN) | curses.A_BOLD)
            for ln in p["command"].splitlines()[:6]:
                scr.add("     " + clip(ln, width - 6), curses.color_pair(C_ACC))
            scr.add()
    else:
        scr.add(" no background shells running right now", dim())
        scr.add()

    # ---- tasks ----------------------------------------------------------
    for sess in state["sessions"]:
        if not sess["tasks"]:
            continue
        scr.add(f" SESSION {sess['short']}  ·  {len(sess['tasks'])} task(s)", label())
        scr.rule(width)
        for t in sess["tasks"]:
            live = t["writing"]
            mark = spin if live else "·"
            attr = curses.color_pair(C_RUN) | curses.A_BOLD if live else curses.A_BOLD
            status = "writing" if live else "idle"
            head = f" {mark} {t['id']}  [{status}]  {core.human_size(t['size'])}  {core.human_age(t['age'])} ago"
            scr.add(clip(head, width), attr)

            if t["progress"] is not None:
                bw = max(10, min(40, width - 24))
                scr.add(f"     {bar(t['progress'], bw)} {t['progress']:>3}%",
                        curses.color_pair(C_BAR))

            if t["signals"]:
                kind = {"bad": C_BAD, "ok": C_OK}.get(t["kind"], C_ACC)
                scr.add("     " + clip(" · ".join(t["signals"]), width - 6),
                        curses.color_pair(kind) | curses.A_BOLD)

            for ln in t["lines"][-TAIL:]:
                scr.add("     " + clip(ln, width - 6), dim())
            scr.add()
    return scr


def draw(stdscr, state, offset, tick, paused):
    stdscr.erase()
    height, width = stdscr.getmaxyx()
    running = len(state["processes"])

    title = f" shell-monitor   {running} running   {time.strftime('%H:%M:%S')}"
    hint = "q quit  j/k scroll  space page  p pause "
    bar_text = title + " " * max(1, width - len(title) - len(hint) - 1) + hint
    try:
        stdscr.addnstr(0, 0, bar_text, width - 1, curses.color_pair(C_HEAD) | curses.A_BOLD)
    except curses.error:
        pass

    scr = build(state, width, tick)
    body = height - 1
    offset = max(0, min(offset, max(0, len(scr.lines) - body)))

    for row, (text, attr) in enumerate(scr.lines[offset: offset + body]):
        try:
            stdscr.addnstr(row + 1, 0, text, width - 1, attr)
        except curses.error:
            pass

    if paused:
        try:
            stdscr.addnstr(height - 1, max(0, width - 10), " PAUSED ", 9,
                           curses.color_pair(C_BAD) | curses.A_BOLD | curses.A_REVERSE)
        except curses.error:
            pass

    stdscr.noutrefresh()
    curses.doupdate()
    return offset


def run(stdscr, args):
    curses.curs_set(0)
    init_colors()
    stdscr.nodelay(True)

    cwd = Path(args.cwd).resolve()
    offset, tick, paused = 0, 0, False
    state = core.snapshot(args.all, cwd, TAIL, 12 if args.all else 3)
    last = time.time()

    while True:
        now = time.time()
        if not paused and now - last >= REFRESH:
            state = core.snapshot(args.all, cwd, TAIL, 12 if args.all else 3)
            last = now
        tick += 1
        offset = draw(stdscr, state, offset, tick, paused)

        # ~10 fps so the spinner moves without rereading the filesystem that often
        curses.napms(100)
        try:
            key = stdscr.getch()
        except curses.error:
            key = -1
        if key == -1:
            continue
        if key in (ord("q"), ord("Q"), 27):
            return
        if key in (ord("j"), curses.KEY_DOWN):
            offset += 1
        elif key in (ord("k"), curses.KEY_UP):
            offset = max(0, offset - 1)
        elif key == ord(" ") or key == curses.KEY_NPAGE:
            offset += stdscr.getmaxyx()[0] - 2
        elif key == curses.KEY_PPAGE:
            offset = max(0, offset - (stdscr.getmaxyx()[0] - 2))
        elif key == ord("g"):
            offset = 0
        elif key == ord("G"):
            offset = 10 ** 6
        elif key in (ord("p"), ord("P")):
            paused = not paused
        elif key == curses.KEY_RESIZE:
            stdscr.erase()


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--all", action="store_true", help="every project, not just this one")
    ap.add_argument("--cwd", default=os.getcwd(), help="project dir to match (default: cwd)")
    args = ap.parse_args()
    try:
        curses.wrapper(run, args)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
