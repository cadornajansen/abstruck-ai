"use client"

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next"

function redactPageUrl(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url, window.location.origin)
  // Auth callbacks and share links can carry credentials in the query or fragment.
  const path = url.pathname.replace(
    /^\/(assessments|materials|spaces|study)\/[^/]+/,
    "/$1/[id]"
  )
  return { ...event, url: url.origin + path }
}

export function WebAnalytics() {
  return <Analytics beforeSend={redactPageUrl} />
}
