# AGENTS.md

AI/Agent 安全综合靶场（攻击者视角）。本地运行、dummy 数据、故意脆弱——**脆弱性是功能，修 bug 时不要把漏洞"修掉"**。

## 命令

```bash
uv sync                  # 安装依赖
uv run asl serve         # 启动靶场(读 .env;ASL_USE_MOCK_LLM=1 离线 mock)
uv run asl reset         # 清产品世界与痕迹;加 --progress 连通关进度
uv run ruff check src
cd frontend && npm install && npm run build   # 前端构建(dev: npm run dev,代理到 :8600)
docker build -t agent-security-lab .          # all-in-one 镜像
```

## 结构契约

- `core/`:LLM 客户端(`build_llm`)/ Agent loop / Tool / Tracer / flags 断言 / sinks / db。红队回放见 `testing.py`。
- `targets/<id>/`:故意脆弱的靶标。模块级 `TARGET = Target(...)`;工具 handler 签名为 `(args, ctx) -> str`;凡外发/抓取走真实 HTTP 到 `ctx.base_url` 并带 `X-ASL-Session` 头;`ctx.state["defenses"]` 是当前产品已开启的防护 id 集合,防护命中必须 `ctx.tracer.record("policy_blocked", ...)`。`seed()` 在世界已存在时只挂载、不重灌种子。
- `scenarios/*.yaml`:场景(briefing/assertions/writeup/defenses),断言 DSL 见 `core/flags.py` docstring。
- 每个场景应有 MockLLM 回放脚本:靶标在 `mock_scripts[scenario_id]`。
- `frontend/`:React + Vite + Tailwind。三套入口:**靶场**(`/`、`/range/:targetId`)全屏浅色仿真产品,一款产品一份持久世界;**教学**(`/learn`)课表;**观测**(`/observe`)该产品的轨迹/外发/防护。世界落在 `data/runtime/worlds/<target_id>/`,重启保留,UI「重置」或 `asl reset` 才回到种子。助手嵌在产品侧栏(`AiRail`)或客服浮窗(`AiWidget`);产品 UI 禁止出现课件词(Flag、长期记忆、跨租户、断言 DSL)。设计系统:`components/Icon.tsx`(零依赖内联图标,禁 emoji)、`components/product.tsx`、`p-card`/`product-scroll`;sim 契约见 `frontend/src/sims/` 的 `SimProps`——数据只用后端 `sim_state()` 返回的键,攻击输入只走 `onSend`。
- 种子数据(`data/seeds/<target>/`)**只增不改**:现有记录是场景断言与 mock 脚本的攻击载体。

## 铁律

- 真实危险载荷禁止入库:不 rm、不外联真实网络、秘密一律 `TEST_*`。
- `.env` 与真实凭据永不入库;Docker 构建上下文由 `.dockerignore` 把关。
- sink/internal 端点永远只绑 `127.0.0.1`。
- 新增依赖前先确认现有依赖做不到;优先 stdlib。
