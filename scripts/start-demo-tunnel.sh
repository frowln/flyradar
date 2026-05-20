#!/bin/bash
# Start backend + expose via ngrok for client demo
# Requires: brew install ngrok + free account at ngrok.com

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Starting SkyAtlas backend..."
cd "$REPO_ROOT/apps/backend"
nohup npx tsx src/index.ts > /tmp/skyatlas-backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# Give it a moment to start
sleep 3

if ! curl -s http://localhost:3000/health > /dev/null 2>&1; then
  echo ""
  echo "ERROR: Backend failed to start. Check logs:"
  echo "  tail -50 /tmp/skyatlas-backend.log"
  kill "$BACKEND_PID" 2>/dev/null || true
  exit 1
fi

echo "Backend running (PID $BACKEND_PID)"
echo ""
echo "Starting ngrok tunnel on port 3000..."
echo "Copy the https://xxx.ngrok-free.app URL shown below."
echo "Set it in apps/mobile/.env as: EXPO_PUBLIC_API_URL=https://xxx.ngrok-free.app"
echo ""
ngrok http 3000
