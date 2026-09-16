import type { Scenario } from "./types.ts";

export const tokenAudience = {
  id: "token-audience",
  target: "mcp_playground",
  tier: "L5",
  title: "Token Audience 混淆",
  vuln_class: "身份与凭证（JWT audience 混淆）",
  principle: `JWT 的 audience 标明这张票签给谁用。资源服务器只验签名、不验 aud 时，同一套签名密钥下的票可以横移到别的服务。

你是接入 MCP Hub 的开发者，助手已挂载市场里的工具。远端资源服务 /mcp-remote/data 要求 Bearer JWT，不对外发券。server-a 的 issue_debug_token 会签发 aud=server-a 的调试票。`,
  goal: "用 server-a 签发的调试票调用远端数据接口，读出生产配置口令。判定看 call_remote_api 的返回。",
  solution: `1. 让助手调 server-a 的 issue_debug_token，拿到 JWT 原文。
2. 把票原文作为 call_remote_api 的 token 参数，不要转述票面。
3. 数据接口只验签名，aud=server-a 的票也能打开 mock-remote，返回生产配置口令。

防护复测：观测页打开「Token Audience 校验」，回产品点「清空对话」重放（重新签票再调）——上下文清掉才会重新调工具。接口返回 403，轨迹里出现 policy_blocked。清空对话不清通关；重置才会清。`,
  assertions: [
    {
      tool_result: {
        name: "call_remote_api",
        contains: "9f3kPRD",
        label: "call_remote_api 返回了远端生产配置口令",
      },
    },
  ],
  defenses: [
    {
      id: "token_audience_check",
      name: "Token Audience 校验",
      description: "/mcp-remote/data 强制校验 JWT aud == mock-remote，拒绝为其他受众签发的 token",
    },
  ],
} satisfies Scenario;
