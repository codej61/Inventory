import { describe, it, expect } from "vitest";
import { SdsExtractionSchema, SDS_SECTION_LABELS, EXTRACTION_PROMPT } from "@/lib/sds/schema";

describe("SdsExtractionSchema", () => {
  it("accepts a fully-null extraction (sparse SDS)", () => {
    const empty = Object.fromEntries(
      Object.keys(SDS_SECTION_LABELS).map((k) => [k, null]),
    );
    const parsed = SdsExtractionSchema.safeParse(empty);
    expect(parsed.success).toBe(true);
  });

  it("accepts a populated identification section", () => {
    const sample = {
      identification: {
        productName: "Acetone",
        productCode: "A-100",
        recommendedUse: "Solvent",
        supplier: { name: "Acme", address: "1 St", phone: "555", emergencyPhone: "911" },
      },
    };
    const parsed = SdsExtractionSchema.safeParse(sample);
    expect(parsed.success).toBe(true);
  });

  it("exposes a label for every schema section", () => {
    const shapeKeys = Object.keys(SdsExtractionSchema.shape);
    for (const key of shapeKeys) {
      expect(SDS_SECTION_LABELS[key as keyof typeof SDS_SECTION_LABELS]).toBeTruthy();
    }
  });

  it("has a non-empty shared prompt", () => {
    expect(EXTRACTION_PROMPT.length).toBeGreaterThan(50);
  });
});
