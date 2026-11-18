import assert from "node:assert/strict";
import { test } from "node:test";
import { ocrPageText, validateOcrPage } from "../dist/ocr.js";

const page = {
  pageNumber: 2, status: "partial", text: "Visible text. [unreadable]",
  tables: [{ headers: ["Group", "Height"], rows: [["A", "12 cm"]] }],
  formulas: ["18 - 12 = 6 cm"], unreadableRegions: ["Lower-right damaged region"],
};

test("OCR retains original page, tables, formulas and explicit unreadable regions", () => {
  assert.deepEqual(validateOcrPage(page,2),page);
  assert.match(ocrPageText(page), /Group\tHeight\nA\t12 cm/);
  assert.match(ocrPageText(page), /18 - 12 = 6 cm/);
  assert.equal(ocrPageText({ ...page,status:"unreadable" }),"");
});

test("OCR rejects wrong pages, unflagged partial extraction and mismatched table cells", () => {
  assert.throws(() => validateOcrPage(page,1), /ocr_invalid_extraction/);
  assert.throws(() => validateOcrPage({ ...page,unreadableRegions:[] },2), /ocr_missing_readability_warning/);
  assert.throws(() => validateOcrPage({ ...page,status:"ready" },2), /ocr_invalid_readability/);
  assert.throws(() => validateOcrPage({ ...page,tables:[{ headers:["Group"],rows:[["A","12 cm"]] }] },2), /ocr_invalid_extraction/);
});
