#!/usr/bin/env python3
# Register the bling Stop hook for Claude Code on this machine (macOS / Windows / Linux).
#   python3 install.py            add or update the hook (points at this repo copy, with this Python)
#   python3 install.py uninstall  remove it
# Turn alerts on/off with the switch in the Claude Usage VS Code panel (it creates/removes ~/bling/enabled).
import json, os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SETTINGS = os.path.join(os.path.expanduser('~'), '.claude', 'settings.json')
MARK = 'on_stop.py'

def is_bling(h):
    c = h.get('command', '')
    return MARK in c or 'bling/on-stop.sh' in c  # also drops the old Mac-only shell hook

d = json.load(open(SETTINGS)) if os.path.exists(SETTINGS) else {}
shutil.copy(SETTINGS, SETTINGS + '.bak-bling') if os.path.exists(SETTINGS) else None
stop = d.setdefault('hooks', {}).setdefault('Stop', [])
for entry in stop:
    entry['hooks'] = [h for h in entry.get('hooks', []) if not is_bling(h)]
stop[:] = [e for e in stop if e.get('hooks')]
if sys.argv[1:] != ['uninstall']:
    cmd = '"%s" "%s"' % (sys.executable, os.path.join(HERE, MARK))
    stop.append({'hooks': [{'type': 'command', 'command': cmd, 'timeout': 10}]})
    os.makedirs(os.path.join(os.path.expanduser('~'), 'bling'), exist_ok=True)
if not stop:
    d['hooks'].pop('Stop')
os.makedirs(os.path.dirname(SETTINGS), exist_ok=True)
json.dump(d, open(SETTINGS, 'w'), indent=2)
print('removed' if sys.argv[1:] == ['uninstall'] else 'installed: ' + cmd)
