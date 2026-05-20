#!/bin/bash
# Manual screenshot capture helper for App Store submission
# Navigate the app to each screen, then press Enter to capture
set -e
DIR="docs/screenshots"
mkdir -p "$DIR"

shoot() {
  local name="$1"
  echo "Press Enter when on: $name"
  read
  xcrun simctl io booted screenshot "$DIR/$name.png"
  echo "  Captured $DIR/$name.png"
}

shoot 01-home-with-flights
shoot 02-home-empty
shoot 03-add-flight
shoot 04-flight-detail-boarding-pass
shoot 05-in-flight-map
shoot 06-poi-card
shoot 07-poi-detail-nat-geo
shoot 08-flight-summary
shoot 09-profile-passport
shoot 10-wrapped-hero

echo ""
echo "All 10 screenshots saved to $DIR/"
echo "App Store size requirements:"
echo "  6.7\" iPhone: 1290x2796"
echo "  6.5\" iPhone: 1284x2778"
echo "  5.5\" iPhone: 1242x2208"
