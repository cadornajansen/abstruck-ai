import { MARKETING_HOSTNAME, isProductionRelease } from "@/lib/release"
import { publicUrl } from "@/lib/public-seo"

export function GET(request: Request): Response {
  const hostname = request.headers.get("host") ?? new URL(request.url).hostname
  const production = isProductionRelease()
  const marketing = production && hostname === MARKETING_HOSTNAME
  const workspace = production && !marketing
  const rules = [
    "User-agent: *",
    marketing || workspace
      ? "Allow: /\nDisallow: /api/\nDisallow: /auth/"
      : "Disallow: /",
  ]

  if (marketing) {
    rules.push(
      "",
      "User-agent: GPTBot",
      "User-agent: Google-Extended",
      "User-agent: ClaudeBot",
      "User-agent: CCBot",
      "Disallow: /",
      "",
      `Sitemap: ${publicUrl("/sitemap.xml")}`
    )
  }

  return new Response(`${rules.join("\n")}\n`, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "text/plain; charset=utf-8",
    },
  })
}
