#!/bin/bash
# Opens the outbound proxy tunnel used by AviationStack lookups.
#
# AviationStack answers Russian IPs with a Cloudflare block page, so flight
# lookup cannot work from the development machine directly. tinyproxy runs on the
# Frankfurt box bound to 127.0.0.1 — never exposed to the internet, because an
# open proxy on a public port is found and abused within hours — and this
# forwards a local port to it over SSH.
#
# The backend reads OUTBOUND_PROXY_URL from apps/backend/.env and sends only
# AviationStack traffic this way. Everything else goes direct, so a dead tunnel
# costs one endpoint rather than the whole product.
#
# Usage: ./scripts/proxy-tunnel.sh [start|stop|status]

set -euo pipefail

HOST="root@37.220.81.52"
LOCAL_PORT=8888
REMOTE="127.0.0.1:8888"
MATCH="${LOCAL_PORT}:${REMOTE}"

case "${1:-start}" in
  start)
    if pgrep -f "$MATCH" >/dev/null 2>&1; then
      echo "Tunnel already open on localhost:${LOCAL_PORT}"
    else
      ssh -f -N \
        -o BatchMode=yes \
        -o ExitOnForwardFailure=yes \
        -o ServerAliveInterval=30 \
        -o ServerAliveCountMax=3 \
        -L "${LOCAL_PORT}:${REMOTE}" "$HOST"
      echo "Tunnel opened on localhost:${LOCAL_PORT}"
    fi
    printf 'exit point: '
    curl -s -m 15 -x "http://127.0.0.1:${LOCAL_PORT}" https://ipinfo.io/json \
      | sed -n 's/.*"city": "\([^"]*\)".*/\1/p' || echo "unreachable"
    ;;
  stop)
    pkill -f "$MATCH" && echo "Tunnel closed" || echo "No tunnel running"
    ;;
  status)
    if pgrep -f "$MATCH" >/dev/null 2>&1; then
      echo "open"
    else
      echo "closed"
      exit 1
    fi
    ;;
  *)
    echo "Usage: $0 [start|stop|status]" >&2
    exit 2
    ;;
esac
