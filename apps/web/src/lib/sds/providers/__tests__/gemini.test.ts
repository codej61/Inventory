import { describe, it, expect, vi, beforeEach } from "vitest";

const generateContentMock = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock };
  },
}));

import { extractWithGemini } from "@/lib/sds/providers/gemini";
import { SDS_SECTION_LABELS } from "@/lib/sds/schema";

// Strict structured outputs: every section key is required (null when absent).
const allNullSections = () =>
  Object.fromEntries(Object.keys(SDS_SECTION_LABELS).map((k) => [k, null]));

describe("extractWithGemini", () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    process.env.GOOGLE_API_KEY = "test-key";
  });

  it("returns ok with parsed+validated data on success", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify(allNullSections()),
    });
    const result = await extractWithGemini("sds text");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBeDefined();
      expect(result.model).toBe("gemini-2.5-flash-lite");
      expect(typeof result.latencyMs).toBe("number");
    }
  });

  it("captures token usage from usageMetadata", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify(allNullSections()),
      usageMetadata: {
        promptTokenCount: 1200,
        candidatesTokenCount: 350,
        cachedContentTokenCount: 800,
      },
    });
    const result = await extractWithGemini("sds text");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.usage).toEqual({ input: 1200, output: 350, cachedInput: 800 });
    }
  });

  it("defaults usage to zero when usageMetadata is absent", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify(allNullSections()),
    });
    const result = await extractWithGemini("sds text");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.usage).toEqual({ input: 0, output: 0 });
  });

  it("returns a failure when the key is missing", async () => {
    delete process.env.GOOGLE_API_KEY;
    const result = await extractWithGemini("text");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/GOOGLE_API_KEY/);
  });

  it("returns a failure when the response is not valid JSON", async () => {
    generateContentMock.mockResolvedValue({ text: "not json" });
    const result = await extractWithGemini("text");
    expect(result.ok).toBe(false);
  });

  it("returns a failure when valid JSON fails schema validation", async () => {
    generateContentMock.mockResolvedValue({ text: JSON.stringify({ identification: "not-an-object" }) });
    const result = await extractWithGemini("text");
    expect(result.ok).toBe(false);
  });
});
