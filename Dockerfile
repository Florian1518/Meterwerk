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
RUN DATABASE_URL=postgresql://127.0.0.1:5432/meterwerk_build pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S meterwerk && adduser -S meterwerk -G meterwerk
RUN mkdir -p /app/.local/attachments && chown -R meterwerk:meterwerk /app/.local
COPY --from=builder --chown=meterwerk:meterwerk /app/.next/standalone ./
COPY --from=builder --chown=meterwerk:meterwerk /app/.next/static ./.next/static
COPY --from=builder --chown=meterwerk:meterwerk /app/public ./public
COPY --from=builder --chown=meterwerk:meterwerk /app/node_modules ./node_modules
COPY --from=builder --chown=meterwerk:meterwerk /app/package.json ./package.json
COPY --from=builder --chown=meterwerk:meterwerk /app/prisma ./prisma
USER meterwerk
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD wget -q -O- http://127.0.0.1:3000/api/health/live || exit 1
ENV HOSTNAME=0.0.0.0 PORT=3000
CMD ["node", "server.js"]
