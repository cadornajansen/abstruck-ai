import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  experimental: {
    agentUpgrade: "security",
  },
  transpilePackages: ["@workspace/ui"],
}

export default nextConfig
