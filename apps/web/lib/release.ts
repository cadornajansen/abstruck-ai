export const APP_HOSTNAME = "app.abstruck.space"
export const APP_ORIGIN = `https://${APP_HOSTNAME}`
export const MARKETING_HOSTNAME = "www.abstruck.space"
export const MARKETING_ORIGIN = `https://${MARKETING_HOSTNAME}`

export function isProductionRelease(): boolean {
  return process.env.VERCEL_ENV === "production"
}

export function workspaceHref(path: string): string {
  return isProductionRelease() ? `${APP_ORIGIN}${path}` : path
}
