import assert from "node:assert/strict";
import { mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";
import { runCommand } from "../dist/process.js";
import { MAX_MEDIA_BYTES, isPublicIpv4, parseYouTubeUrl, validateAudioUrl, validateMediaSize, validateMetadata } from "../dist/youtube.js";

test("only canonical individual HTTPS video URLs reach acquisition", () => {
  for (const url of [
    "https://www.youtube.com/watch?v=BaW_jenozKc&t=12",
    "https://youtu.be/BaW_jenozKc?si=tracking",
    "https://m.youtube.com/shorts/BaW_jenozKc",
  ]) assert.deepEqual(parseYouTubeUrl(url), {
    videoId: "BaW_jenozKc", url: "https://www.youtube.com/watch?v=BaW_jenozKc",
  });
  for (const url of [
    "http://www.youtube.com/watch?v=BaW_jenozKc",
    "https://www.youtube.com.evil.test/watch?v=BaW_jenozKc",
    "https://youtube.com@127.0.0.1/watch?v=BaW_jenozKc",
    "https://youtube.com:8443/watch?v=BaW_jenozKc",
    "https://www.youtube.com/watch?v=BaW_jenozKc&list=anything",
    "https://www.youtube.com/watch?v=BaW_jenozKc&v=abcdefghijk",
    "https://www.youtube.com/live/BaW_jenozKc",
    "https://youtu.be/BaW_jenozKc/extra",
    "https://www.youtube.com/playlist?list=anything",
    "--exec=arbitrary-command",
  ]) assert.throws(() => parseYouTubeUrl(url), /unsupported_youtube_url/);
});

test("unknown/private/live/oversized metadata cannot authorize a download", () => {
  const valid = { id: "BaW_jenozKc", duration: 3600, is_live: false, availability: "public" };
  assert.equal(validateMetadata(valid, valid.id), 3600);
  for (const changed of [
    { duration: 3601 }, { duration: null }, { duration: 0 }, { duration: NaN },
    { is_live: true }, { is_live: undefined }, { availability: "private" },
    { live_status: "is_upcoming" }, { live_status: "post_live" },
    { id: "abcdefghijk" }, { entries: [] },
  ]) assert.throws(() => validateMetadata({ ...valid, ...changed }, valid.id));
});

test("actual downloaded size is checked independently of metadata", () => {
  validateMediaSize(MAX_MEDIA_BYTES);
  for (const bytes of [0, -1, MAX_MEDIA_BYTES + 1, Infinity, NaN, 3.5]) {
    assert.throws(() => validateMediaSize(bytes), /media_size_limit/);
  }
});

test("audio redirects stay on HTTPS Google video hosts and public IPv4 addresses", () => {
  assert.equal(validateAudioUrl("https://rr6---sn-example.googlevideo.com/videoplayback?expire=123").hostname, "rr6---sn-example.googlevideo.com");
  for (const url of [
    "https://googlevideo.com.evil.test/videoplayback", "https://127.0.0.1/videoplayback",
    "http://rr6---sn-example.googlevideo.com/videoplayback", "https://rr6---sn-example.googlevideo.com:8443/videoplayback",
    "https://user@rr6---sn-example.googlevideo.com/videoplayback", "https://rr6---sn-example.googlevideo.com/other",
  ]) assert.throws(() => validateAudioUrl(url), /youtube_audio_url_rejected/);
  for (const address of ["0.0.0.0", "10.1.2.3", "100.64.0.1", "127.0.0.1", "169.254.169.254", "172.31.1.1", "192.168.1.1", "198.18.0.1", "224.0.0.1", "::1"])
    assert.equal(isPublicIpv4(address), false);
  assert.equal(isPublicIpv4("142.250.0.1"), true);
});

test("Linux file-size limit stops a process even without a declared content length", {
  skip: process.platform !== "linux" ? "Requires the deployed Linux runtime" : false,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "abstruck-cp01-size-test-"));
  try {
    await assert.rejects(runCommand("prlimit", [
      "--fsize=4096:4096", "--", process.execPath, "-e",
      "require('node:fs').writeFileSync('bounded.bin', Buffer.alloc(8192))",
    ], { cwd: directory, timeoutMs: 5000 }));
    assert.ok((await stat(join(directory, "bounded.bin"))).size <= 4096);
  } finally {
    const resolved = await realpath(directory);
    assert.equal(dirname(resolved), await realpath(tmpdir()));
    assert.ok(basename(resolved).startsWith("abstruck-cp01-size-test-"));
    await rm(resolved, { recursive: true, force: true });
  }
});

test("process deadline terminates a hung child", async () => {
  const start = Date.now();
  await assert.rejects(runCommand(process.execPath, ["-e", "setInterval(() => {}, 10)"], {
    timeoutMs: 250,
  }), /deadline_exceeded/);
  assert.ok(Date.now() - start < 10_000);
});

test("excess process output is bounded and private stderr never reaches errors", async () => {
  await assert.rejects(runCommand(process.execPath, ["-e", "process.stdout.write('x'.repeat(50000))"], {
    timeoutMs: 5000, outputLimitBytes: 1024,
  }), /command_output_limit/);
  await assert.rejects(runCommand(process.execPath, ["-e", "process.stderr.write('private-secret-value');process.exit(1)"], {
    timeoutMs: 5000,
  }), (error) => error.message === "command_failed");
});

test("subprocess arguments are passed literally without a shell", async () => {
  const value = "literal ; $(not-executed) & `also-not-executed`";
  const output = await runCommand(process.execPath, ["-e", "process.stdout.write(process.argv[1])", value], {
    timeoutMs: 5000,
  });
  assert.equal(output, value);
});
