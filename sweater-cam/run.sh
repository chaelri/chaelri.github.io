#!/bin/bash
# Start the sweater filter -> OBS Virtual Camera. Extra flags pass through (e.g. --sleeves, --camera 1).
cd "$(dirname "$0")"
exec .venv/bin/python sweater_cam.py "$@" 2> >(grep -v -E "^(W0000|I0000|INFO|WARNING)" >&2)
