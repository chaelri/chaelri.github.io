#!/usr/bin/env python3
"""Cursor usage for sessions on this Mac, as JSON. Read by the claude-usage menu bar app and VS Code panel.

Cursor has no plan % on the enterprise seat, so this adds up the per-call events behind the dashboard
(an undocumented endpoint, so expect it to break) and keeps only the sessions that exist in ~/.cursor.
Cached for 5 minutes. On failure it prints the last good data plus "error".
"""
import glob, json, os, sqlite3, subprocess, sys, time, urllib.request

HOME = os.path.expanduser('~')
CACHE = os.path.join(HOME, 'Library/Caches/cursor-usage.json')
URL = 'https://api2.cursor.sh/aiserver.v1.DashboardService/GetFilteredUsageEvents'
MAX_AGE = 300
WEEK_MS = 7 * 86400000
PAGE = 100
MAX_PAGES = 20


def local_sessions():
    """Session id -> folder name, for every Cursor session stored on this Mac."""
    found = {}
    for path in glob.glob(HOME + '/.cursor/projects/*/agent-transcripts/*'):
        folder = path.split('/')[-3].replace('Users-charliecayno-', '', 1) or 'home'
        found[os.path.splitext(os.path.basename(path))[0]] = folder
    for path in glob.glob(HOME + '/.cursor/chats/*/*/meta.json'):
        try:
            cwd = json.load(open(path)).get('cwd') or ''
        except (OSError, ValueError):
            cwd = ''
        found[path.split('/')[-2]] = os.path.basename(cwd) or 'cursor'
    return found


def fetch(start, end):
    token = subprocess.run(['/usr/bin/security', 'find-generic-password', '-s', 'cursor-access-token', '-w'],
                           capture_output=True, text=True, timeout=10).stdout.strip()
    if not token:
        raise RuntimeError('Not logged in: run agent login')
    events = []
    for page in range(1, MAX_PAGES + 1):
        body = {'startDate': str(start), 'endDate': str(end), 'page': page, 'pageSize': PAGE}
        req = urllib.request.Request(URL, json.dumps(body).encode(), {
            'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1'})
        got = json.load(urllib.request.urlopen(req, timeout=15)).get('usageEventsDisplay') or []
        events += got
        if len(got) < PAGE:
            break
    return events


def tally(rows):
    tokens = cents = 0
    for e in rows:
        u = e.get('tokenUsage') or {}
        tokens += sum(int(u.get(k) or 0) for k in ('inputTokens', 'outputTokens', 'cacheWriteTokens', 'cacheReadTokens'))
        cents += float(e.get('chargedCents') or u.get('totalCents') or 0)
    return {'calls': len(rows), 'tokens': tokens, 'cents': round(cents, 2)}


def build():
    now = int(time.time() * 1000)
    day = time.localtime()
    midnight = int(time.mktime((day.tm_year, day.tm_mon, day.tm_mday, 0, 0, 0, 0, 0, -1)) * 1000)
    local = local_sessions()
    events = [e for e in fetch(now - WEEK_MS, now) if e.get('conversationId') in local]
    sessions = {}
    for e in events:
        sessions.setdefault(e['conversationId'], []).append(e)
    recent = sorted(sessions.items(), key=lambda s: -max(int(e['timestamp']) for e in s[1]))[:3]
    return {
        'today': tally([e for e in events if int(e['timestamp']) >= midnight]),
        'week': tally(events),
        'sessions': len(sessions),
        'recent': [dict(tally(rows), folder=local[sid], at=max(int(e['timestamp']) for e in rows)) for sid, rows in recent],
        'nonClaude': sum('claude' not in (e.get('model') or '') for e in events),
        'fetchedAt': now,
    }


def main():
    try:
        cached = json.load(open(CACHE))
    except (OSError, ValueError):
        cached = None
    if cached and '--force' not in sys.argv and time.time() * 1000 - cached.get('fetchedAt', 0) < MAX_AGE * 1000:
        print(json.dumps(cached))
        return
    try:
        data = build()
        with open(CACHE, 'w') as f:
            json.dump(data, f)
    except Exception as err:
        data = dict(cached or {}, error=str(err)[:120])
    print(json.dumps(data))


if __name__ == '__main__':
    main()
