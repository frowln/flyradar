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

# shellcheck source=scripts/mac-preflight.sh
. scripts/mac-preflight.sh

demo_env

if [ "$MODE" = "sim" ]; then
  # The simulator needs no signing. Without Sign in with Apple and push, Expo
  # does not stop to ask for a development team.
  export IOS_PERSONAL_TEAM=1
  xcode_project
  say "Собираю и запускаю в симуляторе iPhone (первый раз 10–20 минут)…"
  # Release: runs on its own, without the Metro server, at full speed.
  npx expo run:ios --configuration Release --no-install
  say "Готово. Запись видео: в окне Simulator — File → Record Screen (⌘R), остановить — тем же пунктом."
  exit 0
fi

xcode_project

# ▶ builds Release: the app runs on its own, with no Metro server on the Mac
# and at full speed, the way it will on the client's phone.
perl -0pi -e 's/(<LaunchAction\s+buildConfiguration = ")Debug/${1}Release/' ios/SkyAtlas.xcodeproj/xcshareddata/xcschemes/SkyAtlas.xcscheme

say "Открываю Xcode. Дальше: SkyAtlas → Signing & Capabilities → Team; вверху выберите свой iPhone; ▶"
open ios/SkyAtlas.xcworkspace
