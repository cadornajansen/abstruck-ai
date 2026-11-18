import { ProbeError, runCommand } from "./process.js";
import { acquireYouTube, MAX_DURATION_SECONDS, MAX_MEDIA_BYTES } from "./youtube.js";
import { inspectDocument } from "./document.js";

async function capabilities(): Promise<boolean> {
  const tools = [
    ["yt-dlp", ["--ignore-config", "--no-plugin-dirs", "--version"]],
    ["ffmpeg", ["-version"]],
    ["ffprobe", ["-version"]],
    ["soffice", ["--version"]],
    ["pdftotext", ["-v"]],
    ["pdfinfo", ["-v"]],
    ["prlimit", ["--version"]],
  ] as const;
  const results: { tool: string; available: boolean; version?: string; reason?: string }[] = [];
  for (const [tool, args] of tools) {
    try {
      const output = await runCommand(tool, args, { timeoutMs: 10_000, captureStderr: true });
      results.push({ tool, available: true, version: output.split(/\r?\n/)[0]?.slice(0,180) ?? "" });
    } catch (error) {
      results.push({ tool, available: false, reason: error instanceof ProbeError ? error.code : "check_failed" });
    }
  }
  console.log(JSON.stringify({
    kind: "capabilities", recordedAt: new Date().toISOString(),
    node: process.versions.node, platform: process.platform, tools: results,
    pipelineFeasibility: "not_tested",
  }, null, 2));
  return results.every((result) => result.available);
}

async function main(): Promise<void> {
  const [command, source, ...extra] = process.argv.slice(2);
  if (command === "capabilities" && !source) {
    process.exitCode = await capabilities() ? 0 : 1;
    return;
  }
  if (command === "youtube" && source && extra.length === 0) {
    const evidence = await acquireYouTube(source);
    console.log(JSON.stringify({
      kind: "youtube_acquisition", status: "acquired",
      recordedAt: new Date().toISOString(), limits: {
        durationSeconds: MAX_DURATION_SECONDS, bytes: MAX_MEDIA_BYTES,
      }, ...evidence,
      transcription: "not_tested", deploymentEvidence: "record_host_and_run_id_separately",
    }, null, 2));
    return;
  }
  if (command === "document" && source && extra.length === 0) {
    const evidence = await inspectDocument(source);
    console.log(JSON.stringify(evidence, null, 2));
    if (evidence.status === "failed") process.exitCode = 1;
    return;
  }
  throw new ProbeError("usage: capabilities | youtube <https-video-url> | document <local-pdf-docx-pptx>");
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({
    kind: "feasibility_failure", status: "failed",
    recordedAt: new Date().toISOString(),
    reason: error instanceof ProbeError ? error.code : "unexpected_probe_failure",
    recovery: "Check installed tools, supported input and configured limits; unavailable YouTube sources need an uploaded-file fallback.",
  }));
  process.exitCode = 1;
});
