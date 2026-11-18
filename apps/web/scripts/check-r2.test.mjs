import assert from "node:assert/strict";
import test from "node:test";
import { S3Client } from "@aws-sdk/client-s3";
import { runR2Probe } from "./check-r2.mjs";

const ENV = {
  R2_ACCOUNT_ID: "1".repeat(32),
  R2_BUCKET: "abstruck-probe-test",
  R2_ACCESS_KEY_ID: "fake-access-key",
  R2_SECRET_ACCESS_KEY: "fake-secret-key",
};
const ORIGIN = "http://localhost:3000";
const CORS = {
  "access-control-allow-origin": ORIGIN,
  "access-control-allow-methods": "GET, PUT, HEAD",
  "access-control-allow-headers": "Content-Type, Range",
  "access-control-expose-headers": "ETag, Content-Length",
};

function harness({ failPut = false, cors = CORS, contentMismatch = false, unsignedStatus = 403,
  unsignedBody = "provider body must stay private", failDelete = false, objectSurvives = false } = {}) {
  const requests = [];
  const commands = [];
  let uploadedBody;
  let clientOptions;
  const dependencies = {
    createClient(options) {
      clientOptions = options;
      // Real local signing with fake credentials, but every transport is replaced.
      const client = new S3Client(options);
      client.send = async (command, sendOptions) => {
        commands.push({ name: command.constructor.name, input: command.input });
        assert.ok(sendOptions.abortSignal instanceof AbortSignal);
        if (command.constructor.name === "DeleteObjectCommand" && failDelete) {
          throw new Error("fake-secret-key https://example.invalid/?signature=private");
        }
        if (command.constructor.name === "HeadObjectCommand" && !objectSurvives) {
          throw { $metadata: { httpStatusCode: 404 } };
        }
        return {};
      };
      return client;
    },
    async request(url, options) {
      const target = new URL(url);
      requests.push({ target, options });
      assert.equal(options.redirect, "error");
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(target.hostname, `${ENV.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
      if (options.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      if (options.method === "PUT") {
        uploadedBody = options.body;
        if (failPut) throw new Error("fake-secret-key https://example.invalid/?signature=private");
        return new Response(null, { status: 200, headers: cors });
      }
      if (target.search) {
        return new Response(contentMismatch ? "unexpected content" : uploadedBody, { headers: cors });
      }
      return new Response(unsignedBody, { status: unsignedStatus });
    },
  };
  return { dependencies, requests, commands, getOptions: () => clientOptions };
}

const status = (report, step) => report.steps.find((entry) => entry.step === step)?.status;

test("real local signing uses scoped object, Content-Type and bounded browser-compatible requests", async () => {
  const fake = harness();
  const result = await runR2Probe(ENV, fake.dependencies);
  assert.equal(result.ok, true);
  assert.ok(result.syntheticBytes >= 100);
  assert.match(result.testObjectKey, /^__abstruck_readiness__\/[a-f0-9-]{36}\.txt$/);
  assert.equal(status(result, "public_domains"), "skipped");
  const options = fake.getOptions();
  assert.equal(options.maxAttempts, 1);
  assert.equal(options.requestChecksumCalculation, "WHEN_REQUIRED");
  assert.equal(options.forcePathStyle, true);
  assert.deepEqual(fake.requests.map(({ options }) => options.method), ["OPTIONS", "PUT", "GET", "GET"]);
  const put = fake.requests[1];
  assert.equal(put.options.headers.Origin, ORIGIN);
  assert.equal(put.options.headers["Content-Type"], "text/plain; charset=utf-8");
  assert.equal(put.target.searchParams.get("X-Amz-SignedHeaders"), "content-type;host");
  assert.equal(put.target.searchParams.get("X-Amz-Expires"), "120");
  assert.ok(![...put.target.searchParams.keys()].some((key) => key.toLowerCase().includes("checksum")));
  assert.deepEqual(fake.commands.map(({ name }) => name), ["DeleteObjectCommand", "HeadObjectCommand"]);
  for (const { input } of fake.commands) {
    assert.deepEqual(input, { Bucket: ENV.R2_BUCKET, Key: result.testObjectKey });
  }
  const output = JSON.stringify(result);
  for (const forbidden of [ENV.R2_SECRET_ACCESS_KEY, ENV.R2_ACCESS_KEY_ID, "X-Amz-Signature", ENV.R2_ACCOUNT_ID]) {
    assert.ok(!output.includes(forbidden));
  }
});

test("invalid host or bucket configuration never reaches signing or network", async () => {
  for (const replacement of [
    { R2_ACCOUNT_ID: "https://attacker.invalid" },
    { R2_BUCKET: "../other-bucket" },
    { R2_BUCKET: "invalid.bucket" },
    { R2_SECRET_ACCESS_KEY: "" },
  ]) {
    const fake = harness();
    const result = await runR2Probe({ ...ENV, ...replacement }, fake.dependencies);
    assert.equal(status(result, "configuration"), "fail");
    assert.equal(status(result, "cleanup_delete"), "skipped");
    assert.equal(fake.requests.length, 0);
    assert.equal(fake.commands.length, 0);
    assert.equal(fake.getOptions(), undefined);
  }
});

test("CORS rejection stops before writing an object", async () => {
  const fake = harness({ cors: { ...CORS, "access-control-allow-origin": "*" } });
  const result = await runR2Probe(ENV, fake.dependencies);
  assert.equal(result.ok, false);
  assert.equal(status(result, "cors_preflight"), "fail");
  assert.equal(status(result, "upload"), "skipped");
  assert.equal(fake.requests.length, 1);
  assert.equal(fake.commands.length, 0);
});

test("an interrupted upload still deletes only its generated object and verifies absence", async () => {
  const fake = harness({ failPut: true });
  const result = await runR2Probe(ENV, fake.dependencies);
  assert.equal(result.ok, false);
  assert.equal(status(result, "upload"), "fail");
  assert.equal(status(result, "cleanup_delete"), "pass");
  assert.equal(status(result, "cleanup_head"), "pass");
  assert.equal(fake.commands.length, 2);
  assert.ok(fake.commands.every(({ input }) => input.Key === result.testObjectKey));
  assert.ok(!JSON.stringify(result).includes("fake-secret-key"));
  assert.ok(!JSON.stringify(result).includes("signature=private"));
});

test("content mismatch and an accessible unsigned object cannot pass readiness", async () => {
  for (const settings of [{ contentMismatch: true }, { unsignedStatus: 200 }]) {
    const fake = harness(settings);
    const result = await runR2Probe(ENV, fake.dependencies);
    assert.equal(result.ok, false);
    assert.equal(status(result, settings.contentMismatch ? "signed_read" : "unsigned_read"), "fail");
    assert.equal(status(result, "cleanup_head"), "pass");
    assert.ok(!JSON.stringify(result).includes("provider body must stay private"));
  }
});

test("cleanup errors remain failures and HEAD still runs after a failed delete", async () => {
  const fake = harness({ failDelete: true, objectSurvives: true });
  const result = await runR2Probe(ENV, fake.dependencies);
  assert.equal(result.ok, false);
  assert.equal(status(result, "cleanup_delete"), "fail");
  assert.equal(status(result, "cleanup_head"), "fail");
  assert.equal(fake.commands.length, 2);
  assert.ok(!JSON.stringify(result).includes("fake-secret-key"));
  assert.ok(!JSON.stringify(result).includes("signature=private"));
});

test("unsigned HTTP 400 reports only status and allowlisted error code, while still failing", async () => {
  const fake = harness({ unsignedStatus: 400,
    unsignedBody: "<Error><Code>InvalidArgument</Code><Message>fake-secret-key</Message></Error>" });
  const result = await runR2Probe(ENV, fake.dependencies);
  const step = result.steps.find(({ step: name }) => name === "unsigned_read");
  assert.equal(step.status, "fail");
  assert.equal(step.httpStatus, 400);
  assert.equal(step.errorCode, "InvalidArgument");
  assert.equal(result.ok, false);
  assert.equal(status(result, "cleanup_head"), "pass");
  assert.ok(!JSON.stringify(result).includes("fake-secret-key"));
});

test("unknown and oversized unsigned error bodies never escape the probe report", async () => {
  for (const unsignedBody of ["<Code>UntrustedSensitiveDetail</Code>", "x".repeat(2049) + "<Code>AccessDenied</Code>"]) {
    const fake = harness({ unsignedStatus: 400, unsignedBody });
    const result = await runR2Probe(ENV, fake.dependencies);
    const step = result.steps.find(({ step: name }) => name === "unsigned_read");
    assert.equal(step.status, "fail");
    assert.equal(step.errorCode, "unrecognized");
    assert.ok(!JSON.stringify(result).includes("UntrustedSensitiveDetail"));
    assert.equal(status(result, "cleanup_head"), "pass");
  }
});

test("only R2's exact authorization refusal qualifies as an HTTP 400 denial", async () => {
  const cases = [
    { body: "<Error><Code>InvalidArgument</Code><Message>Authorization</Message></Error>", pass: true },
    { body: "<Error><Code>InvalidArgument</Code><Message>Authorization unrelated failure</Message></Error>", pass: false },
    { body: "<Error><Code>AccessDenied</Code><Message>Authorization</Message></Error>", pass: false },
    { body: "<Error><Code>InvalidArgument</Code><Message>Content-Type</Message></Error>", pass: false },
  ];
  for (const { body, pass } of cases) {
    const fake = harness({ unsignedStatus: 400, unsignedBody: body });
    const result = await runR2Probe(ENV, fake.dependencies);
    assert.equal(result.ok, pass);
    const entry = result.steps.find(({ step: name }) => name === "unsigned_read");
    assert.equal(entry.status, pass ? "pass" : "fail");
    assert.equal(entry.denialClass, pass ? "unsigned_authorization_rejected" : "unconfirmed");
    assert.equal(status(result, "public_domains"), "skipped");
    assert.equal(status(result, "cleanup_head"), "pass");
  }
});
