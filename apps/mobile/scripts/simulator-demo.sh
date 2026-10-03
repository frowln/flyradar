#!/usr/bin/env bash
# Install a simulator build of SkyAtlas on an iPhone simulator in Russian,
# fly the Moscow–Sochi demo with Maestro and keep the video and screenshots.
#
#   scripts/simulator-demo.sh path/to/SkyAtlas.app out-dir
#
# Needs macOS with Xcode and Maestro (https://maestro.mobile.dev). Used by
# .github/workflows/ios.yml; works the same on a Mac.
set -uo pipefail

APP="$1"
OUT="$(mkdir -p "$2" && cd "$2" && pwd)"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE=com.skyatlas.app
mkdir -p "$OUT/shots" "$OUT/tree"

# The newest iPhone "Pro" (not Max) the installed runtimes offer.
UDID=$(xcrun simctl list devices available -j | python3 -c '
import json, re, sys
devs = json.load(sys.stdin)["devices"]
best = None
for rt, items in devs.items():
    m = re.search(r"iOS-(\d+)-(\d+)", rt)
    if not m: continue
    ver = (int(m.group(1)), int(m.group(2)))
    for d in items:
        n = d["name"]
        if n.startswith("iPhone") and "Pro" in n and "Max" not in n:
            num = int((re.findall(r"\d+", n) or ["0"])[0])
            key = (ver, num)
            if best is None or key > best[0]: best = (key, d["udid"], n, rt)
print(best[1]); print(best[2] + " / " + best[3], file=sys.stderr)
')
echo "simulator: $UDID"

xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b
# Russian everywhere: the app takes its language from the system.
xcrun simctl spawn "$UDID" defaults write "Apple Global Domain" AppleLanguages -array ru-RU ru
xcrun simctl spawn "$UDID" defaults write "Apple Global Domain" AppleLocale -string ru_RU
xcrun simctl shutdown "$UDID"
xcrun simctl boot "$UDID"
xcrun simctl bootstatus "$UDID" -b
xcrun simctl status_bar "$UDID" override --time "9:41" --dataNetwork wifi --wifiBars 3 --cellularBars 4 --batteryState charged --batteryLevel 100 || true

xcrun simctl install "$UDID" "$APP"
xcrun simctl privacy "$UDID" grant location "$BUNDLE" || true

shot() { xcrun simctl io "$UDID" screenshot --type=png "$OUT/shots/$1.png" >/dev/null 2>&1 || true; }
tree() { maestro --device "$UDID" hierarchy > "$OUT/tree/$1.json" 2>/dev/null || true; }
flow() {
  ( cd "$OUT/shots" && maestro --device "$UDID" test "$HERE/.maestro/$1" ) 2>&1 | tee -a "$OUT/maestro.log"
  local code=${PIPESTATUS[0]}
  echo "flow $1 → $code" | tee -a "$OUT/summary.txt"
  return 0
}

xcrun simctl io "$UDID" recordVideo --codec=h264 --force "$OUT/demo-flight.mp4" &
REC=$!
sleep 2

flow 1-start.yaml
tree after-start
sleep 20
flow 2-map.yaml
tree after-map
flow 3-panel.yaml
tree after-panel

# The demo flies twenty times faster than a real flight: Moscow–Sochi lands
# in about five minutes. A frame every 40 seconds until then.
for i in $(seq 1 9); do
  sleep 40
  shot "$(printf '30-cruise-%02d' "$i")"
done
tree end
shot 40-end

kill -INT "$REC" 2>/dev/null
wait "$REC" 2>/dev/null
xcrun simctl spawn "$UDID" log show --last 15m --style compact --predicate 'process == "SkyAtlas"' > "$OUT/app.log" 2>/dev/null || true
ls -la "$OUT" "$OUT/shots"
