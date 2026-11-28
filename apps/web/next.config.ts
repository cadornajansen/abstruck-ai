import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  async redirects() {
    const port = Number(process.env.LOCAL_POLAR_SANDBOX_PORT)
    if (
      process.env.NODE_ENV !== "development" ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    ) {
      return []
    }

    return ["/pricing", "/billing"].map((source) => ({
      source,
      has: [{ type: "host" as const, value: "(?:localhost|127\\.0\\.0\\.1)" }],
      destination: `http://localhost:${port}${source}`,
      permanent: false,
    }))
  },
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
