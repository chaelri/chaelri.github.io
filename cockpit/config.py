"""Cockpit config: weekly caps + lockout thresholds.

Edit values below to tune your weekly budget. All amounts are USD (API-equivalent
cost — what you would pay if metered against a separate API key, useful for
reasoning about Max-vs-API tradeoffs).
"""

WEEKLY_CAPS_USD = {
    "opus": 80.0,
    "sonnet": 50.0,
    "haiku": 20.0,
    "total": 150.0,
}

LOCKOUT_PCT = 90.0
HARD_CAP_PCT = 95.0
