import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  DOCUMENT_LIMITS, documentKind, extractPastedText, inspectDocument, parsePdfPageCount,
  needsVisualExtraction, readBoundedFile, separatePages, validateSignature,
} from "../dist/document.js";
import { runCommand } from "../dist/process.js";

const fixtureRoot = process.env.ABSTRUCK_FIXTURE_ROOT ??
  fileURLToPath(new URL("../../../test/feasibility/fixtures/", import.meta.url));

test("pasted text keeps paragraph order and rejects invalid or oversized sources", () => {
  assert.deepEqual(extractPastedText(Buffer.from("First paragraph\r\n\r\nSecond paragraph.")), ["First paragraph", "Second paragraph."]);
  assert.throws(() => extractPastedText(Buffer.alloc(100001)), /text_size_limit/);
  assert.throws(() => extractPastedText(Buffer.from([0xff])), /invalid_text_encoding/);
  assert.throws(() => extractPastedText(Buffer.from("First\u0000paragraph")), /invalid_text_content/);
  assert.throws(() => extractPastedText(Buffer.from(Array(201).fill("Paragraph").join("\n\n"))), /text_paragraph_limit/);
});

test("CLI fails known-fixture anchor/page-count mismatches while retaining safe evidence", async (context) => {
  const source = join(fixtureRoot, "greenhouse.pdf");
  try { await readFile(source); }
  catch { context.skip("Synthetic fixtures are not mounted"); return; }
  const processModule = new URL("../dist/process.js", import.meta.url).href;
  const cliModule = new URL("../dist/cli.js", import.meta.url).href;
  const correctPages = [
    "Group B received 400 mL of water per day.",
    "The difference in mean height was 6 cm.",
  ];
  for (const pages of [["Wrong first-page extraction", correctPages[1]], [...correctPages, "Unexpected third page"]]) {
    const script = `
      import { mock } from 'node:test';
      const original = await import(${JSON.stringify(processModule)});
      const pages = ${JSON.stringify(pages)};
      mock.module(${JSON.stringify(processModule)}, { exports: {
        ...original,
        runCommand: async (command) => {
          if (command === 'pdfinfo') return 'Pages: ' + pages.length + '\\nEncrypted: no\\n';
          if (command === 'pdftotext') return pages.join('\\f') + '\\f';
          throw new Error('Unexpected subprocess in test');
        },
      }});
      process.argv = [process.execPath, 'cli.js', 'document', ${JSON.stringify(source)}];
      await import(${JSON.stringify(cliModule)});
    `;
    const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--input-type=module", "-e", script], {
      encoding: "utf8", timeout: 10_000, maxBuffer: 65_536, windowsHide: true, shell: false,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
    const evidence = JSON.parse(result.stdout);
    assert.equal(evidence.status, "failed");
    assert.equal(evidence.reason, "fixture_expectation_mismatch");
    assert.equal(evidence.fixture.id, "F-PDF-01");
    assert.equal(evidence.pages.length, pages.length);
    assert.equal(evidence.scratchRemoved, true);
    assert.equal(evidence.sourceSha256, "3ee7b538b245e407a6637f2519a6312699d296f1b41c53300040a756d9301531");
    assert.equal(evidence.fixture.pageCountMatches, pages.length === 2);
    if (pages.length === 2) assert.equal(evidence.fixture.anchors[0].matched, false);
    assert.equal(result.stdout.includes("Wrong first-page extraction"), false);
  }
});

test("document admission rejects unsupported extensions and disguised bytes", () => {
  assert.equal(documentKind("SAMPLE.PDF"), "pdf");
  for (const name of ["file.docm", "file.html", "file.zip", "file.pdf.exe"]) {
    assert.throws(() => documentKind(name), /unsupported_type/);
  }
  assert.throws(() => validateSignature(Buffer.from("<html>private content</html>"), "pdf"), /file_signature_mismatch/);
  assert.throws(() => validateSignature(Buffer.from("not a ZIP package"), "docx"), /file_signature_mismatch/);
});

test("page admission rejects encrypted and over-limit documents before extraction", () => {
  assert.equal(parsePdfPageCount("Pages: 200\nEncrypted: no\n"), 200);
  for (const metadata of ["Pages: 201\n", "Pages: 0\n", "Pages: unknown\n", "Title: private"]) {
    assert.throws(() => parsePdfPageCount(metadata), /document_page_limit/);
  }
  assert.throws(() => parsePdfPageCount("Pages: 2\nEncrypted: yes (copy:no)"), /encrypted_document/);
});

test("page references retain blank pages and reject missing separators/oversized text", () => {
  assert.deepEqual(separatePages("First page\r\n\f\fThird page\n\f", 3), ["First page", "", "Third page"]);
  assert.throws(() => separatePages("Two pages accidentally merged", 2), /page_locator_mismatch/);
  assert.throws(() => separatePages("x".repeat(DOCUMENT_LIMITS.textBytes + 1), 1), /document_text_limit/);
});

test("damaged PDF font mappings require visual extraction instead of readable native text", () => {
  for (const text of ["", " \n\t", "f(x) = x\ufffd", "Integral \u0001 dx", "Value \ue001", "x(cid:42) + 1"]) {
    assert.equal(needsVisualExtraction(text), true);
  }
  for (const text of ["First page\nSecond line\t20", "Niño: 6 oras", "f(x) = x² + α; ∫ x dx = x²/2"]) {
    assert.equal(needsVisualExtraction(text), false);
  }
});

test("UTF-8 characters survive subprocess chunk boundaries", async () => {
  const output = await runCommand(process.execPath, ["-e",
    "process.stdout.write(Buffer.from([0xc3]));setTimeout(()=>process.stdout.write(Buffer.from([0xb1])),25)",
  ], { timeoutMs: 5000 });
  assert.equal(output, "ñ");
});

test("office fixtures satisfy package admission; inflated/invalid archives fail", async (context) => {
  let docx;
  try { docx = await readFile(join(fixtureRoot, "greenhouse.docx")); }
  catch { context.skip("Synthetic fixtures are not mounted"); return; }
  validateSignature(docx, "docx");
  validateSignature(await readFile(join(fixtureRoot, "greenhouse.pptx")), "pptx");
  assert.throws(() => validateSignature(docx, "pptx"), /file_signature_mismatch/);
  const inflated = Buffer.from(docx);
  const directory = inflated.readUInt32LE(inflated.length - 6);
  inflated.writeUInt32LE(100_000_001, directory + 24);
  assert.throws(() => validateSignature(inflated, "docx"), /office_archive_limit/);
  const understated = Buffer.from(docx);
  understated.writeUInt32LE(1, directory + 24);
  assert.throws(() => validateSignature(understated, "docx"), /office_archive_limit|office_archive_size_mismatch/);
  assert.throws(() => validateSignature(docx.subarray(0, 100), "docx"), /invalid_office_archive/);
  await assert.rejects(readBoundedFile(join(fixtureRoot, "greenhouse.pdf"), 10), /document_size_limit/);
});

test("actual Poppler extraction preserves known page anchors without exposing text", async (context) => {
  try {
    await readFile(join(fixtureRoot, "greenhouse.pdf"));
    await runCommand("pdfinfo", ["-v"], { timeoutMs: 5000 });
    await runCommand("pdftotext", ["-v"], { timeoutMs: 5000 });
  } catch { context.skip("Requires local Poppler tools and synthetic fixtures"); return; }
  const evidence = await inspectDocument(join(fixtureRoot, "greenhouse.pdf"));
  assert.equal(evidence.sourceSha256, "3ee7b538b245e407a6637f2519a6312699d296f1b41c53300040a756d9301531");
  assert.equal(evidence.pageCount, 2);
  assert.equal(evidence.fixture.id, "F-PDF-01");
  assert.ok(evidence.fixture.anchors.every((anchor) => anchor.matched));
  assert.deepEqual(evidence.pages.map((page) => page.page), [1, 2]);
  assert.ok(evidence.pages.every((page) => page.characters > 0 && /^[a-f0-9]{64}$/.test(page.sha256)));
  assert.equal(evidence.scratchRemoved, true);
  assert.equal(JSON.stringify(evidence).includes("Group B received"), false);
  await assert.rejects(inspectDocument(join(fixtureRoot, "malformed.pdf")), /invalid_or_password_protected_pdf/);
  await assert.rejects(inspectDocument(join(fixtureRoot, "disguised.pdf")), /file_signature_mismatch/);
  await assert.rejects(inspectDocument(join(fixtureRoot, "unsupported.html")), /unsupported_type/);
});

