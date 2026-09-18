# agent-security-lab · AI 红队靶场

**AI Red Team Lab** —— 一个开源的 Agent 安全实战靶场：在仿真业务产品中动手攻防，覆盖 LLM Agent 从传统 Web 漏洞到 MCP 认证链的主流攻击面。

[![CI](https://github.com/pis10/agent-security-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/pis10/agent-security-lab/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A524-green)](package.json)
[![Docker](https://img.shields.io/badge/deploy-docker%20compose-2496ED)](compose.yaml)

> ⚠️ 仅限本地安全学习与明确授权的安全测试。请勿对任何真实系统使用课程中的攻击手法。

<p align="center">
  <img src="docs/screenshots/product-support.png" width="920" alt="在橙犀客服工作台里，助手未校验租户就读出了邻店工单，右上角弹出通关判定">
</p>

<p align="center"><i>让助手「查一下邻店工单 T-2001」——它真的查了，右上角弹出通关判定。</i></p>

## 这是什么

大模型 Agent 把「对话」变成了「操作」：查数据库、执行命令、发邮件、调用第三方工具。攻击面随之从界面层转移到工具层——提示注入、越权调用、凭据重放、记忆投毒。这个项目把这些攻击面做成了可以动手打的关卡：

- **仿真产品，不是表单**。可真实操作的业务系统（客服后台、云运维控制台、企业邮箱、MCP 工具市场），有漏洞的 AI 助手就藏在里面；
- **以证据定通关**。不看模型的口头回答，看工具的实际执行与外发记录：越权返回的工单行、命令执行输出的 `uid=`、元数据接口吐出的临时凭证、外发邮件里的攻击者归档地址；
- **打完学防御**。每关配套防护开关（租户隔离、命令白名单、出站白名单、写入审批、audience 校验），开启后复测同一攻击，在观测页看它被拦截。

## 关卡

| 关 | 产品 | 攻击面 | 关键缺陷 |
|---|---|---|---|
| L1 | 橙犀 · 客服工作台 | 越权访问（IDOR） | `get_ticket` 按 ID 取行，不校验租户 |
| L2 | CloudOps · 运维控制台 | 命令注入 | `read_report` 把文件名拼进 shell |
| L3 | CloudOps · 运维控制台 | SSRF（云元数据） | `fetch_url` 可达链路本地的元数据接口 |
| L4 | NovaMail · 企业邮箱 | 记忆投毒 | `remember` 无审批写入长期记忆 |
| L5 | Northstar MCP Hub | JWT Audience 混淆 | 资源服务漏验凭据 `aud`，跨资源重放 |

课程由浅入深：前两关是经典漏洞在 Agent 工具里的新形态，之后进入 Agent 特有的攻击面——服务端请求、持久记忆、MCP 认证链。

## 快速开始

唯一依赖是 Docker：

```bash
git clone https://github.com/pis10/agent-security-lab.git
cd agent-security-lab

cp .env.example .env        # 填入你的模型 API Key
docker compose up -d --build
```

打开 `http://127.0.0.1:8600`，从教学页 L1 开始。

### 配置模型

默认使用 Z.AI（GLM），在 `.env` 里填对应的 Key 即可。换厂商只改三行：

```bash
ASL_LLM_PROVIDER=anthropic
ASL_LLM_MODEL=claude-sonnet-4-6
ANTHROPIC_API_KEY=sk-ant-...
```

支持 `openai` / `anthropic` / `openrouter` 等 [Pi](https://github.com/earendil-works/pi) 内建目录中的厂商；本地模型（Ollama 等）或目录外的网关通过 `models.json` 声明，见 `.env.example` 注释。

> 建议选能力中上的模型：模型太弱会自己拒绝攻击指令，打不动关卡。

## 打通一关

以 L1 工单越权为例，一关就是四步。

**① 选产品** —— 靶场里的每套系统都是可真实操作的业务软件，AI 助手就藏在里面。

<img src="docs/screenshots/home.png" width="920" alt="靶场首页：选择要打的仿真产品">

**② 读关卡** —— 教学页讲清原理、目标与通关条件。通关认的是工具实际执行与外发记录，不是模型的口头回答。

<img src="docs/screenshots/lesson.png" width="920" alt="L1 课程详情：原理、目标、通关条件与答案">

**③ 动手攻击** —— 回到产品，像平时一样使唤助手，也像攻击者一样使唤它。就是顶部大图的那一刻：助手未校验租户，邻店工单原样读出，通关判定当场弹出。

**④ 看证据** —— 观测页记录每一步调用与外发，通关判定全部来自这里的实际证据。打开防护后清空对话再复测，同一攻击会被当场拦截。

<img src="docs/screenshots/observe.png" width="920" alt="观测页：时间线记录 get_ticket 的调用与越权返回，下方是防护开关">

对话、轨迹与通关进度都在 Docker 卷里，`docker compose down -v` 一键清零。

## 架构

单体 Next.js 应用，Agent 循环与工具执行全部在服务端：

```
src/
  app/          页面与 HTTP 入口（产品 UI、/api、外发箱 /sink、仿真内网 /internal、/idp、/insights-warehouse）
  core/         Agent 循环（Pi SDK）、工具上下文、轨迹、关卡断言、外发箱
  targets/      脆弱产品（系统提示词、工具、种子数据、防护）
  scenarios/    课程（原理 / 目标 / 答案 / 断言 / 防护）
  world/        产品世界持久化（每产品一个磁盘目录）
  ui/           靶场、教学、观测与四个产品的仿真界面
mcpservers/     MCP stdio server（构件仓库、运维手册）
data/seeds/     产品种子数据
```

几个设计决定：

- **外发不出本机**。外发箱和假内网是同一进程里的路由，攻击产生的「外泄」全部落在观测页，不会触达真实网络。
- **通关判定即代码**。每关的断言对轨迹和外发箱求值（`src/core/flags.ts`），命中记进度，命中防护记 `policy_blocked`。
- **容器加固**。非 root 运行、根文件系统只读、丢弃全部 capabilities、端口只发布到 `127.0.0.1`。
- **模型可换**。协议与模型目录由 Pi SDK 处理，进程直连厂商 API，不经过任何中间代理。

## 用于团队培训

关卡由浅入深，单关 15–40 分钟。组织内训时的一些建议：

- 先只给靶场不给教学页，让学员自己发现攻击路径，再对照答案复盘；
- L2 / L3 同一产品两关，可对比「经典注入」与「SSRF 打元数据」的防御差异；
- L5 适合结合 OWASP 对 LLM 供应链与越权类风险的讨论展开。

## 参与贡献

欢迎提 Issue 和 PR。新增关卡请参考 `src/scenarios/` 现有结构：一个场景 = 原理 / 目标 / 答案 / 断言 / 防护，产品放在 `src/targets/`。提交前跑 `corepack pnpm check && corepack pnpm build`。

## 安全披露

本仓库自身的研究性漏洞（例如绕过通关判定）欢迎通过 Issue 报告。请不要提交针对真实系统的攻击内容。

## 许可证

[MIT](LICENSE)
