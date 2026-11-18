import type { MaterialLocation, SpaceFolder } from "@/lib/organisation-types"

export function folderHref(
  folder: Pick<SpaceFolder, "spaceId" | "id">
): string {
  return `/spaces/${folder.spaceId}?folderId=${folder.id}`
}

export class OrganisationRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly folder?: SpaceFolder,
    readonly location?: MaterialLocation
  ) {
    super(message)
    this.name = "OrganisationRequestError"
  }
}

export async function organisationRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  const result = await response.json()
  if (!response.ok)
    throw new OrganisationRequestError(
      typeof result.error === "string"
        ? result.error
        : "This change could not be saved. Try again.",
      response.status,
      result.folder,
      result.location
    )
  return result as T
}

export function organisationMessage(error: unknown): string {
  return error instanceof OrganisationRequestError
    ? error.message
    : "We couldn’t connect. Your change has not been confirmed; try again."
}
