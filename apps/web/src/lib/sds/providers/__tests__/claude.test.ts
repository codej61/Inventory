import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();
vi.mock("@anthropic-ai/bedrock-sdk", () => ({
  AnthropicBedrock: class {
    messages = { create: createMock };
  },
}));

import { extractWithClaude } from "@/lib/sds/providers/claude";
import { SDS_SECTION_LABELS } from "@/lib/sds/schema";

// Provider now prompts for JSON and validates client-side, so the mocked
// response must be a text block whose JSON satisfies the (strict) schema —
// every section key present, null when absent.
const allNullSections = () =>
  Object.fromEntries(Object.keys(SDS_SECTION_LABELS).map((k) => [k, null]));

const textResponse = (text: string) => ({ content: [{ type: "text", text }] });

describe("extractWithClaude", () => {
  beforeEach(() => {
    createMock.mockReset();
    process.env.AWS_ACCESS_KEY_ID = "test-key";
  });

  it("returns ok with parsed+validated data on success", async () => {
    const data = allNullSections();
    createMock.mockResolvedValue(textResponse(JSON.stringify(data)));
    const result = await extractWithClaude("some sds text");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model).toBe("us.anthropic.claude-haiku-4-5-20251001-v1:0");
      expect(result.data).toEqual(data);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("captures token usage from the response", async () => {
    createMock.mockResolvedValue({
      ...textResponse(JSON.stringify(allNullSections())),
      usage: {
        input_tokens: 2000,
        output_tokens: 600,
        cache_read_input_tokens: 1500,
      },
    });
    const result = await extractWithClaude("some sds text");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.usage).toEqual({ input: 2000, output: 600, cachedInput: 1500 });
    }
  });

  it("defaults usage to zero when the response omits it", async () => {
    createMock.mockResolvedValue(textResponse(JSON.stringify(allNullSections())));
    const result = await extractWithClaude("some sds text");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.usage).toEqual({ input: 0, output: 0 });
  });

  it("strips a ```json markdown fence before parsing", async () => {
    const data = allNullSections();
    createMock.mockResolvedValue(
      textResponse("```json\n" + JSON.stringify(data) + "\n```"),
    );
    const result = await extractWithClaude("some sds text");
    expect(result.ok).toBe(true);
  });

  it("returns a failure when the key is missing", async () => {
    delete process.env.AWS_ACCESS_KEY_ID;
    const result = await extractWithClaude("text");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/AWS_ACCESS_KEY_ID/);
  });

  it("returns a failure when the response is not valid JSON", async () => {
    createMock.mockResolvedValue(textResponse("not json"));
    const result = await extractWithClaude("text");
    expect(result.ok).toBe(false);
  });

  it("returns a failure when valid JSON fails schema validation", async () => {
    createMock.mockResolvedValue(
      textResponse(JSON.stringify({ identification: "not-an-object" })),
    );
    const result = await extractWithClaude("text");
    expect(result.ok).toBe(false);
  });

  it("returns a failure when the SDK throws", async () => {
    createMock.mockRejectedValue(new Error("boom"));
    const result = await extractWithClaude("text");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/boom/);
  });
});
