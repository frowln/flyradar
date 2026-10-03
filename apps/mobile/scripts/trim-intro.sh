#!/usr/bin/env bash
# Cut the simulator's home screen off the start of a recording: the video
# starts at the first dark frame, which is the app (its screens are all dark;
# the iOS home screen is bright). Then a smaller copy for sending.
#
#   scripts/trim-intro.sh in.mp4 out.mp4 [width]
#
# Needs ffmpeg. Used by scripts/record-demo.sh and .github/workflows/ios.yml.
set -euo pipefail
IN="$1"
OUT="$2"
WIDTH="${3:-720}"

# Mean brightness once a second; the first second darker than 45/255 is the app.
start=$(ffmpeg -hide_banner -nostats -i "$IN" -vf "fps=1,scale=64:-2,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" -f null - 2>/dev/null |
  awk -F'[ =:]+' '/pts_time/ { t = $0; sub(/.*pts_time:/, "", t); sub(/ .*/, "", t) } /YAVG/ { if ($NF + 0 < 45) { print int(t); exit } }')
start=${start:-0}
# A second of the launch screen before it, so the cut is not abrupt.
[ "$start" -gt 1 ] && start=$((start - 1))
ffmpeg -loglevel error -y -ss "$start" -i "$IN" -vf "scale=${WIDTH}:-2,fps=30" \
  -c:v libx264 -preset veryfast -crf 26 -pix_fmt yuv420p -movflags +faststart -an "$OUT"
echo "trimmed ${start}s from the start → $OUT"
