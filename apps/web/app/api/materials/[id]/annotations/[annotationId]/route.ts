import { getCurrentUser } from "@/lib/auth/session"
import {
  AnnotationError,
  annotationDeletion,
  annotationEdit,
  annotationFailure,
  annotationHeaders,
  annotationInput,
  annotationUuid,
  deleteMaterialAnnotation,
  editMaterialAnnotation,
} from "@/lib/material-annotations"

export const runtime = "nodejs"
type Context = { params: Promise<{ id: string; annotationId: string }> }

export async function PATCH(
  request: Request,
  { params }: Context
): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to edit highlights." },
      { status: 401 }
    )
  try {
    const { id, annotationId } = await params
    if (!annotationUuid.test(id) || !annotationUuid.test(annotationId))
      throw new AnnotationError(404, "not_found", "Highlight not found.")
    const input = annotationEdit(await annotationInput(request))
    return Response.json(
      await editMaterialAnnotation(user.id, id, annotationId, input),
      { headers: annotationHeaders }
    )
  } catch (error) {
    return annotationFailure(error)
  }
}

export async function DELETE(
  request: Request,
  { params }: Context
): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to remove highlights." },
      { status: 401 }
    )
  try {
    const { id, annotationId } = await params
    if (!annotationUuid.test(id) || !annotationUuid.test(annotationId))
      throw new AnnotationError(404, "not_found", "Highlight not found.")
    const input = annotationDeletion(await annotationInput(request))
    return Response.json(
      await deleteMaterialAnnotation(user.id, id, annotationId, input),
      { headers: annotationHeaders }
    )
  } catch (error) {
    return annotationFailure(error)
  }
}
