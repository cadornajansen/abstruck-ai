import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  experimental: {
    agentUpgrade: "security",
  },
  outputFileTracingIncludes: {
    "/blog/*": ["./content/blog/*.md"],
    "/agent-content/blog/*": ["./content/blog/*.md"],
  },
  transpilePackages: ["@workspace/ui"],
}

export default nextConfig
