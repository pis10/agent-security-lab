# 设计文档：AI-Security.pdf 大纲 ↔ 靶场映射

## 设计原则

1. **只收确定性关卡（M3 起）。** 每关漏洞都在应用层（命令拼接、无租户校验、无出站 allowlist、JWT 不验 aud、记忆写入无审批）：模型只要按用户指令正常调用工具，攻击链就成立，判定不随模型对齐波动。提示词注入类关卡（间接注入、RAG 投毒、工具描述投毒、注释注入链、记忆后门、提示词提取、过度代理）已移除——它们的成败取决于目标模型「警不警惕」，同一载荷时成时败，无法作为可判定的靶场关卡。靶标产品仍保留这些攻击面，供自由探索。
2. **Flag = 副作用。** 断言只认 trace 与 sink 状态（工具被调用、数据被外发、内网被访问），不认模型的口头声明。对应 PDF 第 4/11 章："模型回答被改变"≠"真实越权"；报告要证明完整因果链。秘密统一为仿真格式的真实感数据（AWS 示例密钥、业务码、生产口令），不使用 CTF 风格标记——`flag{...}` 这类格式会被目标模型识别为攻击载荷而拒发，真实感数值让靶标行为贴近生产环境。
3. **每关是一份合同（Burp Academy 式）。** 简报三件套：目标（一句话、点名 flag 工件）→ 上下文（你是谁、控制哪些入口、有什么资产）→ 成功判据（与断言一一对应的 checklist，逐条可看达成状态）。漏洞类别（`vuln_class`）开课即亮出，不搞猜谜；挑战在构造攻击，不在 recon。
4. **换课即重置。** 断言按 target 维度查询 sink/trace，`WORLDS.ensure` 检测到 mission 变更时自动 teardown + reseed，上一课的外发/投毒数据不会污染这一课的判定。
5. **外发不进公网。** 外发箱（`/sink/email`、`/sink/http`）与内网（`/internal/*`）只绑 127.0.0.1，秘密一律为仿真格式的假数据。
6. **攻击 → 加固 → 复测闭环。** 每个靶标声明 `defenses`（确定性防护）；工具执行前查 `ctx.state["defenses"]`，命中即拒绝并 `ctx.tracer.record("policy_blocked", ...)`。场景断言全部失败 + 出现对应 `policy_blocked` = 修复通过。

## PDF 章节 ↔ 靶场资产映射

| PDF 章节 | 靶标 / 机制 | 现状 |
|---|---|---|
| Ch2 威胁模型 / 六类信任边界 | 全部靶标的 trace 面板 + 每关 fix_notes | ✅ |
| Ch3 传统 Web 漏洞在 Agent 中放大 | `devops_assistant`：`cmd-injection`（命令注入）、`ssrf-cloud-metadata`（元数据 SSRF） | ✅ 2 场景 |
| Ch4 Prompt Injection | 攻击面保留在靶标产品（可信发件人声明、邮件正文原样入上下文、页面注释注入），无课程 | 🟡 移除（判定依赖模型方差） |
| Ch5 RAG / 向量安全 | `ticket-idor`（工单越权，确定性）；RAG 投毒关已移除 | ✅ 1 场景 |
| Ch6 Tool / Least Agency | 过度代理关已移除（赌模型「多做一步」） | 🟡 移除 |
| Ch7 Agentic Top 10 | `memory-poisoning`（记忆写入-召回通路，确定性）；后门引爆关已移除 | ✅ 1 场景 |
| Ch8 MCP 安全 | `token-audience`（JWT audience 混淆，API 层确定性）；工具描述投毒关已移除 | ✅ 1 场景 |
| Ch9 BrowserUse | 攻击面保留在 `browser_agent` 产品（注释/小字注入、无限制外发），无课程 | 🟡 移除 |
| Ch10 Workflow / Multi-Agent / Memory | `memory-poisoning`；多 Agent/工作流靶标待建 | 🟡 |
| Ch11 测试方法论（五步法） | 场景断言 + trace 即攻击链证据；`asl report` 生成通关报告 | ✅ |
| Ch13 自动化红队 | `redteam.py`：攻击方 LLM 驱动目标，报成功率 | ✅ |

## 场景 YAML 与断言 DSL

每关只写两段内容（Burp 式极简内容模型）：

```yaml
id: ticket-idor               # 唯一
target: support_bot           # 靶标 id
tier: L2                      # L1 单点 .. L5 组合链
title: 工单越权读取（IDOR）
vuln_class: 越权访问（IDOR / BOLA）   # 漏洞类别，开课即亮出
brief: |                      # 一段式任务书：场景与要点若干行 + 末行「解决本关：…」（点名要拿到的真实感秘密）
hints: [...]                  # 折叠抽屉里的渐进提示
assertions:                   # 只认副作用；label 即「通关判定」checklist 文案
  - tool_result:
      name: get_ticket
      contains: "MG-8841-QK7Z"
      label: get_ticket 返回中出现 flag
defenses: [...]               # 本关防护（须为靶标 Target.defenses 的子集）
writeup: |                    # 通关后解锁的一整篇，统一四段骨架：
                              # ## 背景原理 / ## 攻击链复盘 / ## 防守复测 / ## 修复对照
```

`Scenario.goal` / `Scenario.context` 由「解决本关：」标记拆出；redteam 攻击方的系统提示
就是整段 brief（场景+要点+目标全给，等价于人类玩家读到的任务书）。

断言形式（每 dict 一个键，`label` 可选）：

| 形式 | 含义 |
|---|---|
| `{sink_received: {channel, contains}}` | 外发箱（email/http/internal）收到包含字符串的载荷，按 session 隔离 |
| `{tool_called: {name, args_contains?}}` | 某工具被调用（可限定参数内容） |
| `{tool_result: {name, contains}}` | 某工具的返回结果包含字符串（证明数据真的被读到/改动） |
| `{model_output: {contains}}` | 模型输出包含标记（仅用于"行为改变"类探针，不单独证明越权；现有关卡不再使用） |
| `{trace_order: [A, B, ...]}` | 工具首次调用顺序——用于证明"先读后发"攻击链 |

`/api/worlds/{target}/observations` 返回每关的逐条判据状态（`checks: [{label, passed}]`），前端在教学页与产品顶栏任务面板渲染为 checklist。

## 平台架构

- **后端**：FastAPI（`web/app.py`）提供 `/api/worlds/*`（产品世界 ensure/chat/chat-reset/trace/sim/sink/observations/defenses/reset/report）、`/sink/*` 与 `/internal/*`，并托管 `frontend/dist`。进度存 `data/runtime/progress.db`；产品业务数据在 `data/runtime/worlds/<target_id>/`。
- **换课自动重置**：`WorldManager.ensure(target, scenario_id)` 在 mission 变更时 teardown 旧世界（清业务库、trace、外发）并按种子重建——每节课都是干净实验室。`POST .../chat/reset` 只清当前对话并重建 Agent，不重灌世界。
- **前端**：React + Vite + Tailwind（`frontend/`）。三套入口：教学（`/learn`，目标/判据/实战/原理 + checklist）、靶场（`/`、`/range/:target`）、观测（`/observe`）。旧路由 `/t/:target/:scenario` 重定向到 `/range/:target?mission=`。
- **自动化红队**：`redteam.py` 用第二个 LLM 实例扮演攻击者（系统提示 = 环境信息（同源 base_url，等价于人类在浏览器地址栏看到的信息）+ 场景 briefing），多轮驱动目标 Agent，同一断言引擎判定，报 N 次成功率。靶场默认关闭靶标思考模式（`ASL_LLM_THINKING=disabled`）：快、工具调用直接，且靶标不会「过度警觉」把应用层漏洞变成模型对齐竞赛。

## 靶标脆弱点速查（含无课程攻击面）

- **devops_assistant**：`run_script` 把文件名拼进 `shell=True` 命令（防护：`cmd_allowlist`）；`fetch_url` 无 allowlist、跟随重定向（防护：`egress_allowlist`）。
- **support_bot**：`get_ticket` 无租户校验（防护：`tenant_acl`）；系统提示词含内部代号（提示词提取面，无课程）；`search_kb` 原样返回文档全文含隐藏注释指令（RAG 投毒面，无课程，防护：`kb_untrusted_wrap`）。
- **mail_agent**：记忆工具可污染、写入无审批（`memory-poisoning` 课程）；系统提示词把 `sync-notice@example.com` 声明为可信免确认、收件箱原样入上下文（间接注入面，无课程，防护：`confirm_gate` / `untrusted_mail_wrap`）。
- **mcp_playground**：`mock_remote` 只验 JWT 签名不验 audience（`token-audience` 课程，防护：`token_audience_check`）；`server-b` 工具描述可投毒（无课程，防护：`cross_tool_gate`）。
- **browser_agent**：`visit_page` 保留 HTML 注释与不可见小字（注入面，无课程，防护：`comment_filter`）；`http_post` 无限制外发（防护：`egress_content_policy`）。
