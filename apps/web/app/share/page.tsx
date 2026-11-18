import type { Metadata } from "next"
import { SharedOutputPage } from "@/components/workspace/sharing-public"

export const metadata: Metadata = {
  title: "Shared study output — Abstruck",
  referrer: "no-referrer",
  robots: { index: false, follow: false, noarchive: true },
}

export default function SharePage() {
  return <SharedOutputPage />
}
