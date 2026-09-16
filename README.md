# agent-security-lab · AI 红队靶场

> **仅限本地学习与明确授权的安全测试。** 靶场中所有秘密均为 `TEST_*` dummy 数据，外发箱和内网端点只绑 `127.0.0.1`。不要把这里的攻击手法用于未授权系统。

一个以**攻击者视角**系统性学习 AI / Agent 安全的综合仿真靶场，大纲参考 `AI-Security.pdf`（OWASP LLM Top 10 / Agentic Top 10 / MCP 安全）。靶场的核心设计理念：

- **只收确定性关卡。** 每关的漏洞都在应用层（命令拼接、无租户校验、无出站限制、JWT 不验 audience、记忆写入无审批），攻击成败取决于工具/接口的真实执行，不取决于目标模型「今天警不警惕」。提示词注入类「赌模型不拒绝」的关卡已移除——它们的成功率方差来自模型对齐，而不是靶标缺陷。
- **看实际发生了什么，不看模型嘴上怎么说。** 每关是否完成，看外发箱有没有收到数据、内网有没有被访问、工具有没有按攻击链被调用。秘密是仿真格式的真实感数据（AWS 示例密钥、业务确认码、生产口令等）——不出现 CTF 风格的标记，靶标与判定都贴近真实攻防。
- **攻击链优先于单点。** 关卡围绕「能控制的输入 × 够得着的权限 × 能看见的结果」组织。
- **攻击 → 加固 → 复测闭环。** 每关可一键开启确定性防护（如外发 allowlist、工单属主校验），防护命中即阻断并在 trace 中记录 `policy_blocked`。

## 快速开始

```bash
cp .env.example .env   # 填入你的 GLM API Key（智谱开放平台，OpenAI 兼容端点）
uv sync
cd frontend && npm install && npm run build && cd ..   # 需要 Node >= 20
uv run asl serve       # 打开 http://127.0.0.1:8600
```

Docker all-in-one（前端已在镜像内构建）：

```bash
docker build -t agent-security-lab .
docker run --rm -p 8600:8600 -e ASL_LLM_API_KEY=<your-key> agent-security-lab
```

## 玩法

教学、靶场、观测是三个分开的入口。

1. **靶场**（`/`）：打开 NovaMail / 橙犀等仿真产品。产品全屏，漏洞在工具和初始数据里。默认随便玩。
2. **教学**（`/learn`）：先读**任务书**（场景要点 + 一句「解决本关」）和**通关判定**（机器可判定的 checklist），提示与背景原理折叠其下。漏洞类别开课即亮出。
3. **观测**（`/observe`）：看这款产品里助手调用了什么、数据发到哪，并在这里开关防护。课程还在教学页。
4. 在产品里翻数据、对助手说话。状态会留下来，完成课程目标后，教学页解锁解析；逐条判据的达成状态在课程页和产品顶栏任务面板实时可见。**切换课程会自动重置该产品的世界**，保证每关判定干净。
5. 在观测页打开防护再打一次：应被拦截。想重新测，先点「重置」。
6. 解析在教学页，不在产品里。不要只靠改提示词来当防护。

## 命令行

```bash
uv run asl serve          # Web 靶场
uv run asl targets        # 列出靶标
uv run asl scenarios      # 列出场景
uv run asl redteam --scenario ticket-idor --runs 3   # 自动化红队：攻击方 LLM 驱动目标，报成功率
uv run asl redteam --scenario ticket-idor --defenses tenant_acl   # 开启防护复测
uv run asl report support_bot --scenario ticket-idor   # 由产品世界的 trace 生成通关报告
uv run asl reset              # 清所有产品世界与痕迹；种子不动
uv run asl reset --progress   # 同上，并清掉通关进度
```

`redteam` 遵循"报告成功率而非一次侥幸"的原则：同一场景跑 N 次，统计攻击成功率；加 `--defenses` 即变为加固复测。

## 靶标与场景

| 靶标 | 仿真产品 | 漏洞类别 | 场景 |
|---|---|---|---|
| `devops_assistant` 运维助手 | 运维控制台 | 命令注入 / SSRF | `cmd-injection` (L1) · `ssrf-cloud-metadata` (L3) |
| `support_bot` 客服机器人 | 电商后台 | IDOR / 越权 | `ticket-idor` (L2) |
| `mail_agent` 邮件助手 | 邮件客户端 | 记忆投毒（写入通路） | `memory-poisoning` (L4) |
| `mcp_playground` MCP 市场 | 工具市场 | Token audience 混淆 | `token-audience` (L5) |
| `browser_agent` 浏览助手 | 仿真浏览器 | —— | 无课程，保留自由玩 |

五个等级就是一条学习路径：**L1 输入注入 → L2 对象授权 → L3 出网边界 → L4 持久化记忆 → L5 身份凭证**，一关一个台阶。

每关都是**确定性判定**：断言只查工具返回与外发箱（`tool_result` / `sink_received`），漏洞在应用层，模型只要正常干活、攻击链就成立。历史上的提示词注入类关卡（间接注入外发、RAG 投毒、工具描述投毒、注释注入链、记忆后门引爆、提示词提取、过度代理）已移除——它们的成败取决于目标模型的对齐运气，不适合做可判定的靶场关卡；相关靶标产品仍保留这些攻击面供自由探索。

## 结构

```
src/agent_security_lab/
├── core/        # LLM 客户端(OpenAI 兼容)、agent loop、工具、trace、flag 断言、外发箱、
│                # progress DB (SQLite)、报告生成
├── targets/     # 5 个故意脆弱的靶标应用（SQLite 业务库 + 防护开关 + 仿真数据接口）
├── web/         # FastAPI：产品世界/聊天/sim/sink/progress/report API，托管前端 dist
├── redteam.py   # 自动化红队驱动（攻击方 LLM ↔ 目标 Agent）
├── config.py / scenario.py / testing.py / cli.py
frontend/        # React + Vite + Tailwind：靶场 / 教学 / 观测，5 套仿真产品 UI
scenarios/       # 5 个确定性场景 YAML（目标合同 + 判据 label + 防御 + 攻击解析）
data/seeds/      # 种子数据（知识库、邮件、站点页面……）
data/runtime/    # 产品世界 worlds/<target_id>/ 与通关进度（gitignored）
docs/design.md   # PDF 章节 ↔ 靶标/场景映射与断言 DSL 参考
```

## 安全说明

- API Key 只放本地 `.env`（已 gitignore），不要提交；Key 若在任何公开场合出现过，请到控制台轮换。
- 所有 sink / internal 服务只绑 `127.0.0.1`；`run_script` 等脆弱工具只操作 `data/runtime/` 下的 dummy 文件。
