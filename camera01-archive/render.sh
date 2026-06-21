#!/bin/bash
# ============================================================================
# render.sh — merge a date-folder of Insta360 (or any) clips into one 1080p60
# H.264 mp4 ready for YouTube upload. Hardware-accelerated end-to-end on
# Apple Silicon.
#
# Usage:
#   ./render.sh <source_dir> [output_name]
#
# Example:
#   ./render.sh ~/Desktop/Camera01/2026-02-17
#   → produces $source_dir/_render/Feb17_2026.mp4
#
# Inputs handled:
#   • .mp4   — video clips (encoded as below)
#   • .jpg / .jpeg / .png — still images, shown for $IMAGE_DUR (1.5s) each
#
# Mixing: source files are sorted by the YYYYMMDD_HHMMSS_NNN portion of the
# filename so photos slot in chronologically among the videos rather than
# getting bunched by prefix.
#
# Pipeline per clip:
#   • HW HEVC decode via VideoToolbox
#   • "area" downscale (best quality/speed for 4K→1080p)
#   • If 16:9 landscape: simple scale to 1920×1080
#   • If portrait or 4:3:   scale-to-fit + empty pad (the surrounding canvas
#     just stays empty, which renders as black in mp4). No blur background —
#     the per-frame boxblur on the bg branch was CPU-bound and dominated
#     runtime on portrait-heavy days (Apr 2 took ~3h 46m for 34 GB source).
#     Empty pad cuts that to landscape-mode throughput.
#     (rotation metadata auto-handled by ffmpeg's autorotate)
#   • HW H.264 encode (h264_videotoolbox -realtime 1) at 14M target / 18M cap
#   • AAC 192k stereo, +faststart
#
# Concurrency: 2 parallel ffmpeg jobs. Apple M3 base has one HW encoder unit
#   so 2-way already saturates it; bumping to 3-4 doesn't help.
#
# Throughput: ~3.5–4× realtime on M3 base. 51 min of 4K source → ~13–17 min
# wall time end-to-end including the final concat.
#
# Quality: visually indistinguishable from libx264 slower CRF 17 once YouTube
# re-encodes for delivery (YouTube targets ~10 Mbps VP9 for 1080p60).
# ============================================================================
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "usage: $0 <source_dir> [output_name]" >&2
  exit 2
fi

SRC="${1%/}"
if [ ! -d "$SRC" ]; then
  echo "not a directory: $SRC" >&2
  exit 2
fi

# Default output name: <Mon><DD>_<YYYY>.mp4 derived from folder name YYYY-MM-DD.
DATE_DIR=$(basename "$SRC")
if [ -n "${2:-}" ]; then
  OUT_NAME="$2"
elif [[ "$DATE_DIR" =~ ^([0-9]{4})-([0-9]{2})-([0-9]{2})$ ]]; then
  YYYY=${BASH_REMATCH[1]}; MM=${BASH_REMATCH[2]}; DD=${BASH_REMATCH[3]}
  case $MM in
    01) MON=Jan;; 02) MON=Feb;; 03) MON=Mar;; 04) MON=Apr;;
    05) MON=May;; 06) MON=Jun;; 07) MON=Jul;; 08) MON=Aug;;
    09) MON=Sep;; 10) MON=Oct;; 11) MON=Nov;; 12) MON=Dec;;
  esac
  OUT_NAME="${MON}${DD}_${YYYY}.mp4"
else
  OUT_NAME="merged.mp4"
fi

OUT="$SRC/_render"
LOG="$OUT/render.log"
LIST="$OUT/concat.txt"
FINAL="$OUT/$OUT_NAME"

mkdir -p "$OUT"
: > "$LOG"
: > "$LIST"

VBR_TARGET="14M"
VBR_MAX="18M"
VBR_BUF="20M"
HW_DECODE="-hwaccel videotoolbox"
MAX_JOBS=2

F_LAND='scale=1920:1080:flags=area,setsar=1,fps=60,format=yuv420p'

# Portrait / 4:3 → scale to fit inside 1920×1080, leave the remainder empty.
# The empty pad renders as black in mp4 but it's not painted black per se —
# it's just the canvas where the source doesn't reach. Replaces the older
# blur-fill which was CPU-bound on the boxblur branch.
F_PAD='scale=1920:1080:force_original_aspect_ratio=decrease:flags=area,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=60,format=yuv420p'

IMAGE_DUR=1.5   # how long each still image is shown, seconds

encode_clip() {
  local in="$1" out="$2" mode="$3"
  echo "[$(date +%H:%M:%S)] encode ($mode): $(basename "$in") -> $(basename "$out")" | tee -a "$LOG"
  if [ "$mode" = "landscape" ]; then
    ffmpeg -hide_banner -loglevel warning -y \
      $HW_DECODE -i "$in" \
      -vf "$F_LAND" \
      -c:v h264_videotoolbox -realtime 1 \
      -b:v "$VBR_TARGET" -maxrate "$VBR_MAX" -bufsize "$VBR_BUF" \
      -profile:v high -level 4.2 -pix_fmt yuv420p -tag:v avc1 \
      -c:a aac -b:a 192k -ar 48000 -ac 2 \
      -movflags +faststart \
      "$out" 2>>"$LOG"
  else
    ffmpeg -hide_banner -loglevel warning -y \
      $HW_DECODE -i "$in" \
      -vf "$F_PAD" \
      -c:v h264_videotoolbox -realtime 1 \
      -b:v "$VBR_TARGET" -maxrate "$VBR_MAX" -bufsize "$VBR_BUF" \
      -profile:v high -level 4.2 -pix_fmt yuv420p -tag:v avc1 \
      -c:a aac -b:a 192k -ar 48000 -ac 2 \
      -movflags +faststart \
      "$out" 2>>"$LOG"
  fi
}

# Convert a still image into a $IMAGE_DUR seconds video clip at 1920×1080 60fps
# with silent stereo audio so the concat demuxer's -c copy works. Uses the same
# scale+pad as portrait video clips (empty canvas around the source).
encode_image() {
  local in="$1" out="$2"
  echo "[$(date +%H:%M:%S)] encode (image): $(basename "$in") -> $(basename "$out")" | tee -a "$LOG"
  ffmpeg -hide_banner -loglevel warning -y \
    -loop 1 -t "$IMAGE_DUR" -i "$in" \
    -f lavfi -t "$IMAGE_DUR" -i anullsrc=channel_layout=stereo:sample_rate=48000 \
    -vf "$F_PAD" \
    -c:v h264_videotoolbox -realtime 1 \
    -b:v "$VBR_TARGET" -maxrate "$VBR_MAX" -bufsize "$VBR_BUF" \
    -profile:v high -level 4.2 -pix_fmt yuv420p -tag:v avc1 \
    -c:a aac -b:a 192k -ar 48000 -ac 2 \
    -shortest -movflags +faststart \
    "$out" 2>>"$LOG"
}

# Build sorted source list — mp4 + still images mixed chronologically.
# Insta360 filenames embed YYYYMMDD_HHMMSS_NNN so we sort by that key (strips
# the VID_/IMG_/PRO_VID_/PRO_IMG_ prefix). This lets photos slot in by capture
# time among the videos rather than getting bunched by prefix.
CLIPS=()
while IFS= read -r line; do
  CLIPS+=("$line")
done < <(cd "$SRC" && {
  ls *.mp4 *.jpg *.jpeg *.png *.JPG *.JPEG *.PNG 2>/dev/null
} | awk '{
  if (match($0, /[0-9]{8}_[0-9]{6}_[0-9]+/))
    print substr($0, RSTART, RLENGTH) "\t" $0;
  else
    print "00000000_000000_000" "\t" $0;
}' | sort -k1,1 | cut -f2)

if [ ${#CLIPS[@]} -eq 0 ]; then
  echo "no .mp4 / .jpg / .jpeg / .png files in $SRC" >&2
  exit 2
fi

is_image() {
  case "$1" in
    *.jpg|*.JPG|*.jpeg|*.JPEG|*.png|*.PNG) return 0;;
    *) return 1;;
  esac
}

i=0
for f in "${CLIPS[@]}"; do
  i=$((i+1))
  printf -v idx "%02d" $i
  out_file="$OUT/clip_${idx}.mp4"

  if is_image "$f"; then
    while [ $(jobs -rp | wc -l) -ge $MAX_JOBS ]; do sleep 0.3; done
    encode_image "$SRC/$f" "$out_file" &
    echo "file 'clip_${idx}.mp4'" >> "$LIST"
    continue
  fi

  dims=$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=width,height:stream_side_data=rotation \
    -of default=nw=1 "$SRC/$f")
  w=$(echo "$dims" | awk -F= '/^width/{print $2}')
  h=$(echo "$dims" | awk -F= '/^height/{print $2}')
  rot=$(echo "$dims" | awk -F= '/^rotation/{print $2}')
  rot=${rot:-0}
  if [ "$rot" = "90" ] || [ "$rot" = "-90" ] || [ "$rot" = "270" ] || [ "$rot" = "-270" ]; then
    tmp=$w; w=$h; h=$tmp
  fi
  if [ "$((w*9))" = "$((h*16))" ]; then mode="landscape"; else mode="pad"; fi

  while [ $(jobs -rp | wc -l) -ge $MAX_JOBS ]; do sleep 0.3; done
  encode_clip "$SRC/$f" "$out_file" "$mode" &
  echo "file 'clip_${idx}.mp4'" >> "$LIST"
done
wait

echo "[$(date +%H:%M:%S)] concatenating ${#CLIPS[@]} clips" | tee -a "$LOG"
ffmpeg -hide_banner -loglevel warning -y \
  -f concat -safe 0 -i "$LIST" \
  -c copy -movflags +faststart \
  "$FINAL" 2>>"$LOG"

echo "[$(date +%H:%M:%S)] DONE → $FINAL" | tee -a "$LOG"
ls -lh "$FINAL" | tee -a "$LOG"
