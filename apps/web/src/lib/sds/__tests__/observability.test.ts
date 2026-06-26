import { describe, it, expect } from "vitest";
import { generationEndBody } from "@/lib/sds/observability";
import type { ProviderResult } from "@/lib/sds/providers/types";
import type { SdsExtraction } from "@/lib/sds/schema";

const emptyData = {} as SdsExtraction;

describe("generationEndBody", () => {
  it("maps a successful result to usageDetails + DEFAULT level", () => {
    const result: ProviderResult = {
      ok: true,
      data: emptyData,
      model: "gemini-2.5-flash-lite",
      latencyMs: 42,
      usage: { input: 1200, output: 350, cachedInput: 800 },
    };
    expect(generationEndBody(result)).toEqual({
      output: emptyData,
      model: "gemini-2.5-flash-lite",
      usageDetails: { input: 1200, output: 350, cache_read_input_tokens: 800 },
      level: "DEFAULT",
    });
  });

  it("omits cache_read_input_tokens when there is no cached input", () => {
    const result: ProviderResult = {
      ok: true,
      data: emptyData,
      model: "m",
      latencyMs: 1,
      usage: { input: 10, output: 5 },
    };
    expect(generationEndBody(result).usageDetails).toEqual({ input: 10, output: 5 });
  });

  it("maps a failure to ERROR level with statusMessage", () => {
    const result: ProviderResult = { ok: false, error: "boom" };
    expect(generationEndBody(result)).toEqual({
      output: { error: "boom" },
      level: "ERROR",
      statusMessage: "boom",
    });
  });
});
