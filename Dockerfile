# Debian Bookworm（node:24-slim）。standalone + 生产 node_modules（mcpservers 子进程用）。
# 以 node 用户跑；可写目录 data/runtime。

# ---- builder ----
FROM node:24-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY src ./src
COPY mcpservers ./mcpservers
COPY data/seeds ./data/seeds
COPY next.config.ts tsconfig.json postcss.config.js tailwind.config.js ./
RUN pnpm build && pnpm prune --prod

# ---- runner ----
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=8600
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/mcpservers ./mcpservers
COPY --from=builder /app/data/seeds ./data/seeds
RUN mkdir -p data/runtime && chown -R node:node data/runtime
USER node
EXPOSE 8600
CMD ["node", "server.js"]
