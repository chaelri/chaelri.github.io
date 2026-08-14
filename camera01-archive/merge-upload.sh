#!/bin/bash
# ============================================================================
# merge-upload.sh — "merge and upload to yt" in one command.
#
#   ./merge-upload.sh --title "Kuya J's with Lovey" clip1.mp4 clip2.mp4 …
#
# Merges the given clips chronologically into one 1080p H.264 mp4 and uploads
# it to YouTube unlisted. Live progress bar throughout — never runs silent.
#
# Options:
#   --title <t>      YouTube title (required)
#   --privacy <p>    unlisted (default) | private | public
#   --out <path>     output file (default: <first clip's dir>/_render/<title>.mp4)
#   --no-sort        keep the order given instead of sorting chronologically
#   --no-upload      render only, skip YouTube
#   --no-encode      the clips are already what the encode would produce, so
#                    skip it. One clip goes up exactly as it is — no ffmpeg at
#                    all. Several are stitched with the concat demuxer's
#                    -c copy, which is only legal if they match; the check
#                    below refuses rather than producing a broken file.
#
# Ordering: clips are sorted by the digits in their filename, which puts DJI
# (DJI_20260701065329_0275_D) and LRV/VID (LRV_20260405_185403_271) names in
# capture order. --no-sort if a batch doesn't follow that.
#
# Pipeline per clip (same as render.sh, which this borrows its flags from):
#   HW HEVC decode → area scale to fit 1920x1080 → HW H.264 encode 12M/16M
#   → AAC 192k stereo → +faststart, then a stream-copy concat.
#
# Every clip is normalised to the FIRST clip's frame rate and to 1920x1080, so
# the concat demuxer's -c copy is always valid. Streams are mapped explicitly
# because DJI files carry a second full-resolution mjpeg thumbnail track that
# makes ffmpeg's automatic "best video stream" pick ambiguous.
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WATCH="$HERE/watch.sh"
YT="$HERE/../gemini-proxy/yt-helper.mjs"

TITLE=""; PRIVACY="unlisted"; OUTFILE=""; SORT=1; UPLOAD=1; ENCODE=1; OUTGIVEN=0
FILES=()
while [ $# -gt 0 ]; do
  case "$1" in
    --title)     TITLE="$2"; shift 2 ;;
    --privacy)   PRIVACY="$2"; shift 2 ;;
    --out)       OUTFILE="$2"; OUTGIVEN=1; shift 2 ;;
    --no-sort)   SORT=0; shift ;;
    --no-upload) UPLOAD=0; shift ;;
    --no-encode) ENCODE=0; shift ;;
    -h|--help)   sed -n '3,26p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)           FILES+=("$1"); shift ;;
  esac
done

[ -z "$TITLE" ] && { echo "--title is required" >&2; exit 2; }
[ ${#FILES[@]} -lt 1 ] && { echo "give me at least one clip" >&2; exit 2; }
for f in "${FILES[@]}"; do [ -f "$f" ] || { echo "no such file: $f" >&2; exit 2; }; done

# Absolute from here on. The concat demuxer resolves relative entries against
# the folder holding the list file — which is _render, not where you were
# standing — and the upload runs from the script's own directory, so a path
# like "a.mp4" is a different file to each of them.
ABS=()
for f in "${FILES[@]}"; do
  ABS+=("$(cd "$(dirname "$f")" && pwd)/$(basename "$f")")
done
FILES=("${ABS[@]}")

# -- chronological order -------------------------------------------------- #
# No mapfile here: macOS ships bash 3.2, where it does not exist.
if [ "$SORT" = "1" ] && [ ${#FILES[@]} -gt 1 ]; then
  SORTED=()
  while IFS= read -r line; do
    SORTED+=("$line")
  done < <(
    for f in "${FILES[@]}"; do
      printf '%s\t%s\n' "$(basename "$f" | tr -cd '0-9')" "$f"
    done | sort -k1,1 | cut -f2-
  )
  FILES=("${SORTED[@]}")
fi

SRCDIR="$(cd "$(dirname "${FILES[0]}")" && pwd)"
OUT="$SRCDIR/_render"
mkdir -p "$OUT"
[ -z "$OUTFILE" ] && OUTFILE="$OUT/$TITLE.mp4"
LOG="$OUT/merge.log"
ULOG="$OUT/upload.log"
: > "$LOG"
# The watcher reads the upload log's existence as "encoding is over". A log
# left behind by the previous run would make it skip straight to that phase —
# and a stale one still holding a youtu.be URL would report instant success.
rm -f "$ULOG" "$OUT/upload.json"

# -- probe ----------------------------------------------------------------- #
TOTAL=0
for f in "${FILES[@]}"; do
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  TOTAL=$(printf '%.0f' "$(echo "$TOTAL + $d" | bc)")
done
# Normalise everything to the first clip's frame rate so -c copy concat is legal.
FPS=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "${FILES[0]}")

{
  echo "title   : $TITLE"
  echo "clips   : ${#FILES[@]}"
  echo "total   : ${TOTAL}s"
  echo "fps     : $FPS"
  echo "privacy : $PRIVACY"
  for f in "${FILES[@]}"; do echo "  - $(basename "$f")"; done
} >> "$LOG"

VF="scale=1920:1080:force_original_aspect_ratio=decrease:flags=area,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=$FPS,format=yuv420p"

# Every long stage opens its own Terminal window with the live bar. Charlie
# should never have to ask where the progress is; a snapshot pasted into a chat
# is not a progress bar. Set DISKSCOPE_NO_POPUP=1 to suppress (e.g. in cron).
# popup upload <log> <label>
# popup multi  <dir> <total-seconds> <label>
# Arity differs per mode, so pass through exactly what was given rather than
# padding — a stray extra argument here would silently become the label.
popup() {
  [ "${DISKSCOPE_NO_POPUP:-0}" = "1" ] && return 0
  [ -d /Applications/Utilities/Terminal.app ] || [ -d /System/Applications/Utilities/Terminal.app ] || return 0
  local mode="$1"; shift
  # Terminal is set to leave finished windows on screen (that's how the final
  # youtu.be frame survives), so a previous run's window is still sitting there.
  # Close it before opening this one — exactly one progress window, always.
  osascript -e 'tell application "Terminal" to close (every window whose name contains ".watch-" and busy is false)' >/dev/null 2>&1 || true
  local cmdfile="$OUT/.watch-$mode.command" line
  line=$(printf '%q ' "$WATCH" "$mode" "$@")
  { echo '#!/bin/bash'; echo "exec $line"; } > "$cmdfile"
  chmod +x "$cmdfile"
  open -a Terminal "$cmdfile" >/dev/null 2>&1 || true
}

# -- no-encode -------------------------------------------------------------- #
# The pixels are already right, so the fastest correct thing to do is nothing.
# A single clip is uploaded from where it lies — not copied, not remuxed — so
# a five-minute export that took four minutes to make takes zero seconds to
# prepare. Several clips still have to be stitched, but the concat demuxer can
# do that with -c copy: a mux, not an encode, seconds rather than minutes.
if [ "$ENCODE" = "0" ]; then
  if [ ${#FILES[@]} -gt 1 ]; then
    # -c copy across a concat is only valid when the streams truly match. This
    # compares what the muxer cares about and refuses on a mismatch, because
    # the alternative is a file that plays for one clip and then falls apart.
    sig() {
      ffprobe -v error -select_streams v:0 -show_entries \
        stream=codec_name,width,height,pix_fmt,r_frame_rate -of csv=p=0 "$1"
      ffprobe -v error -select_streams a:0 -show_entries \
        stream=codec_name,sample_rate,channels -of csv=p=0 "$1"
    }
    FIRSTSIG="$(sig "${FILES[0]}")"
    for f in "${FILES[@]:1}"; do
      if [ "$(sig "$f")" != "$FIRSTSIG" ]; then
        echo "--no-encode needs every clip to match; $(basename "$f") does not." >&2
        echo "Drop --no-encode and let it normalise them." >&2
        exit 3
      fi
    done
  fi

  if [ ${#FILES[@]} = 1 ] && [ "$OUTGIVEN" = "0" ]; then
    OUTFILE="${FILES[0]}"
    echo "[$(date +%H:%M:%S)] no encode — uploading as-is" >> "$LOG"
  else
    echo "[$(date +%H:%M:%S)] no encode — stream-copy concat" >> "$LOG"
    LIST="$OUT/concat.txt"
    : > "$LIST"
    # Source names are whatever the camera or the editor called them, so unlike
    # the generated part_NN.mp4 names they can contain a quote. The concat
    # demuxer's escape for one inside a quoted entry is '\''.
    for f in "${FILES[@]}"; do
      printf "file '%s'\n" "$(printf '%s' "$f" | sed "s/'/'\\\\''/g")" >> "$LIST"
    done
    ffmpeg -hide_banner -loglevel warning -y -f concat -safe 0 -i "$LIST" \
      -c copy -movflags +faststart "$OUTFILE" 2>>"$LOG"
    rm -f "$LIST"
    echo "[$(date +%H:%M:%S)] merged -> $OUTFILE" >> "$LOG"
  fi
  ls -lh "$OUTFILE"

  if [ "$UPLOAD" = "0" ]; then
    echo "render only — no upload requested" > "$ULOG"
    exit 0
  fi
  : > "$ULOG"
  node "$YT" upload "$OUTFILE" --title "$TITLE" --privacy "$PRIVACY" \
    --progress "$OUT/upload.json" > "$ULOG" 2>&1 &
  UPID=$!
  # There was no encode stage to open a window, so the upload opens its own.
  popup upload "$ULOG" "$TITLE  ·  uploading"
  "$WATCH" upload "$ULOG" "$TITLE  ·  uploading" || true
  wait $UPID || true
  rm -f "$OUT"/.watch-*.command
  [ -f "$OUT/upload.json" ] && cp "$OUT/upload.json" "$OUT/upload-$TITLE.json"
  cp "$ULOG" "$OUT/upload-$TITLE.log" 2>/dev/null || true
  grep -oE 'https://youtu\.be/[A-Za-z0-9_-]+' "$ULOG" | tail -1
  exit 0
fi

rm -f "$OUT"/*.prog "$OUT"/*.dur
PARTS=()
i=0
for f in "${FILES[@]}"; do
  PARTS+=("$OUT/part_$(printf '%02d' $i).mp4")
  i=$((i + 1))
done

# The loop below only launches two ffmpegs at a time and blocks on the slot
# check, so it does NOT return until the last clips are already going. Run it
# in a background subshell, or the progress window opens at the END of the
# encode instead of the start — which is the same as having no bar at all.
(
  i=0
  for f in "${FILES[@]}"; do
    p="$OUT/part_$(printf '%02d' $i).mp4"
    stem="$OUT/$(printf '%02d_%s' $i "$(basename "${f%.*}" | cut -c1-16)")"
    # Sidecar duration so watch.sh can scale this clip's bar to the clip itself.
    ffprobe -v error -show_entries format=duration -of csv=p=0 "$f" \
      | cut -d. -f1 > "$stem.dur"
    ffmpeg -hide_banner -loglevel warning -y \
      -progress "$stem.prog" -nostats \
      -hwaccel videotoolbox -i "$f" \
      -map 0:v:0 -map 0:a:0 -dn \
      -vf "$VF" \
      -c:v h264_videotoolbox -realtime 1 \
      -b:v 12M -maxrate 16M -bufsize 24M \
      -profile:v high -level 4.2 -pix_fmt yuv420p -tag:v avc1 \
      -c:a aac -b:a 192k -ar 48000 -ac 2 \
      -movflags +faststart \
      "$p" 2>>"$LOG" &
    i=$((i + 1))
    while [ "$(jobs -rp | wc -l)" -ge 2 ]; do sleep 0.5; done
  done
  wait
) &
ENCPID=$!

# ONE window for encode + concat + upload. It outlives this stage on purpose.
popup "job" "$OUT" "$TOTAL" "$ULOG" "$TITLE"
"$WATCH" multi "$OUT" "$TOTAL" "$TITLE  ·  encoding" || true
wait $ENCPID

LIST="$OUT/concat.txt"
: > "$LIST"
for p in "${PARTS[@]}"; do printf "file '%s'\n" "$p" >> "$LIST"; done
echo "[$(date +%H:%M:%S)] concatenating" >> "$LOG"
ffmpeg -hide_banner -loglevel warning -y -f concat -safe 0 -i "$LIST" \
  -c copy -movflags +faststart "$OUTFILE" 2>>"$LOG"
# NOT .watch-*.command — that is the file the live progress window is still
# executing; it has to outlive the concat now that one window spans the run.
rm -f "${PARTS[@]}" "$LIST" "$OUT"/*.prog "$OUT"/*.dur

echo "[$(date +%H:%M:%S)] merged -> $OUTFILE" >> "$LOG"
ls -lh "$OUTFILE"

if [ "$UPLOAD" = "0" ]; then
  # Give the watcher its terminating frame, or it spins on "merging parts…".
  echo "render only — no upload requested" > "$ULOG"
  sleep 2; rm -f "$OUT"/.watch-*.command
  exit 0
fi

# -- upload ---------------------------------------------------------------- #
: > "$ULOG"
node "$YT" upload "$OUTFILE" --title "$TITLE" --privacy "$PRIVACY" > "$ULOG" 2>&1 &
UPID=$!
# No second popup — the window opened at the encode stage picks the upload up
# by itself the moment $ULOG appears, and ends on the youtu.be link.
"$WATCH" upload "$ULOG" "$TITLE  ·  uploading" || true
wait $UPID || true
rm -f "$OUT"/.watch-*.command
# Keep a per-title record. yt-helper always writes upload.json beside the mp4,
# so back-to-back runs in one folder overwrite each other — that is how the
# link for an earlier upload got lost with nothing left to recover it from.
[ -f "$OUT/upload.json" ] && cp "$OUT/upload.json" "$OUT/upload-$TITLE.json"
cp "$ULOG" "$OUT/upload-$TITLE.log" 2>/dev/null || true
grep -oE 'https://youtu\.be/[A-Za-z0-9_-]+' "$ULOG" | tail -1
