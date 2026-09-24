# syntax=docker/dockerfile:1
# Next.js frontend for Cloud Run.
#
# Multi-stage: install deps -> build -> copy only the standalone server into a
# small runtime image. The featured country pages are statically prerendered
# from live data (ISR), so the build needs database access. The connection
# string is mounted as a BuildKit secret for that one RUN step only - never an
# ARG/ENV - so the password is not baked into any image layer or its history.
# At runtime Cloud Run injects its own DATABASE_URL from Secret Manager.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=secret,id=database_url \
    DATABASE_URL="$(cat /run/secrets/database_url)" npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 8080
CMD ["node", "server.js"]
