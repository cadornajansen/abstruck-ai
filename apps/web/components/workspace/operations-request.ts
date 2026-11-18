export class OperationsRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = "OperationsRequestError"
  }
}

export async function operationsRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  init?.signal?.addEventListener("abort", abort, { once: true })
  if (init?.signal?.aborted) controller.abort()
  const timeout = setTimeout(abort, 20_000)
  try {
    const response = await fetch(path, {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...init?.headers },
      signal: controller.signal,
    })
    let result: T & { error?: string }
    try {
      result = await response.json()
    } catch {
      throw new Error("The response could not be read. Please try again.")
    }
    if (!response.ok)
      throw new OperationsRequestError(
        typeof result.error === "string"
          ? result.error
          : "This request could not be completed. Please try again.",
        response.status
      )
    return result
  } catch (cause) {
    if (!init?.signal?.aborted && controller.signal.aborted)
      throw new Error(
        "The request timed out. Check its status before trying again."
      )
    if (cause instanceof TypeError)
      throw new Error(
        "Connection interrupted. Your request may have been received; check its status or retry the same request."
      )
    throw cause
  } finally {
    clearTimeout(timeout)
    init?.signal?.removeEventListener("abort", abort)
  }
}

export function operationsMessage(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "The request could not be completed. Please try again."
}

export function operationsDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}
