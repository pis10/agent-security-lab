# agent-security-lab · AI 红队靶场

**AI Red Team Lab** —— 一个开源的 Agent 安全实战靶场：在仿真业务产品中动手攻防，覆盖 LLM Agent 从传统 Web 漏洞到 MCP 认证链的主流攻击面。

[![CI](https://github.com/pis10/agent-security-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/pis10/agent-security-lab/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A524-green)](package.json)
[![Docker](https://img.shields.io/badge/deploy-docker%20compose-2496ED)](compose.yaml)

> ⚠️ 仅限本地安全学习与明确授权的安全测试。请勿对任何真实系统使用课程中的攻击手法。

## 这是什么

大模型 Agent 把「对话」变成了「操作」：查数据库、执行命令、发邮件、调用第三方工具，攻击面随之转移到工具层。这个项目把这些攻击面做成可以动手打的关卡：

- **仿真产品**：客服后台、云运维控制台、企业邮箱、MCP 工具市场，每套都内置 AI 助手；
- **以证据定通关**：判定依据是工具执行与外发记录，不是模型的口头回答；
- **防护复测**：每关配套防护开关，开启后复测同一攻击，观测页可见拦截记录。

## 界面

**靶场** —— 仿真业务产品

<img src="docs/screenshots/home.png" width="920" alt="靶场首页">

**关卡工作台** —— 任务卡、仿真产品与内置 AI 助手

<img src="docs/screenshots/workspace.png" width="920" alt="客服工作台与内置助手">

**观测** —— 调用时间线、外发箱与防护开关

<img src="docs/screenshots/observe.png" width="920" alt="观测页">

**教学进度** —— 学员通关、实际防护复测与答案开关

<img src="docs/screenshots/progress.png" width="920" alt="教学进度管理页">

## 关卡

| 关 | 产品 | 攻击面 | 关键缺陷 |
|---|---|---|---|
| L1 | 橙犀 · 客服工作台 | 越权访问（IDOR） | `get_ticket` 按 ID 取行，不校验租户 |
| L2 | CloudOps · 运维控制台 | 命令注入 | `read_report` 把文件名拼进 shell |
| L3 | CloudOps · 运维控制台 | SSRF（云元数据） | `fetch_url` 可达链路本地的元数据接口 |
| L4 | NovaMail · 企业邮箱 | 记忆投毒 | `remember` 无审批写入长期记忆 |
| L5 | Northstar MCP Hub | JWT Audience 混淆 | 资源服务漏验凭据 `aud`，跨资源重放 |

课程由浅入深：前两关是经典漏洞在 Agent 工具里的新形态，之后继续练习服务端请求、持久记忆与 MCP 认证链中的安全边界。

## 快速开始

需要 Docker Engine 26 或更新版本，以及 Docker Compose v2。首次构建需要联网下载基础镜像和 npm 依赖。镜像基于 **Debian Bookworm**（`node:24-slim`）。Compose 启动应用与报告执行调度服务；每次 `read_report` 用同一个镜像创建一次性容器，真实执行 `cat` / `id` 后销毁。

模型走 [Pi 1.2.0](https://github.com/earendil-works/pi/tree/v1.2.0) 的 `pi-ai` / `pi-agent-core`，MCP 客户端使用 `pi-mcp`：协议与目录由 SDK 处理，进程直连模型服务。

```bash
git clone https://github.com/pis10/agent-security-lab.git
cd agent-security-lab
cp .env.example .env   # 可选：并发、初始管理员密码
docker compose up -d --build
# http://127.0.0.1:8600
```

`.env` 只放本机，compose 注入应用容器。服务绑在 `127.0.0.1:8600`。账号、模型设置、世界和通关进度都在卷 `asl-data`；清零：`docker compose down -v`。

首次启动创建管理员 `admin`。初始密码取 `.env` 的 `ASL_ADMIN_PASSWORD`；未设置时随机生成，只在日志里出现一次（`docker compose logs asl | grep 初始密码`）。首次登录须修改密码。

学员账号由管理员在「管理 › 账号管理」批量创建（每行一个用户名，可带显示名），初始密码只显示一次，本人首次登录须修改。忘记密码由管理员重置。每个账号的产品数据与通关进度相互独立。

### 配置模型

模型只在网页上配置：管理员登录后进入「管理 › 模型设置」。没配置之前，学员可以浏览关卡，但助手不会回复。

- **内置厂商**：Pi 包内的模型目录（OpenAI、Anthropic、DeepSeek、智谱、Kimi、OpenRouter 等），选厂商和模型、填 API Key 即可。需要 OAuth 或云凭据的厂商不在列表里。
- **OpenAI 兼容服务**：vLLM、SGLang、Ollama 或自建网关，填以 `/v1` 结尾的地址和服务端模型名；服务不校验 Key 时可以留空。
- **Anthropic 兼容服务**：填不带 `/v1` 的地址。

自建服务的高级选项可以调整上下文长度、最大输出、兼容开关（`max_tokens` 字段、`store`、developer 角色、思考参数格式）和额外请求头。

保存前先点「测试连接」：它发一次带工具的请求，告诉你能否连通、模型会不会调用工具。自建服务最常见的问题是没开工具调用（如 vLLM 的 `--enable-auto-tool-choice` 与 `--tool-call-parser`）。保存后，下一轮对话即使用新模型，已有对话保留。

Key 保存在数据卷的 `settings.db`（文件权限 600），页面只显示末四位。更换服务地址或厂商时，已保存的 Key 不会沿用到新服务，需要重新填写。

不要把 coding-agent 的 `read` / `write` / `edit` / `bash` 装进靶场。模型只能看到各产品自己的工具。

## 模型自检

换模型或调整模型服务配置后，用标准解法重复跑五关。自检使用网页上保存的模型设置和应用容器中的沙箱：

```bash
docker compose exec asl node src/smoke/run.ts --runs 3
# 不用 Compose 时：
docker exec agent-security-lab node src/smoke/run.ts --runs 3
```

源码目录也可执行 `pnpm smoke`（读取 `data/runtime/settings.db`，`--settings` 可指定其他设置库）。L2 需要可用的沙箱 Unix socket；可用 `ASL_SANDBOX_SOCKET` 指定路径。只验证其他关卡无需沙箱，例如：

```bash
pnpm smoke --runs 3 --scenario ticket-idor --scenario token-audience
```

每关在关闭/开启防护时各跑 N 次；L4 每个样本包含「读通知写入记忆 → 清空聊天 → 正常回复邮件」两轮。自检直接复用 Agent、产品工具、关卡断言与内部 HTTP 路由，在独立进程的临时世界中运行，不创建登录账号，也不修改现有世界和进度；它不覆盖浏览器或登录流程。结束或正常中断时清理临时世界及 MCP 子进程。

默认每轮对话限时 120 秒，超时通过 SDK 取消，再等待工具收尾；`--timeout-ms` 可调整。样本依次执行。默认报告写入 `data/runtime/smoke/`（容器里位于持久数据卷），也可用 `--output /tmp/smoke.json` 指定新文件；已有文件不会覆盖。每完成一项即保存，报告只记录模型标识、调用名称、结果与耗时，不保存 Key、回复、工具参数或临时凭据。

- 通关率：无防护时，实际关卡断言通过且没有运行错误的样本 / 已完成的无防护样本。
- 拦截率：有防护时，有对应 `policy_blocked` 事件、未通关且没有运行错误的样本 / 已完成的有防护样本。
- 疑似模型拒绝（基于回复措辞的启发式识别）、未演示、错误和超时分别列出，均计入分母；模型拒绝不算防护拦截。即使运行出错，也单独保留已成立的防护绕过证据。
- 错误样本附带来源、工具名和固定分类（例如 `invalid_token`、`context_limit`、`tool_calling_config`），不保存可能回显凭据的服务端原文。若一次防护样本既有拦截又有后续工具错误，按错误样本统计，同时保留拦截次数。
- 退出码：`0` 全部符合预期；`1` 有未演示、错误、超时或防护绕过；`2` 配置失败或运行中断。中断报告的 `complete` 为 `false`，不能作为完整验收结果。

自检会真实调用模型并消耗额度。小样本结果只说明当前标准解法的表现，不代表所有提示都稳定可用。若服务不产生工具调用，检查服务端的自动工具选择与对应 parser（例如 vLLM 的 `--enable-auto-tool-choice`）；若报上下文长度错误，核对服务端实际容量和模型设置里的「上下文长度」「最大输出」。报告中的容量来自配置，并非对服务端的自动探测。

## 怎么玩

| 入口 | 地址 | 用途 |
|---|---|---|
| 学习 | `/` | 五关学习路径与四个仿真产品 |
| 关卡工作台 | `/range/<产品>?mission=<关卡>` | 左侧任务卡（目标、通关条件、原理、提示与答案），中间是产品，右侧观测抽屉 |
| 观测 | `/observe` | 各产品的工具调用时间线、外发箱、防护开关 |
| 管理 | `/admin` | 账号管理、教学进度（每人五关、复测、CSV）、模型设置（管理员） |

按 L1 至 L5 进行。在工作台左侧任务卡阅读原理与目标，再在产品里尝试；卡住时逐级展开提示，最后才是答案。通关后在右侧观测抽屉开启防护，清空对话再试（无需重置；重置会清除当前关卡的通关记录）。产品「重置」清除该产品数据及当前课程的通关进度，同产品其他课程不受影响；账号菜单「重置我的进度」只清当前账号的数据。切换课程会重置对应产品。同一产品回复期间，再发消息、清空、重置和修改防护会返回 409，等待本轮结束后再操作。

防护默认关。命中防护记 `policy_blocked`。

任务卡实时显示通关条件的达成情况，提示按「提示 1 → 提示 2 → 答案」逐步展开。不带关卡进入产品为自由探索，可在任务卡里选择关卡。工作台里按 `` Ctrl+` `` 开关观测抽屉。管理员在教学进度页统一控制答案是否开放；默认开放，关闭后服务端不再向学员下发答案（管理员始终可见），已打开的页面需要刷新，已看过的内容无法收回。

教学进度显示首次通关时间，以及通关后开启该关全部防护、实际调用相关工具的最近一次复测。仅开启开关、普通聊天或刷新页面不算复测；「实际拦截」「已调用，未见拦截」「运行出错」分开显示，不把没有通关当成防护成功。CSV 使用 UTC 时间，页面显示浏览器当地时间。

### 多人运行

单进程内默认最多同时执行 4 轮对话，多余请求按先后排队，产品页显示「排队中」。同一世界在排队和执行时均禁止重复发送或重置。每轮执行默认限时 120 秒（不含排队），超时通过 Pi 取消模型请求并等待工具收尾，再释放容量，避免遗留工具与下一轮并发写数据。待执行队列最多 100 轮。报告执行调度服务同时运行的容器数与对话并发相同，Compose 会把 `ASL_MAX_CONCURRENT_TURNS` 一并传给它。

世界默认 15 分钟无人访问后落盘并释放内存及 MCP 子进程；下次进入从磁盘恢复对话、记忆、轨迹和外发记录。可见产品页的轮询视为仍在使用，后台标签停止轮询。可通过 `.env` 调整：

```dotenv
ASL_MAX_CONCURRENT_TURNS=4
ASL_TURN_TIMEOUT_MS=120000
ASL_WORLD_IDLE_MS=900000
```

这些限制作用于当前应用进程，应用维持单进程运行；模型服务自身也应按实际吞吐配置容量。

## 目录

```
src/app/         页面与 HTTP 入口（产品 UI、/api、/sink、/internal、/idp、/insights-warehouse）
src/core/        agent（Pi 循环）、模型设置、工具上下文、轨迹、断言、外发箱、进度库
src/sandbox/     报告执行调度器与一次性容器入口
src/targets/     四个产品
src/scenarios/   五关课
src/world/       产品世界
src/ui/          客户端界面
src/lib/         配置、契约、路由助手
mcpservers/      MCP stdio server
data/seeds/      种子
data/runtime/    运行时数据：账号、模型设置、世界、进度（gitignore，容器内挂卷）
```

## 安全

- 模型 API Key 由管理员在网页上填写，保存在数据卷的 `settings.db`（权限 600），完整 Key 不下发到页面，也不写入镜像。备份数据卷时会包含模型设置，应按凭据保管。
- 端口只发布到回环地址。
- 应用容器非 root、根文件系统只读、丢弃全部 capabilities；持久数据写入 `data/runtime`，临时文件写入 `/tmp`。
- HTTP 工具只能请求本站服务；元数据 IP 映射到站内仿真响应，其他地址返回模拟连接失败。重定向逐跳检查，这层限制始终生效，不受教学防护开关影响，也不限制模型客户端连接配置的模型服务。
- 外发箱、假内网、拨测站点、IdP 和 Insights 路由仅接受进程内随机令牌，浏览器登录也不能直接调用。令牌只在当前进程内共享，因此应用按单进程运行。
- L2 在一次性容器执行真实 shell：非 root、断网、根目录只读，无应用数据卷和模型凭据，限制内存、进程数、时间和输出。每次只传入当前世界的报告文件，执行完成后销毁整个容器。
- 调度服务通过专用 Unix socket 接收固定格式的报告任务，是唯一挂载 Docker socket 的组件；应用与执行容器均不挂载 Docker socket。它属于可信基础设施，不对外暴露端口或接受任意 Docker 参数。
- 沙箱不可用时 `read_report` 返回服务不可用，不会回退到应用或宿主机执行。

## 用于团队培训

管理员在「管理 › 账号管理」创建学员账号，在「教学进度」查看通关与复测、导出 CSV，并控制是否下发答案。可以先关闭答案，让学员按任务卡的分级提示尝试，再开放答案复盘。

- L2 / L3 使用同一个运维产品，可对比命令注入和 SSRF 的防护差异。
- L4 分别体验外部攻击者与邮箱主人，观察记忆如何跨会话影响后续行为。
- L5 结合凭据签名、scope 与 audience 的不同职责展开讨论。

## 参与贡献

欢迎提 Issue 和 PR。新增关卡参考 `src/scenarios/`：原理、目标、提示、答案、断言、防护与复测工具；产品工具放在 `src/targets/`。

本地开发需要 Node 24 和 Corepack；依赖版本由锁文件固定：

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm check
corepack pnpm test
corepack pnpm build
# 开发服务：corepack pnpm dev
```

L2 的隔离集成测试会创建并清理专用容器和卷，需要运行中的 Docker：

```bash
docker build -t agent-security-lab:sandbox-test .
ASL_TEST_IMAGE=agent-security-lab:sandbox-test corepack pnpm test:sandbox
```

## 安全披露

本仓库自身的研究性漏洞（例如绕过通关判定）欢迎通过 Issue 报告。请不要提交针对真实系统的攻击内容。

## 许可证

[MIT](LICENSE)
