import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import {
  APP_HOSTNAME,
  APP_ORIGIN,
  MARKETING_HOSTNAME,
  MARKETING_ORIGIN,
  isProductionRelease,
} from "@/lib/release"
import { INDEXED_MARKETING_PATHS } from "@/lib/public-seo"
import { getSupabaseConfig } from "@/lib/supabase/config"
import type { Database } from "@/lib/supabase/database.types"

const marketingPaths = new Set([
  ...INDEXED_MARKETING_PATHS,
  "/changelog",
  "/manifest.webmanifest",
  "/roadmap",
  "/partners",
])

const discoveryPaths = new Set(["/robots.txt", "/sitemap.xml", "/llms.txt"])

function routeProductionRequest(
  request: NextRequest
): NextResponse | undefined {
  const { pathname, search } = request.nextUrl
  const hostname = request.headers.get("host") ?? request.nextUrl.hostname
  const isPublicAlias = hostname === "abstruck-app.vercel.app"
  const isReading = request.method === "GET" || request.method === "HEAD"
  if (
    pathname === "/preview" ||
    pathname.startsWith("/preview/") ||
    pathname === "/marketing-preview" ||
    pathname.startsWith("/marketing-preview/")
  ) {
    return new NextResponse(null, { status: 404 })
  }

  if (pathname === "/robots.txt" && !isPublicAlias) {
    return NextResponse.next()
  }
  if (discoveryPaths.has(pathname)) {
    if (hostname === MARKETING_HOSTNAME) return NextResponse.next()
    return NextResponse.redirect(new URL(pathname, MARKETING_ORIGIN), 308)
  }

  if (isReading) {
    const destination =
      pathname === "/signup"
        ? new URL("/sign-up", APP_ORIGIN)
        : pathname === "/landing"
          ? new URL("/", MARKETING_ORIGIN)
          : pathname === "/help"
            ? new URL("/contact", MARKETING_ORIGIN)
            : null
    if (destination) {
      destination.search = search
      return NextResponse.redirect(destination, 308)
    }
  }

  const isMarketingPath =
    marketingPaths.has(pathname) ||
    pathname.startsWith("/blog/") ||
    pathname.startsWith("/landing/demo/") ||
    pathname.startsWith("/landing/examples/")
  const toMarketing =
    (hostname === APP_HOSTNAME || isPublicAlias) &&
    (pathname !== "/" || isPublicAlias) &&
    (pathname !== "/manifest.webmanifest" || isPublicAlias) &&
    isMarketingPath
  const toApp =
    (isPublicAlias && !isMarketingPath) ||
    (hostname === MARKETING_HOSTNAME && !isMarketingPath)

  if (!toMarketing && !toApp) return
  if (!isReading || pathname === "/api" || pathname.startsWith("/api/")) {
    return new NextResponse(null, { status: 404 })
  }

  const destination = new URL(toMarketing ? MARKETING_ORIGIN : APP_ORIGIN)
  destination.pathname = pathname
  destination.search = search
  return NextResponse.redirect(destination, toMarketing ? 308 : 307)
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl
  if (isProductionRelease()) {
    const routed = routeProductionRequest(request)
    if (routed) return routed
  }
  if (discoveryPaths.has(pathname)) {
    if (process.env.VERCEL_ENV === "preview" && pathname !== "/robots.txt")
      return new NextResponse(null, { status: 404 })
    return NextResponse.next()
  }
  const markdown = /^\/blog\/([a-z0-9-]+)\.md$/.exec(pathname)
  if (markdown) {
    const destination = request.nextUrl.clone()
    destination.pathname = `/agent-content/blog/${markdown[1]}`
    return NextResponse.rewrite(destination)
  }
  let response = NextResponse.next({ request })
  const { url, publishableKey } = getSupabaseConfig()
  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        )
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
        Object.entries(headers).forEach(([name, value]) => {
          response.headers.set(name, value)
        })
      },
    },
  })

  await supabase.auth.getClaims()
  response.headers.set("Cache-Control", "private, no-store")
  if (
    process.env.VERCEL_ENV === "preview" ||
    (isProductionRelease() &&
      (request.headers.get("host") ?? request.nextUrl.hostname) !==
        MARKETING_HOSTNAME)
  ) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow")
  }
  return response
}

export const config = {
  matcher: [
    "/preview/:path*",
    "/marketing-preview/:path*",
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
