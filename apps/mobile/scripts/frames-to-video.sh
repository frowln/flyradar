#!/usr/bin/env bash
# Screenshots with their times (scripts/simulator-demo.sh writes frames.txt:
# "<unix time> <file>" per line) into a video that keeps the real timing.
#
#   scripts/frames-to-video.sh frames.txt out.mp4 [speed] [width]
#
# speed 1.5 plays the tour half as fast again; the demo flight itself already
# runs twenty times faster than a real one. Needs ffmpeg and python3.
set -euo pipefail
LIST="$1"
OUT="$2"
SPEED="${3:-1.5}"
WIDTH="${4:-720}"
CONCAT="$(mktemp "${TMPDIR:-/tmp}/frames-concat.XXXXXX")"

python3 - "$LIST" > "$CONCAT" <<'PY'
import sys
rows = [line.split(" ", 1) for line in open(sys.argv[1], encoding="utf-8").read().splitlines() if " " in line]
times = [float(t) for t, _ in rows]
files = [f for _, f in rows]
for i, f in enumerate(files):
    d = times[i + 1] - times[i] if i + 1 < len(files) else 1.0
    print(f"file '{f}'")
    print(f"duration {max(d, 0.03):.3f}")
# The concat demuxer drops the last duration unless the last file is repeated.
if files:
    print(f"file '{files[-1]}'")
PY

ffmpeg -loglevel error -y -f concat -safe 0 -i "$CONCAT" \
  -vf "setpts=PTS/${SPEED},scale=${WIDTH}:-2,fps=30,format=yuv420p" \
  -c:v libx264 -preset veryfast -crf 25 -movflags +faststart -an "$OUT"
rm -f "$CONCAT"
echo "$(wc -l < "$LIST") frames → $OUT"
