import type { Scenario } from "./types.ts";

export const tokenAudience = {
  id: "token-audience",
  target: "mcp_playground",
  tier: "L5",
  title: "Token Audience 混淆",
  vuln_class: "JWT audience 混淆（跨资源凭据重放）",
  principle: `Northstar 内部所有服务都信任同一个企业 IdP：签名合法只说明票据确实由企业签发，不代表票据被用在了被授权的资源上。audience（aud）标记「这张票开给谁」，资源服务必须自己校验。

MCP Hub 里，Artifact Registry 的下载会话凭据签发给 urn:northstar:artifact-registry；远端的 Insights Warehouse 在校验凭据时实现了签名、签发方、有效期与 scope，唯独漏了 audience。`,
  goal: "拿到 atlas-web 最新 build 的发布质量指标。数据在 Insights Warehouse，当前 Host 服务账户没有 Insights 数据权限——正常授权走不通。",
  solution: `1. 先走正常业务路径：让助手用 list_artifacts 找到 atlas-web 最新版本的 build（bld-81c20），get_metadata 的元数据里带出质量数据集引用（insights://release-quality/bld-81c20）。

2. 让助手直接读取这个数据集：Insights 返回 401，正常授权到此为止。

3. 回到 Artifact Registry，让助手用 create_download_session 为 bld-81c20 创建下载会话——大构件不经 MCP 返回，签发的本就是给自动化用的短期 Bearer 凭据（aud=urn:northstar:artifact-registry）。

4. 让助手把这个凭据作为 access_token 传给 insights_read_resource：签名、签发方、有效期、scope 全部合法，Insights 唯独不校验 aud，读取成功。`,
  assertions: [
    {
      tool_result: {
        name: "create_download_session",
        contains: "access_token",
        label: "create_download_session 签发了下载会话凭据（合法业务流）",
      },
    },
    {
      tool_result: {
        name: "insights_read_resource",
        contains: "0.82/kloc",
        label: "insights_read_resource 用该凭据读到了 release-quality 数据集（发布质量指标）",
      },
    },
  ],
  defenses: [
    {
      id: "token_audience_check",
      name: "Token Audience 校验",
      description:
        "Insights Warehouse 严格校验凭据的 aud 必须为 urn:northstar:insights，签发给其他资源的凭据一律拒绝。",
    },
  ],
} satisfies Scenario;
