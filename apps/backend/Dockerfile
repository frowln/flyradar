# syntax=docker/dockerfile:1
#
# SkyAtlas backend. Build from the REPOSITORY ROOT, not from apps/backend:
#
#   docker build -f apps/backend/Dockerfile -t skyatlas-backend .
#
# The repo is an npm workspace, so the only lockfile is the root one, and the
# backend compiles against the types in packages/shared. With apps/backend as
# the context there was no lockfile for `npm ci` to install from.
# docker-compose.prod.yml builds it this way; Dockerfile.dockerignore (next to
# this file) trims the context to what the image needs.

FROM node:20-alpine AS deps
# Prisma's schema engine needs libssl 3, which Alpine's base already carries
# (apk itself links against it), so no extra packages are installed.
WORKDIR /repo
# Manifests before sources, so the install layer survives code edits. Every
# workspace's package.json is required for npm to accept the root lockfile,
# even though only the backend's dependencies are installed.
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
# Dev dependencies stay: TypeScript builds the image, and the prisma CLI —
# a devDependency — applies migrations when the container starts.
RUN npm ci --workspace apps/backend --workspace packages/shared \
      --include-workspace-root=false --no-audit --no-fund

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/backend apps/backend
WORKDIR /repo/apps/backend
RUN npx prisma generate && npm run build

FROM node:20-alpine AS runtime
# npx runs at every start (migrations); its update check is noise in the logs.
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /repo
# node_modules carries the Prisma client generated in the build stage.
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/package.json ./
COPY --from=build /repo/apps/backend/package.json /repo/apps/backend/prisma.config.ts apps/backend/
COPY --from=build /repo/apps/backend/prisma apps/backend/prisma
COPY --from=build /repo/apps/backend/dist apps/backend/dist
COPY --chmod=755 apps/backend/docker-entrypoint.sh apps/backend/docker-entrypoint.sh
WORKDIR /repo/apps/backend
USER node
EXPOSE 3000
# Applies pending migrations, then execs the command below.
ENTRYPOINT ["/repo/apps/backend/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
