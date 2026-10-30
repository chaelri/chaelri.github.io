#!/usr/bin/env python3
# summarise(hook_json) -> (title, summary). Run directly it reads Stop-hook JSON on stdin and prints "TITLE\tSUMMARY" for the bling alert.
# Summary = the reply's opening sentences with markdown stripped (no extra model call, so it's instant).
import json, os, re, sys

def last_reply(d):
    if d.get('last_assistant_message'):
        return d['last_assistant_message']
    p = d.get('transcript_path')
    if not p or not os.path.exists(p):
        return ''
    text = ''
    for line in open(p, encoding='utf8', errors='ignore'):
        try:
            e = json.loads(line)
        except ValueError:
            continue
        m = e.get('message') or {}
        if e.get('type') == 'assistant' and m.get('role') == 'assistant':
            parts = [c.get('text', '') for c in m.get('content', []) if isinstance(c, dict) and c.get('type') == 'text']
            if any(parts):
                text = '\n'.join(parts)
    return text

def clean(t):
    t = re.sub(r'```.*?```', ' ', t, flags=re.S)
    t = re.sub(r'^\s*\|.*\|\s*$', ' ', t, flags=re.M)          # tables
    t = re.sub(r'^\s*(#+|[-*]|\d+\.)\s*', '', t, flags=re.M)    # headings, bullets
    t = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', t)              # links
    t = re.sub(r'[*`>]+', '', t)
    return re.sub(r'\s+', ' ', t).strip()

def summarise(d):
    """(title, summary) for the bling alert from Stop-hook JSON."""
    t = clean(last_reply(d))
    sents = re.split(r'(?<=[.!?])\s+', t)
    summary = ''
    for s in sents:
        if len(summary) + len(s) > 220 and summary:
            break
        summary = (summary + ' ' + s).strip()
    summary = summary[:240] + ('…' if len(summary) > 240 else '')
    first = sents[0].lower() if sents else ''
    title = 'HEADS UP!' if re.search(r'\b(fail|error|blocked|can.t|couldn.t|won.t work|problem)\b', first) else \
            'QUESTION!' if t.rstrip().endswith('?') else 'CLAUDE REPLIED!'
    folder = os.path.basename(d.get('cwd', '')) or 'Claude'
    return title, summary or 'New response in ' + folder + '.'


if __name__ == '__main__':
    print('\t'.join(summarise(json.load(sys.stdin))))
