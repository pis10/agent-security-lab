"""asl CLI: serve the range, list targets/scenarios."""
from __future__ import annotations

import argparse
import logging


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(prog="asl", description="agent-security-lab: AI 红队靶场（仅限本地/授权环境）")
    sub = parser.add_subparsers(dest="command", required=True)

    p_serve = sub.add_parser("serve", help="启动 Web 靶场")
    p_serve.add_argument("--host", default=None)
    p_serve.add_argument("--port", type=int, default=None)

    sub.add_parser("targets", help="列出靶标")
    sub.add_parser("scenarios", help="列出场景")

    p_rt = sub.add_parser("redteam", help="自动化红队：攻击方 LLM 驱动目标，统计成功率")
    p_rt.add_argument("--scenario", required=True, help="场景 id")
    p_rt.add_argument("--runs", type=int, default=3, help="重复攻击次数（默认 3）")
    p_rt.add_argument("--max-turns", type=int, default=6, help="单次运行最大对话轮数（默认 6）")
    p_rt.add_argument("--defenses", default="", help="逗号分隔的防护 id 列表（默认不开防护）")

    p_rep = sub.add_parser("report", help="由 trace 证据生成通关报告（Markdown）")
    p_rep.add_argument("session_id", help="会话 id（traces/<session_id>.jsonl）")
    p_rep.add_argument("--scenario", required=True, help="场景 id")

    args = parser.parse_args()

    if args.command == "serve":
        from .config import load_config

        config = load_config()
        host = args.host or config.host
        port = args.port or config.port
        import uvicorn

        uvicorn.run("agent_security_lab.web.app:app", host=host, port=port, reload=False)
    elif args.command == "targets":
        from .targets import list_targets

        for t in list_targets():
            print(f"{t.id:20s} {t.name:24s} {t.tier_focus}")
    elif args.command == "scenarios":
        from .scenario import load_scenarios

        for s in load_scenarios():
            print(f"[{s.tier}] {s.id:28s} target={s.target:18s} {s.title}")
    elif args.command == "redteam":
        from .redteam import run_redteam
        from .scenario import load_scenarios
        from .targets import get_target
        from .testing import live_sinks, test_config

        scenario = next((s for s in load_scenarios() if s.id == args.scenario), None)
        if scenario is None:
            raise SystemExit(f"未知场景 {args.scenario!r}，用 `asl scenarios` 查看列表")
        target = get_target(scenario.target)
        config = test_config()
        defenses = {d.strip() for d in args.defenses.split(",") if d.strip()}
        mode = "MockLLM 回放" if config.use_mock_llm else f"真实模型 {config.llm_model}"
        print(f"红队评估: {scenario.id} × {args.runs} 次 · {mode} · 防护: {sorted(defenses) or '无'}")
        with live_sinks(config):
            result = run_redteam(
                scenario, target, config,
                runs=args.runs, max_turns=args.max_turns, defenses=defenses,
            )
        print(f"成功率: {result.successes}/{result.runs} = {result.success_rate:.0%}")
    elif args.command == "report":
        from .config import load_config
        from .core.report import generate_report, load_trace_events
        from .scenario import load_scenarios

        scenario = next((s for s in load_scenarios() if s.id == args.scenario), None)
        if scenario is None:
            raise SystemExit(f"未知场景 {args.scenario!r}，用 `asl scenarios` 查看列表")
        config = load_config()
        events = load_trace_events(config.trace_dir, args.session_id)
        if not events:
            raise SystemExit(f"找不到 trace: {config.trace_dir}/{args.session_id}.jsonl")
        print(generate_report(scenario, args.session_id, events, []))


if __name__ == "__main__":
    main()
