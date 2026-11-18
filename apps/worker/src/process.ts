import { spawn } from "node:child_process";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";

export class ProbeError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ProbeError";
  }
}

export interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
  outputLimitBytes?: number;
  captureStderr?: boolean;
}

export function runCommand(
  command: string,
  args: readonly string[],
  options: CommandOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let bytes = 0;
    let failure: string | undefined;
    let finished = false;
    const stdoutDecoder = new StringDecoder("utf8");
    const stderrDecoder = new StringDecoder("utf8");

    const stop = (reason: string): void => {
      if (failure || finished) return;
      failure = reason;
      if (!child.pid) return;
      if (process.platform === "win32") {
        const taskkill = spawn(
          join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"),
          ["/pid", String(child.pid), "/T", "/F"],
          { shell: false, windowsHide: true, stdio: "ignore" },
        );
        taskkill.on("error", () => child.kill());
        taskkill.on("close", (code) => { if (code !== 0 && !finished) child.kill(); });
      } else {
        try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
      }
    };

    const timer = setTimeout(() => stop("deadline_exceeded"), options.timeoutMs);
    const read = (chunk: Buffer, keep: boolean, decoder: StringDecoder): void => {
      bytes += chunk.length;
      if (bytes > (options.outputLimitBytes ?? 1_048_576)) {
        stop("command_output_limit");
      } else if (keep) {
        output += decoder.write(chunk);
      }
    };
    child.stdout.on("data", (chunk: Buffer) => read(chunk, true, stdoutDecoder));
    child.stderr.on("data", (chunk: Buffer) => read(chunk, options.captureStderr ?? false, stderrDecoder));
    child.on("error", () => {
      finished = true;
      clearTimeout(timer);
      reject(new ProbeError("command_unavailable"));
    });
    child.on("close", (code) => {
      finished = true;
      clearTimeout(timer);
      if (failure || code !== 0) reject(new ProbeError(failure ?? "command_failed"));
      else resolve(output + stdoutDecoder.end() + (options.captureStderr ? stderrDecoder.end() : ""));
    });
  });
}
