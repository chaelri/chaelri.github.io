#!/bin/bash
# ============================================================================
# watch.sh — one live progress bar for the long jobs in this repo.
#
# Charlie's standing rule: nothing that takes more than ~30 s runs without a
# visible percentage and ETA. This is the shared renderer for that.
#
# Usage:
#   ./watch.sh encode <progress-file> <total-seconds> [label]
#       Reads an ffmpeg `-progress <file>` stream. Give ffmpeg:
#           ffmpeg -progress /tmp/enc.prog -nostats ... out.mp4
#       and the total duration of the source in seconds.
#
#   ./watch.sh upload <yt-helper-log> [label]
#       Reads the `NN.N%  (x/y GB · z MB/s)` line yt-helper.mjs prints.
#
#   ./watch.sh multi <dir> <total-seconds> [label]
#       Watches every <dir>/*.prog at once (parallel encodes) and shows a bar
#       per job plus a combined bar.
#
# Add --once to print a single snapshot instead of redrawing.
# ============================================================================
set -u

MODE="${1:-}"
[ -z "$MODE" ] && { sed -n '4,20p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }

ONCE=0
for a in "$@"; do [ "$a" = "--once" ] && ONCE=1; done

C_DIM=$'\033[38;5;244m'; C_OK=$'\033[38;5;114m'; C_RUN=$'\033[38;5;111m'
C_HEAD=$'\033[1m'; C_ACC=$'\033[38;5;213m'; C_OFF=$'\033[0m'
# Time the JOB, not this script — otherwise a `--once` snapshot of an
# already-running job reports an elapsed of ~1 s and a nonsense ETA. The log /
# progress file's birth time is when the job actually started.
_clock_src="${3:-}"
[ "$MODE" = "upload" ] && _clock_src="${2:-}"
[ "$MODE" = "encode" ] && _clock_src="${2:-}"
[ "$MODE" = "multi" ] && _clock_src="${2:-}"
if [ -n "$_clock_src" ] && [ -e "$_clock_src" ]; then
  START=$(stat -f%B "$_clock_src" 2>/dev/null || date +%s)
else
  START=$(date +%s)
fi

bar() {  # bar <pct> <width> <color>
  local pct=$1 w=$2 col=$3 filled i out=""
  [ "$pct" -lt 0 ] && pct=0; [ "$pct" -gt 100 ] && pct=100
  filled=$(( pct * w / 100 ))
  for ((i = 0; i < w; i++)); do
    [ $i -lt $filled ] && out+="█" || out+="░"
  done
  printf '%s%s%s' "$col" "$out" "$C_OFF"
}

hms() { printf '%d:%02d:%02d' $(($1/3600)) $(($1%3600/60)) $(($1%60)); }

eta_of() {  # eta_of <pct>
  local pct=$1 el=$(( $(date +%s) - START ))
  if [ "$pct" -gt 1 ] && [ "$pct" -lt 100 ]; then hms $(( el * (100 - pct) / pct )); else echo "—"; fi
}

# ffmpeg -progress writes `out_time_us=<n>` repeatedly; the last one is current.
pct_from_prog() {  # pct_from_prog <file> <total_seconds>
  local f="$1" total="$2" us
  [ -f "$f" ] || { echo 0; return; }
  us=$(grep '^out_time_us=' "$f" 2>/dev/null | tail -1 | cut -d= -f2)
  [ -z "${us:-}" ] || [ "$us" = "N/A" ] && { echo 0; return; }
  echo $(( us / 10000 / total ))
}

draw_encode() {
  local pf="$1" total="$2" label="${3:-encoding}" pct done
  pct=$(pct_from_prog "$pf" "$total")
  done=$(grep -c '^progress=end' "$pf" 2>/dev/null || echo 0)
  [ "$done" -gt 0 ] && pct=100
  printf '%s  %s%s\n\n' "$C_HEAD" "$label" "$C_OFF"
  printf '  %s %3d%%   %selapsed %s · eta %s%s\n' \
    "$(bar "$pct" 40 "$([ "$pct" -ge 100 ] && echo "$C_OK" || echo "$C_RUN")")" \
    "$pct" "$C_DIM" "$(hms $(( $(date +%s) - START )))" "$(eta_of "$pct")" "$C_OFF"
  [ "$pct" -ge 100 ] && return 1 || return 0
}

secs_from_prog() {  # last out_time_us, in whole seconds
  local f="$1" us
  [ -f "$f" ] || { echo 0; return; }
  us=$(grep '^out_time_us=' "$f" 2>/dev/null | tail -1 | cut -d= -f2)
  case "${us:-}" in ''|N/A|*[!0-9]*) echo 0 ;; *) echo $(( us / 1000000 )) ;; esac
}

draw_multi() {
  local dir="$1" total="$2" label="${3:-rendering}" secs_done=0 n=0 finished=0
  printf '%s  %s%s\n\n' "$C_HEAD" "$label" "$C_OFF"
  for pf in "$dir"/*.prog; do
    [ -f "$pf" ] || continue
    local pct col state clip_total s
    # Each clip's own duration lives in a sidecar .dur written by the caller.
    # Without it a per-clip bar would be measured against the whole batch and
    # could never pass (clip duration / batch duration) percent.
    clip_total="$total"
    [ -f "${pf%.prog}.dur" ] && clip_total=$(cat "${pf%.prog}.dur")
    [ "${clip_total:-0}" -lt 1 ] && clip_total=1
    s=$(secs_from_prog "$pf")
    pct=$(( s * 100 / clip_total ))
    if grep -q '^progress=end' "$pf" 2>/dev/null; then
      pct=100; col="$C_OK"; state="done"; s="$clip_total"; finished=$(( finished + 1 ))
    else
      [ "$pct" -gt 99 ] && pct=99; col="$C_RUN"; state="encoding"
    fi
    printf '  %-22s %s %3d%%  %s%s%s\n' \
      "$(basename "$pf" .prog)" "$(bar "$pct" 32 "$col")" "$pct" "$col" "$state" "$C_OFF"
    secs_done=$(( secs_done + s )); n=$(( n + 1 ))
  done
  [ "$n" -eq 0 ] && { printf '  %swaiting for jobs…%s\n' "$C_DIM" "$C_OFF"; return 0; }
  # Overall is video-seconds encoded / video-seconds total, so a long clip
  # counts for more than a short one instead of averaging the percentages.
  # Done is "every job wrote progress=end", NOT "the percentage reached 100".
  # Integer division truncates — 2921 of 2922 video-seconds is 99% — so keying
  # completion off the percentage left this looping forever after the encodes
  # had already exited, and the caller blocked on it and never uploaded.
  local all_done=0
  [ "$finished" -eq "$n" ] && all_done=1

  local ov=0
  [ "$total" -gt 0 ] && ov=$(( secs_done * 100 / total ))
  [ "$ov" -gt 100 ] && ov=100
  [ "$all_done" = "1" ] && ov=100
  printf '\n  %-22s %s %3d%%\n' "OVERALL" "$(bar "$ov" 32 "$C_ACC")" "$ov"
  printf '  %selapsed %s · eta %s%s\n' "$C_DIM" "$(hms $(( $(date +%s) - START )))" "$(eta_of "$ov")" "$C_OFF"
  [ "$all_done" = "1" ] && return 1 || return 0
}

draw_upload() {
  local log="$1" label="${2:-uploading}" last pct gb rate
  last=$(tr '\r' '\n' < "$log" 2>/dev/null | grep -oE '[0-9.]+%  \([0-9.]+/[0-9.]+ GB · [0-9.]+ MB/s\)' | tail -1)
  printf '%s  %s%s\n\n' "$C_HEAD" "$label" "$C_OFF"
  if grep -qiE 'https://youtu|watch\?v=' "$log" 2>/dev/null; then
    printf '  %s %3d%%\n' "$(bar 100 40 "$C_OK")" 100
    printf '  %s%s%s\n' "$C_OK" "$(grep -oE 'https://[^ ]*' "$log" | tail -1)" "$C_OFF"
    return 1
  fi
  if grep -qi 'error' "$log" 2>/dev/null; then
    printf '  %sERROR: %s%s\n' "$'\033[38;5;203m'" "$(grep -i error "$log" | tail -1)" "$C_OFF"
    return 1
  fi
  [ -z "${last:-}" ] && { printf '  %sopening resumable session…%s\n' "$C_DIM" "$C_OFF"; return 0; }
  pct=${last%%.*}
  gb=$(echo "$last" | grep -oE '\([0-9.]+/[0-9.]+ GB' | tr -d '(')
  rate=$(echo "$last" | grep -oE '[0-9.]+ MB/s')
  printf '  %s %3d%%   %s%s · %s · eta %s%s\n' \
    "$(bar "$pct" 40 "$C_RUN")" "$pct" "$C_DIM" "$gb" "$rate" "$(eta_of "$pct")" "$C_OFF"
  return 0
}

run() {
  case "$MODE" in
    encode) draw_encode "$2" "$3" "${4:-encoding}" ;;
    multi)  draw_multi  "$2" "$3" "${4:-rendering}" ;;
    upload) draw_upload "$2" "${3:-uploading}" ;;
    *) echo "unknown mode: $MODE" >&2; exit 2 ;;
  esac
}

if [ "$ONCE" = "1" ]; then run "$@"; exit 0; fi

printf '\033[?25l'; trap 'printf "\033[?25h\n"; exit 0' INT TERM
while true; do
  printf '\033[H\033[2J'
  run "$@" || { printf '\033[?25h\n'; break; }
  sleep 1
done
