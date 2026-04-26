"""Weekly budget tracker.

Walks ~/.claude/projects/**/*.jsonl, sums token usage from assistant events,
groups by model family (opus/sonnet/haiku), computes API-equivalent cost using
approximate pricing constants. Returns weekly totals + percentages against caps.

The jsonl files are written by Claude Code itself (one per session). Cockpit's
own subprocess calls show up here too because the spawned `claude -p` writes
to the same store unless --no-session-persistence is set.

Cost is API-equivalent, not what's actually billed against the Max subscription.
The point is to track "what would this have cost on metered API" so the user
can decide whether to stay on Max or move to API billing.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from config import HARD_CAP_PCT, LOCKOUT_PCT, WEEKLY_CAPS_USD

PROJECTS_DIR = Path.home() / ".claude" / "projects"

# Per-million-token rates (USD). Cache_create rate matches what we observed in
# stream-json result events for the relevant model. Update if Anthropic changes
# pricing or if observed rates drift.
PRICING = {
    "haiku": {"input": 1.0, "output": 5.0, "cache_create": 1.25, "cache_read": 0.10},
    "sonnet": {"input": 3.0, "output": 15.0, "cache_create": 3.75, "cache_read": 0.30},
    "opus": {"input": 15.0, "output": 75.0, "cache_create": 18.75, "cache_read": 1.50},
}


def family_for_model(model: str | None) -> str | None:
    """Map a full model string like 'claude-haiku-4-5-20251001' → 'haiku'."""
    if not model:
        return None
    m = model.lower()
    for fam in ("opus", "sonnet", "haiku"):
        if fam in m:
            return fam
    return None


def cost_for(family: str, usage: dict) -> float:
    """Compute API-equivalent cost in USD from a usage dict."""
    rates = PRICING.get(family)
    if not rates:
        return 0.0
    return (
        (usage.get("input_tokens", 0) or 0) * rates["input"] / 1_000_000
        + (usage.get("output_tokens", 0) or 0) * rates["output"] / 1_000_000
        + (usage.get("cache_creation_input_tokens", 0) or 0) * rates["cache_create"] / 1_000_000
        + (usage.get("cache_read_input_tokens", 0) or 0) * rates["cache_read"] / 1_000_000
    )


def week_start_utc(now: datetime | None = None) -> datetime:
    """Monday 00:00 UTC of the current week."""
    now = now or datetime.now(timezone.utc)
    monday = now - timedelta(days=now.weekday())
    return monday.replace(hour=0, minute=0, second=0, microsecond=0)


def parse_ts(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def weekly_usage(now: datetime | None = None) -> dict:
    """Walk jsonl files and return weekly totals by model family."""
    cutoff = week_start_utc(now)
    cutoff_epoch = cutoff.timestamp()

    by_family: dict[str, dict] = {
        f: {"input_tokens": 0, "output_tokens": 0, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0, "cost_usd": 0.0, "calls": 0}
        for f in PRICING
    }
    files_scanned = 0
    files_skipped = 0

    if not PROJECTS_DIR.exists():
        return _wrap(by_family, files_scanned, files_skipped, cutoff)

    for path in PROJECTS_DIR.rglob("*.jsonl"):
        try:
            if path.stat().st_mtime < cutoff_epoch:
                files_skipped += 1
                continue
        except OSError:
            continue
        files_scanned += 1
        try:
            with path.open() as fp:
                for line in fp:
                    try:
                        e = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if e.get("type") != "assistant":
                        continue
                    ts = parse_ts(e.get("timestamp"))
                    if not ts or ts < cutoff:
                        continue
                    msg = e.get("message") or {}
                    fam = family_for_model(msg.get("model"))
                    if not fam:
                        continue
                    usage = msg.get("usage") or {}
                    bucket = by_family[fam]
                    for k in ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"):
                        bucket[k] += usage.get(k, 0) or 0
                    bucket["cost_usd"] += cost_for(fam, usage)
                    bucket["calls"] += 1
        except OSError:
            continue

    return _wrap(by_family, files_scanned, files_skipped, cutoff)


def _wrap(by_family: dict, scanned: int, skipped: int, cutoff: datetime) -> dict:
    total_cost = sum(b["cost_usd"] for b in by_family.values())
    caps = WEEKLY_CAPS_USD
    pct = lambda spent, cap: round(min(spent / cap * 100, 999.9), 1) if cap > 0 else 0.0
    return {
        "week_start_utc": cutoff.isoformat(),
        "by_model": {
            fam: {
                **b,
                "cap_usd": caps.get(fam, 0),
                "pct": pct(b["cost_usd"], caps.get(fam, 0)),
            }
            for fam, b in by_family.items()
        },
        "total_cost_usd": round(total_cost, 4),
        "total_cap_usd": caps["total"],
        "total_pct": pct(total_cost, caps["total"]),
        "lockout_pct": LOCKOUT_PCT,
        "hard_cap_pct": HARD_CAP_PCT,
        "files_scanned": scanned,
        "files_skipped": skipped,
    }


if __name__ == "__main__":
    import pprint
    pprint.pp(weekly_usage())
