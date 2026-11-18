import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { parseEnv } from "node:util";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ORIGIN = "http://localhost:3000";
const CONTENT_TYPE = "text/plain; charset=utf-8";
const TIMEOUT_MS = 15_000;
const BODY = Buffer.from(
  "Abstruck R2 development readiness probe. This is generated synthetic text, not a user file. " +
    "The probe must upload, read back these exact bytes, deny unsigned access, and remove this object.\n",
);
const STEP_NAMES = [
  "configuration", "authorization", "cors_preflight", "upload", "signed_read",
  "unsigned_read", "cleanup_delete", "cleanup_head", "public_domains",
];

class ProbeFailure extends Error {}

function requireCheck(condition, code) {
  if (!condition) throw new ProbeFailure(code);
}

function configuration(env) {
  const names = ["R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];
  for (const name of names) {
    requireCheck(typeof env[name] === "string" && env[name].trim().length > 0, `missing_${name}`);
  }
  requireCheck(/^[a-f0-9]{32}$/i.test(env.R2_ACCOUNT_ID), "invalid_R2_ACCOUNT_ID");
  requireCheck(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(env.R2_BUCKET), "invalid_R2_BUCKET");
  return {
    endpoint: `https://${env.R2_ACCOUNT_ID.toLowerCase()}.r2.cloudflarestorage.com`,
    bucket: env.R2_BUCKET,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  };
}

function safeFailure(error) {
  if (error instanceof ProbeFailure) return error.message;
  const status = error?.$metadata?.httpStatusCode;
  return Number.isInteger(status) && status >= 100 && status <= 599
    ? `provider_http_${status}`
    : "request_failed_or_timed_out";
}

function headerIncludes(response, name, value) {
  return (response.headers.get(name) ?? "").toLowerCase().split(",")
    .some((entry) => entry.trim() === value.toLowerCase());
}

async function discard(response) {
  await response.body?.cancel();
}

async function denialDiagnostic(response) {
  const allowed = new Set([
    "AccessDenied", "InvalidArgument", "MissingRequiredHeader", "MissingAuthenticationToken",
    "SignatureDoesNotMatch", "AuthorizationHeaderMalformed", "InvalidAccessKeyId", "InvalidRequest",
  ]);
  const reader = response.body?.getReader();
  const unknown = { errorCode: "unrecognized", authorizationRejected: false };
  if (!reader) return unknown;
  let body = Buffer.alloc(0);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (body.byteLength + value.byteLength > 2048) return unknown;
      body = Buffer.concat([body, value]);
    }
    const xml = body.toString("utf8");
    const code = /<Code>([A-Za-z0-9]+)<\/Code>/.exec(xml)?.[1];
    const message = /<Message>([^<]*)<\/Message>/.exec(xml)?.[1];
    return {
      errorCode: allowed.has(code) ? code : "unrecognized",
      // Observed R2 refusal for a GET with neither signed query nor Authorization.
      // A general InvalidArgument can describe unrelated errors and is not sufficient.
      authorizationRejected: response.status === 400 && code === "InvalidArgument" &&
        /^Authorization$/i.test(message ?? ""),
    };
  } finally {
    await reader.cancel();
  }
}

// Dependencies are injectable so cleanup and credential handling can be tested offline.
export async function runR2Probe(env, {
  request = fetch,
  sign = getSignedUrl,
  createClient = (options) => new S3Client(options),
} = {}) {
  const report = {
    ok: false,
    steps: STEP_NAMES.map((step) => ({ step, status: "skipped", detail: "not_run" })),
    testObjectKey: null,
    syntheticBytes: BODY.byteLength,
  };
  const setStep = (step, status, detail) => {
    Object.assign(report.steps.find((entry) => entry.step === step), { status, detail });
  };
  const step = async (name, operation) => {
    try {
      const value = await operation();
      setStep(name, "pass", "verified");
      return value;
    } catch (error) {
      setStep(name, "fail", safeFailure(error));
      throw error;
    }
  };
  const sendOptions = () => ({ abortSignal: AbortSignal.timeout(TIMEOUT_MS) });
  const fetchOptions = (method, headers = {}) => ({
    method, headers, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let client;
  let object;
  let uploadAttempted = false;

  setStep("public_domains", "skipped", "r2_dev_and_custom_domain_public_access_not_verified");
  try {
    const config = await step("configuration", () => configuration(env));
    const urls = await step("authorization", async () => {
      client = createClient({
        endpoint: config.endpoint,
        region: "auto",
        forcePathStyle: true,
        credentials: config.credentials,
        maxAttempts: 1,
        // Optional checksum headers would change the browser CORS/signature contract.
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      });
      const key = `__abstruck_readiness__/${randomUUID()}.txt`;
      report.testObjectKey = key;
      object = Object.freeze({ Bucket: config.bucket, Key: key });
      const put = await sign(client, new PutObjectCommand({ ...object, ContentType: CONTENT_TYPE }), {
        expiresIn: 120, signableHeaders: new Set(["content-type"]),
      });
      const get = await sign(client, new GetObjectCommand(object), { expiresIn: 120 });
      for (const candidate of [put, get]) {
        const url = new URL(candidate);
        requireCheck(url.origin === config.endpoint && !url.username && !url.password &&
          url.pathname === `/${object.Bucket}/${object.Key}`, "unexpected_signed_url_target");
      }
      return { put, get };
    });

    await step("cors_preflight", async () => {
      const response = await request(urls.put, fetchOptions("OPTIONS", {
        Origin: ORIGIN,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type",
      }));
      await discard(response);
      requireCheck(response.ok, `http_${response.status}`);
      requireCheck(response.headers.get("access-control-allow-origin") === ORIGIN, "localhost_origin_not_allowed");
      requireCheck(headerIncludes(response, "access-control-allow-methods", "PUT"), "put_method_not_allowed");
      requireCheck(headerIncludes(response, "access-control-allow-headers", "content-type"), "content_type_not_allowed");
    });

    await step("upload", async () => {
      // Mark before sending: a timeout can happen after the server stores the object.
      uploadAttempted = true;
      const response = await request(urls.put, {
        ...fetchOptions("PUT", { Origin: ORIGIN, "Content-Type": CONTENT_TYPE }), body: BODY,
      });
      await discard(response);
      requireCheck(response.ok, `http_${response.status}`);
      requireCheck(response.headers.get("access-control-allow-origin") === ORIGIN, "upload_cors_missing");
      requireCheck(headerIncludes(response, "access-control-expose-headers", "etag"), "etag_not_exposed");
    });

    await step("signed_read", async () => {
      const response = await request(urls.get, fetchOptions("GET", { Origin: ORIGIN }));
      if (!response.ok) {
        await discard(response);
        throw new ProbeFailure(`http_${response.status}`);
      }
      // Read at most the expected synthetic bytes; never print a provider response.
      const reader = response.body?.getReader();
      requireCheck(reader, "missing_response_body");
      let received = Buffer.alloc(0);
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          requireCheck(received.byteLength + value.byteLength <= BODY.byteLength, "content_mismatch");
          received = Buffer.concat([received, value]);
        }
      } finally {
        await reader.cancel();
      }
      requireCheck(received.equals(BODY), "content_mismatch");
      requireCheck(response.headers.get("access-control-allow-origin") === ORIGIN, "read_cors_missing");
    });

    await step("unsigned_read", async () => {
      const unsigned = new URL(urls.get);
      unsigned.search = "";
      const response = await request(unsigned, fetchOptions("GET"));
      const entry = report.steps.find(({ step: name }) => name === "unsigned_read");
      entry.httpStatus = response.status;
      const diagnostic = await denialDiagnostic(response);
      entry.errorCode = diagnostic.errorCode;
      const httpDenied = response.status === 401 || response.status === 403;
      entry.denialClass = httpDenied ? "http_authentication_denial"
        : diagnostic.authorizationRejected ? "unsigned_authorization_rejected" : "unconfirmed";
      requireCheck(httpDenied || diagnostic.authorizationRejected, "unsigned_s3_denial_not_confirmed");
    });
  } catch {
    // Each step records only an allowlisted reason, never SDK errors or signed URLs.
  } finally {
    if (uploadAttempted && client && object) {
      try {
        await step("cleanup_delete", () => client.send(new DeleteObjectCommand(object), sendOptions()));
      } catch { /* Still check absence if the delete response was interrupted. */ }
      try {
        await step("cleanup_head", async () => {
          try {
            await client.send(new HeadObjectCommand(object), sendOptions());
          } catch (error) {
            if (error?.$metadata?.httpStatusCode === 404) return;
            throw error;
          }
          throw new ProbeFailure("test_object_still_exists");
        });
      } catch { /* Report retains cleanup failure and the generated key for recovery. */ }
    } else {
      setStep("cleanup_delete", "skipped", "no_upload_attempted");
      setStep("cleanup_head", "skipped", "no_upload_attempted");
    }
    client?.destroy();
  }
  report.ok = report.steps.every(({ step: name, status }) => name === "public_domains" || status === "pass");
  return report;
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === "--help") {
      console.log("node apps/web/scripts/check-r2.mjs\nReads apps/web/.env.local. Creates one synthetic R2 object, probes localhost access, then deletes and checks it.\nPublic r2.dev/custom-domain settings remain unverified.");
    } else if (args.length) {
      console.error("Unsupported option. Use --help.");
      process.exitCode = 2;
    } else {
      const env = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
      const report = await runR2Probe(env);
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = report.ok ? 0 : 1;
    }
  } catch {
    console.error("R2 check could not run. Check local environment file and installed dependencies; details suppressed.");
    process.exitCode = 1;
  }
}
