#!/usr/bin/env python3
# Claude Code Stop hook (macOS / Windows / Linux): when ~/bling/enabled exists (toggled from the Claude Usage
# panel), every finished reply pops the 8-bit bling alert with a short summary of the reply. Never blocks Claude.
import json, os, platform, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
HOME = os.path.join(os.path.expanduser('~'), 'bling')
WINDOWS = platform.system() == 'Windows'

def alive(pid):
    if WINDOWS:
        # os.kill(pid, 0) would terminate the process on Windows, so ask the OS instead.
        import ctypes
        h = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not h:
            return False
        code = ctypes.c_ulong()
        ctypes.windll.kernel32.GetExitCodeProcess(h, ctypes.byref(code))
        ctypes.windll.kernel32.CloseHandle(h)
        return code.value == 259  # STILL_ACTIVE
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False

def main():
    if not os.path.exists(os.path.join(HOME, 'enabled')):
        return
    lock = os.path.join(HOME, '.ringing')
    try:
        if alive(int(open(lock).read().strip())):
            return  # one alert at a time
    except (OSError, ValueError):
        pass
    sys.path.insert(0, HERE)
    from summary import summarise
    try:
        title, msg = summarise(json.load(sys.stdin))
    except Exception:
        title, msg = 'CLAUDE REPLIED!', 'New response.'
    log = open(os.path.join(HOME, 'last.log'), 'w')  # errors from the alert land here
    kw = {'stdin': subprocess.DEVNULL, 'stdout': log, 'stderr': log}
    if WINDOWS:
        kw['creationflags'] = 0x00000008 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    else:
        kw['start_new_session'] = True
    subprocess.Popen([sys.executable, os.path.join(HERE, 'bling.py'), title, msg], **kw)

if __name__ == '__main__':
    main()
