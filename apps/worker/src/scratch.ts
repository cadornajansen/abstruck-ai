import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { ProbeError } from "./process.js";

export function subprocessEnvironment(scratch: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH, HOME: scratch, TMPDIR: scratch, TEMP: scratch, TMP: scratch,
    LANG: "C.UTF-8", LC_ALL: "C.UTF-8",
    ...(process.platform === "win32" ? { SystemRoot: process.env.SystemRoot } : {}),
  };
}

export async function withScratch<T>(work: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "abstruck-cp01-"));
  try {
    return await work(directory);
  } finally {
    const root = await realpath(tmpdir());
    const target = await realpath(directory);
    if (resolve(dirname(target)) !== resolve(root) || !basename(target).startsWith("abstruck-cp01-")) {
      throw new ProbeError("scratch_cleanup_boundary");
    }
    await rm(target, { recursive: true, force: true });
  }
}
