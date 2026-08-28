"""MCP stdio 客户端：后台线程跑 asyncio 事件循环，对外提供同步 API。

生命周期：start() -> list_tools() / call_tool() -> close()。
anyio 的 cancel scope 是任务绑定的，因此 stdio transport 与 ClientSession
在同一个长跑协程 `_run` 内 enter/exit；close() 通过事件通知它收尾，
并确认 server 子进程已退出、无残留。
"""
from __future__ import annotations

import asyncio
import os
import subprocess
import threading
import time
from contextlib import AsyncExitStack

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


def _child_pids() -> dict[int, str]:
    """当前进程的直接子进程 {pid: command}（stdlib ps，macOS/Linux 均可）。"""
    out = subprocess.run(
        ["ps", "-eo", "pid=,ppid=,command="], capture_output=True, text=True, check=True
    ).stdout
    me = str(os.getpid())
    children: dict[int, str] = {}
    for line in out.splitlines():
        parts = line.split(None, 2)
        if len(parts) == 3 and parts[1] == me:
            children[int(parts[0])] = parts[2]
    return children


class McpStdioClient:
    """同步桥接一个 MCP stdio server 的 ClientSession。"""

    def __init__(self, params: StdioServerParameters, timeout: float = 15.0):
        self._params = params
        self._timeout = timeout
        self._marker = " ".join(params.args)  # 用启动参数在 ps 里识别子进程
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._session: ClientSession | None = None
        self._server_pids: set[int] = set()
        self._ready = threading.Event()
        self._done: asyncio.Event | None = None
        self._connect_error: BaseException | None = None
        self._runner: asyncio.Future | None = None

    def start(self) -> None:
        before = set(_child_pids())
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(
            target=self._loop.run_forever, daemon=True, name=f"mcp-stdio-{self._marker}"
        )
        self._thread.start()
        self._runner = asyncio.run_coroutine_threadsafe(self._run(), self._loop)
        if not self._ready.wait(timeout=self._timeout):
            self._shutdown_loop()
            raise TimeoutError(f"MCP server did not start in time: {self._marker}")
        if self._connect_error is not None:
            err = self._connect_error
            self._shutdown_loop()
            raise err
        self._server_pids = {
            pid
            for pid, cmd in _child_pids().items()
            if pid not in before and self._marker in cmd
        }

    async def _run(self) -> None:
        """连接、待命、收尾都在这一个任务里（cancel scope 任务绑定）。"""
        stack = AsyncExitStack()
        try:
            read, write = await stack.enter_async_context(stdio_client(self._params))
            session = await stack.enter_async_context(ClientSession(read, write))
            await session.initialize()
        except BaseException as exc:
            await stack.aclose()
            self._connect_error = exc
            self._ready.set()
            return
        self._session = session
        self._done = asyncio.Event()
        self._ready.set()
        await self._done.wait()
        await stack.aclose()
        self._session = None

    def _shutdown_loop(self) -> None:
        if self._loop is None:
            return
        self._loop.call_soon_threadsafe(self._loop.stop)
        self._thread.join(timeout=self._timeout)
        self._loop.close()
        self._loop = None

    def _require_started(self) -> None:
        if self._loop is None or self._session is None:
            raise RuntimeError("McpStdioClient not started (or already closed)")

    def list_tools(self) -> list:
        self._require_started()
        fut = asyncio.run_coroutine_threadsafe(self._session.list_tools(), self._loop)
        return fut.result(timeout=self._timeout).tools

    def call_tool(self, name: str, args: dict) -> str:
        self._require_started()
        fut = asyncio.run_coroutine_threadsafe(
            self._session.call_tool(name, args), self._loop
        )
        result = fut.result(timeout=self._timeout)
        parts = [c.text if hasattr(c, "text") else str(c) for c in result.content]
        return "\n".join(parts)

    def close(self) -> None:
        if self._loop is None:
            return
        if self._done is not None:
            self._loop.call_soon_threadsafe(self._done.set)
            self._runner.result(timeout=self._timeout)  # 等待 stack.aclose 完成
        self._shutdown_loop()
        self._confirm_exited()

    def _confirm_exited(self) -> None:
        """确认 transport 子进程已退出（等价于 Popen.poll() 不为 None）。"""
        deadline = time.time() + 5
        for pid in self._server_pids:
            while time.time() < deadline:
                try:
                    os.kill(pid, 0)
                except ProcessLookupError:
                    break  # 进程已回收，无残留
                time.sleep(0.05)
            else:
                raise RuntimeError(
                    f"MCP server subprocess leaked: pid={pid} ({self._marker})"
                )
        self._server_pids = set()
