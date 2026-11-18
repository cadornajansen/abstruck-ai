import { z } from "zod"

export const checkoutReferenceSchema = z
  .string()
  .trim()
  .regex(
    /^cs_[A-Za-z0-9]{3,100}$/,
    "Enter a PayMongo checkout ID starting with cs_."
  )

export interface OperationsJob {
  id: string
  ownerId: string
  kind: string
  state: string
  attempt: number
  targetKind: "material" | "study-set" | "attempt"
  targetId: string
  createdAt: string
  updatedAt: string
  leaseUntil: string | null
  errorCode: string | null
  retryAllowed: boolean
  retryReason: string | null
}

export interface OperationsPayment {
  id: string
  ownerId: string
  state: string
  amount: number
  currency: string
  testMode: boolean
  createdAt: string
  updatedAt: string
  errorCode: string | null
  reconcileAllowed: boolean
}

export interface OperationsAudit {
  id: string
  actorId: string | null
  targetType: string
  targetId: string
  action: string
  status: string
  errorCode: string | null
  createdAt: string
}

export interface OperationsOverview {
  generatedAt: string
  jobs: OperationsJob[]
  jobCounts: {
    queued: number
    running: number
    waiting: number
    failed: number
  }
  payments: OperationsPayment[]
  costs: {
    windowHours: 24
    actualUsd: number
    reservedUsd: number
    inputTokens: number
    outputTokens: number
    byFeature: { feature: string; actualUsd: number; requests: number }[]
  }
  services: {
    name: string
    state: "available" | "configured" | "not_configured" | "unknown"
    detail: string
  }[]
  audit: OperationsAudit[]
}

export interface SupportInput {
  requestId: string
  subject: string
  message: string
  reference?: { kind: "job" | "order"; id: string }
}

export interface SupportReceipt {
  id: string
  status: "queued" | "sending" | "sent" | "failed" | "uncertain"
  createdAt: string
  sentAt: string | null
  error: string | null
}

export interface SupportResponse {
  request: SupportReceipt | null
}
