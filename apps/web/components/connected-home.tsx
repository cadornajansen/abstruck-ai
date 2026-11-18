"use client"

import type { ComponentProps } from "react"
import { useRouter } from "next/navigation"
import { StudyHome } from "@/components/workspace/study-home"
import {
  SpaceHome,
  type SpaceHomeProps,
} from "@/components/workspace/space-home"
import type { MaterialDraft } from "@/components/workspace/material-dialog"
import type { UploadOptions } from "@/lib/file-upload"
import { organisationRequest } from "@/components/workspace/organisation-request"
import {
  importPastedText,
  importYouTube,
  uploadMaterial,
} from "@/lib/upload-material"

function useMaterialUpload(
  spaceId: string | null,
  folderId: string | null = null
) {
  const router = useRouter()
  return async (
    draft: MaterialDraft,
    options?: UploadOptions
  ): Promise<{ error?: string }> => {
    try {
      const { materialId } =
        draft.kind === "link"
          ? await importYouTube(draft.url, spaceId, folderId)
          : draft.kind === "paste"
            ? await importPastedText(draft.text, spaceId, folderId)
            : await uploadMaterial(draft.file, spaceId, folderId, options)
      router.push(`/materials/${materialId}`)
      router.refresh()
      return {}
    } catch (error) {
      return {
        error: options?.signal?.aborted
          ? "Upload paused. Add the same file to resume its saved parts."
          : error instanceof Error
            ? error.message
            : "Upload was interrupted. Please try again.",
      }
    }
  }
}

function useStartChat() {
  const router = useRouter()
  return async (
    question: string,
    requestId: string
  ): Promise<{ error?: string }> => {
    try {
      const response = await fetch("/api/materials/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, requestId }),
      })
      const result = (await response.json()) as {
        materialId?: string
        error?: string
      }
      if (!response.ok || !result.materialId)
        return {
          error:
            result.error ?? "Your chat could not be opened. Please try again.",
        }
      router.push(`/materials/${result.materialId}`)
      router.refresh()
      return {}
    } catch {
      return {
        error: "Connection interrupted. Try again to reopen your saved chat.",
      }
    }
  }
}

export function ConnectedHome(props: ComponentProps<typeof StudyHome>) {
  const onSubmit = useMaterialUpload(null)
  const onStartChat = useStartChat()
  return (
    <StudyHome
      {...props}
      onSubmitMaterial={onSubmit}
      onStartChat={onStartChat}
    />
  )
}

export function ConnectedSpaceHome(props: SpaceHomeProps) {
  const router = useRouter()
  const onSubmit = useMaterialUpload(
    props.space.id,
    props.activeFolder?.id ?? null
  )
  const onStartChat = useStartChat()
  async function deleteMaterial(id: string): Promise<void> {
    await organisationRequest<unknown>(`/api/materials/${id}`, {
      method: "DELETE",
    })
    router.refresh()
  }
  return (
    <SpaceHome
      {...props}
      onSubmitMaterial={onSubmit}
      onStartChat={onStartChat}
      onDeleteMaterial={deleteMaterial}
    />
  )
}
