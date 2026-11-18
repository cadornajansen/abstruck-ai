export const UPLOAD_PART_BYTES = 8 * 1024 * 1024
export const DOCUMENT_UPLOAD_BYTES = 50_000_000
export const MEDIA_UPLOAD_BYTES = 250_000_000

export function fileUploadLimit(fileName: string): number {
  return /\.(pdf|docx|pptx)$/i.test(fileName)
    ? DOCUMENT_UPLOAD_BYTES
    : MEDIA_UPLOAD_BYTES
}

export interface UploadProgress {
  phase: "checking" | "uploading" | "confirming"
  uploadedBytes: number
  totalBytes: number
}

export interface UploadOptions {
  signal?: AbortSignal
  onProgress?: (progress: UploadProgress) => void
  transcriptionLanguage?: "auto" | "en" | "tl"
}

export interface UploadPart {
  partNumber: number
  bytes: number
  url: string
}

export type FileUploadAuthorization =
  | { kind: "single"; url: string; headers: Record<string, string> }
  | {
      kind: "multipart"
      partBytes: number
      completedBytes: number
      parts: UploadPart[]
    }
