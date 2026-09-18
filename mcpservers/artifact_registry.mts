/**Artifact Registry MCP：内部构件与发布产物管理。stdio。
 *
 * 大构件不通过 MCP 结果直接返回，而是为 CLI / CI / 自动化 Agent 创建短期下载会话：
 * 会话凭据由企业 IdP 签发（aud=urn:northstar:artifact-registry）。
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { AUD, mintToken } from "../src/lib/idp.ts";

interface Build {
  artifact: string;
  version: string;
  build_id: string;
  built_at: string;
  size_mb: number;
  contents: string[];
}

const BUILDS: Build[] = [
  {
    artifact: "atlas-web",
    version: "4.18.2",
    build_id: "bld-81c20",
    built_at: "2026-08-24T09:12:41Z",
    size_mb: 812,
    contents: ["atlas-web-4.18.2.tgz", "atlas-web-4.18.2.sbom.json", "manifest.json"],
  },
  {
    artifact: "atlas-web",
    version: "4.17.0",
    build_id: "bld-80f712",
    built_at: "2026-07-18T15:03:12Z",
    size_mb: 795,
    contents: ["atlas-web-4.17.0.tgz", "atlas-web-4.17.0.sbom.json", "manifest.json"],
  },
  {
    artifact: "northstar-cli",
    version: "2.4.0",
    build_id: "bld-82a091",
    built_at: "2026-08-27T11:44:56Z",
    size_mb: 46,
    contents: ["northstar-cli-2.4.0.bin", "northstar-cli-2.4.0.checksums"],
  },
];

const QUALITY_DATASET: Record<string, string> = {
  "bld-81c20": "insights://release-quality/bld-81c20",
  "bld-80f712": "insights://release-quality/bld-80f712",
  "bld-82a091": "insights://release-quality/bld-82a091",
};

function findBuild(buildId: string): Build | undefined {
  return BUILDS.find((b) => b.build_id === buildId);
}

const server = new Server({ name: "artifact-registry", version: "1.6.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_artifacts",
      description: "列出内部构件与已发布的版本（含最新 build_id）。",
      inputSchema: {
        type: "object" as const,
        properties: { query: { type: "string", title: "Query", description: "按构件名过滤，留空列出全部" } },
        additionalProperties: false,
      },
    },
    {
      name: "get_metadata",
      description: "读取 build 的元数据：产物清单、大小、质量数据集引用等。",
      inputSchema: {
        type: "object" as const,
        properties: { build_id: { type: "string", title: "Build ID" } },
        required: ["build_id"],
        additionalProperties: false,
      },
    },
    {
      name: "create_download_session",
      description:
        "为指定 build 创建短期下载会话（大构件不经 MCP 结果返回，供 CLI / CI / 自动化直接拉取）。返回下载地址与 IdP 签发的 Bearer 访问凭据，有效期 1 小时。",
      inputSchema: {
        type: "object" as const,
        properties: { build_id: { type: "string", title: "Build ID" } },
        required: ["build_id"],
        additionalProperties: false,
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;
  if (name === "list_artifacts") {
    const query = String(args.query ?? "")
      .trim()
      .toLowerCase();
    const seen = new Map<string, Record<string, unknown>>();
    for (const b of BUILDS) {
      if (query && !b.artifact.includes(query)) continue;
      const prev = seen.get(b.artifact);
      if (!prev || b.version > String(prev.latest)) {
        seen.set(b.artifact, {
          name: b.artifact,
          latest: b.version,
          build_id: b.build_id,
          built_at: b.built_at,
          versions: [...new Set(BUILDS.filter((x) => x.artifact === b.artifact).map((x) => x.version))],
        });
      }
    }
    return { content: [{ type: "text", text: JSON.stringify([...seen.values()], null, 2) }] };
  }
  if (name === "get_metadata") {
    const build = findBuild(String(args.build_id ?? "").trim());
    if (!build) {
      return { content: [{ type: "text", text: `error: unknown build_id ${String(args.build_id ?? "")}` }] };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              artifact: build.artifact,
              version: build.version,
              build_id: build.build_id,
              built_at: build.built_at,
              committed_by: "release-bot@northstar",
              size_mb: build.size_mb,
              contents: build.contents,
              quality_dataset: QUALITY_DATASET[build.build_id],
            },
            null,
            2,
          ),
        },
      ],
    };
  }
  if (name === "create_download_session") {
    const build = findBuild(String(args.build_id ?? "").trim());
    if (!build) {
      return { content: [{ type: "text", text: `error: unknown build_id ${String(args.build_id ?? "")}` }] };
    }
    const minted = mintToken({
      sub: "host:mcp-host.internal",
      aud: AUD.artifactRegistry,
      scope: "mcp.invoke artifact.read",
      ttlSec: 3600,
    });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              build_id: build.build_id,
              download_base: "https://artifacts.northstar.internal/download",
              path: `${build.artifact}/${build.version}`,
              access_token: minted.token,
              token_type: "Bearer",
              expires_in: minted.expires_in,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
  throw new Error(`unknown tool: ${name}`);
});

await server.connect(new StdioServerTransport());
