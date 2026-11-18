import { createHash } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import { mkdir, stat, statfs, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3"
import type { WorkerClients } from "./jobs.js"
import { cleanupOwnedArtifacts, type CleanupManifest } from "./data-cleanup.js"
import { ProbeError, runCommand } from "./process.js"
import { subprocessEnvironment, withScratch } from "./scratch.js"

interface ExportAsset {
  id: string
  object_key: string
  bytes: number
  mime: string
  uploaded_at: string | null
  role: string
}
interface AccountJob {
  id: string
  owner_id: string
  kind: "export" | "deletion" | "material_deletion"
  status: string
  lease_token: string
  object_key: string | null
  expires_at: string | null
  purge?: boolean
  payload: CleanupManifest & {
    snapshot?: { tables: Record<string, unknown[]> }
  }
}
export type AccountDataFunctions = {
  claim_account_data_job: {
    Args: Record<string, never>
    Returns: AccountJob | null
  }
  checkpoint_account_data_job: {
    Args: {
      p_id: string
      p_lease_token: string
      p_stage: string
      p_bytes?: number
      p_error?: string
    }
    Returns: boolean
  }
}

function missing(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "$metadata" in error &&
    (error.$metadata as { httpStatusCode?: number }).httpStatusCode === 404
  )
}
async function checkpoint(
  worker: WorkerClients,
  job: AccountJob,
  stage: string,
  bytes?: number
): Promise<void> {
  const result = await worker.supabase.rpc("checkpoint_account_data_job", {
    p_id: job.id,
    p_lease_token: job.lease_token,
    p_stage: stage,
    ...(bytes === undefined ? {} : { p_bytes: bytes }),
  })
  if (result.error || !result.data)
    throw new ProbeError("account_job_lease_lost")
}

async function exportAccount(
  worker: WorkerClients,
  job: AccountJob
): Promise<void> {
  if (job.object_key !== `${job.owner_id}/exports/${job.id}.tar.gz`)
    throw new ProbeError("export_owner_boundary")
  try {
    const existing = await worker.storage.send(
      new HeadObjectCommand({ Bucket: worker.bucket, Key: job.object_key }),
      { abortSignal: AbortSignal.timeout(30_000) }
    )
    if (
      existing.Metadata?.request_id !== job.id ||
      existing.Metadata.archive_bytes !== String(existing.ContentLength)
    )
      throw new ProbeError("export_artifact_conflict")
    await checkpoint(worker, job, "ready", existing.ContentLength)
    return
  } catch (error) {
    if (!missing(error)) throw error
  }
  const snapshot = job.payload.snapshot
  if (!snapshot) throw new ProbeError("export_snapshot_missing")
  const assets = (snapshot.tables.assets ?? []) as ExportAsset[]
  const files = assets.filter((asset) => asset.uploaded_at)
  const bytes = files.reduce((sum, asset) => sum + asset.bytes, 0)
  if (
    bytes > 2_500_000_000 ||
    files.length > 10000 ||
    files.some(
      (asset) =>
        !asset.object_key.startsWith(`${job.owner_id}/`) ||
        !/^[a-f0-9-]{36}$/i.test(asset.id)
    )
  )
    throw new ProbeError("export_size_boundary")
  await withScratch(async (directory) => {
    const space = await statfs(directory)
    if (space.bavail * space.bsize < bytes * 2 + 200_000_000)
      throw new ProbeError("export_disk_space")
    const content = join(directory, "content"),
      fileDirectory = join(content, "files")
    await mkdir(fileDirectory, { recursive: true })
    const manifest: Record<string, unknown>[] = []
    for (const asset of files) {
      await checkpoint(worker, job, "renew")
      const extension = asset.object_key.split(".").at(-1)!
      const name = `${asset.id}.${/^[a-z0-9]{1,8}$/i.test(extension) ? extension : "bin"}`
      const source = await worker.storage.send(
        new GetObjectCommand({ Bucket: worker.bucket, Key: asset.object_key }),
        { abortSignal: AbortSignal.timeout(180_000) }
      )
      if (
        !(source.Body instanceof Readable) ||
        source.ContentLength !== asset.bytes
      ) {
        ;(source.Body as Readable | undefined)?.destroy()
        throw new ProbeError("export_file_unavailable")
      }
      let readBytes = 0
      const hash = createHash("sha256")
      await pipeline(
        source.Body,
        new Transform({
          transform(chunk: Buffer, _encoding, done) {
            readBytes += chunk.length
            if (readBytes > asset.bytes) {
              done(new ProbeError("export_file_size_changed"))
              return
            }
            hash.update(chunk)
            done(null, chunk)
          },
        }),
        createWriteStream(join(fileDirectory, name), { flags: "wx" })
      )
      if (readBytes !== asset.bytes)
        throw new ProbeError("export_file_size_changed")
      manifest.push({
        assetId: asset.id,
        path: `files/${name}`,
        role: asset.role,
        mime: asset.mime,
        bytes: asset.bytes,
        sha256: hash.digest("hex"),
      })
    }
    await writeFile(join(content, "data.json"), JSON.stringify(snapshot), {
      flag: "wx",
    })
    await writeFile(
      join(content, "files.json"),
      JSON.stringify({
        files: manifest,
        notUploaded: assets
          .filter((asset) => !asset.uploaded_at)
          .map((asset) => asset.id),
      }),
      { flag: "wx" }
    )
    await writeFile(
      join(content, "README.txt"),
      "Abstruck account export\nData is in data.json. Available originals and derived files are in files/, mapped by files.json. Pending uploads have no stored file. This private archive expires after 24 hours.\n",
      { flag: "wx" }
    )
    await checkpoint(worker, job, "renew")
    await runCommand("tar", ["-czf", "export.tar.gz", "-C", "content", "."], {
      cwd: directory,
      env: subprocessEnvironment(directory),
      timeoutMs: 600_000,
      outputLimitBytes: 65536,
    })
    const archive = join(directory, "export.tar.gz"),
      info = await stat(archive)
    if (info.size > 2_600_000_000) throw new ProbeError("export_size_boundary")
    await checkpoint(worker, job, "renew")
    await worker.storage.send(
      new PutObjectCommand({
        Bucket: worker.bucket,
        Key: job.object_key!,
        Body: createReadStream(archive),
        ContentLength: info.size,
        ContentType: "application/gzip",
        ContentDisposition:
          'attachment; filename="abstruck-account-export.tar.gz"',
        CacheControl: "private, no-store",
        IfNoneMatch: "*",
        Metadata: { request_id: job.id, archive_bytes: String(info.size) },
      }),
      { abortSignal: AbortSignal.timeout(300_000) }
    )
    await checkpoint(worker, job, "ready", info.size)
  })
}

export async function processAccountDataJob(
  worker: WorkerClients
): Promise<boolean> {
  const claimed = await worker.supabase.rpc("claim_account_data_job", {})
  if (claimed.error) throw new ProbeError("account_queue_unavailable")
  const job = claimed.data
  if (!job) return false
  try {
    if (job.kind === "export" && (job.status === "ready" || job.purge)) {
      if (job.object_key)
        await worker.storage.send(
          new DeleteObjectCommand({
            Bucket: worker.bucket,
            Key: job.object_key,
          }),
          { abortSignal: AbortSignal.timeout(30_000) }
        )
      await checkpoint(worker, job, "expired")
    } else if (job.kind === "export") await exportAccount(worker, job)
    else {
      if (job.kind === "deletion") {
        const removed = await worker.supabase.auth.admin.deleteUser(
          job.owner_id
        )
        if (
          removed.error &&
          removed.error.status !== 404 &&
          removed.error.code !== "user_not_found"
        )
          throw new ProbeError("account_auth_cleanup_pending")
      }
      await cleanupOwnedArtifacts(
        worker.storage,
        worker.bucket,
        job.owner_id,
        job.payload
      )
      if (Date.parse(job.payload.drainUntil) > Date.now())
        await checkpoint(worker, job, "wait")
      else await checkpoint(worker, job, "ready")
    }
    console.log(
      JSON.stringify({
        event: "account_data_checkpoint",
        requestId: job.id,
        kind: job.kind,
      })
    )
  } catch (error) {
    const code =
      error instanceof ProbeError ? error.code : "account_cleanup_retry_pending"
    await worker.supabase.rpc("checkpoint_account_data_job", {
      p_id: job.id,
      p_lease_token: job.lease_token,
      p_stage: "retry",
      p_error: code,
    })
    console.log(
      JSON.stringify({
        event: "account_data_retry",
        requestId: job.id,
        reason: code,
      })
    )
  }
  return true
}
