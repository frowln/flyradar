#!/usr/bin/env bash
# The iPhone app for the client demo, on your Mac.
#
#   cd apps/mobile
#   scripts/xcode-demo.sh sim      # iPhone simulator on the Mac: no iPhone, no Apple ID
#   scripts/xcode-demo.sh          # your iPhone: prepares the project and opens Xcode
#
# With a free Apple ID (no paid developer account):
#
#   IOS_PERSONAL_TEAM=1 IOS_BUNDLE_ID=com.yourname.skyatlas scripts/xcode-demo.sh
#
# Then in Xcode: Signing & Capabilities → Team, pick the iPhone at the top, ▶.
# Step by step: docs/IOS.md.
set -euo pipefail
cd "$(dirname "$0")/.."
MODE="${1:-device}"

say() { printf '\n\033[1;33m▶ %s\033[0m\n' "$1"; }
fail() {
  printf '\n\033[1;31m✗ %s\033[0m\n' "$1" >&2
  exit 1
}

# --- What the Mac needs, checked up front with a way to fix each ---------------
[ "$(uname)" = "Darwin" ] || fail "Нужен Mac: iPhone-приложение собирается только в Xcode на macOS."
xcode-select -p >/dev/null 2>&1 && xcodebuild -version >/dev/null 2>&1 ||
  fail "Не найден Xcode. Поставьте его из App Store, откройте один раз и выполните: sudo xcode-select -s /Applications/Xcode.app"
if ! xcodebuild -checkFirstLaunchStatus >/dev/null 2>&1; then
  fail "Xcode ещё не закончил первую настройку. Выполните: sudo xcodebuild -runFirstLaunch (и примите лицензию: sudo xcodebuild -license accept)"
fi
command -v node >/dev/null || fail "Не найден Node.js. Поставьте: brew install node@20 (или с nodejs.org, версия 20.19+)"
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>20||(a===20&&b>=19)?0:1)' ||
  fail "Node.js $(node -v) слишком старый, нужен 20.19 или новее: brew install node@20"
command -v pod >/dev/null || fail "Не найден CocoaPods. Поставьте: brew install cocoapods"

if [ ! -d ../../node_modules/expo ]; then
  say "Ставлю зависимости (npm install, 2–5 минут)…"
  (cd ../.. && npm install)
fi

# --- The demo as the client should see it -------------------------------------
# Sample travellers in «Люди», demo flights counted in the passport, the Pro
# screen; and, while we are still testing, the error screen says what broke, so
# a screenshot of it is enough to fix it. Read when Xcode bundles the
# JavaScript, so they live in a file rather than in this shell.
cat > .env.local <<'ENV'
EXPO_PUBLIC_DEMO_SOCIAL=1
EXPO_PUBLIC_DEMO_COUNTS=1
EXPO_PUBLIC_DEMO_PAYWALL=1
EXPO_PUBLIC_SHOW_ERRORS=1
ENV

if [ "$MODE" = "sim" ]; then
  say "Собираю и запускаю в симуляторе iPhone (первый раз 10–20 минут)…"
  # Release: runs on its own, without the Metro server, at full speed.
  npx expo run:ios --configuration Release
  say "Готово. Запись видео: в окне Simulator — File → Record Screen (⌘R), остановить — тем же пунктом."
  exit 0
fi

say "Создаю проект Xcode и ставлю CocoaPods (3–5 минут)…"
npx expo prebuild --platform ios --clean

# ▶ builds Release: the app runs on its own, with no Metro server on the Mac
# and at full speed, the way it will on the client's phone.
perl -0pi -e 's/(<LaunchAction\s+buildConfiguration = ")Debug/${1}Release/' ios/SkyAtlas.xcodeproj/xcshareddata/xcschemes/SkyAtlas.xcscheme

say "Открываю Xcode. Дальше: SkyAtlas → Signing & Capabilities → Team; вверху выберите свой iPhone; ▶"
open ios/SkyAtlas.xcworkspace
