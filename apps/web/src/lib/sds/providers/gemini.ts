import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { SdsExtractionSchema, EXTRACTION_PROMPT } from "@/lib/sds/schema";
import type { ProviderResult } from "@/lib/sds/providers/types";

const RESPONSE_JSON_SCHEMA = z.toJSONSchema(SdsExtractionSchema) as Record<string, unknown>;

export async function extractWithGemini(text: string): Promise<ProviderResult> {
  if (!process.env.GOOGLE_API_KEY) {
    return { ok: false, error: "GOOGLE_API_KEY is not set." };
  }
  // Read model env var per-call so it is overridable in tests.
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";
  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
  const start = Date.now();
  try {
    const response = await ai.models.generateContent({
      model,
      contents: `${EXTRACTION_PROMPT}\n\n--- SDS TEXT ---\n${text}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_JSON_SCHEMA,
      },
    });
    const raw = response.text;
    if (!raw) return { ok: false, error: "Gemini returned an empty response." };
    let parsed;
    try {
      parsed = SdsExtractionSchema.safeParse(JSON.parse(raw));
    } catch {
      return { ok: false, error: "Gemini response could not be parsed as JSON." };
    }
    if (!parsed.success) {
      return { ok: false, error: "Gemini output failed schema validation." };
    }
    return { ok: true, data: parsed.data, model, latencyMs: Date.now() - start };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Gemini error: ${msg}` };
  }
}
