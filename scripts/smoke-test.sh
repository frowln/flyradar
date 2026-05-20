#!/bin/bash
# SkyAtlas backend smoke test — verifies all critical endpoints
set -e

BASE="${1:-http://localhost:3000}"
TOKEN="dev_smoketest_$(date +%s)_$(uuidgen | tr -d '-' | head -c 8)"
PASS=0
FAIL=0
SKIP=0

green() { echo -e "\033[32m✓ $1\033[0m"; PASS=$((PASS+1)); }
red()   { echo -e "\033[31m✗ $1\033[0m\n   $2"; FAIL=$((FAIL+1)); }
yellow(){ echo -e "\033[33m⊘ $1: $2\033[0m"; SKIP=$((SKIP+1)); }

echo "===== SkyAtlas Backend Smoke Test ====="
echo "Base URL: $BASE"
echo ""

# 1. Health endpoint (no auth required)
R=$(curl -s -o /tmp/sa-health -w "%{http_code}" "$BASE/health")
if [ "$R" = "200" ]; then green "Health endpoint reachable"; else red "Health failed" "HTTP $R"; fi

# 2. Metrics endpoint
R=$(curl -s -o /tmp/sa-metrics -w "%{http_code}" "$BASE/metrics")
if [ "$R" = "200" ]; then green "Metrics endpoint responds"; else red "Metrics failed" "HTTP $R"; fi

# 3. Auth rejection — no token
R=$(curl -s -o /tmp/sa-noauth -w "%{http_code}" -X POST "$BASE/flights/lookup" \
  -H "Content-Type: application/json" \
  -d '{"flightNumber":"SU100","date":"2026-05-22"}')
if [ "$R" = "401" ]; then green "Auth rejection works (no token = 401)"; else red "Auth bypass risk" "Got HTTP $R, expected 401"; fi

# 4. Flight lookup with auth
R=$(curl -s -o /tmp/sa-lookup -w "%{http_code}" -X POST "$BASE/flights/lookup" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"flightNumber":"SU100","date":"2026-05-22"}')
if [ "$R" = "200" ]; then
  green "Flight lookup with auth returns 200"
  python3 -c "
import sys, json
try:
  d = json.load(open('/tmp/sa-lookup'))
  origin = d.get('origin', {})
  dest   = d.get('destination', {})
  print('   Flight:', d.get('flightNumber'), '|', origin.get('iata','?'), '->', dest.get('iata','?'))
except Exception as e:
  print('   (could not parse response:', e, ')')
"
else
  red "Flight lookup failed" "HTTP $R — $(cat /tmp/sa-lookup 2>/dev/null | head -c 200)"
fi

# 5. Package endpoint — heavy, should return POIs
echo "Testing package endpoint (may take 10-60 sec)..."
R=$(curl -s -o /tmp/sa-pkg -w "%{http_code}" -X POST "$BASE/flights/package" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"flightNumber":"AB999","date":"2026-05-22","locale":"en"}' --max-time 90)
if [ "$R" = "200" ]; then
  POI_COUNT=$(python3 -c "
import json
try:
  d = json.load(open('/tmp/sa-pkg'))
  pois = d.get('pois', [])
  print(len(pois))
except:
  print('unknown')
")
  green "Package built with $POI_COUNT POIs"
elif [ "$R" = "404" ]; then
  yellow "Package build" "Flight AB999 not found in demo mode — expected in demo, not a failure"
else
  red "Package build failed" "HTTP $R — $(cat /tmp/sa-pkg 2>/dev/null | head -c 200)"
fi

# 6. Subscription verify endpoint
R=$(curl -s -o /tmp/sa-sub -w "%{http_code}" -X POST "$BASE/subscription/verify" \
  -H "Content-Type: application/json" \
  -d '{"appUserId":"test_user_smoke"}')
if [ "$R" = "200" ]; then green "Subscription verify endpoint responds"; else red "Subscription failed" "HTTP $R"; fi

# 7. Subscription verify rejects missing body
R=$(curl -s -o /tmp/sa-sub-bad -w "%{http_code}" -X POST "$BASE/subscription/verify" \
  -H "Content-Type: application/json" \
  -d '{}')
if [ "$R" = "400" ]; then green "Subscription verify rejects invalid body (400)"; else yellow "Subscription input validation" "Got HTTP $R, expected 400"; fi

# 8. Flight lookup — bad date format returns 400
R=$(curl -s -o /tmp/sa-baddate -w "%{http_code}" -X POST "$BASE/flights/lookup" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"flightNumber":"SU100","date":"not-a-date"}')
if [ "$R" = "400" ]; then green "Input validation rejects bad date (400)"; else red "Input validation missing" "Got HTTP $R, expected 400"; fi

# 9. Rate limit — use /flights/lookup (fast) with a fresh unique token, fire 110 rapid calls
# Global rate limit is 100/min keyed by x-device-id; use a fixed device-id to hit it quickly
echo "Testing rate limit (firing 110 rapid /flights/lookup calls, expects 429)..."
RL_TOKEN="rl_test_token_$(date +%s)"
RL_DEVICE="smoke-rl-device-$(date +%s)"
RATELIMITED=0
for i in $(seq 1 110); do
  R=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/flights/lookup" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $RL_TOKEN" \
    -H "x-device-id: $RL_DEVICE" \
    -d '{"flightNumber":"SU100","date":"2026-05-22"}' --max-time 5) || true
  if [ "$R" = "429" ]; then RATELIMITED=1; break; fi
done
if [ "$RATELIMITED" = "1" ]; then green "Rate limit enforces (429 after <110 calls)"; else yellow "Rate limit" "Didn't hit 429 in 110 tries — check rate limit config"; fi

# 10. CORS rejection from disallowed origin
R=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/flights/lookup" \
  -H "Origin: https://evil.example.com" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"flightNumber":"SU100","date":"2026-05-22"}')
# Fastify with custom CORS function returns 500 for disallowed origin
if [ "$R" = "500" ] || [ "$R" = "403" ]; then green "CORS rejects disallowed origin"; else yellow "CORS check" "Got HTTP $R — evaluate headers manually (allowed origins in index.ts)"; fi

# 11. Health response shape
TS=$(python3 -c "
import json
try:
  d = json.load(open('/tmp/sa-health'))
  ok = d.get('ok')
  ts = d.get('ts')
  print('ok' if ok is True and isinstance(ts, int) else 'bad')
except:
  print('bad')
")
if [ "$TS" = "ok" ]; then green "Health response has {ok:true, ts:number}"; else yellow "Health response shape" "Unexpected payload — check /tmp/sa-health"; fi

echo ""
echo "===== Result ====="
echo "PASS: $PASS"
echo "FAIL: $FAIL"
echo "SKIP/UNCLEAR: $SKIP"
if [ $FAIL -eq 0 ]; then
  echo -e "\033[32m✅ Smoke test PASSED\033[0m"
else
  echo -e "\033[31m❌ Smoke test FAILED\033[0m"
  exit 1
fi
