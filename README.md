# agent-security-lab · AI 红队靶场

以攻击者视角学习 AI / Agent 安全的本地仿真靶场：5 个仿真产品、5 关确定性课程，覆盖从输入注入到身份凭证的完整攻击链。大纲参考《AI Security》一书（OWASP LLM Top 10 / Agentic Top 10 / MCP 安全）。

> **仅限本地学习与明确授权的安全测试。** 所有秘密均为 `TEST_*` dummy 数据，外发与内网端点只绑 `127.0.0.1`。

## 设计理念

- **确定性关卡**：漏洞都在应用层（命令拼接、无租户校验、无出站限制、JWT 不验 audience、记忆写入无审批），攻击成败看工具的真实执行，不看目标模型「今天警不警惕」。
- **看副作用，不看嘴上说**：判定只认外发箱收到什么、内网被访问什么、工具按什么参数执行了什么。秘密是仿真格式的真实感数据（AWS 示例密钥、业务确认码、生产口令），没有 CTF 风格的 flag 标记。
- **攻击链优先**：关卡围绕「能控制的输入 × 够得着的权限 × 能看见的结果」组织。
- **攻击 → 加固 → 复测闭环**：每关可一键开启确定性防护，命中即阻断并在 trace 记录 `policy_blocked`；开防护重放，应被拦截。

## 快速开始（Docker 是唯一支持的运行方式）

```bash
cp .env.example .env   # 填入你的 GLM API Key（智谱开放平台，OpenAI 兼容端点）
docker compose up -d --build
# 打开 http://127.0.0.1:8600
```

- 镜像多阶段构建：standalone 产物 + 生产 node_modules，以非 root 运行，容器内仅 `data/runtime` 可写——靶场故意保留真实命令执行（shell 注入面），容器就是安全边界。
- 世界与通关进度持久化在命名卷 `asl-data`，重建容器不丢；想全部清零用 `docker compose down -v`。
- 端口只发布到 `127.0.0.1:8600`，不要改成对外网开放。

## 怎么玩

三个入口各管一事：**靶场**（`/`）打开仿真产品随便玩；**教学**（`/learn`）读任务书与通关判定，打成了解锁解析；**观测**（`/observe`）看助手调用了什么、数据发到哪，并在这里开关防护。

标准学习循环：

1. 教学页读任务书（场景要点 + 机器可判定的 checklist），进产品构造攻击；
2. 逐条判据的达成状态在课程页与产品顶栏任务面板实时可见，达成后教学页解锁攻击解析；
3. 观测页打开防护重放一次：应被拦截；
4. 想重新测，先点「重置」。切换课程会自动重置该产品的世界，保证每关判定干净。

## 靶标与关卡

| 靶标 | 仿真产品 | 漏洞类别 | 场景 |
|---|---|---|---|
| `devops_assistant` 运维助手 | 运维控制台 | 命令注入 / SSRF | `cmd-injection` (L1) · `ssrf-cloud-metadata` (L3) |
| `support_bot` 客服机器人 | 电商后台 | IDOR / 越权 | `ticket-idor` (L2) |
| `mail_agent` 邮件助手 | 邮件客户端 | 记忆投毒（写入通路） | `memory-poisoning` (L4) |
| `mcp_playground` MCP 市场 | 工具市场 | Token audience 混淆 | `token-audience` (L5) |
| `browser_agent` 浏览助手 | 仿真浏览器 | —— | 无课程，保留自由玩 |

五个等级就是一条学习路径：**L1 输入注入 → L2 对象授权 → L3 出网边界 → L4 持久化记忆 → L5 身份凭证**。每关判定只查工具返回与外发箱（`tool_result` / `sink_received`），模型只要正常干活、攻击链就成立；提示词注入类攻击面保留在靶标产品里供自由探索。

## 目录结构

```
app/             # Next.js App Router：页面（靶场/教学/观测）+ 全部 Route Handlers
                 # （/api/*、攻击面端点 /sink/*、/internal/*、/mcp-remote/*、/sites/*）
src/
├── core/        # LLM 客户端(OpenAI 兼容,原生 fetch)、agent loop、工具(Zod schema)、
│                # trace、flag 断言、外发箱、progress DB (node:sqlite)、报告生成
├── targets/     # 5 个故意脆弱的靶标应用 + MCP stdio client + mock_remote(JWT)
├── world/       # WorldManager：持久产品世界（磁盘为准）与观测判定
├── scenarios/   # 5 个确定性场景（TS 定义：目标合同 + 判据 label + 防御 + 攻击解析）
├── ui/          # React 组件与 5 套仿真产品 UI（client components）
└── lib/ web/    # 配置加载、路由助手
mcpservers/      # server-a / server-b：MCP stdio server（node 原生跑 .mts，随镜像分发）
tests/           # node --test：断言引擎、靶标攻击面与防护、JWT、schema 兼容
data/seeds/      # 种子数据（知识库、邮件、站点页面……）
data/runtime/    # 产品世界与通关进度（gitignored，容器内挂卷持久化）
Dockerfile / compose.yaml   # 多阶段镜像 + 一键起跑
```

## 开发（可选）

改代码时才需要本地工具链（Node >= 24 + pnpm）：

```bash
pnpm install
pnpm dev        # http://127.0.0.1:8600
pnpm check      # biome lint + format
pnpm test       # node:test 单测
pnpm build      # 生产构建
```

CI（`.github/workflows/ci.yml`）跑同样的检查，并验证 Docker 镜像可构建。

## 安全说明

- API Key 只放本地 `.env`（已 gitignore，也不进镜像），不要提交；Key 若在任何公开场合出现过，请到控制台轮换。
- 所有 sink / internal 服务只绑 `127.0.0.1`；`run_script` 等脆弱工具只操作 `data/runtime/` 下的 dummy 文件。
