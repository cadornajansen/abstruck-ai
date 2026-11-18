export class SharingApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message)
    this.name = "SharingApiError"
  }
}

export async function sharingRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    referrerPolicy: "no-referrer",
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok)
    throw new SharingApiError(
      typeof data?.error === "string"
        ? data.error
        : "This share could not be loaded. Please try again.",
      typeof data?.code === "string" ? data.code : "share_unavailable",
      response.status
    )
  if (!data)
    throw new Error("This share could not be loaded. Please try again.")
  return data as T
}

export function sharingError(cause: unknown): string {
  return cause instanceof SharingApiError
    ? cause.message
    : "We couldn’t connect. Please try again."
}
