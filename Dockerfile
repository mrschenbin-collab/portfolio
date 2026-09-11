# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS builder

WORKDIR /app

ENV npm_config_audit=false
ENV npm_config_fund=false
ENV npm_config_update_notifier=false

COPY package.json package-lock.json .npmrc ./
RUN npm ci && npm cache clean --force && rm -rf .sites-runtime

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV PORTFOLIO_STORAGE_DIR=/app/storage

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.openai ./.openai
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts

VOLUME ["/app/storage"]
EXPOSE 3000

CMD ["sh", "-c", "npm run start -- --host 0.0.0.0 --port ${PORT:-3000}"]
