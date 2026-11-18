import { OrganisationError } from "@/lib/organisation"

export const organisationHeaders = { "Cache-Control": "private, no-store" }
export const organisationUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const validRevision = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value < 2147483647

export async function organisationInput(
  request: Request,
  maxBytes = 4096
): Promise<Record<string, unknown>> {
  if (
    !request.headers.get("content-type")?.startsWith("application/json") ||
    !request.body
  )
    throw new OrganisationError(400, "Invalid organization request.")
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > maxBytes) {
        await reader.cancel()
        throw new OrganisationError(
          413,
          "This organization request is too large."
        )
      }
      chunks.push(next.value)
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new OrganisationError(400, "Invalid organization request.")
    return body as Record<string, unknown>
  } finally {
    reader.releaseLock()
  }
}

export function organisationFailure(error: unknown): Response {
  if (error instanceof OrganisationError)
    return Response.json(
      {
        error: error.message,
        ...(error.folder ? { folder: error.folder } : {}),
        ...(error.location ? { location: error.location } : {}),
      },
      { status: error.status, headers: organisationHeaders }
    )
  return Response.json(
    {
      error:
        error instanceof SyntaxError
          ? "Invalid organization request."
          : "This change could not be saved. Refresh and try again.",
    },
    {
      status: error instanceof SyntaxError ? 400 : 503,
      headers: organisationHeaders,
    }
  )
}
