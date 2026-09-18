# agent-security-lab · AI 红队靶场

四个脆弱产品、五关课程。通关以工具实际执行与数据外发为准。

> 仅限本地学习与明确授权的安全测试。通关认的是工具结果与外发记录里的实际证据：越权返回的 `tenant_b` 工单行、命令执行输出的 `uid=`、元数据接口返回的 RAM 临时凭证（仿真 STS AccessKeyId，如 `STS.N4aBExample4CloudOps`）、远端配置口令本身。

## 运行

唯一部署方式是 Docker。镜像基于 **Debian Bookworm**（`node:24-slim`）。容器里才有 `cat` / `id` 这条命令注入面。

模型走 [Pi](https://github.com/earendil-works/pi) 的 `pi-ai` / `pi-agent-core`：协议与目录由 SDK 处理，进程直连厂商 API。模型目录用 Pi 包内清单，换模型 id 靠升级 Pi。

```bash
cp .env.example .env
# 默认：ASL_LLM_PROVIDER=zai-coding-cn，填 ZAI_CODING_CN_API_KEY
docker compose up -d --build
# http://127.0.0.1:8600
```

`.env` 只放本机，compose 注入容器。服务绑在 `127.0.0.1:8600`。世界和通关进度在卷 `asl-data`；清零：`docker compose down -v`。升级后若对话无法恢复，对该产品重置即可（旧 transcript 格式不转换）。

换厂商只改 `ASL_LLM_PROVIDER`、`ASL_LLM_MODEL` 和该厂商的原生 Key，例如：

```bash
ASL_LLM_PROVIDER=openai
ASL_LLM_MODEL=gpt-4.1-mini
OPENAI_API_KEY=sk-...
```

```bash
ASL_LLM_PROVIDER=anthropic
ASL_LLM_MODEL=claude-sonnet-4-6
ANTHROPIC_API_KEY=sk-ant-...
```

```bash
ASL_LLM_PROVIDER=openrouter
ASL_LLM_MODEL=anthropic/claude-sonnet-4
OPENROUTER_API_KEY=...
```

目录里没有的网关或本地模型，用本项目的 `models.json` **子集**（不是 Pi coding-agent 的全量字段）：

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://host.docker.internal:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [{ "id": "qwen2.5-coder:7b" }]
    }
  }
}
```

`ASL_MODELS_JSON` 指向该文件，`ASL_LLM_PROVIDER=ollama`，`ASL_LLM_MODEL=qwen2.5-coder:7b`。`api` 仅支持 `openai-completions` 与 `anthropic-messages`；`apiKey` 可以是字面量或 `$ENV_VAR`。

不要把 coding-agent 的 `read` / `write` / `edit` / `bash` 装进靶场。模型只能看到各产品自己的工具。

改镜像源码需要 Node 24（pnpm 无需单独安装，corepack 按锁定版本提供：`corepack pnpm check` / `corepack pnpm test` / `corepack pnpm build`），跑靶场仍走上面的 compose。

## 怎么玩

| 入口 | 地址 | 用途 |
|---|---|---|
| 靶场 | `/` | 打开仿真产品 |
| 教学 | `/learn` | 原理、目标、答案、通关条件 |
| 观测 | `/observe` | 工具调用、外发箱、防护开关 |

按 L1 至 L5 进行。请先在教学页阅读原理与目标，再进入产品尝试；必要时查看答案。观测中开启防护后，返回产品清空对话再试（无需重置；重置会清除当前课程的通关记录）。产品「重置」清除该产品数据及当前课程的通关进度，同产品其他课程不受影响；顶栏「全部重置」恢复整个靶场。切换课程会重置对应产品。

| 关 | 产品 | 攻击面 |
|---|---|---|
| L1 `ticket-idor` | 橙犀客服后台 | `get_ticket` 不校验租户 |
| L2 `cmd-injection` | CloudOps 运维控制台 | `read_report` 把文件名拼进 shell |
| L3 `ssrf-cloud-metadata` | CloudOps | `fetch_url` 打到站内元数据 |
| L4 `memory-poisoning` | NovaMail | `remember` 无审批写入长期记忆 |
| L5 `token-audience` | Northstar MCP Hub | 下载会话凭据（aud=artifact-registry）重放到漏验 audience 的 Insights Warehouse |

防护默认关。命中防护记 `policy_blocked`。

## 目录

```
src/app/         页面与 HTTP 入口（产品 UI、/api、/sink、/internal、/idp、/insights-warehouse）
src/core/        agent（Pi 循环）、工具上下文、轨迹、断言、外发箱、进度库
src/targets/     四个产品
src/scenarios/   五关课
src/world/       产品世界
src/ui/          客户端界面
src/lib/         配置、契约、路由助手
mcpservers/      MCP stdio server
data/seeds/      种子
data/runtime/    运行时世界（gitignore，容器内挂卷）
agent-security-notes/  Agent 安全教学文章与截图
```

## 安全

- API Key 只在 `.env`（使用各厂商原生变量名，如 `ZAI_CODING_CN_API_KEY`）。
- 端口只发布到回环地址。
- 容器非 root、根文件系统只读、丢弃全部 capabilities；可写路径是 `data/runtime`。
- 外发箱和假内网是同一进程里的路由。
