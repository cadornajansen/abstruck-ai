import "server-only"

import { APP_ORIGIN, getAppOrigin } from "@/lib/release"

export const polarUuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i

function readConfig() {
  const environment = process.env.POLAR_ENVIRONMENT
  const organizationId = process.env.POLAR_ORGANIZATION_ID?.trim()
  const productId = process.env.POLAR_PRODUCT_ID?.trim()
  const accessToken = process.env.POLAR_ACCESS_TOKEN?.trim()
  const webhookSecret = process.env.POLAR_WEBHOOK_SECRET?.trim()
  if (
    (environment !== "sandbox" && environment !== "production") ||
    !organizationId ||
    !polarUuid.test(organizationId) ||
    !productId ||
    !polarUuid.test(productId) ||
    !accessToken ||
    !webhookSecret ||
    (process.env.VERCEL_ENV === "preview" && environment !== "sandbox") ||
    (process.env.VERCEL_ENV === "production" && environment !== "production")
  )
    return null

  const app = new URL(
    getAppOrigin(environment === "production" ? APP_ORIGIN : undefined)
  )
  if (
    app.username ||
    app.password ||
    app.pathname !== "/" ||
    app.search ||
    app.hash ||
    (app.protocol !== "https:" &&
      !(
        environment === "sandbox" &&
        app.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(app.hostname)
      ))
  )
    return null
  return {
    environment,
    organizationId,
    productId,
    accessToken,
    webhookSecret,
    appOrigin: app.origin,
  } as const
}

export function isPolarBillingConfigured(): boolean {
  try {
    return readConfig() !== null
  } catch {
    return false
  }
}

export function getPolarConfig(): NonNullable<ReturnType<typeof readConfig>> {
  const config = readConfig()
  if (!config) throw new Error("polar_config_unavailable")
  return config
}
