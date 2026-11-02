ARG VERSION=unknown
ARG GIT_SHA=unknown
ARG BUILD_TIMESTAMP=unknown
ARG NEXT_PUBLIC_METERWERK_ENV=production

FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS builder
WORKDIR /app
ARG VERSION
ARG GIT_SHA
ARG BUILD_TIMESTAMP
ARG NEXT_PUBLIC_METERWERK_ENV
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 BUILD_VERSION=$VERSION \
  GIT_COMMIT_SHA=$GIT_SHA BUILD_TIMESTAMP=$BUILD_TIMESTAMP \
  NEXT_PUBLIC_METERWERK_ENV=$NEXT_PUBLIC_METERWERK_ENV
RUN DATABASE_URL=postgresql://127.0.0.1:5432/meterwerk_build pnpm build
RUN node scripts/copy-argon2-runtime.mjs /app/.next/standalone

FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS runner
WORKDIR /app
ARG VERSION
ARG GIT_SHA
ARG BUILD_TIMESTAMP
ARG NEXT_PUBLIC_METERWERK_ENV
LABEL org.opencontainers.image.source=https://github.com/Florian1518/Meterwerk \
  org.opencontainers.image.version=$VERSION \
  org.opencontainers.image.revision=$GIT_SHA \
  org.opencontainers.image.created=$BUILD_TIMESTAMP \
  org.opencontainers.image.base.name=node:22-alpine \
  de.meterwerk.environment=$NEXT_PUBLIC_METERWERK_ENV
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 BUILD_VERSION=$VERSION \
  GIT_COMMIT_SHA=$GIT_SHA BUILD_TIMESTAMP=$BUILD_TIMESTAMP \
  NEXT_PUBLIC_METERWERK_ENV=$NEXT_PUBLIC_METERWERK_ENV
RUN addgroup -S meterwerk && adduser -S meterwerk -G meterwerk
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
RUN mkdir -p /app/.local/attachments && chown -R meterwerk:meterwerk /app/.local
COPY --from=builder --chown=meterwerk:meterwerk /app/.next/standalone ./
COPY --from=builder --chown=meterwerk:meterwerk /app/.next/static ./.next/static
COPY --from=builder --chown=meterwerk:meterwerk /app/public ./public
COPY --from=builder --chown=meterwerk:meterwerk /app/package.json ./package.json
COPY --from=builder --chown=meterwerk:meterwerk /app/prisma ./prisma
USER meterwerk
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD wget -q -O- --header='x-forwarded-proto: https' --header='x-forwarded-host: localhost' http://127.0.0.1:3000/api/health/ready || exit 1
ENV HOSTNAME=0.0.0.0 PORT=3000
ENTRYPOINT ["node"]
CMD ["server.js"]
