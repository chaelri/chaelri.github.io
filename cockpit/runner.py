"""Async subprocess wrapper around `claude -p`.

Spawns the Claude Code CLI in headless mode with --output-format stream-json,
parses NDJSON events line-by-line, and yields them to callers.

Auth model: Max subscription via macOS Keychain. ANTHROPIC_API_KEY is explicitly
unset before exec to prevent accidental fallback to API-metered billing.
"""

from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass, field
from typing import AsyncIterator


@dataclass
class RunnerConfig:
    prompt: str
    model: str | None = None
    system_prompt: str | None = None
    append_system_prompt: str | None = None
    add_dirs: list[str] = field(default_factory=list)
    allowed_tools: list[str] | None = None
    disallowed_tools: list[str] | None = None
    permission_mode: str | None = None
    max_budget_usd: float | None = None
    session_id: str | None = None
    resume_session_id: str | None = None
    mcp_config: str | None = None
    agents_json: str | None = None
    effort: str | None = None
    no_session_persistence: bool = False
    cwd: str | None = None

    def to_argv(self) -> list[str]:
        argv = ["claude", "-p", self.prompt, "--output-format", "stream-json", "--verbose"]
        if self.model:
            argv += ["--model", self.model]
        if self.system_prompt:
            argv += ["--system-prompt", self.system_prompt]
        if self.append_system_prompt:
            argv += ["--append-system-prompt", self.append_system_prompt]
        for d in self.add_dirs:
            argv += ["--add-dir", d]
        if self.allowed_tools:
            argv += ["--allowed-tools", ",".join(self.allowed_tools)]
        if self.disallowed_tools:
            argv += ["--disallowed-tools", ",".join(self.disallowed_tools)]
        if self.permission_mode:
            argv += ["--permission-mode", self.permission_mode]
        if self.max_budget_usd is not None:
            argv += ["--max-budget-usd", str(self.max_budget_usd)]
        if self.session_id:
            argv += ["--session-id", self.session_id]
        if self.resume_session_id:
            argv += ["--resume", self.resume_session_id]
        if self.mcp_config:
            argv += ["--mcp-config", self.mcp_config]
        if self.agents_json:
            argv += ["--agents", self.agents_json]
        if self.effort:
            argv += ["--effort", self.effort]
        if self.no_session_persistence:
            argv += ["--no-session-persistence"]
        return argv


async def run(config: RunnerConfig, on_proc=None) -> AsyncIterator[dict]:
    """Spawn `claude -p` and yield parsed stream-json events.

    Yields one dict per NDJSON line. The final event has type='result' with
    total_cost_usd, usage, and the final result text. If `on_proc` is given it
    is called with the asyncio.subprocess.Process so callers can terminate it.
    """
    env = os.environ.copy()
    env.pop("ANTHROPIC_API_KEY", None)

    proc = await asyncio.create_subprocess_exec(
        *config.to_argv(),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=config.cwd,
        env=env,
    )
    if on_proc:
        on_proc(proc)

    assert proc.stdout is not None
    try:
        async for raw_line in proc.stdout:
            line = raw_line.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                yield {"type": "_parse_error", "raw": line}
                continue
            yield event
    finally:
        rc = await proc.wait()
        if rc not in (0, -15, -2):  # 0=clean, -15=SIGTERM (cancel), -2=SIGINT
            err = (await proc.stderr.read()).decode("utf-8", errors="replace") if proc.stderr else ""
            yield {"type": "_process_error", "returncode": rc, "stderr": err}


async def _smoke_test() -> None:
    cfg = RunnerConfig(
        prompt="Reply with exactly: ok",
        model="haiku",
        max_budget_usd=0.10,
        no_session_persistence=True,
        cwd="/tmp",
    )
    print("argv:", cfg.to_argv())
    async for event in run(cfg):
        etype = event.get("type")
        if etype == "system" and event.get("subtype") == "init":
            print(f"[init] session={event.get('session_id')} model={event.get('model')} apiKeySource={event.get('apiKeySource')}")
        elif etype == "assistant":
            for block in event.get("message", {}).get("content", []):
                if block.get("type") == "text":
                    print(f"[text] {block.get('text')}")
                elif block.get("type") == "thinking":
                    print(f"[thinking] {block.get('thinking', '')[:80]}...")
        elif etype == "result":
            print(f"[result] cost=${event.get('total_cost_usd'):.6f} duration={event.get('duration_ms')}ms")
        elif etype == "_process_error":
            print(f"[error] rc={event.get('returncode')} stderr={event.get('stderr')[:200]}")


if __name__ == "__main__":
    asyncio.run(_smoke_test())
