# Multi-stage build：builder 用完整依赖跑 next build；runner 带 standalone 产物
# 加 prune 后的生产 node_modules（mcpservers/*.mts 是独立 node 子进程，
# 需要真实解析 @modelcontextprotocol/sdk 及其依赖树，不赌 standalone tracing）。
# 靶场故意保留真实命令执行（shell 注入面），容器是安全边界：
# runner 以非 root 运行，仅 data/runtime 可写。
# 发布到宿主时建议 -p 127.0.0.1:8600:8600，不要暴露公网。

# ---- builder ----
FROM node:24-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY app ./app
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
# node 用户对 runtime 目录可写（挂命名卷首次初始化会沿用该属主）
RUN mkdir -p data/runtime && chown -R node:node /app
USER node
EXPOSE 8600
CMD ["node", "server.js"]
