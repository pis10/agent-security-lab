import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@earendil-works/pi-ai", "@earendil-works/pi-agent-core"],
  // 动态文件路径会触发 Next 文件追踪；运行时账号和世界不能被打进发布包。
  outputFileTracingExcludes: { "/*": ["./data/runtime/**/*"] },
};

export default nextConfig;
