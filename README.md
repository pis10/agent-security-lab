# agent-security-lab · AI 红队靶场

> **仅限本地学习与明确授权的安全测试。** 靶场中所有秘密均为 `TEST_*` dummy 数据，所有"外发/内网"端点都是本机 mock 服务（只绑 `127.0.0.1`）。不要把这里的攻击手法用于未授权系统。

一个以**攻击者视角**系统性学习 AI / Agent 安全的综合仿真靶场，大纲参考 `AI-Security.pdf`（OWASP LLM Top 10 / Agentic Top 10 / MCP 安全）。靶场的核心设计理念：

- **判定靠副作用，不靠模型说了什么。** 每关的 Flag 是一个可观察副作用：mock sink 收到了外发数据、内网接口被访问、工具按攻击链顺序被调用。
- **攻击链优先于单点。** 关卡围绕"可控输入 × 可达权限 × 可观察副作用"组织。
- **漏洞在应用设计里，不在"模型笨"里。** 靶标应用的缺陷（无审批的高权限工具、把外部内容声明为可信、无 allowlist 的 URL 抓取……）都是真实产品的常见错误。
- **攻击 → 加固 → 复测闭环。** 每关可一键开启确定性防护（如外发 allowlist、工单属主校验），防护命中即阻断并在 trace 中记录 `policy_blocked`。

## 快速开始

```bash
cp .env.example .env   # 填入你的 Kimi Code API Key（OpenAI 兼容端点）
uv sync
cd frontend && npm install && npm run build && cd ..   # 需要 Node >= 20
uv run asl serve       # 打开 http://127.0.0.1:8600
```

无 Key 离线体验（脚本化 mock 模型，攻击链是"标准答案"回放）：

```bash
ASL_USE_MOCK_LLM=1 uv run asl serve
```

Docker all-in-one（前端已在镜像内构建）：

```bash
docker build -t agent-security-lab .
docker run --rm -p 8600:8600 -e ASL_LLM_API_KEY=<your-key> agent-security-lab
```

## 玩法

1. 任务板上选场景，读 briefing（你的攻击任务）与学习目标。
2. 进入三栏工作区：左边是**仿真产品**（邮件客户端 / 电商后台 / 运维控制台 / MCP 市场 / 仿真浏览器），中间是和目标 Agent 的对话，右边是实时 trace 控制台。
3. 在仿真产品里翻翻数据找攻击面，把 payload 藏进邮件 / 工单 / 网页，诱导 Agent 中招。
4. 达成可观察副作用后 Flag 自动点亮；右下角可一键生成本关**通关报告**（Markdown，含攻击链与证据）。
5. 打开**防护开关**再攻一次：攻击应被 `policy_blocked` 拦截——攻击 → 加固 → 复测。
6. 做完看「攻击解析」：根因 + 确定性修复（Prompt 加固永远只是纵深防御）。

## 命令行

```bash
uv run asl serve          # Web 靶场
uv run asl targets        # 列出靶标
uv run asl scenarios      # 列出场景
uv run asl redteam --scenario smoke-mail-agent --runs 3   # 自动化红队：攻击方 LLM 驱动目标，报成功率
uv run asl redteam --scenario ticket-idor --defenses tenant_acl   # 开启防护复测
uv run asl report <session_id> --scenario smoke-mail-agent   # 由 trace 生成通关报告
```

`redteam` 遵循"报告成功率而非一次侥幸"的原则：同一场景跑 N 次，统计攻击成功率；加 `--defenses` 即变为加固复测。

## 靶标与场景

| 靶标 | 仿真产品 | 攻击面 | 场景 |
|---|---|---|---|
| `support_bot` 客服机器人 | 电商后台 | 直接注入 / RAG 投毒 / IDOR | `direct-injection-probe` (L1) · `ticket-idor` (L2) · `smoke-support-bot` (L2) |
| `devops_assistant` 运维助手 | 运维控制台 | 命令注入 / SSRF | `cmd-injection` (L1) · `smoke-devops-assistant` (L1) |
| `mail_agent` 邮件助手 | 邮件客户端 | 间接注入外发 / 过度代理 / 记忆投毒 | `excessive-agency` (L2) · `memory-poisoning` (L3) · `smoke-mail-agent` (L3) |
| `mcp_playground` MCP 市场 | 工具市场 | 工具描述投毒 / Token audience 混淆 | `token-audience` (L4) · `smoke-mcp-playground` (L4) |
| `browser_agent` 浏览助手 | 仿真浏览器 | 隐藏注释注入 → 内部页 → 外发链 | `comment-injection-probe` (L3) · `smoke-browser-agent` (L5) |

每个靶标的 `mock_scripts[scenario_id]` 是该场景的"标准答案"脚本，供离线回放与 CI 回归。

## 测试

```bash
uv run pytest            # 37 个测试：core 单测 + 12 场景攻击回放 + 防护阻断 + 红队/报告（全部离线）
uv run ruff check src tests
```

## 结构

```
src/agent_security_lab/
├── core/        # LLM 客户端(OpenAI 兼容+Mock)、agent loop、工具、trace、flag 断言、mock sink、
│                # progress DB (SQLite)、报告生成
├── targets/     # 5 个故意脆弱的靶标应用（SQLite 业务库 + 防护开关 + 仿真数据接口）
├── web/         # FastAPI：会话/聊天/flag/sim/sink/progress/report API，托管前端 dist
├── redteam.py   # 自动化红队驱动（攻击方 LLM ↔ 目标 Agent）
├── config.py / scenario.py / testing.py / cli.py
frontend/        # React + Vite + Tailwind：任务板、三栏工作区、5 套仿真产品 UI
scenarios/       # 12 个场景 YAML（briefing + 断言 + 防护 + 攻击解析）
data/seeds/      # 种子数据（知识库、邮件、站点页面……）
data/runtime/    # per-session 运行态（gitignored）
docs/design.md   # PDF 章节 ↔ 靶标/场景映射与断言 DSL 参考
```

## 安全说明

- API Key 只放本地 `.env`（已 gitignore），不要提交；Key 若在任何公开场合出现过，请到控制台轮换。
- 所有 sink / internal 服务只绑 `127.0.0.1`；`run_script` 等脆弱工具只操作 `data/runtime/` 下的 dummy 文件。

## Roadmap

- [x] 平台化 M2：仿真前端、防护开关、通关报告、自动化红队、12 场景
- [ ] 完整场景包 L1–L5（对应 PDF 第 12 章 10 个实验、第 7/8 章攻击链）
- [ ] browser_agent 接真实浏览器自动化；多 Agent / 工作流靶标
