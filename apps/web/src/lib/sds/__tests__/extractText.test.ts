import { describe, it, expect, vi } from "vitest";

// Mock unpdf so the test doesn't need a real PDF binary.
vi.mock("unpdf", () => ({
  extractText: vi.fn(async () => ({ totalPages: 1, text: ["Hello SDS world ".repeat(20)] })),
  getDocumentProxy: vi.fn(async (d: Uint8Array) => d),
}));

import { extractText, MIN_TEXT_CHARS } from "@/lib/sds/extractText";

describe("extractText", () => {
  it("joins page text and reports char count", async () => {
    const result = await extractText(new Uint8Array([1, 2, 3]));
    expect(result.chars).toBeGreaterThan(MIN_TEXT_CHARS);
    expect(result.isLikelyScanned).toBe(false);
    expect(result.text).toContain("Hello SDS world");
  });
});
