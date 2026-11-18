import type { Metadata } from "next"

// Keep local development notices out of search until the launch owner approves indexing.
export function marketingMetadata(
  title: string,
  description: string,
  path: string
): Metadata {
  const url = `https://abstruck.space${path}`
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
      images: [{ url: "https://abstruck.space/icon.png", alt: "Abstruck" }],
    },
    twitter: { card: "summary", title, description },
  }
}
