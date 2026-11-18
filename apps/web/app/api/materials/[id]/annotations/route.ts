import { getCurrentUser } from "@/lib/auth/session"
import {
  AnnotationError,
  annotationCreation,
  annotationFailure,
  annotationHeaders,
  annotationInput,
  annotationUuid,
  createMaterialAnnotation,
  listMaterialAnnotations,
} from "@/lib/material-annotations"

export const runtime = "nodejs"
type Context = { params: Promise<{ id: string }> }

export async function GET(
  _request: Request,
  { params }: Context
): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to view highlights." },
      { status: 401 }
    )
  try {
    const { id } = await params
    if (!annotationUuid.test(id))
      throw new AnnotationError(404, "not_found", "Material not found.")
    return Response.json(await listMaterialAnnotations(user.id, id), {
      headers: annotationHeaders,
    })
  } catch (error) {
    return annotationFailure(error)
  }
}

export async function POST(
  request: Request,
  { params }: Context
): Promise<Response> {
  const user = await getCurrentUser()
  if (!user)
    return Response.json(
      { error: "Sign in to save highlights." },
      { status: 401 }
    )
  try {
    const { id } = await params
    if (!annotationUuid.test(id))
      throw new AnnotationError(404, "not_found", "Material not found.")
    const input = annotationCreation(await annotationInput(request))
    return Response.json(await createMaterialAnnotation(user.id, id, input), {
      headers: annotationHeaders,
    })
  } catch (error) {
    return annotationFailure(error)
  }
}
