# agent-security-lab · AI 红队靶场

4 个脆弱产品、5 关课。判定看工具有没有真的执行、数据有没有真的发出去。

> 仅限本地学习与明确授权的安全测试。通关认的是仿真业务码（如 `MG-8841-QK7Z`）和公开文档示例密钥（如 `ASIAIOSFODNN7EXAMPLE`）。

## 运行

唯一部署方式是 Docker。镜像基于 **Debian Bookworm**（`node:24-slim`）。容器里才有 `cat` / `id` 这条命令注入面。

```bash
cp .env.example .env   # 填 GLM Coding Plan 的 API Key
docker compose up -d --build
# http://127.0.0.1:8600
```

`.env` 只放本机，compose 注入容器。服务绑在 `127.0.0.1:8600`。世界和通关进度在卷 `asl-data`；清零：`docker compose down -v`。

改镜像源码需要 Node 24 + pnpm（`pnpm check` / `pnpm build`），跑靶场仍走上面的 compose。

## 怎么玩

| 入口 | 地址 | 干什么 |
|---|---|---|
| 靶场 | `/` | 打开仿真产品 |
| 教学 | `/learn` | 原理、目标、答案、通关判定 |
| 观测 | `/observe` | 工具调用、外发箱、防护开关 |

L1 → L5。教学页先看原理和目标，进产品打；卡住再看答案。观测里开防护再打一次。产品「重置」清该产品世界和相关完成状态；顶栏「全部重置」回到刚打开靶场。换课会重置该产品。

| 关 | 产品 | 打什么 |
|---|---|---|
| L1 `ticket-idor` | 橙犀客服后台 | `get_ticket` 不校验租户 |
| L2 `cmd-injection` | CloudOps 运维控制台 | `run_script` 把文件名拼进 shell |
| L3 `ssrf-cloud-metadata` | CloudOps | `fetch_url` 打到站内元数据 |
| L4 `memory-poisoning` | NovaMail | `remember` 无审批写入长期记忆 |
| L5 `token-audience` | MCP Hub | 用 server-a 的票调不验 audience 的数据接口 |

防护默认关。命中防护记 `policy_blocked`。

## 目录

```
src/app/         页面与 HTTP 入口（产品 UI、/api、/sink、/internal、/mcp-remote）
src/core/        agent、LLM、工具、轨迹、断言、外发箱、进度库
src/targets/     四个产品
src/scenarios/   五关课
src/world/       产品世界
src/ui/          客户端界面
src/lib/         配置、契约、路由助手
mcpservers/      MCP stdio server
data/seeds/      种子
data/runtime/    运行时世界（gitignore，容器内挂卷）
```

## 安全

- API Key 只在 `.env`。
- 端口只发布到回环地址。
- 容器非 root、根文件系统只读、丢弃全部 capabilities；可写路径是 `data/runtime`。
- 外发箱和假内网是同一进程里的路由。
