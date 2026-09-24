#!/bin/sh
# Brings the schema up to date, then becomes the server.
#
# Migrations run here rather than by hand so a deploy can never start code
# against a schema it does not expect. `exec` makes the server PID 1, so it
# receives `docker stop`'s SIGTERM itself and shuts down cleanly.
#
# SKIP_MIGRATIONS=1 skips the step, for when migrations are applied by a
# separate one-off job (e.g. several replicas starting at once).
set -e

if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  # --no: never download a prisma CLI at runtime; use the one in the image.
  npx --no prisma migrate deploy
fi

exec "$@"
