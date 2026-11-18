import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import {
  APP_HOSTNAME,
  APP_ORIGIN,
  MARKETING_HOSTNAME,
  MARKETING_ORIGIN,
  isProductionRelease,
} from "@/lib/release"
import { getSupabaseConfig } from "@/lib/supabase/config"
import type { Database } from "@/lib/supabase/database.types"

const marketingPaths = new Set([
  "/",
  "/about",
  "/blog",
  "/changelog",
  "/contact",
  "/features",
  "/help",
  "/manifest.webmanifest",
  "/pricing",
  "/privacy",
  "/roadmap",
  "/robots.txt",
  "/sitemap.xml",
  "/terms",
])

function routeProductionRequest(
  request: NextRequest
): NextResponse | undefined {
  const { pathname, search } = request.nextUrl
  const hostname = request.headers.get("host") ?? request.nextUrl.hostname
  if (
    pathname === "/preview" ||
    pathname.startsWith("/preview/") ||
    pathname === "/marketing-preview" ||
    pathname.startsWith("/marketing-preview/")
  ) {
    return new NextResponse(null, { status: 404 })
  }

  const isMarketingPath =
    marketingPaths.has(pathname) || pathname.startsWith("/blog/")
  const isPublicAlias = hostname === "abstruck-app.vercel.app"
  const toMarketing =
    hostname === APP_HOSTNAME &&
    pathname !== "/" &&
    pathname !== "/manifest.webmanifest" &&
    isMarketingPath
  const toApp =
    isPublicAlias || (hostname === MARKETING_HOSTNAME && !isMarketingPath)

  if (!toMarketing && !toApp) return
  if (
    (request.method !== "GET" && request.method !== "HEAD") ||
    pathname === "/api" ||
    pathname.startsWith("/api/")
  ) {
    return new NextResponse(null, { status: 404 })
  }

  const destination = new URL(toMarketing ? MARKETING_ORIGIN : APP_ORIGIN)
  destination.pathname = pathname
  destination.search = search
  return NextResponse.redirect(destination)
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (isProductionRelease()) {
    const routed = routeProductionRequest(request)
    if (routed) return routed
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
  return response
}

export const config = {
  matcher: [
    "/preview/:path*",
    "/marketing-preview/:path*",
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
