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
  hasBillingAccount: boolean
  subscription: {
    status: string
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
  } | null
  periodId: string
  startsAt: string
  endsAt: string
  limits: BillingLimits
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
  limits: BillingLimits
  used: BillingUsage
  remaining: BillingUsage
  checkoutAvailable: boolean
  hasBillingAccount: boolean
  subscription: BillingContext["subscription"]
}
