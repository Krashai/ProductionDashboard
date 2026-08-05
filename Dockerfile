# syntax=docker/dockerfile:1
#
# Kiosk frontend (Next.js) — standalone build, 3-stage image.
# Ported from ProductionMonitor's dashboard/Dockerfile.prod pattern, minus
# Prisma (this app has no direct DB access — it talks to the PLC backend
# over WebSocket, see src/lib/backend/wsAdapter.ts).
#
# NEXT_PUBLIC_* vars are inlined into the JS bundle by `next build` (see
# src/lib/backend/config.ts) — they must be passed as build ARGs, not just
# runtime environment, or the browser bundle will fall back to defaults.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_DATA_SOURCE
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
ENV NEXT_PUBLIC_DATA_SOURCE=${NEXT_PUBLIC_DATA_SOURCE}
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
