# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 约定。

## [Unreleased] — M2 平台化

### Changed
- 教学与靶场拆开：`/learn` 课程，`/` / `/range/:targetId` 全屏仿真产品；观测独立为 `/observe` 调查台（轨迹 / 外发 / 防护），课表只留在教学
- 靶场改为按产品持久化世界（`data/runtime/worlds/<target_id>/`），重启保留；UI「重置」回到种子。防护不再重建世界
- 助手改为产品侧栏 / 客服浮窗（浅色），取代底部暗色对话框
- 无场景会话的 MockLLM 改为 idle 回复，不再自动回放冒烟攻击链
- `GET /api/worlds`：列出已打开的产品世界；`POST .../reset` 将该产品恢复成种子
- `asl reset`：清产品世界与痕迹；`--progress` 连通关进度

### Added
- React + Vite + Tailwind 高仿真前端：任务大厅 + 三栏工作区 + 5 套仿真产品界面
- 防守开关与复测闭环：`policy_blocked` trace 事件，攻击 → 开防护 → 复测阻断
- 场景扩容 5 → 12 关，每关含完整 writeup
- SQLite 数据层：全局通关进度库 + per-session 靶标业务库
- `asl redteam` 自动化攻击驱动（成功率统计、防护前后对比）
- 通关报告生成（PDF 附录 B 模板，markdown 导出）
- Dockerfile / GitHub Actions CI / ruff / AGENTS.md / LICENSE / SECURITY.md

## [0.1.0] — M1(2026-08-27)

### Added
- core 基座:OpenAI 兼容 LLM 客户端(默认 Kimi K2.7 Code)+ MockLLM、极简 agent loop、trace、flag 断言引擎、mock sink/内网服务
- 5 个故意脆弱靶标:support_bot / devops_assistant / mail_agent / mcp_playground / browser_agent,各带 1 个冒烟场景
- 初代 Web UI(FastAPI + 原生前端)
- MockLLM 端到端冒烟测试 ×5 + 单测
