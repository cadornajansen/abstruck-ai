export type AccountDataKind = "export" | "deletion"
export type AccountDataStatus = "queued" | "running" | "ready" | "failed"

export interface AccountDataRequest {
  id: string
  kind: AccountDataKind
  status: AccountDataStatus
  createdAt: string
  completedAt: string | null
  error: string | null
  includesOriginalFiles: boolean
  downloadUrl?: string
  expiresAt?: string
}

export interface AccountDataResponse {
  request: AccountDataRequest | null
  signOut?: boolean
}
