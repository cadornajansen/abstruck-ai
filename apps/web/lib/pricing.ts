export const monthlyPrices = {
  usd: { free: "$0", pro: "$6.99", currencyName: "US dollars" },
  php: { free: "₱0", pro: "₱199", currencyName: "Philippine pesos" },
} as const

export type BillingCurrency = keyof typeof monthlyPrices

export const proFeatures = [
  "10 hours of audio and video",
  "500 document pages",
  "300 study-chat questions",
  "100 generated study sets",
  "2 GB of file storage",
] as const

export const billingPaths = {
  settings: "/?settings=billing",
  "checkout-return": "/?settings=billing&checkout=success",
  upgrade: "/?upgrade=pro",
} as const

export type BillingView = keyof typeof billingPaths
type BillingQuery = {
  settings?: string | string[]
  checkout?: string | string[]
  upgrade?: string | string[]
}

export function getBillingView(query: BillingQuery): BillingView | undefined {
  if (query.settings === "billing" && query.checkout === "success")
    return "checkout-return"
  if (query.upgrade === "pro") return "upgrade"
  if (query.settings === "billing") return "settings"
}

export function getPricingCurrency(
  headers: Pick<Headers, "get">
): BillingCurrency {
  const country =
    headers.get("x-vercel-ip-country") ??
    (process.env.NODE_ENV === "development"
      ? process.env.LOCAL_PRICING_COUNTRY
      : undefined)
  return country?.trim().toUpperCase() === "PH" ? "php" : "usd"
}
