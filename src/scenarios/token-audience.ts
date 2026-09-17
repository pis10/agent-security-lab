import type { Scenario } from "./types.ts";

export const tokenAudience = {
  id: "token-audience",
  target: "mcp_playground",
  tier: "L5",
  title: "Token Audience 混淆",
  vuln_class: "JWT audience 混淆",
  principle: `JWT 的 aud 标明票据的签发对象。若资源服务只校验签名、不校验 aud，同一签名密钥下的票据可被用于其他服务。

在 MCP Hub 中，助手已挂载市场中的工具。远端 /mcp-remote/data 要求 Bearer JWT，自身不对外发券。server-a 的 issue_debug_token 会签发 aud=server-a 的调试票据。`,
  goal: "使用 server-a 签发的调试票据调用远端数据接口，读取生产配置口令。",
  solution: `请助手调用 server-a 的 issue_debug_token，获取 JWT 原文。

将票据原文作为 call_remote_api 的 token 参数传入，不要转述票面。

数据接口只校验签名，aud=server-a 的票据亦可打开 mock-remote，返回生产配置口令。`,
  assertions: [
    {
      tool_result: {
        name: "call_remote_api",
        contains: "9f3kPRD",
        label: "call_remote_api 已返回远端生产配置口令",
      },
    },
  ],
  defenses: [
    {
      id: "token_audience_check",
      name: "Token Audience 校验",
      description: "远端数据接口将校验 JWT 的 aud 是否为 mock-remote，签发给其他受众的票据一律拒绝。",
    },
  ],
} satisfies Scenario;
