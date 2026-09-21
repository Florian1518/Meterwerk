FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S meterwerk && adduser -S meterwerk -G meterwerk
COPY --from=builder --chown=meterwerk:meterwerk /app/.next ./.next
COPY --from=builder --chown=meterwerk:meterwerk /app/public ./public
COPY --from=builder --chown=meterwerk:meterwerk /app/node_modules ./node_modules
COPY --from=builder --chown=meterwerk:meterwerk /app/package.json ./package.json
COPY --from=builder --chown=meterwerk:meterwerk /app/prisma ./prisma
USER meterwerk
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD wget -q -O- http://127.0.0.1:3000/api/health/live || exit 1
CMD ["node", "node_modules/next/dist/bin/next", "start"]
