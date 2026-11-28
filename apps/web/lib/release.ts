export const APP_HOSTNAME = "app.abstruck.com"
export const APP_ORIGIN = `https://${APP_HOSTNAME}`
export const MARKETING_HOSTNAME = "www.abstruck.com"
export const MARKETING_ORIGIN = `https://${MARKETING_HOSTNAME}`

export function isProductionRelease(): boolean {
  return process.env.VERCEL_ENV === "production"
}

export function getAppOrigin(fallback = "http://localhost:3000"): string {
  if (isProductionRelease()) return APP_ORIGIN
  return process.env.NEXT_PUBLIC_APP_URL || fallback
}

export function workspaceHref(path: string): string {
  return isProductionRelease() ? `${APP_ORIGIN}${path}` : path
}
