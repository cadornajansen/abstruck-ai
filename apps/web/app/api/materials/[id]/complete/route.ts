import { getCurrentUser } from "@/lib/auth/session"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  finishFileUpload,
  ownedUploadAsset,
} from "@/lib/material-upload-session"

export const runtime = "nodejs"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user)
    return Response.json({ error: "Sign in to continue." }, { status: 401 })
  const { id } = await params
  const db = createAdminClient()
  const asset = await ownedUploadAsset(id, user.id)
  if (!asset)
    return Response.json({ error: "Material not found." }, { status: 404 })
  try {
    await finishFileUpload(asset)
    const { data, error } = await db.rpc("queue_material", {
      p_owner_id: user.id,
      p_material_id: id,
      p_retry: true,
    })
    if (error) throw error
    return Response.json({ materialId: id, status: data.status })
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string" &&
      error.message.includes("concurrent_job_limit")
    )
      return Response.json(
        { error: "Wait for your current study job to finish, then try again." },
        { status: 429 }
      )
    return Response.json(
      {
        error:
          "The upload could not be confirmed. Choose the same file to resume, or try again.",
      },
      { status: 409 }
    )
  }
}
