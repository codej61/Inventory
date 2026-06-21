import { describe, it, expect, vi, beforeEach } from "vitest";

const generateContentMock = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock };
  },
}));

import { extractWithGemini } from "@/lib/sds/providers/gemini";

describe("extractWithGemini", () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    process.env.GOOGLE_API_KEY = "test-key";
  });

  it("returns ok with parsed+validated data on success", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ identification: null, hazardsIdentification: null }),
    });
    const result = await extractWithGemini("sds text");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBeDefined();
      expect(result.model).toBe("gemini-2.5-flash-lite");
      expect(typeof result.latencyMs).toBe("number");
    }
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
