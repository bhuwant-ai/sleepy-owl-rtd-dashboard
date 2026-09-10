import { describe, it, expect } from "vitest";
import { parseInventoryTab } from "../parse";
import { LOW_SHELF_FIELDS } from "../../data/source";

// A tiny Low Shelf Life sheet: one sellable batch, one "Non Sellable" batch,
// and one expired batch (negative remaining shelf life).
const CSV = [
  "Remarks,SKU,Categories,MFD,EXP,Batch No,Total Shelf Life(Days),Remaining (days),Closing Inventory No. of Boxes,Location,Description",
  "Low Shelf Life,CCC-CLA-230-CAN-C24,RTD Can,01-Jun-2026,01-Mar-2027,B1,273,200,10,A05,Classic",
  "Non Sellable,CCC-CLA-230-CAN-C24,RTD Can,01-Jun-2026,01-Mar-2027,B2,273,50,20,A06,Classic",
  ",CCC-CLA-230-CAN-C24,RTD Can,01-Jan-2026,01-Feb-2026,B3,31,-5,30,A07,Classic",
].join("\n");

describe("Low Shelf Life exclusions", () => {
  const res = parseInventoryTab(CSV, "LOW_SHELF_LIFE", "JWL", LOW_SHELF_FIELDS);

  it("keeps only the sellable, in-date batch", () => {
    expect(res.data.length).toBe(1);
    expect(res.data[0].batchNo).toBe("B1");
    expect(res.data[0].cases).toBe(10);
  });

  it("excludes Non Sellable stock", () => {
    expect(res.issues.some((i) => i.code === "EXCLUDED_NON_SELLABLE")).toBe(true);
  });

  it("excludes expired stock with negative shelf life", () => {
    expect(res.issues.some((i) => i.code === "EXCLUDED_NEGATIVE_SHELF_LIFE")).toBe(true);
  });
});
