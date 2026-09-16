import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 单容器部署：构建产物自带最小 node server（HOSTNAME/PORT 环境变量控制绑定）
  output: "standalone",
};

export default nextConfig;
