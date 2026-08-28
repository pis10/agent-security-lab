# AGENTS.md

AI/Agent 安全综合靶场（攻击者视角）。本地运行、dummy 数据、故意脆弱——**脆弱性是功能，修 bug 时不要把漏洞"修掉"**。

## 命令

```bash
uv sync                  # 安装依赖
uv run asl serve         # 启动靶场(读 .env;ASL_USE_MOCK_LLM=1 离线 mock)
uv run pytest            # 后端测试(全部离线可跑)
uv run ruff check src tests
cd frontend && npm install && npm run build   # 前端构建(dev: npm run dev,代理到 :8600)
docker build -t agent-security-lab .          # all-in-one 镜像
```

## 结构契约

- `core/`:LLM 客户端(`build_llm`)/ Agent loop / Tool / Tracer / flags 断言 / sinks / db。**改 core 即改契约,先读 testing.py 看使用方式。**
- `targets/<id>/`:故意脆弱的靶标。模块级 `TARGET = Target(...)`;工具 handler 签名为 `(args, ctx) -> str`;凡外发/抓取走真实 HTTP 到 `ctx.base_url` 并带 `X-ASL-Session` 头;`ctx.state["defenses"]` 是当前会话已开启的防护 id 集合,防护命中必须 `ctx.tracer.record("policy_blocked", ...)`。
- `scenarios/*.yaml`:场景(briefing/assertions/writeup/defenses),断言 DSL 见 `core/flags.py` docstring。
- 每个场景必须能被 MockLLM 回放:靶标在 `mock_scripts[scenario_id]` 里放"标准答案"脚本,`tests/test_scenarios_e2e.py` 会逐场景验证。
- `frontend/`:React + Vite + Tailwind;sim 组件契约见 `frontend/src/sims/` 的 `SimProps`。

## 铁律

- 真实危险载荷禁止入库:不 rm、不外联真实网络、秘密一律 `TEST_*`。
- `.env` 与真实凭据永不入库;Docker 构建上下文由 `.dockerignore` 把关。
- sink/internal 端点永远只绑 `127.0.0.1`。
- 新增依赖前先确认现有依赖做不到;优先 stdlib。
