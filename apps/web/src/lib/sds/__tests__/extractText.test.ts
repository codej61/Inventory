import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock unpdf so the test doesn't need a real PDF binary.
vi.mock("unpdf", () => ({
  extractText: vi.fn(async () => ({ totalPages: 1, text: ["Hello SDS world ".repeat(20)] } as any)),
  getDocumentProxy: vi.fn(async (d: Uint8Array) => d),
}));

import * as unpdf from "unpdf";
import { extractText, MIN_TEXT_CHARS } from "@/lib/sds/extractText";

describe("extractText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("joins page text and reports char count", async () => {
    vi.mocked(unpdf.extractText).mockResolvedValueOnce({ totalPages: 1, text: ["Hello SDS world ".repeat(20)] } as any);
    const result = await extractText(new Uint8Array([1, 2, 3]));
    expect(result.chars).toBeGreaterThan(MIN_TEXT_CHARS);
    expect(result.isLikelyScanned).toBe(false);
    expect(result.text).toContain("Hello SDS world");
  });

  it("marks a low-text PDF as likely scanned", async () => {
    vi.mocked(unpdf.extractText).mockResolvedValueOnce({ totalPages: 1, text: ["short"] } as any);
    const result = await extractText(new Uint8Array([1]));
    expect(result.chars).toBeLessThan(MIN_TEXT_CHARS);
    expect(result.isLikelyScanned).toBe(true);
  });

  it("calls unpdf with mergePages: false", async () => {
    vi.mocked(unpdf.extractText).mockResolvedValueOnce({ totalPages: 1, text: ["Hello SDS world ".repeat(20)] } as any);
    await extractText(new Uint8Array([1, 2, 3]));
    expect(vi.mocked(unpdf.extractText)).toHaveBeenCalledWith(expect.anything(), { mergePages: false });
  });
});
