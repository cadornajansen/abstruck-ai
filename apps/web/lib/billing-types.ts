export interface BillingLimits {
  storageBytes: number
  documentPages: number
  transcriptionSeconds: number
  ocrPages: number
  chatMessages: number
  studySets: number
  concurrentJobs: number
}

export interface BillingContext {
  ownerId: string
  planId: string
  plan: "free" | "paid"
  planVersion: number
  grantId: string | null
  periodId: string
  startsAt: string
  endsAt: string
  limits: BillingLimits
}

export interface BillingGrant {
  id: string
  orderId: string
  startsAt: string
  endsAt: string
  state: "active" | "revoked"
}

export type BillingUsage = Omit<BillingLimits, "concurrentJobs">

export interface AccountUsage {
  plan: "free" | "paid"
  planVersion: number
  period: {
    id: string
    startsAt: string
    endsAt: string
    grantId: string | null
  }
  activeUntil: string | null
  nextPaidStartsAt: string | null
  paidThrough: string | null
  limits: BillingLimits
  used: BillingUsage
  remaining: BillingUsage
  grants: BillingGrant[]
  testMode: true
  allowancesProvisional: true
}

export interface BillingOrder {
  id: string
  state:
    | "creating"
    | "pending"
    | "paid"
    | "refunded"
    | "partially_refunded"
    | "failed"
    | "expired"
    | "review"
  amount: 19900
  currency: "PHP"
  checkoutUrl: string | null
  createdAt: string
  paidAt: string | null
  refundedAt: string | null
  errorCode: string | null
}
