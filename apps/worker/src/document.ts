import { createHash } from "node:crypto";
import { lstat, mkdir, open, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";
import { ProbeError, runCommand } from "./process.js";
import { subprocessEnvironment, withScratch } from "./scratch.js";

export const DOCUMENT_LIMITS = {
  inputBytes: 50_000_000, normalizedPdfBytes: 50_000_000, pages: 200,
  textBytes: 8_388_608, conversionMs: 120_000, extractionMs: 30_000,
} as const;

export const TEXT_LIMITS = { inputBytes: 100_000, paragraphs: 200, bytesPerEquivalentPage: 2000 } as const;

export function extractPastedText(source: Buffer): string[] {
  if (source.length < 1 || source.length > TEXT_LIMITS.inputBytes) throw new ProbeError("text_size_limit");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(source); }
  catch { throw new ProbeError("invalid_text_encoding"); }
  if (/\u0000/.test(text)) throw new ProbeError("invalid_text_content");
  const paragraphs = text.replace(/\r\n?/g, "\n").trim().split(/\n[\t ]*\n+/).map((paragraph) => paragraph.trim()).filter(Boolean);
  if (!paragraphs.length) throw new ProbeError("empty_text_source");
  if (paragraphs.length > TEXT_LIMITS.paragraphs) throw new ProbeError("text_paragraph_limit");
  return paragraphs;
}
type DocumentKind = "pdf" | "docx" | "pptx";
const sha256 = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");

export async function readBoundedFile(path: string, limit: number): Promise<Buffer> {
  const entry = await lstat(path).catch(() => { throw new ProbeError("document_not_found"); });
  if (!entry.isFile() || entry.isSymbolicLink()) throw new ProbeError("document_requires_regular_file");
  const file = await open(path, "r");
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size <= 0 || info.size > limit) throw new ProbeError("document_size_limit");
    const buffer = Buffer.alloc(info.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset !== info.size) throw new ProbeError("document_changed_during_read");
    return buffer.subarray(0, offset);
  } finally { await file.close(); }
}

export function documentKind(path: string): DocumentKind {
  const extension = extname(path).toLowerCase().slice(1);
  if (extension !== "pdf" && extension !== "docx" && extension !== "pptx") {
    throw new ProbeError("unsupported_type");
  }
  return extension;
}

// Verify actual expanded sizes as well as ZIP metadata before the converter sees it.
export function validateSignature(bytes: Buffer, kind: DocumentKind): void {
  if (kind === "pdf") {
    if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new ProbeError("file_signature_mismatch");
    return;
  }
  if (bytes.length < 22 || bytes.readUInt32LE(0) !== 0x04034b50) {
    throw new ProbeError("file_signature_mismatch");
  }
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset--) {
    if (bytes.readUInt32LE(offset) === 0x06054b50 && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) {
      end = offset; break;
    }
  }
  if (end < 0) throw new ProbeError("invalid_office_archive");
  const count = bytes.readUInt16LE(end + 10);
  const directorySize = bytes.readUInt32LE(end + 12);
  let offset = bytes.readUInt32LE(end + 16);
  if (bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0 ||
      bytes.readUInt16LE(end + 8) !== count || count < 1 || count > 2000 ||
      offset + directorySize !== end) throw new ProbeError("office_archive_limit");
  const names = new Set<string>();
  let expandedBytes = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) throw new ProbeError("invalid_office_archive");
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const compressed = bytes.readUInt32LE(offset + 20);
    const expanded = bytes.readUInt32LE(offset + 24);
    expandedBytes += expanded;
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > end || flags & 1 || ![0, 8].includes(method) || expandedBytes > 100_000_000 ||
        compressed > bytes.length || localOffset + 30 > bytes.readUInt32LE(end + 16) ||
        bytes.readUInt32LE(localOffset) !== 0x04034b50) throw new ProbeError("office_archive_limit");
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (!name || names.has(name) || name.startsWith("/") || name.includes("\\") ||
        name.split("/").includes("..") || name.includes(":") || /vbaProject\.bin$/i.test(name)) {
      throw new ProbeError("unsupported_office_package");
    }
    names.add(name);
    const dataStart = localOffset + 30 + bytes.readUInt16LE(localOffset + 26) + bytes.readUInt16LE(localOffset + 28);
    if (dataStart + compressed > bytes.readUInt32LE(end + 16)) throw new ProbeError("invalid_office_archive");
    let payload: Buffer;
    try { payload = method === 0 ? bytes.subarray(dataStart,dataStart+compressed) :
      inflateRawSync(bytes.subarray(dataStart,dataStart+compressed),{ maxOutputLength: Math.max(1,Math.min(expanded,100_000_000)) }); }
    catch { throw new ProbeError("office_archive_limit"); }
    if (payload.length !== expanded) throw new ProbeError("office_archive_size_mismatch");
    if (/\.rels$/i.test(name) && /TargetMode\s*=\s*["']External["']/i.test(payload.toString("utf8")))
      throw new ProbeError("office_external_links_unsupported");
    offset = next;
  }
  if (offset !== end || !names.has("[Content_Types].xml") ||
      !names.has(kind === "docx" ? "word/document.xml" : "ppt/presentation.xml")) {
    throw new ProbeError("file_signature_mismatch");
  }
}

export function parsePdfPageCount(info: string): number {
  if (/^Encrypted:\s+yes\b/m.test(info)) throw new ProbeError("encrypted_document");
  const pages = Number(info.match(/^Pages:\s+(\d+)\s*$/m)?.[1]);
  if (!Number.isInteger(pages) || pages < 1 || pages > DOCUMENT_LIMITS.pages) throw new ProbeError("document_page_limit");
  return pages;
}

export function separatePages(text: string, expectedPages: number): string[] {
  if (Buffer.byteLength(text) > DOCUMENT_LIMITS.textBytes) throw new ProbeError("document_text_limit");
  const pages = text.split("\f");
  if (pages.at(-1) === "") pages.pop();
  if (pages.length !== expectedPages) throw new ProbeError("page_locator_mismatch");
  return pages.map((page) => page.replace(/\r\n?/g, "\n").trim());
}

export function needsVisualExtraction(text: string): boolean {
  // Broken font maps can produce nonempty text with missing mathematical symbols.
  return !text.trim() || /[\u0000-\u0008\u000b\u000e-\u001f\u007f\ufffd\p{Co}]|\(cid:\d+\)/u.test(text);
}

const fixtures = [
  { id: "F-PDF-01", hash: "3ee7b538b245e407a6637f2519a6312699d296f1b41c53300040a756d9301531",
    anchors: ["Group B received 400 mL of water per day.", "The difference in mean height was 6 cm."] },
  { id: "F-DOCX-01", hash: "7a091265c25399982382769c5e85e6d3543db5151fd7ba703f1b5550396d8178",
    anchors: ["Each group contained five seedlings.", "The difference in mean height was 6 cm."] },
  { id: "F-PPTX-01", hash: "caf9b5a3b6061cd40917f372de0daf93cffeaa654ff2ac0e9e9fd702db2a10bf",
    anchors: ["Group A received 200 mL of water per day.", "The difference in mean height was 6 cm."] },
] as const;

interface DocumentEvidence {
  status: "extracted" | "ocr_required" | "failed";
  reason: "fixture_expectation_mismatch" | null;
}

export interface ExtractedDocument {
  pages: string[];
  evidence: DocumentEvidence;
  normalizedPdf: Buffer;
}

function linuxScratchPath(path: string): string {
  if (process.platform !== "win32") return path;
  const absolute = resolve(path);
  const match = /^([a-z]):\\(.+)$/i.exec(absolute);
  if (!match) throw new ProbeError("office_scratch_path_unsupported");
  return `/mnt/${match[1]!.toLowerCase()}/${match[2]!.replaceAll("\\","/")}`;
}

async function convertOffice(sourcePath: string, scratch: string, kind: "docx" | "pptx"): Promise<void> {
  const profile = join(scratch,"office-profile");
  await mkdir(join(profile,"user"),{ recursive: true });
  await writeFile(join(profile,"user","registrymodifications.xcu"),
    '<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>');
  const linuxScratch = linuxScratchPath(scratch);
  const linuxProfile = linuxScratchPath(profile);
  const args = [`--fsize=${DOCUMENT_LIMITS.normalizedPdfBytes}:${DOCUMENT_LIMITS.normalizedPdfBytes}`,"--","soffice",
    `-env:UserInstallation=${process.platform === "win32" ? `file://${linuxProfile}` : pathToFileURL(profile).href}`,
    "--headless","--nologo","--norestore","--nodefault","--convert-to",kind === "docx" ? "pdf:writer_pdf_Export" : "pdf:impress_pdf_Export",
    "--outdir",linuxScratch,linuxScratchPath(sourcePath)];
  const command = process.platform === "win32" ? "wsl.exe" : "prlimit";
  const commandArgs = process.platform === "win32" ? ["-d",process.env.ABSTRUCK_WSL_DISTRIBUTION ?? "Ubuntu-24.04","--exec","env","-i",
    "PATH=/usr/bin:/bin",`HOME=${linuxScratch}`,`TMPDIR=${linuxScratch}`,"LANG=C.UTF-8","prlimit",...args] : args;
  await runCommand(command,commandArgs,{ cwd:scratch,env:subprocessEnvironment(scratch),timeoutMs:DOCUMENT_LIMITS.conversionMs,outputLimitBytes:65_536 });
}

export async function extractDocument(input: string): Promise<ExtractedDocument> {
  const started = Date.now();
  const kind = documentKind(input);
  const source = await readBoundedFile(resolve(input), DOCUMENT_LIMITS.inputBytes);
  const inputHash = sha256(source);
  validateSignature(source, kind);
  if (kind !== "pdf" && !["linux","win32"].includes(process.platform)) throw new ProbeError("office_conversion_requires_linux");
  return withScratch(async (scratch) => {
    const environment = subprocessEnvironment(scratch);
    const sourcePath = join(scratch, `source.${kind}`);
    await writeFile(sourcePath, source, { flag: "wx" });
    const pdfPath = join(scratch, "source.pdf");
    if (kind !== "pdf") {
      await convertOffice(sourcePath,scratch,kind);
    }
    const pdf = await readBoundedFile(pdfPath, DOCUMENT_LIMITS.normalizedPdfBytes);
    validateSignature(pdf, "pdf");
    let info: string;
    try {
      info = await runCommand("pdfinfo", [pdfPath], {
        cwd: scratch, env: environment, timeoutMs: 15_000, outputLimitBytes: 65_536,
      });
    } catch (error) {
      if (error instanceof ProbeError && error.code === "command_failed") throw new ProbeError("invalid_or_password_protected_pdf");
      throw error;
    }
    const pageCount = parsePdfPageCount(info);
    const extracted = await runCommand("pdftotext", [
      "-f", "1", "-l", String(pageCount), "-enc", "UTF-8", "-eol", "unix", pdfPath, "-",
    ], { cwd: scratch, env: environment, timeoutMs: DOCUMENT_LIMITS.extractionMs, outputLimitBytes: DOCUMENT_LIMITS.textBytes });
    const pages = separatePages(extracted, pageCount);
    const fixture = fixtures.find((item) => item.hash === inputHash);
    const fixtureEvidence = fixture ? {
      id: fixture.id, matchedBy: "source_sha256", expectedPages: 2, pageCountMatches: pageCount === 2,
      anchors: fixture.anchors.map((anchor, index) => ({
        page: index + 1, matched: (pages[index] ?? "").replace(/\s+/g, " ").includes(anchor),
      })),
    } : null;
    const fixtureMismatch = fixtureEvidence !== null &&
      (!fixtureEvidence.pageCountMatches || fixtureEvidence.anchors.some((anchor) => !anchor.matched));
    return { pages, normalizedPdf: pdf, evidence: {
      kind: "document_extraction",
      status: fixtureMismatch ? "failed" : pages.some(needsVisualExtraction) ? "ocr_required" : "extracted",
      reason: fixtureMismatch ? "fixture_expectation_mismatch" : null,
      recordedAt: new Date().toISOString(), sourceKind: kind, sourceBytes: source.length, sourceSha256: inputHash,
      normalizedPdfSha256: sha256(pdf), normalizedPdfBytes: pdf.length, pageCount,
      locator: kind === "pdf" ? "original_pdf_page" : "normalized_pdf_page",
      pages: pages.map((text, index) => ({
        page: index + 1, characters: text.length, utf8Bytes: Buffer.byteLength(text),
        sha256: sha256(text), needsOcr: needsVisualExtraction(text),
      })),
      fixture: fixtureEvidence,
      textNormalization: "UTF-8; LF line endings; outer whitespace trimmed per page",
      limits: DOCUMENT_LIMITS, elapsedMs: Date.now() - started, scratchRemoved: true,
      ocr: "not_tested", renderingFidelity: "requires_visual_review", productionPipeline: "not_tested",
    } };
  });
}

export async function inspectDocument(input: string): Promise<DocumentEvidence> {
  return (await extractDocument(input)).evidence;
}

