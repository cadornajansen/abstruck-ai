import { spawn } from "node:child_process"
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import {
  appendFile,
  mkdir,
  open,
  readFile,
  realpath,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { Readable, Transform, Writable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { fileURLToPath } from "node:url"
import { parseArgs, parseEnv } from "node:util"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const project = "qgdbftgqiinydeeiwadg"
const directory = join(root, ".local", "database-backups")
const prefix = `database-backups/${project}/`
const magic = Buffer.from("ABSTRUCKDB1\n")
const maximumBytes = 2 * 1024 ** 3
const require = createRequire(join(root, "apps/web/package.json"))
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3")
const { positionals, values } = parseArgs({
  options: {
    file: { type: "string" },
    key: { type: "string" },
    ca: { type: "string" },
    "pg-bin": { type: "string" },
    "confirm-project": { type: "string" },
    apply: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  allowPositionals: true,
})
const command = positionals[0]
const envFile = join(root, "apps/web/.env.local")
const configuration = {
  ...parseEnv(await readFile(envFile, "utf8")),
  ...process.env,
}
const pgBin =
  values["pg-bin"] ??
  configuration.PG_BIN ??
  (process.platform === "win32" ? "C:/Program Files/PostgreSQL/18/bin" : "")

/** @param {string} code @returns {never} */
function fail(code) {
  throw new Error(code)
}
/** @param {Record<string, unknown>} value */
function report(value) {
  console.log(JSON.stringify(value))
}
/** @param {string} name */
function binary(name) {
  return pgBin
    ? join(pgBin, `${name}${process.platform === "win32" ? ".exe" : ""}`)
    : name
}
/** @param {string} value */
function identifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) fail("unsafe_identifier")
  return `"${value}"`
}

/** Credentials are child-process environment only, never command arguments or logs. */
async function sourceEnvironment() {
  let url
  try {
    url = new URL(configuration.SUPABASE_DB_URL)
  } catch {
    fail("database_url_missing_or_invalid")
  }
  if (
    !/^postgres(?:ql)?:$/.test(url.protocol) ||
    url.hash ||
    url.search ||
    decodeURIComponent(url.pathname) !== "/postgres" ||
    (url.port && url.port !== "5432")
  )
    fail("source_connection_boundary")
  const direct =
    url.hostname === `db.${project}.supabase.co` && url.username === "postgres"
  const pooler =
    /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) &&
    url.username === `postgres.${project}`
  if (!direct && !pooler) fail("source_project_mismatch")
  const password = decodeURIComponent(url.password)
  if (
    !password ||
    /your[-_ ]?password|replace[-_ ]?me|^\[.*\]$/i.test(password)
  )
    fail("database_password_placeholder")
  const ca =
    values.ca ??
    configuration.SUPABASE_DB_CA_FILE ??
    join(root, "config/supabase-ca.crt")
  if (!ca || !(await stat(ca)).isFile()) fail("verified_ca_required")
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: "5432",
    PGDATABASE: "postgres",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: password,
    PGSSLMODE: "verify-full",
    PGSSLROOTCERT: resolve(ca),
    PGGSSENCMODE: "disable",
    PGCONNECT_TIMEOUT: "15",
    PGAPPNAME: "abstruck_database_backup",
    PGOPTIONS:
      "-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=15000",
  }
}

/** @returns {Buffer} */
function encryptionKey() {
  const value = configuration.DATABASE_BACKUP_KEY ?? ""
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value))
    fail("backup_key_required_32_bytes_base64")
  const key = Buffer.from(value, "base64")
  if (key.length !== 32) fail("backup_key_required_32_bytes_base64")
  return key
}

/** @param {string} value */
function databaseFailure(value) {
  if (/password authentication failed/.test(value))
    return "database_authentication_failed"
  if (/certificate|SSL error|SSL is not enabled/.test(value))
    return "database_tls_failed"
  const extension = value.match(
    /(?:must be owner of extension|permission denied to create extension)\s+"?(plpgsql|vector|supabase_vault|pgmq|pgcrypto|uuid-ossp|pg_stat_statements)"?/
  )
  if (extension)
    return `restore_extension_permission_${extension[1].replaceAll("-", "_")}`
  if (/permission denied to set parameter "log_min_messages"/.test(value))
    return "restore_managed_realtime_parameter_denied"
  if (/permission denied|must be owner|must be superuser/.test(value))
    return "database_permission_denied"
  if (
    /extension.*not available|could not open extension control file/.test(value)
  )
    return "restore_extension_unavailable"
  if (/database .*does not exist/.test(value))
    return "restore_database_unreachable"
  if (/unrecognized configuration parameter/.test(value))
    return "restore_version_incompatible"
  if (/role .* does not exist/.test(value)) return "restore_role_unavailable"
  if (/already exists/.test(value)) return "restore_object_already_exists"
  if (/could not execute query/.test(value)) return "restore_statement_failed"
  return "native_database_command_failed"
}

/** @param {string} name @param {string[]} args @param {NodeJS.ProcessEnv} environment */
function start(name, args, environment) {
  const child = spawn(binary(name), args, {
    env: environment,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  })
  let errors = ""
  child.stderr.on("data", (chunk) => {
    errors = (errors + chunk.toString()).slice(-32000)
  })
  const timeout = setTimeout(() => child.kill(), 600000)
  const done = new Promise((accept, reject) => {
    child.once("error", () => {
      clearTimeout(timeout)
      reject(new Error("native_postgres_tool_unavailable"))
    })
    child.once("close", (code) => {
      clearTimeout(timeout)
      if (code === 0) accept(undefined)
      else {
        const error = new Error(databaseFailure(errors))
        const hint = errors.match(
          /(?:permission denied (?:to create|for) (?:event trigger|schema|table|sequence|function)|must be (?:owner of|member of role))\s+"?([a-z_][a-z0-9_]*)"?/
        )
        if (hint) error.safeResource = hint[1]
        reject(error)
      }
    })
  })
  // Callers may still be piping when a child fails; avoid an unhandled rejection.
  void done.catch(() => {})
  return { child, done }
}

/** @param {NodeJS.ProcessEnv} environment @param {string} sql */
async function query(environment, sql) {
  const { child, done } = start(
    "psql",
    ["-X", "-q", "-A", "-t", "-w", "-v", "ON_ERROR_STOP=1"],
    environment
  )
  const chunks = []
  let bytes = 0
  child.stdout.on("data", (chunk) => {
    bytes += chunk.length
    if (bytes > 8 * 1024 ** 2) child.kill()
    else chunks.push(chunk)
  })
  child.stdin.end(sql + "\n")
  await done
  if (bytes > 8 * 1024 ** 2) fail("database_result_boundary")
  return Buffer.concat(chunks).toString("utf8").trim()
}

/** @param {{schema:string,name:string}[]} tables */
function fingerprintsSql(tables) {
  return `select json_object_agg(relation,proof) from (${tables.map(({ schema, name }) => `select '${schema}.${name}' relation,json_build_object('rows',count(*),'digest',coalesce(sum(('x'||substr(md5(to_jsonb(t)::text),1,15))::bit(60)::bigint),0)::text) proof from ${identifier(schema)}.${identifier(name)} t`).join(" union all ")}) proofs;`
}

/** Keeps the exported snapshot alive until pg_dump finishes. @param {NodeJS.ProcessEnv} environment */
async function snapshot(environment) {
  const tables = JSON.parse(
    await query(
      environment,
      "select coalesce(json_agg(json_build_object('schema',n.nspname,'name',c.relname) order by n.nspname,c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in('r','p') and not c.relispartition and (n.nspname='public' or (n.nspname='auth' and c.relname='users'))"
    )
  )
  if (!tables.length || tables.length > 200) fail("backup_schema_boundary")
  const { child, done } = start(
    "psql",
    ["-X", "-q", "-A", "-t", "-w", "-v", "ON_ERROR_STOP=1"],
    environment
  )
  let pending = ""
  const header = await new Promise((accept, reject) => {
    child.stdout.on("data", (chunk) => {
      pending += chunk.toString()
      if (pending.length > 4 * 1024 ** 2) {
        child.kill()
        reject(new Error("snapshot_result_boundary"))
        return
      }
      const line = pending.indexOf("\n")
      if (line >= 0) {
        try {
          accept(JSON.parse(pending.slice(0, line)))
        } catch {
          reject(new Error("snapshot_result_invalid"))
        }
      }
    })
    void done.then(() => reject(new Error("snapshot_closed_early")), reject)
    child.stdin.write(
      `begin isolation level repeatable read read only;\nselect json_build_object('snapshot',pg_export_snapshot(),'serverVersion',current_setting('server_version'),'capturedAt',clock_timestamp(),'extensions',(select json_agg(json_build_object('name',extname,'version',extversion)) from pg_extension),'proofs',(${fingerprintsSql(
        tables
      )
        .replace(/^select /, "select ")
        .replace(/;$/, "")}));\n`
    )
  })
  if (!/^[0-9A-Fa-f-]+$/.test(header.snapshot)) {
    child.kill()
    fail("snapshot_identity_invalid")
  }
  return {
    header,
    tables,
    close: async () => {
      child.stdin.end("rollback;\n\\q\n")
      await done
    },
  }
}

/** @param {string} file */
async function sha256(file) {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest("hex")
}

/** @param {string} file @param {NodeJS.ProcessEnv} environment */
async function dump(file, environment) {
  const point = await snapshot(environment),
    key = encryptionKey(),
    iv = randomBytes(12)
  const metadata = {
    format: 1,
    project,
    capturedAt: point.header.capturedAt,
    serverVersion: point.header.serverVersion,
    extensions: point.header.extensions,
    tables: point.tables,
    proofs: point.header.proofs,
    keyId: createHash("sha256").update(key).digest("hex").slice(0, 16),
  }
  const header = Buffer.from(JSON.stringify(metadata)),
    size = Buffer.alloc(4)
  size.writeUInt32BE(header.length)
  const aad = Buffer.concat([magic, size, header, iv]),
    cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 })
  cipher.setAAD(aad)
  await writeFile(file, aad, { flag: "wx", mode: 0o600 })
  const { child, done } = start(
    "pg_dump",
    [
      "--format=custom",
      "--no-password",
      "--no-publications",
      "--no-subscriptions",
      "--lock-wait-timeout=15000",
      `--snapshot=${point.header.snapshot}`,
    ],
    environment
  )
  child.stdin.end()
  let bytes = 0
  try {
    await Promise.all([
      done,
      pipeline(
        child.stdout,
        new Transform({
          transform(chunk, _encoding, callback) {
            bytes += chunk.length
            callback(
              bytes > maximumBytes ? new Error("backup_size_boundary") : null,
              chunk
            )
          },
        }),
        cipher,
        createWriteStream(file, { flags: "a", mode: 0o600 })
      ),
    ])
    await appendFile(file, cipher.getAuthTag())
    return metadata
  } catch (error) {
    child.kill()
    await unlink(file).catch(() => {})
    throw error
  } finally {
    await point.close()
  }
}

/** Authentication is a complete first pass; no unverified SQL reaches pg_restore. @param {string} file @param {NodeJS.WritableStream} [destination] */
async function decrypt(file, destination) {
  const info = await stat(file)
  if (
    info.size < magic.length + 4 + 12 + 16 ||
    info.size > maximumBytes + 4 * 1024 ** 2
  )
    fail("encrypted_backup_size_invalid")
  const handle = await open(file, "r")
  let metadata, offset, decipher
  try {
    const prelude = Buffer.alloc(magic.length + 4)
    await handle.read(prelude, 0, prelude.length, 0)
    if (!prelude.subarray(0, magic.length).equals(magic))
      fail("encrypted_backup_format_invalid")
    const length = prelude.readUInt32BE(magic.length)
    if (length < 2 || length > 1024 ** 2)
      fail("encrypted_backup_header_invalid")
    offset = prelude.length + length + 12
    if (offset + 16 >= info.size) fail("encrypted_backup_truncated")
    const aad = Buffer.alloc(offset),
      tag = Buffer.alloc(16)
    await handle.read(aad, 0, offset, 0)
    await handle.read(tag, 0, 16, info.size - 16)
    metadata = JSON.parse(
      aad.subarray(prelude.length, offset - 12).toString("utf8")
    )
    if (metadata.project !== project || metadata.format !== 1)
      fail("encrypted_backup_project_mismatch")
    decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      aad.subarray(offset - 12),
      { authTagLength: 16 }
    )
    decipher.setAAD(aad)
    decipher.setAuthTag(tag)
  } finally {
    await handle.close()
  }
  await pipeline(
    createReadStream(file, { start: offset, end: info.size - 17 }),
    decipher,
    destination ??
      new Writable({
        write(_chunk, _encoding, callback) {
          callback()
        },
      })
  )
  return metadata
}

function storage() {
  for (const name of [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
  ])
    if (!configuration[name]) fail("backup_storage_configuration_missing")
  return new S3Client({
    region: "auto",
    endpoint: `https://${configuration.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: configuration.R2_ACCESS_KEY_ID,
      secretAccessKey: configuration.R2_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    maxAttempts: 2,
  })
}
/** @param {import('@aws-sdk/client-s3').S3Client} client @param {object} operation */
async function send(client, operation) {
  return client.send(operation, { abortSignal: AbortSignal.timeout(180000) })
}
/** @param {string} key */
function managedKey(key) {
  return new RegExp(
    `^${prefix}(daily|weekly)/\\d{4}-\\d{2}-\\d{2}/[0-9a-f-]{36}\\.dump\\.enc$`
  ).test(key)
}
/** @param {import('@aws-sdk/client-s3').S3Client} client @param {string} key @param {string} file */
async function download(client, key, file) {
  if (!managedKey(key)) fail("backup_key_boundary")
  const object = await send(
    client,
    new GetObjectCommand({ Bucket: configuration.R2_BUCKET, Key: key })
  )
  if (
    !(object.Body instanceof Readable) ||
    !object.ContentLength ||
    object.ContentLength > maximumBytes + 4 * 1024 ** 2
  ) {
    object.Body?.destroy()
    fail("backup_remote_size_invalid")
  }
  let bytes = 0
  try {
    await pipeline(
      object.Body,
      new Transform({
        transform(chunk, _encoding, callback) {
          bytes += chunk.length
          callback(
            bytes > object.ContentLength
              ? new Error("backup_remote_size_changed")
              : null,
            chunk
          )
        },
      }),
      createWriteStream(file, { flags: "wx", mode: 0o600 })
    )
    if (
      bytes !== object.ContentLength ||
      (await sha256(file)) !== object.Metadata?.sha256
    )
      fail("backup_remote_hash_mismatch")
    await decrypt(file)
  } catch (error) {
    await unlink(file).catch(() => {})
    throw error
  }
}

/** @param {import('@aws-sdk/client-s3').S3Client} client @param {string} file @param {string} key */
async function upload(client, file, key) {
  if (!managedKey(key)) fail("backup_key_boundary")
  const hash = await sha256(file),
    bytes = (await stat(file)).size,
    keyId = createHash("sha256")
      .update(encryptionKey())
      .digest("hex")
      .slice(0, 16)
  await send(
    client,
    new PutObjectCommand({
      Bucket: configuration.R2_BUCKET,
      Key: key,
      Body: createReadStream(file),
      ContentLength: bytes,
      ContentType: "application/octet-stream",
      IfNoneMatch: "*",
      Metadata: {
        project,
        format: "abstruck-aes256gcm-v1",
        sha256: hash,
        keyid: keyId,
      },
    })
  )
  const head = await send(
    client,
    new HeadObjectCommand({ Bucket: configuration.R2_BUCKET, Key: key })
  )
  if (head.ContentLength !== bytes || head.Metadata?.sha256 !== hash)
    fail("backup_upload_verification_failed")
  return { bytes, sha256: hash }
}

/** @param {import('@aws-sdk/client-s3').S3Client} client @param {boolean} apply */
async function prune(client, apply) {
  if (apply && values["confirm-project"] !== project)
    fail("retention_project_confirmation_required")
  const objects = []
  let token
  do {
    const page = await send(
      client,
      new ListObjectsV2Command({
        Bucket: configuration.R2_BUCKET,
        Prefix: prefix,
        ContinuationToken: token,
        MaxKeys: 1000,
      })
    )
    for (const object of page.Contents ?? [])
      if (object.Key && managedKey(object.Key)) objects.push(object)
    if (objects.length > 2000) fail("retention_inventory_boundary")
    token = page.IsTruncated ? page.NextContinuationToken : undefined
    if (page.IsTruncated && !token) fail("retention_inventory_incomplete")
  } while (token)
  const remove = []
  for (const [group, limit] of [
    ["daily", 7],
    ["weekly", 4],
  ]) {
    const rows = objects
      .filter((x) => x.Key.startsWith(prefix + group + "/"))
      .sort((a, b) => b.LastModified - a.LastModified)
    const periods = new Set()
    for (const row of rows) {
      const date = row.Key.slice(
        (prefix + group + "/").length,
        (prefix + group + "/").length + 10
      )
      if (periods.has(date) || periods.size >= limit) remove.push(row)
      else periods.add(date)
    }
  }
  let deleted = 0
  for (const row of remove) {
    const head = await send(
      client,
      new HeadObjectCommand({ Bucket: configuration.R2_BUCKET, Key: row.Key })
    )
    if (
      head.Metadata?.project !== project ||
      head.Metadata?.format !== "abstruck-aes256gcm-v1" ||
      head.Metadata?.keyid !==
        createHash("sha256")
          .update(encryptionKey())
          .digest("hex")
          .slice(0, 16) ||
      !head.ETag
    )
      fail("retention_object_fence_failed")
    if (apply) {
      await send(
        client,
        new DeleteObjectCommand({
          Bucket: configuration.R2_BUCKET,
          Key: row.Key,
          IfMatch: head.ETag,
        })
      )
      deleted++
    }
  }
  return {
    dailyRetained: Math.min(
      7,
      new Set(
        objects
          .filter((x) => x.Key.startsWith(prefix + "daily/"))
          .map((x) => x.Key.split("/")[3])
      ).size
    ),
    weeklyRetained: Math.min(
      4,
      new Set(
        objects
          .filter((x) => x.Key.startsWith(prefix + "weekly/"))
          .map((x) => x.Key.split("/")[3])
      ).size
    ),
    eligible: remove.length,
    deleted,
    dryRun: !apply,
  }
}

/** Current deletion receipts are read separately so a historical archive cannot resurrect a deleted owner/source. @param {NodeJS.ProcessEnv} source @param {NodeJS.ProcessEnv} target */
async function reapplyDeletions(source, target) {
  const rows = JSON.parse(
    await query(
      source,
      "select coalesce(json_agg(json_build_object('id',id,'owner_id',owner_id,'kind',kind,'target_id',target_id,'created_at',created_at)),'[]') from public.account_data_requests where kind in('deletion','material_deletion')"
    )
  )
  if (rows.length > 10000) fail("deletion_manifest_boundary")
  for (const row of rows)
    for (const key of [
      "id",
      "owner_id",
      ...(row.kind === "material_deletion" ? ["target_id"] : []),
    ])
      if (!/^[a-f0-9-]{36}$/.test(row[key])) fail("deletion_manifest_invalid")
  const encoded = Buffer.from(JSON.stringify(rows)).toString("base64")
  return JSON.parse(
    await query(
      target,
      `begin;
    create temporary table restore_deletions as select * from jsonb_to_recordset(convert_from(decode('${encoded}','base64'),'utf8')::jsonb) as x(id uuid,owner_id uuid,kind text,target_id uuid,created_at timestamptz);
    insert into public.account_data_requests(id,owner_id,kind,target_id,status,payload,created_at) select id,owner_id,kind,target_id,'ready','{}',created_at from restore_deletions on conflict do nothing;
    update public.share_links set revoked_at=coalesce(revoked_at,now());
    update public.processing_jobs set state='failed',error_code='isolated_restore',lease_token=null,lease_until=null where state in('queued','running','waiting_provider');
    update public.usage_ledger set status='uncertain' where status='reserved';
    update public.notification_deliveries set state='uncertain',lease_token=null,lease_until=null,error_code='isolated_restore' where state in('queued','sending');
    update public.account_data_requests set status='failed',error_code='isolated_restore',lease_token=null,lease_until=null where status in('queued','running');
    update public.study_sets s set source_unavailable=true where exists(select 1 from restore_deletions d where d.kind='material_deletion' and d.owner_id=s.owner_id and (s.material_id=d.target_id or exists(select 1 from public.study_set_versions v join public.study_set_sources ss on ss.version_id=v.id where v.study_set_id=s.id and ss.material_id=d.target_id)));
    delete from public.materials m using restore_deletions d where d.kind='material_deletion' and m.owner_id=d.owner_id and m.id=d.target_id;
    update public.payment_events e set details='{}' where exists(select 1 from restore_deletions d where d.kind='deletion' and d.owner_id=e.owner_id);
    delete from auth.users u using restore_deletions d where d.kind='deletion' and u.id=d.owner_id;
    delete from auth.sessions;
    do $$ declare q record;begin for q in select tablename from pg_tables where schemaname='pgmq' and tablename like 'q\_%' escape '\' loop execute format('truncate table pgmq.%I',q.tablename);end loop;end $$;
    select json_build_object('receipts',count(*),'deletedOwnersRemaining',(select count(*) from auth.users u join restore_deletions d on d.owner_id=u.id and d.kind='deletion'),'deletedSourcesRemaining',(select count(*) from public.materials m join restore_deletions d on d.target_id=m.id and d.kind='material_deletion'),'liveShares',(select count(*) from public.share_links where revoked_at is null),'activeJobs',(select count(*) from public.processing_jobs where state in('queued','running','waiting_provider'))) from restore_deletions;
    commit;`
    )
  )
}

/** Provider event triggers need a managed administrator, not a recovery scratch DB. @param {string} file */
async function restorePlan(file) {
  const { child, done } = start("pg_restore", ["--list"], process.env)
  let toc = ""
  child.stdout.on("data", (chunk) => {
    toc += chunk.toString()
    if (toc.length > 8 * 1024 ** 2) child.kill()
  })
  const results = await Promise.allSettled([done, decrypt(file, child.stdin)])
  if (results[0].status === "rejected") throw results[0].reason
  const providerTriggers = new Set([
    "ensure_rls",
    "issue_graphql_placeholder",
    "issue_pg_cron_access",
    "issue_pg_graphql_access",
    "issue_pg_net_access",
    "pgrst_ddl_watch",
    "pgrst_drop_watch",
  ])
  let skipped = 0
  let skippedRealtime = 0
  let skippedVaultData = 0
  const lines = toc.split("\n").filter((line) => {
    if (/ FUNCTION realtime list_changes(?:_sync)?\(/.test(line)) {
      skippedRealtime++
      return false
    }
    if (/ TABLE DATA vault secrets /.test(line)) {
      skippedVaultData++
      return false
    }
    const trigger = line.match(/ EVENT TRIGGER - ([a-z_]+) /)
    if (!trigger) return true
    if (!providerTriggers.has(trigger[1]))
      fail("unrecognized_restore_event_trigger")
    skipped++
    return false
  })
  const path = join(directory, `${randomUUID()}.restore-toc`)
  await writeFile(path, lines.join("\n"), { flag: "wx", mode: 0o600 })
  return { path, skipped, skippedRealtime, skippedVaultData }
}

/** @param {string} file @param {NodeJS.ProcessEnv} source */
async function restoreCheck(file, source) {
  const metadata = await decrypt(file)
  const plan = await restorePlan(file)
  const database = `abstruck_restore_check_${randomUUID().replaceAll("-", "")}`
  if (
    !/^abstruck_restore_check_[a-f0-9]{32}$/.test(database) ||
    database === source.PGDATABASE
  )
    fail("restore_database_boundary")
  const writable = {
    ...source,
    PGOPTIONS: "-c statement_timeout=300000 -c lock_timeout=15000",
  }
  const target = { ...writable, PGDATABASE: database }
  let created = false,
    completed = false
  let phase = "create_database"
  try {
    await query(
      writable,
      `create database ${identifier(database)} template template0;`
    )
    created = true
    await query(
      writable,
      `revoke connect on database ${identifier(database)} from public,anon,authenticated,service_role;`
    )
    phase = "verify_empty_target"
    const check = JSON.parse(
      await query(
        target,
        "select json_build_object('database',current_database(),'userTables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in('pg_catalog','information_schema') and c.relkind in('r','p')))"
      )
    )
    if (check.database !== database || Number(check.userTables) !== 0)
      fail("restore_target_not_empty")
    phase = "restore_archive"
    const { child, done } = start(
      "pg_restore",
      [
        "--no-password",
        "--single-transaction",
        "--exit-on-error",
        "--no-owner",
        "--no-comments",
        "--no-privileges",
        "--use-list",
        plan.path,
        "--no-publications",
        "--no-subscriptions",
        "--dbname",
        database,
      ],
      target
    )
    child.stdout.resume()
    try {
      const results = await Promise.allSettled([
        done,
        decrypt(file, child.stdin),
      ])
      if (results[0].status === "rejected") throw results[0].reason
      if (results[1].status === "rejected") throw results[1].reason
    } catch (error) {
      child.kill()
      throw error
    }
    phase = "compare_restored_rows"
    const actual = JSON.parse(
      await query(target, fingerprintsSql(metadata.tables))
    )
    if (
      Object.keys(actual).length !== metadata.tables.length ||
      metadata.tables.some(
        ({ schema, name }) =>
          JSON.stringify(actual[`${schema}.${name}`]) !==
          JSON.stringify(metadata.proofs[`${schema}.${name}`])
      )
    )
      fail("restore_row_fingerprint_mismatch")
    phase = "reapply_deletions"
    const deletionProof = await reapplyDeletions(source, target)
    if (
      deletionProof.deletedOwnersRemaining ||
      deletionProof.deletedSourcesRemaining ||
      deletionProof.liveShares ||
      deletionProof.activeJobs
    )
      fail("restore_quarantine_failed")
    phase = "verify_restored_integrity"
    const integrity = JSON.parse(
      await query(
        target,
        "select json_build_object('publicTables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),'rlsTables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity),'policies',(select count(*) from pg_policies where schemaname='public'),'foreignKeys',(select count(*) from pg_constraint where contype='f' and connamespace='public'::regnamespace))"
      )
    )
    completed = true
    return {
      passed: true,
      restored: true,
      sourceVersion: metadata.serverVersion,
      fingerprintTables: metadata.tables.length,
      rowFingerprintsMatched: true,
      skippedProviderEventTriggers: plan.skipped,
      skippedProviderRealtimeFunctions: plan.skippedRealtime,
      skippedProviderVaultDataEntries: plan.skippedVaultData,
      roleOwnershipAndGrantsRequireManagedTarget: true,
      deletionProof,
      integrity,
      isolatedDatabaseDropped: true,
      targetConnectRestricted: true,
    }
  } finally {
    await unlink(plan.path).catch(() => {})
    if (created) {
      // This exact random database was created in this invocation; no other target is accepted.
      await query(
        writable,
        `drop database ${identifier(database)} with (force);`
      )
    }
    if (!completed)
      report({ restorePassed: false, phase, isolatedDatabaseDropped: created })
  }
}

async function main() {
  if (values.help || !command) {
    console.log(
      "database-backup.mjs init-key | create | restore-check --file <private .enc> | restore-check --key <managed R2 key> | prune [--apply --confirm-project qgdbftgqiinydeeiwadg]\nSource requires SUPABASE_DB_URL, SUPABASE_DB_CA_FILE (or --ca), DATABASE_BACKUP_KEY and existing R2 variables. No secrets in arguments. Restore creates/drops only a fresh abstruck_restore_check_<uuid> database."
    )
    return
  }
  if (
    !["init-key", "create", "restore-check", "prune"].includes(command) ||
    positionals.length !== 1
  )
    fail("unsupported_command")
  if (values.apply && values["confirm-project"] !== project)
    fail("retention_project_confirmation_required")
  await mkdir(directory, { recursive: true, mode: 0o700 })
  if (command === "init-key") {
    if (configuration.DATABASE_BACKUP_KEY) fail("backup_key_already_configured")
    await appendFile(
      envFile,
      `\nDATABASE_BACKUP_KEY=${randomBytes(32).toString("base64")}\n`
    )
    report({
      keyCreated: true,
      valueLogged: false,
      location: "ignored apps/web/.env.local",
      escrowRequired: true,
    })
    return
  }
  encryptionKey()
  if (command === "prune") {
    const client = storage()
    try {
      report(await prune(client, values.apply))
    } finally {
      client.destroy()
    }
    return
  }
  const source = await sourceEnvironment()
  if (command === "restore-check") {
    if (Boolean(values.file) === Boolean(values.key))
      fail("choose_exactly_one_restore_input")
    let file = values.file
      ? await realpath(resolve(values.file))
      : join(directory, `${randomUUID()}.download.enc`)
    if (values.key) {
      const client = storage()
      try {
        await download(client, values.key, file)
      } finally {
        client.destroy()
      }
    }
    const evidence = await restoreCheck(file, source)
    await writeFile(
      join(directory, "latest-restore.json"),
      JSON.stringify(evidence, null, 2),
      { mode: 0o600 }
    )
    report(evidence)
    return
  }
  const id = randomUUID(),
    file = join(directory, `${id}.dump.enc`)
  const metadata = await dump(file, source)
  await decrypt(file)
  const date = new Date(metadata.capturedAt),
    daily = date.toISOString().slice(0, 10)
  const monday = new Date(date)
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  const keys = [
    `${prefix}daily/${daily}/${id}.dump.enc`,
    `${prefix}weekly/${monday.toISOString().slice(0, 10)}/${id}.dump.enc`,
  ]
  const client = storage()
  try {
    const saved = await upload(client, file, keys[0])
    await upload(client, file, keys[1])
    const roundtrip = join(directory, `${id}.roundtrip.enc`)
    await download(client, keys[0], roundtrip)
    const receipt = {
      backupId: id,
      sourceVersion: metadata.serverVersion,
      createdAt: metadata.capturedAt,
      encrypted: true,
      algorithm: "AES-256-GCM",
      sourceReadOnly: true,
      clientTls: "verify-full",
      bytes: saved.bytes,
      sha256: saved.sha256,
      keys,
      remoteReadbackVerified: true,
      plaintextDumpWritten: false,
      retention: await prune(client, values.apply),
    }
    await writeFile(
      join(directory, "latest-backup.json"),
      JSON.stringify(receipt, null, 2),
      { mode: 0o600 }
    )
    report(receipt)
  } finally {
    client.destroy()
  }
}

try {
  await main()
} catch (error) {
  report({
    ok: false,
    error:
      error instanceof Error && /^[a-z0-9_]+$/.test(error.message)
        ? error.message
        : "backup_operation_failed",
    errorType:
      error instanceof Error ? error.name.replace(/[^A-Za-z]/g, "") : "Unknown",
    ...(error &&
    typeof error === "object" &&
    "code" in error &&
    /^[A-Z0-9_]+$/.test(String(error.code))
      ? { nativeCode: error.code }
      : {}),
    ...(error &&
    typeof error === "object" &&
    "safeResource" in error &&
    /^[a-z_][a-z0-9_]*$/.test(String(error.safeResource))
      ? { resource: error.safeResource }
      : {}),
    secretsLogged: false,
  })
  process.exitCode = 1
}
