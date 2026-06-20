#!/bin/bash
# ============================================================================
# progress.sh — live Terminal progress monitor for a camera01-archive render.
#
# Usage:
#   In one Terminal:  ./camera01-archive/render.sh ~/Desktop/Camera01/2026-02-18
#   In another:       ./camera01-archive/progress.sh ~/Desktop/Camera01/2026-02-18
#
# Watches:
#   <source_dir>/_render/render.log   — clip transitions
#   <source_dir>/_render/clip_NN.mp4  — output sizes (in-clip progress proxy)
#   <source_dir>/_render/<out>.mp4    — final file = DONE
#
# Redraws every 1 s, ANSI cursor moves (no scrollback spam). Ctrl-C to quit;
# leaves the render untouched.
# ============================================================================
set -u

if [ -z "${1:-}" ]; then
  echo "usage: $0 <source_dir>" >&2
  exit 2
fi

SRC="${1%/}"
ROOT="$SRC/_render"
LOG="$ROOT/render.log"

if [ ! -d "$SRC" ]; then
  echo "not a directory: $SRC" >&2; exit 2
fi

DATE_DIR=$(basename "$SRC")
if [[ "$DATE_DIR" =~ ^([0-9]{4})-([0-9]{2})-([0-9]{2})$ ]]; then
  YYYY=${BASH_REMATCH[1]}; MM=${BASH_REMATCH[2]}; DD=${BASH_REMATCH[3]}
  case $MM in
    01) MON=Jan;; 02) MON=Feb;; 03) MON=Mar;; 04) MON=Apr;;
    05) MON=May;; 06) MON=Jun;; 07) MON=Jul;; 08) MON=Aug;;
    09) MON=Sep;; 10) MON=Oct;; 11) MON=Nov;; 12) MON=Dec;;
  esac
  FINAL="$ROOT/${MON}${DD}_${YYYY}.mp4"
else
  FINAL="$ROOT/merged.mp4"
fi

# Probe source clip durations once (kept in two parallel arrays).
declare -a NAMES DURS
TOTAL=0
i=0
while IFS= read -r name; do
  dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$SRC/$name" 2>/dev/null)
  i=$((i+1))
  NAMES[$i]="$name"
  DURS[$i]="$dur"
  TOTAL=$(echo "$TOTAL + $dur" | bc -l)
done < <(cd "$SRC" && ls *.mp4 2>/dev/null | sort)
N=$i

if [ $N -eq 0 ]; then
  echo "no clips in $SRC" >&2; exit 2
fi

# Recover the render's start epoch from the first log line if it exists.
START_EPOCH=$(date +%s)
if [ -f "$LOG" ]; then
  first=$(head -1 "$LOG" 2>/dev/null)
  if [[ "$first" =~ ^\[([0-9]{2}):([0-9]{2}):([0-9]{2})\] ]]; then
    today=$(date +%Y-%m-%d)
    parsed=$(date -j -f "%Y-%m-%d %H:%M:%S" "$today ${BASH_REMATCH[1]}:${BASH_REMATCH[2]}:${BASH_REMATCH[3]}" +%s 2>/dev/null)
    [ -n "$parsed" ] && START_EPOCH=$parsed
  fi
fi

# Constants for projected output bytes (matches render.sh: 14M video + ~24kB/s audio).
BYTES_PER_SEC=$(echo "14000000/8 + 24000" | bc -l)

bar() {
  local pct=$1 width=44
  local fill=$(printf "%.0f" "$(echo "$pct * $width / 100" | bc -l)")
  [ "$fill" -gt "$width" ] && fill=$width
  [ "$fill" -lt 0 ] && fill=0
  local empty=$((width - fill))
  printf '['
  for ((j=0; j<fill; j++)); do printf '█'; done
  for ((j=0; j<empty; j++)); do printf '·'; done
  printf ']'
}

fmt_t() {
  local s=$1
  [ -z "$s" ] && { echo "—"; return; }
  s=$(printf "%.0f" "$s" 2>/dev/null) || { echo "—"; return; }
  [ "$s" -lt 0 ] 2>/dev/null && { echo "—"; return; }
  local h=$((s/3600)) m=$(((s%3600)/60)) ss=$((s%60))
  if [ $h -gt 0 ]; then printf "%dh%02dm%02ds" $h $m $ss
  else printf "%dm%02ds" $m $ss
  fi
}

draw() {
  # Identify the current encoding clip from the last "encode" log line.
  # bash 3.2 parses `[[ =~ ]]` differently; using a variable-stored regex.
  local cur_out="" cur_src="" cur_idx=0
  local re_enc='encode \(([^)]+)\): (.+) -> (clip_[0-9]+\.mp4)'
  local re_idx='clip_([0-9]+)\.mp4'
  if [ -f "$LOG" ]; then
    while IFS= read -r line; do
      if [[ "$line" =~ $re_enc ]]; then
        cur_src="${BASH_REMATCH[2]}"
        cur_out="${BASH_REMATCH[3]}"
      fi
    done < <(grep "encode" "$LOG" 2>/dev/null | grep -v swscaler)
  fi
  if [[ "$cur_out" =~ $re_idx ]]; then
    cur_idx=$((10#${BASH_REMATCH[1]}))
  fi

  local finished=0
  [ -f "$FINAL" ] && finished=1
  [ $finished -eq 1 ] && cur_idx=$N

  # Encoded source seconds = sum of durations for clips fully done.
  local encoded=0
  if [ $finished -eq 1 ]; then
    encoded=$TOTAL
  else
    for ((k=1; k<cur_idx; k++)); do
      encoded=$(echo "$encoded + ${DURS[$k]}" | bc -l)
    done
    # Add a partial estimate for the in-flight clip from its output size.
    if [ $cur_idx -ge 1 ] && [ $cur_idx -le $N ]; then
      out_p="$ROOT/$cur_out"
      if [ -f "$out_p" ]; then
        sz=$(stat -f "%z" "$out_p" 2>/dev/null || echo 0)
        proj=$(echo "${DURS[$cur_idx]} * $BYTES_PER_SEC" | bc -l)
        if (( $(echo "$proj > 0" | bc -l) )); then
          frac=$(echo "if ($sz / $proj < 0.98) $sz / $proj else 0.98" | bc -l)
          partial=$(echo "$frac * ${DURS[$cur_idx]}" | bc -l)
          encoded=$(echo "$encoded + $partial" | bc -l)
        fi
      fi
    fi
  fi

  local pct
  pct=$(echo "scale=2; $encoded * 100 / $TOTAL" | bc -l)
  [ -z "$pct" ] && pct=0

  local now=$(date +%s)
  local elapsed=$((now - START_EPOCH))
  local eta="—"
  local total_est="—"
  if [ $finished -eq 0 ] && (( $(echo "$encoded > 2" | bc -l) )); then
    rate=$(echo "scale=4; $encoded / $elapsed" | bc -l)
    if (( $(echo "$rate > 0" | bc -l) )); then
      remaining=$(echo "($TOTAL - $encoded) / $rate" | bc -l)
      eta=$(fmt_t "$remaining")
      total=$(echo "$elapsed + $remaining" | bc -l)
      total_est=$(fmt_t "$total")
    fi
  fi
  [ $finished -eq 1 ] && { eta="complete"; total_est=$(fmt_t "$elapsed"); }

  # Output bytes so far.
  local out_bytes=0
  for p in "$ROOT"/clip_*.mp4 "$FINAL"; do
    [ -f "$p" ] || continue
    sz=$(stat -f "%z" "$p" 2>/dev/null || echo 0)
    out_bytes=$((out_bytes + sz))
  done
  out_gb=$(echo "scale=2; $out_bytes / 1073741824" | bc -l)

  # Clip strip: one cell per clip, colored by status.
  local strip=""
  for ((k=1; k<=N; k++)); do
    if [ $finished -eq 1 ] || [ $k -lt $cur_idx ]; then
      strip="${strip}\033[42m \033[0m"     # done = green
    elif [ $k -eq $cur_idx ]; then
      strip="${strip}\033[44m \033[0m"     # encoding = blue
    else
      strip="${strip}\033[100m \033[0m"    # pending = gray
    fi
  done

  # Render (overwrite same screen).
  printf '\033[H\033[2J'    # clear screen, home cursor
  printf '\033[1;37m  %s\033[0m\n' "$DATE_DIR · render"
  printf '\033[0;90m  %d clips · %.1f min source · 1080p60 · h264_videotoolbox\033[0m\n\n' \
    $N "$(echo "$TOTAL/60" | bc -l)"

  printf '  '
  if [ $finished -eq 1 ]; then printf '\033[1;32m'; else printf '\033[1;34m'; fi
  bar "$pct"
  printf '\033[0m  \033[1;37m%.1f%%\033[0m\n\n' "$pct"

  printf '  \033[0;90mclips\033[0m   '
  printf "$strip"
  printf '\n\n'

  printf '  \033[0;90melapsed\033[0m   %-10s   \033[0;90mremaining\033[0m  %-10s\n' "$(fmt_t $elapsed)" "$eta"
  printf '  \033[0;90mtotal est\033[0m %-10s   \033[0;90moutput\033[0m     %s GB\n' "$total_est" "$out_gb"

  printf '\n  \033[0;90mnow:\033[0m %s\n\n' "${cur_src:-—}"

  printf '  \033[0;90m── log ───\033[0m\n'
  grep -v swscaler "$LOG" 2>/dev/null | tail -6 | sed 's/^/  /'

  if [ $finished -eq 1 ]; then
    printf '\n  \033[1;42m\033[1;37m  DONE  \033[0m  → %s\n' "$FINAL"
    return 1
  fi
  printf '\n  \033[0;90mctrl-c to exit · refresh 1s\033[0m\n'
  return 0
}

trap 'printf "\033[?25h"; exit 0' INT TERM
printf '\033[?25l'   # hide cursor for cleaner redraw

while :; do
  if ! draw; then
    printf '\033[?25h'
    exit 0
  fi
  sleep 1
done
