#!/usr/bin/env bash
# One command on a Mac: build the iPhone app, take the whole demo tour in the
# iPhone simulator by itself, and leave the video on the Desktop.
#
#   cd apps/mobile && scripts/record-demo.sh
#
# 30–40 minutes the first time (most of it the Xcode build), about 20 after.
# The tour is .maestro/1-start … 7-people; scripts/simulator-demo.sh drives it.
set -euo pipefail
cd "$(dirname "$0")/.."

# shellcheck source=scripts/mac-preflight.sh
. scripts/mac-preflight.sh

# Maestro presses the buttons; it needs Java 17 or newer.
if ! /usr/libexec/java_home -v 17+ >/dev/null 2>&1; then
  fail "Нужна Java 17+ для робота, который нажимает кнопки. Поставьте: brew install --cask temurin (попросит пароль от Mac), затем запустите скрипт снова."
fi
export PATH="$PATH:$HOME/.maestro/bin"
if ! command -v maestro >/dev/null; then
  say "Ставлю Maestro (робот для симулятора)…"
  curl -fsSL "https://get.maestro.mobile.dev" | bash
fi
command -v brew >/dev/null || fail "Нужен Homebrew: поставьте одной командой с сайта brew.sh и запустите скрипт снова."
command -v ffmpeg >/dev/null || { say "Ставлю ffmpeg (обрезка и сжатие видео)…"; brew install ffmpeg; }

demo_env

say "Создаю проект Xcode (3–5 минут)…"
npx expo prebuild --platform ios --clean

say "Собираю приложение в Xcode для симулятора (первый раз 15–25 минут)…"
set -o pipefail
(cd ios && xcodebuild -workspace SkyAtlas.xcworkspace -scheme SkyAtlas -configuration Release \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build CODE_SIGNING_ALLOWED=NO COMPILER_INDEX_STORE_ENABLE=NO build) > /tmp/skyatlas-xcodebuild.log 2>&1 ||
  fail "Сборка не прошла. Последние строки — в /tmp/skyatlas-xcodebuild.log (пришлите их: tail -40 /tmp/skyatlas-xcodebuild.log)"
APP="ios/build/Build/Products/Release-iphonesimulator/SkyAtlas.app"

OUT="$HOME/Desktop/SkyAtlas-demo-$(date +%Y%m%d-%H%M)"
say "Экскурсия по приложению в симуляторе iPhone, с записью (15–20 минут). Окно симулятора можно не трогать."
open -a Simulator || true
scripts/simulator-demo.sh "$APP" "$OUT"

if [ -s "$OUT/frames.txt" ]; then
  # From timed screenshots, at the screen's own width, half as fast again as real time.
  scripts/frames-to-video.sh "$OUT/frames.txt" "$HOME/Desktop/SkyAtlas-demo.mp4" 1.5 1080
elif [ -f "$OUT/demo-flight.mp4" ]; then
  scripts/trim-intro.sh "$OUT/demo-flight.mp4" "$HOME/Desktop/SkyAtlas-demo.mp4" 1080 || cp "$OUT/demo-flight.mp4" "$HOME/Desktop/SkyAtlas-demo.mp4"
fi
say "Готово."
echo "  Видео:       ~/Desktop/SkyAtlas-demo.mp4"
echo "  Скриншоты:   $OUT/shots"
echo "  Что прошло:  $OUT/summary.txt"
grep -E "^\[(Passed|Failed)\]" "$OUT/summary.txt" 2>/dev/null || true
open "$HOME/Desktop/SkyAtlas-demo.mp4" 2>/dev/null || true
