import "server-only"

import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import type {
  ShareMetadata,
  SharePreview,
  SharedOutput,
  SharedSnapshot,
} from "@/lib/sharing-types"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Json, Tables } from "@/lib/supabase/database.types"

export const sharingHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
}
export const sharingIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const tokenPattern = /^[A-Za-z0-9_-]{43}$/

export class ShareError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 409
  ) {
    super(code)
  }
}

export function sharingObject(
  value: unknown
): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

export function shareFailure(error: unknown, anonymous = false): Response {
  if (anonymous)
    return Response.json(
      { error: "This shared output is unavailable." },
      { status: 404, headers: sharingHeaders }
    )
  const code = error instanceof ShareError ? error.code : "share_unavailable"
  const status = error instanceof ShareError ? error.status : 503
  const messages: Record<string, string> = {
    revision_conflict:
      "The saved output changed. Review its latest version before sharing.",
    source_unavailable:
      "A selected original source is unavailable. Exclude originals or review your sources.",
    not_ready: "Save or finish generating this output before sharing it.",
    not_found: "This output could not be found.",
    invalid_expiry: "Choose a future expiry time.",
    request_conflict:
      "This request was used for different share settings. Review the preview and try again.",
    share_key_changed:
      "This link cannot be copied with the current sharing key. Create a new link; existing links keep working.",
  }
  return Response.json(
    {
      error:
        messages[code] ??
        "This share could not be completed. Please try again.",
      code,
    },
    { status, headers: sharingHeaders }
  )
}

function checkResult(
  data: Json | null,
  error: unknown
): Record<string, unknown> {
  if (error || !sharingObject(data))
    throw new ShareError("share_unavailable", 503)
  if (typeof data.error === "string")
    throw new ShareError(
      data.error,
      data.error === "not_found"
        ? 404
        : data.error === "share_key_changed"
          ? 503
          : 409
    )
  return data
}

function shareToken(ownerId: string, requestId: string): string {
  const secret = process.env.SHARE_TOKEN_SECRET
  if (!secret || Buffer.byteLength(secret) < 32)
    throw new ShareError("sharing_not_configured", 503)
  return createHmac("sha256", secret)
    .update(
      `abstruck:output-share:v1\0${ownerId.toLowerCase()}\0${requestId.toLowerCase()}`
    )
    .digest("base64url")
}

export function shareTokenHash(token: string): string {
  if (!tokenPattern.test(token)) throw new ShareError("share_unavailable", 404)
  return createHash("sha256").update(token).digest("hex")
}

export function shareBearer(request: Request): string {
  const header = request.headers.get("authorization")
  const token = header?.startsWith("Bearer ") ? header.slice(7) : ""
  if (!tokenPattern.test(token)) throw new ShareError("share_unavailable", 404)
  return token
}

function shareUrl(token: string): string {
  const origin = new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  )
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password
  )
    throw new ShareError("sharing_not_configured", 503)
  return `${origin.origin}/share#${token}`
}

function metadata(row: Tables<"share_links">): ShareMetadata {
  const snapshot = row.snapshot as unknown as SharedSnapshot
  return {
    id: row.id,
    studySetId: row.study_set_id,
    versionId: row.version_id,
    title: row.title,
    type: row.type as SharedSnapshot["type"],
    version: snapshot.version,
    includeOriginals: row.include_sources,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  }
}

async function ownedShare(
  ownerId: string,
  id: string
): Promise<Tables<"share_links">> {
  const { data, error } = await createAdminClient()
    .from("share_links")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("id", id)
    .maybeSingle()
  if (error) throw new ShareError("share_unavailable", 503)
  if (!data) throw new ShareError("not_found", 404)
  return data
}

export async function getSharePreview(
  ownerId: string,
  studySetId: string,
  includeOriginals: boolean,
  versionId?: string
): Promise<SharePreview> {
  const result = await createAdminClient().rpc("sharing_preview", {
    p_owner_id: ownerId,
    p_study_set_id: studySetId,
    p_include_sources: includeOriginals,
    ...(versionId ? { p_version_id: versionId } : {}),
  })
  const data = checkResult(result.data, result.error)
  if (
    !Array.isArray(data.sourceManifest) ||
    !sharingObject(data.snapshot) ||
    !sharingObject(data.disclosure)
  )
    throw new ShareError("share_unavailable", 503)
  return {
    studySetId: String(data.studySetId),
    versionId: typeof data.versionId === "string" ? data.versionId : null,
    revision: Number(data.revision),
    includeOriginals,
    snapshot: data.snapshot as unknown as SharedSnapshot,
    disclosure: data.disclosure as unknown as SharePreview["disclosure"],
    sources: data.sourceManifest
      .filter(sharingObject)
      .map((source) => ({
        key: String(source.source_key),
        title: String(source.title),
        type: String(source.source_type),
        mime: String(source.mime),
        available: source.available === true,
      })),
  }
}

export interface CreateShareInput {
  studySetId: string
  requestId: string
  revision: number
  versionId?: string
  includeOriginals: boolean
  expiresAt?: string
}

export async function createOutputShare(
  ownerId: string,
  input: CreateShareInput
): Promise<{ share: ShareMetadata; url: string }> {
  const token = shareToken(ownerId, input.requestId)
  const result = await createAdminClient().rpc("create_output_share", {
    p_owner_id: ownerId,
    p_study_set_id: input.studySetId,
    p_revision: input.revision,
    p_request_id: input.requestId,
    p_token_hash: shareTokenHash(token),
    p_include_sources: input.includeOriginals,
    ...(input.versionId ? { p_version_id: input.versionId } : {}),
    ...(input.expiresAt ? { p_expires_at: input.expiresAt } : {}),
  })
  const data = checkResult(result.data, result.error)
  if (typeof data.shareId !== "string")
    throw new ShareError("share_unavailable", 503)
  const row = await ownedShare(ownerId, data.shareId)
  return { share: metadata(row), url: shareUrl(token) }
}

export async function listOutputShares(
  ownerId: string,
  studySetId?: string
): Promise<ShareMetadata[]> {
  let query = createAdminClient()
    .from("share_links")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(50)
  if (studySetId) query = query.eq("study_set_id", studySetId)
  const { data, error } = await query
  if (error) throw new ShareError("share_unavailable", 503)
  return data.map(metadata)
}

export async function copyOutputShare(
  ownerId: string,
  id: string
): Promise<string> {
  const row = await ownedShare(ownerId, id)
  if (
    row.revoked_at ||
    (row.expires_at && Date.parse(row.expires_at) <= Date.now())
  )
    throw new ShareError("share_unavailable", 409)
  const token = shareToken(ownerId, row.request_id)
  if (
    !timingSafeEqual(
      Buffer.from(row.token_hash, "hex"),
      Buffer.from(shareTokenHash(token), "hex")
    )
  )
    throw new ShareError("share_key_changed", 503)
  return shareUrl(token)
}

export async function revokeOutputShare(
  ownerId: string,
  id: string
): Promise<ShareMetadata> {
  const { data, error } = await createAdminClient().rpc("revoke_output_share", {
    p_owner_id: ownerId,
    p_share_id: id,
  })
  if (error) throw new ShareError("share_unavailable", 503)
  if (!data) throw new ShareError("not_found", 404)
  return metadata(await ownedShare(ownerId, id))
}

export async function getSharedOutput(token: string): Promise<SharedOutput> {
  const { data, error } = await createAdminClient().rpc(
    "shared_output_by_hash",
    { p_token_hash: shareTokenHash(token) }
  )
  if (error || !sharingObject(data))
    throw new ShareError("share_unavailable", 404)
  return data as unknown as SharedOutput
}
