# Builds the convenr web application as a standalone Next.js server.
FROM docker.io/library/node:26.13.1-slim AS base
RUN npm install --global @nubjs/nub@0.11.1
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
# The lockfile names every workspace package, so a frozen install needs each manifest.
COPY packages/sdk-ts/package.json packages/sdk-ts/package.json
COPY packages/sdk-codegen/package.json packages/sdk-codegen/package.json
RUN --mount=type=cache,id=nub-cache,target=/root/.cache nub ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN nub run --filter @convenr/web build

FROM docker.io/library/node:26.13.1-slim AS run
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
# Standalone maintenance scripts run with plain Node next to the server and load `pg` directly.
COPY --from=build --chown=node:node /repo/apps/web/scripts/purge.mts /repo/apps/web/scripts/usage.mts ./apps/web/scripts/
COPY --from=build --chown=node:node /repo/apps/web/src/server/maintenance.ts ./apps/web/src/server/maintenance.ts
COPY --from=build --chown=node:node /repo/apps/web/src/domain/usage.ts ./apps/web/src/domain/usage.ts
RUN ln -s /app/node_modules/.store/node_modules/pg /app/apps/web/node_modules/pg
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
