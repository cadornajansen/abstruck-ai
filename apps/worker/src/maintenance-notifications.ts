import type { WorkerClients } from "./jobs.js"

interface MaintenanceResult {
  reminders: number
  digests: number
}

export type MaintenanceNotificationFunctions = {
  schedule_maintenance_notifications: {
    Args: { p_founder_id?: string; p_limit?: number }
    Returns: MaintenanceResult
  }
}

/** Production admission is explicit; reading the queue never creates notifications. */
export async function scheduleMaintenanceNotifications(
  worker: WorkerClients
): Promise<void> {
  if (process.env.MAINTENANCE_NOTIFICATIONS_ENABLED !== "true") return

  const configuredIds = (process.env.ABSTRUCK_ADMIN_USER_IDS ?? "")
    .split(/[\s,]+/)
    .filter(Boolean)
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
  const founderId =
    configuredIds.length > 0 && configuredIds.every((id) => uuid.test(id))
      ? configuredIds.map((id) => id.toLowerCase()).sort()[0]
      : undefined
  const result = await worker.supabase.rpc(
    "schedule_maintenance_notifications",
    {
      p_limit: 100,
      ...(founderId ? { p_founder_id: founderId } : {}),
    }
  )
  if (result.error) {
    console.error(JSON.stringify({ event: "maintenance_notifications_failed" }))
    return
  }
  if (result.data.reminders || result.data.digests)
    console.log(
      JSON.stringify({
        event: "maintenance_notifications_queued",
        ...result.data,
      })
    )
}
