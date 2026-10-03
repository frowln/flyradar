#!/usr/bin/env bash
# Prepare the iPhone app for the client demo and open it in Xcode.
#
#   cd apps/mobile && scripts/xcode-demo.sh
#
# With a free Apple ID (no paid developer account):
#
#   IOS_PERSONAL_TEAM=1 IOS_BUNDLE_ID=com.yourname.skyatlas scripts/xcode-demo.sh
#
# Then in Xcode: Signing & Capabilities → Team, pick the iPhone at the top, ▶.
# Step by step: docs/IOS.md.
set -euo pipefail
cd "$(dirname "$0")/.."

# The demo as the client should see it: sample travellers in «Люди», demo
# flights counted in the passport, the Pro screen. Read when Xcode bundles the
# JavaScript, so they live in a file rather than in this shell.
cat > .env.local <<'ENV'
EXPO_PUBLIC_DEMO_SOCIAL=1
EXPO_PUBLIC_DEMO_COUNTS=1
EXPO_PUBLIC_DEMO_PAYWALL=1
ENV

npx expo prebuild --platform ios --clean

# ▶ builds Release: the app runs on its own, with no Metro server on the Mac
# and at full speed, the way it will on the client's phone.
perl -0pi -e 's/(<LaunchAction\s+buildConfiguration = ")Debug/${1}Release/' ios/SkyAtlas.xcodeproj/xcshareddata/xcschemes/SkyAtlas.xcscheme

open ios/SkyAtlas.xcworkspace
