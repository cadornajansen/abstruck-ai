export async function billingRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  let data: T & { error?: string }
  try {
    data = await response.json()
  } catch {
    throw new Error("We couldn’t read your billing status. Please try again.")
  }
  if (!response.ok)
    throw new Error(
      data.error ??
        "Your billing request could not be completed. Please try again."
    )
  return data
}
