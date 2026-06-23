import { describe, it, expect } from "vitest";
import { SdsExtractionSchema, SDS_SECTION_LABELS, EXTRACTION_PROMPT } from "@/lib/sds/schema";

// Fields are required-but-nullable (strict structured outputs), so the model
// always returns every section key — null when absent. Tests build on a
// fully-null base that mirrors that shape.
const allNull = () =>
  Object.fromEntries(Object.keys(SDS_SECTION_LABELS).map((k) => [k, null]));

describe("SdsExtractionSchema", () => {
  it("accepts a fully-null extraction (sparse SDS)", () => {
    const parsed = SdsExtractionSchema.safeParse(allNull());
    expect(parsed.success).toBe(true);
  });

  it("accepts a populated identification section", () => {
    const sample = {
      ...allNull(),
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

  it("requires every section key (strict structured outputs)", () => {
    // Omitting a section now fails — the model must return all keys.
    const missingSections = { identification: null };
    expect(SdsExtractionSchema.safeParse(missingSections).success).toBe(false);
  });

  it("accepts an array element with null fields (absent data)", () => {
    const sample = {
      ...allNull(),
      composition: {
        components: [
          { name: "Water", casNumber: "7732-18-5", ecNumber: null, concentration: null },
        ],
      },
    };
    expect(SdsExtractionSchema.safeParse(sample).success).toBe(true);
  });
});
