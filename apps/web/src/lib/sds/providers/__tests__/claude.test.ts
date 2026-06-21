import { describe, it, expect, vi, beforeEach } from "vitest";

const parseMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { parse: parseMock };
  },
}));

import { extractWithClaude } from "@/lib/sds/providers/claude";

describe("extractWithClaude", () => {
  beforeEach(() => {
    parseMock.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it("returns ok with parsed data on success", async () => {
    parseMock.mockResolvedValue({
      parsed_output: { identification: null, hazardsIdentification: null },
    });
    const result = await extractWithClaude("some sds text");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.model).toBe("claude-haiku-4-5");
  });

  it("returns a failure when the key is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await extractWithClaude("text");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("returns a failure when the SDK throws", async () => {
    parseMock.mockRejectedValue(new Error("boom"));
    const result = await extractWithClaude("text");
    expect(result.ok).toBe(false);
  });
});
