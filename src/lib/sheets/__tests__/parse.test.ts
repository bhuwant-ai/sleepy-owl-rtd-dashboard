import { describe, it, expect } from "vitest";
import { parseInventoryTab } from "../parse";
import { LOW_SHELF_FIELDS, JWL_FIELDS } from "../../data/source";

// A tiny Low Shelf Life sheet: one sellable batch, one "Non Sellable" batch,
// one expired batch (negative remaining), and one at exactly 0% (boundary).
const LOW_CSV = [
  "Remarks,SKU,Categories,MFD,EXP,Batch No,Total Shelf Life(Days),Remaining (days),Closing Inventory No. of Boxes,Location,Description",
  "Low Shelf Life,CCC-CLA-230-CAN-C24,RTD Can,01-Jun-2026,01-Mar-2027,B1,273,200,10,A05,Classic",
  "Non Sellable,CCC-CLA-230-CAN-C24,RTD Can,01-Jun-2026,01-Mar-2027,B2,273,50,20,A06,Classic",
  ",CCC-CLA-230-CAN-C24,RTD Can,01-Jan-2026,01-Feb-2026,B3,31,-5,30,A07,Classic",
  "Low Shelf Life,CCC-CLA-230-CAN-C24,RTD Can,01-Jan-2026,10-Jan-2026,B4,9,0,40,A08,Classic",
].join("\n");

describe("Low Shelf Life exclusions", () => {
  const res = parseInventoryTab(LOW_CSV, "LOW_SHELF_LIFE", "JWL", LOW_SHELF_FIELDS);

  it("keeps only the sellable, in-date batch", () => {
    expect(res.data.length).toBe(1);
    expect(res.data[0].batchNo).toBe("B1");
    expect(res.data[0].cases).toBe(10);
  });

  it("excludes Non Sellable stock", () => {
    expect(res.issues.some((i) => i.code === "EXCLUDED_NON_SELLABLE")).toBe(true);
  });

  it("excludes expired stock (negative and 0% shelf life)", () => {
    expect(res.issues.some((i) => i.code === "EXCLUDED_EXPIRED")).toBe(true);
  });
});

// JWL Racks has no Remarks column, but must still drop 0%/expired stock.
const JWL_CSV = [
  "Inward Date,SKU,Categories,MFD,EXP,Batch No.,Total Shelf Life(Days),Remaining (days),Shelf Life %,Closing Inventory No. Of boxes,Location,Description",
  "Audit,CCC-HAZ-230-CAN-C24,RTD Can,05-Aug-2026,05-May-2027,H1,273,237,87%,50,A05,Hazelnut",
  "Audit,CCC-VIE-230-CAN-C24,RTD Can,,,V1,,-46275,0%,120,A06,Vietnamese",
].join("\n");

describe("JWL Racks expired exclusion", () => {
  const res = parseInventoryTab(JWL_CSV, "JWL_RACKS", "JWL", JWL_FIELDS);

  it("keeps the in-date batch and drops the 0% batch", () => {
    expect(res.data.length).toBe(1);
    expect(res.data[0].sku).toBe("CCC-HAZ-230-CAN-C24");
    expect(res.issues.some((i) => i.code === "EXCLUDED_EXPIRED")).toBe(true);
  });
});
