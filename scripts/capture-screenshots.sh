#!/bin/bash
# Manual screenshot capture helper for App Store submission
# Navigate the app to each screen, then press Enter to capture.
# Clears any stale frames from previous runs to avoid shipping duplicates.
set -e
DIR="docs/screenshots"
mkdir -p "$DIR"

# Drop stale frames so a botched run never leaks duplicates into git.
rm -f "$DIR"/0*.png "$DIR"/1*.png 2>/dev/null || true

shoot() {
  local name="$1"
  echo "Press Enter when on: $name"
  read
  local path="$DIR/$name.png"
  xcrun simctl io booted screenshot "$path"
  # Hash the file so accidental reuse of the same frame is visible immediately.
  local hash
  hash=$(md5 -q "$path" 2>/dev/null || md5sum "$path" | cut -d' ' -f1)
  echo "  Captured $path (md5: ${hash:0:10})"
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
echo "Verifying uniqueness…"
DUPES=$(find "$DIR" -maxdepth 1 -name "*.png" -exec md5 -q {} \; 2>/dev/null \
  | sort | uniq -d | wc -l | tr -d ' ')
if [ "$DUPES" != "0" ]; then
  echo "❌ Detected $DUPES duplicate screenshot(s) — re-shoot before submitting."
  exit 1
fi
echo "✓ All screenshots unique."
echo ""
echo "App Store size requirements:"
echo "  6.7\" iPhone: 1290x2796"
echo "  6.5\" iPhone: 1284x2778"
echo "  5.5\" iPhone: 1242x2208"
