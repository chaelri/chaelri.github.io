"""FastAPI server for the Claude Code Cockpit.

WebSocket endpoint /ws/chat receives {prompt, mode_id} and streams stream-json
events back to the client. Mode JSON loading is stubbed for Day 1; Day 3 wires
the real mode loader.
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from budget import weekly_usage
from runner import RunnerConfig, run

app = FastAPI(title="Claude Code Cockpit", version="0.1.0")

PUBLIC_DIR = Path(__file__).parent / "public"
MODES_DIR = Path(__file__).parent / "modes"
PROJECT_ROOT = Path(__file__).parent.parent  # chaelri.github.io/


def load_mode(mode_id: str) -> dict:
    """Load a mode JSON. Returns empty dict if mode_id is None or missing."""
    if not mode_id:
        return {}
    path = MODES_DIR / f"{mode_id}.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def _build_knowledge_block(rel_paths: list[str], base: Path) -> str:
    """Read knowledge MDs and concatenate into one trust-as-authoritative block."""
    parts: list[str] = []
    for rel in rel_paths:
        p = (base / rel).resolve()
        if not p.exists() or not p.is_file():
            continue
        try:
            parts.append(f"## {rel}\n\n{p.read_text()}")
        except OSError:
            continue
    if not parts:
        return ""
    intro = (
        "# Pre-loaded knowledge — trust as authoritative\n\n"
        "The following docs describe the project. Trust them and answer from them; "
        "do NOT re-investigate the codebase via Glob/Grep/Read unless the user explicitly "
        "asks or the docs don't cover the question. If a doc says 'unknown — verify before "
        "relying on this', that part is fair to investigate.\n\n---\n\n"
    )
    return intro + "\n\n---\n\n".join(parts)


def build_config(prompt: str, mode: dict, resume_session_id: str | None = None) -> RunnerConfig:
    """Map a mode JSON + prompt to a RunnerConfig."""
    append = mode.get("append_system_prompt", "") or ""
    knowledge_files = mode.get("knowledge_files") or []
    if knowledge_files:
        base = Path(mode.get("workspace") or PROJECT_ROOT)
        block = _build_knowledge_block(knowledge_files, base)
        if block:
            append = block + ("\n\n" + append if append else "")
    return RunnerConfig(
        prompt=prompt,
        model=mode.get("model"),
        system_prompt=mode.get("system_prompt"),
        append_system_prompt=append or None,
        add_dirs=mode.get("add_dirs", []),
        allowed_tools=mode.get("allowed_tools"),
        permission_mode=mode.get("permission_mode"),
        max_budget_usd=mode.get("max_budget_usd"),
        effort=mode.get("effort"),
        cwd=mode.get("workspace"),
        no_session_persistence=mode.get("no_session_persistence", False),
        resume_session_id=resume_session_id,
    )


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(PUBLIC_DIR / "index.html")


@app.get("/api/modes")
async def list_modes() -> list[dict]:
    if not MODES_DIR.exists():
        return []
    return [json.loads(p.read_text()) for p in sorted(MODES_DIR.glob("*.json"))]


@app.get("/api/budget")
async def get_budget() -> dict:
    return weekly_usage()


@app.websocket("/ws/chat")
async def ws_chat(ws: WebSocket) -> None:
    await ws.accept()
    session_id: str | None = None  # captured from first turn's init event, used for --resume on subsequent turns
    current_proc: dict = {"p": None}
    try:
        while True:
            msg = await ws.receive_json()
            action = msg.get("action")
            if action == "reset_session":
                session_id = None
                await ws.send_json({"type": "_session_reset"})
                continue
            if action == "cancel":
                # When the client wants to cancel, the simpler protocol is to
                # close the WS — the disconnect handler below SIGTERMs the
                # subprocess. A mid-turn cancel can't be served here because
                # WebSocket allows only one concurrent receive_json caller.
                continue
            prompt = msg.get("prompt", "").strip()
            mode_id = msg.get("mode_id")
            if not prompt:
                await ws.send_json({"type": "_error", "message": "empty prompt"})
                continue
            mode = load_mode(mode_id)
            if mode.get("model"):
                budget_snapshot = weekly_usage()
                fam = next((f for f in ("opus", "sonnet", "haiku") if f in mode["model"].lower()), None)
                if fam:
                    fam_pct = budget_snapshot["by_model"][fam]["pct"]
                    total_pct = budget_snapshot["total_pct"]
                    if fam_pct >= budget_snapshot["lockout_pct"] or total_pct >= budget_snapshot["lockout_pct"]:
                        await ws.send_json({
                            "type": "_locked_out",
                            "family": fam,
                            "family_pct": fam_pct,
                            "total_pct": total_pct,
                            "lockout_pct": budget_snapshot["lockout_pct"],
                        })
                        continue
            cfg = build_config(prompt, mode, resume_session_id=session_id)
            await ws.send_json({"type": "_runner_start", "argv": cfg.to_argv(), "resumed": bool(session_id)})
            try:
                async for event in run(cfg, on_proc=lambda p: current_proc.update(p=p)):
                    if event.get("type") == "system" and event.get("subtype") == "init":
                        new_sid = event.get("session_id")
                        if new_sid and not session_id:
                            session_id = new_sid
                    await ws.send_json(event)
            finally:
                current_proc["p"] = None
            await ws.send_json({"type": "_runner_done", "session_id": session_id})
    except WebSocketDisconnect:
        p = current_proc.get("p")
        if p and p.returncode is None:
            p.terminate()
        return


if PUBLIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=PUBLIC_DIR), name="static")
