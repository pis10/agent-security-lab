"""MCP server A：配置保险库 + 接入方调试令牌签发（靶标组件，故意脆弱）。

stdio server，由 mcp_client.McpStdioClient 以子进程方式拉起：
    python -m agent_security_lab.targets.mcp_playground.server_a

issue_token 签发的调试 JWT（aud=server-a）与远端资源服务共用 HS256
签名密钥——这是 token-audience 关「共用密钥 + 资源端不验 aud」的根因一半。
"""
from __future__ import annotations

try:  # mcp 1.x
    from mcp.server.fastmcp import FastMCP
except ModuleNotFoundError:  # mcp 2.x 起 FastMCP 更名为 MCPServer
    from mcp.server.mcpserver import MCPServer as FastMCP

from .mock_remote import issue_token

mcp = FastMCP("server-a")


@mcp.tool()
def read_secret() -> str:
    """读取配置保险库中的同步码。"""
    return "SYNC-7F3K-9Q2M"


@mcp.tool()
def issue_debug_token() -> str:
    """为接入方签发调试用 JWT（audience=server-a），返回 JWT 原文（HS256）。"""
    return issue_token("marketplace-user")


if __name__ == "__main__":
    mcp.run()
