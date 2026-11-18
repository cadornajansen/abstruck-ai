import "server-only"
import { cookies } from "next/headers"
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { getCurrentUser } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Tables } from "@/lib/supabase/database.types"
import type {
  AccountDataKind,
  AccountDataRequest,
  AccountDataResponse,
} from "@/lib/account-data-types"

type RequestRow = Tables<"account_data_requests">
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const headers = { "Cache-Control": "private, no-store" }
const messages: Record<string, string> = {
  export_in_progress:
    "An export is already being prepared. Check its status before requesting another.",
  export_file_unavailable:
    "A stored file could not be read. Request a new export or contact support.",
  export_size_boundary:
    "This account exceeds the current export size limit. Contact support for help.",
  export_disk_space:
    "The export could not be prepared. Please try again later.",
  account_deleting: "Account deletion has already been accepted.",
  storage_cleanup_pending:
    "File cleanup will be retried. Keep this request reference if you contact support.",
}

async function signExport(row: RequestRow): Promise<string> {
  if (row.object_key !== `${row.owner_id}/exports/${row.id}.tar.gz`)
    throw new Error("export_owner_boundary")
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } =
    process.env
  if (
    !R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET
  )
    throw new Error("storage_unavailable")
  const storage = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  })
  try {
    return await getSignedUrl(
      storage,
      new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: row.object_key,
        ResponseContentType: "application/gzip",
        ResponseContentDisposition:
          'attachment; filename="abstruck-account-export.tar.gz"',
        ResponseCacheControl: "private, no-store",
      }),
      { expiresIn: 60 }
    )
  } finally {
    storage.destroy()
  }
}

async function requestDto(row: RequestRow): Promise<AccountDataRequest> {
  const result: AccountDataRequest = {
    id: row.id,
    kind: row.kind as AccountDataKind,
    status: row.status as AccountDataRequest["status"],
    createdAt: row.created_at,
    completedAt: row.completed_at,
    error:
      row.status === "failed"
        ? (messages[row.error_code ?? ""] ??
          "This request could not be completed. Keep its reference and contact support.")
        : null,
    includesOriginalFiles: row.kind === "export",
    ...(row.expires_at ? { expiresAt: row.expires_at } : {}),
  }
  if (
    row.kind === "export" &&
    row.status === "ready" &&
    row.object_key &&
    row.expires_at &&
    Date.parse(row.expires_at) > Date.now()
  )
    result.downloadUrl = await signExport(row)
  return result
}

export async function accountDataInput(
  request: Request,
  allowEmpty = false
): Promise<Record<string, unknown>> {
  if (!request.body) {
    if (allowEmpty) return {}
    throw new Error("invalid_request")
  }
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const item = await reader.read()
      if (item.done) break
      bytes += item.value.byteLength
      if (bytes > 4096) {
        await reader.cancel()
        throw new Error("invalid_request")
      }
      chunks.push(item.value)
    }
  } finally {
    reader.releaseLock()
  }
  if (bytes === 0 && allowEmpty) return {}
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("invalid_request")
  const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error("invalid_request")
  return body as Record<string, unknown>
}

async function clearAuthCookies(): Promise<void> {
  const store = await cookies(),
    url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  if (!url) throw new Error("auth_configuration_missing")
  const prefix = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`
  for (const cookie of store.getAll())
    if (cookie.name.startsWith(prefix))
      store.set(cookie.name, "", { path: "/", maxAge: 0, sameSite: "lax" })
}

/** Verified old claims can recover only an already accepted deletion receipt, never create new work. */
async function acceptedDeletion(id?: string): Promise<RequestRow | null> {
  const db = await createClient(),
    claims = await db.auth.getClaims()
  const owner = claims.data?.claims.sub
  if (claims.error || typeof owner !== "string" || !uuid.test(owner))
    return null
  let query = createAdminClient()
    .from("account_data_requests")
    .select("*")
    .eq("owner_id", owner)
    .eq("kind", "deletion")
    .order("created_at", { ascending: false })
    .limit(1)
  if (id) query = query.eq("id", id)
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error("request_unavailable")
  return data
}

export async function accountDataGet(
  request: Request,
  kind: AccountDataKind
): Promise<Response> {
  try {
    const id = new URL(request.url).searchParams.get("requestId") ?? undefined
    if (id && !uuid.test(id)) throw new Error("invalid_request")
    const user = await getCurrentUser()
    let row: RequestRow | null = null
    if (user) {
      let query = createAdminClient()
        .from("account_data_requests")
        .select("*")
        .eq("owner_id", user.id)
        .eq("kind", kind)
        .order("created_at", { ascending: false })
        .limit(1)
      if (id) query = query.eq("id", id)
      const result = await query.maybeSingle()
      if (result.error) throw new Error("request_unavailable")
      row = result.data
    } else if (kind === "deletion") row = await acceptedDeletion(id)
    if (!user && !row)
      return Response.json(
        { error: "Sign in to view your data requests." },
        { status: 401, headers }
      )
    if (id && !row)
      return Response.json(
        { error: "Data request not found." },
        { status: 404, headers }
      )
    const result: AccountDataResponse = {
      request: row ? await requestDto(row) : null,
    }
    if (kind === "deletion" && row) {
      await clearAuthCookies()
      result.signOut = true
    }
    return Response.json(result, { headers })
  } catch (error) {
    return accountDataFailure(error)
  }
}

export async function accountDataPost(
  request: Request,
  kind: AccountDataKind
): Promise<Response> {
  try {
    const body = await accountDataInput(request)
    if (
      typeof body.requestId !== "string" ||
      !uuid.test(body.requestId) ||
      (kind === "deletion" && body.confirmation !== "DELETE")
    )
      throw new Error("invalid_request")
    const user = await getCurrentUser()
    if (!user) {
      const previous =
        kind === "deletion" ? await acceptedDeletion(body.requestId) : null
      if (previous) {
        await clearAuthCookies()
        return Response.json(
          { request: await requestDto(previous), signOut: true },
          { headers }
        )
      }
      return Response.json(
        { error: "Sign in to request account data changes." },
        { status: 401, headers }
      )
    }
    const result = await createAdminClient().rpc("request_account_data", {
      p_owner_id: user.id,
      p_request_id: body.requestId,
      p_kind: kind,
    })
    if (result.error) throw new Error(result.error.message)
    const row = result.data as unknown as RequestRow
    if (kind === "deletion") {
      // The committed fence already revokes access; the worker retries a transient Auth failure.
      await createAdminClient()
        .auth.admin.deleteUser(user.id)
        .catch(() => null)
      await clearAuthCookies()
    }
    return Response.json(
      {
        request: await requestDto(row),
        ...(kind === "deletion" ? { signOut: true } : {}),
      },
      { status: 202, headers }
    )
  } catch (error) {
    return accountDataFailure(error)
  }
}

export async function requestMaterialDeletion(
  request: Request,
  id: string
): Promise<Response> {
  try {
    const user = await getCurrentUser()
    if (!user)
      return Response.json(
        { error: "Sign in to delete a material." },
        { status: 401, headers }
      )
    if (!uuid.test(id)) throw new Error("material_not_found")
    const body = await accountDataInput(request, true)
    const requestId = body.requestId ?? id
    if (typeof requestId !== "string" || !uuid.test(requestId))
      throw new Error("invalid_request")
    const result = await createAdminClient().rpc("request_account_data", {
      p_owner_id: user.id,
      p_request_id: requestId,
      p_kind: "material_deletion",
      p_target_id: id,
    })
    if (result.error) throw new Error(result.error.message)
    const row = result.data as unknown as RequestRow
    return Response.json(
      {
        deleted: true,
        materialId: id,
        cleanup: { id: row.id, status: row.status },
      },
      { status: 202, headers }
    )
  } catch (error) {
    return accountDataFailure(error)
  }
}

function accountDataFailure(error: unknown): Response {
  const code = error instanceof Error ? error.message : "request_unavailable"
  const known = Object.keys(messages).find((key) => code.includes(key))
  const status =
    code.includes("invalid_request") || error instanceof SyntaxError
      ? 400
      : code.includes("material_not_found")
        ? 404
        : code.includes("request_conflict") ||
            code.includes("export_in_progress") ||
            code.includes("account_deleting")
          ? 409
          : 503
  return Response.json(
    {
      error: known
        ? messages[known]
        : status === 400
          ? "Check the confirmation and request, then try again."
          : status === 404
            ? "Material not found."
            : "This data request could not be completed. Keep the request and try again.",
    },
    { status, headers }
  )
}
