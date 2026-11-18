import type { Metadata } from "next"
import { MARKETING_ORIGIN } from "@/lib/release"

// Keep local development notices out of search until the launch owner approves indexing.
export function marketingMetadata(
  title: string,
  description: string,
  path: string
): Metadata {
  const url = `${MARKETING_ORIGIN}${path}`
  return {
    title: `${title} · Abstruck`,
    description,
    alternates: { canonical: url },
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      url,
      siteName: "Abstruck",
      type: "website",
      images: [{ url: `${MARKETING_ORIGIN}/icon.png`, alt: "Abstruck" }],
    },
    twitter: { card: "summary", title, description },
  }
}
