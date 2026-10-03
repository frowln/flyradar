#!/usr/bin/env bash
# Install a simulator build of SkyAtlas on an iPhone simulator in Russian and
# take the whole demo tour with Maestro (.maestro/1-start … 7-people): the
# Moscow–Sochi flight with the map, landing, the Atlas, People, settings.
# Keeps a video of all of it and screenshots along the way.
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

# The first start of Maestro's iOS driver on a fresh simulator takes minutes
# on a CI machine; the default wait gives up before it is ready.
export MAESTRO_DRIVER_STARTUP_TIMEOUT=600000
export MAESTRO_CLI_NO_ANALYTICS=1

touch "$OUT/.start"
xcrun simctl io "$UDID" recordVideo --codec=h264 --force "$OUT/demo-flight.mp4" &
REC=$!
sleep 2

# The whole tour in one session (.maestro/config.yaml orders the parts).
started=$(date +%s)
echo "$started" > "$OUT/.video-start"
# The driver takes minutes to start; the video for people starts with the tour.
( until grep -q "Flow 1-start\|> Flow" "$OUT/maestro.log" 2>/dev/null; do sleep 1; done; date +%s > "$OUT/.tour-start" ) &
( cd "$HERE" && maestro --device "$UDID" test .maestro --test-output-dir "$OUT/maestro" --debug-output "$OUT/maestro-debug" ) 2>&1 | tee "$OUT/maestro.log"
code=${PIPESTATUS[0]}
# An older Maestro without those options fails at once: run it plain.
if [ "$code" != 0 ] && [ $(( $(date +%s) - started )) -lt 30 ]; then
  ( cd "$HERE" && maestro --device "$UDID" test .maestro ) 2>&1 | tee -a "$OUT/maestro.log"
  code=${PIPESTATUS[0]}
fi
echo "maestro exit $code" > "$OUT/summary.txt"
grep -E "^\s*\[(Passed|Failed)\]|Flow .* (Passed|Failed)|FAILED|COMPLETED|> Flow" "$OUT/maestro.log" | tail -400 >> "$OUT/summary.txt" || true
shot 99-end

kill -INT "$REC" 2>/dev/null
wait "$REC" 2>/dev/null
xcrun simctl spawn "$UDID" log show --last 90m --style compact --predicate 'process == "SkyAtlas"' > "$OUT/app.log" 2>/dev/null || true
# Crash reports of the app, if it died on the way (the host keeps them).
mkdir -p "$OUT/crash"
find "$HOME/Library/Logs/DiagnosticReports" -newer "$OUT/.start" -iname '*SkyAtlas*' 2>/dev/null | while read -r c; do cp "$c" "$OUT/crash/"; done
# takeScreenshot lands beside the flow or in the output folder, depending on
# the Maestro version: gather them all.
{ find "$HERE" "$HERE/.maestro" -maxdepth 1 -name '*.png'; find "$OUT/maestro" "$OUT/maestro-debug" "$HOME/.maestro/tests" -name '*.png'; } 2>/dev/null | while read -r f; do
  cp "$f" "$OUT/shots/" 2>/dev/null || true
done
rm -f "$HERE"/*.png "$HERE"/.maestro/*.png
ls -la "$OUT" "$OUT/shots"
