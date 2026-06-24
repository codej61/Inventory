import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import { z } from "zod";
import { SdsExtractionSchema, EXTRACTION_PROMPT } from "@/lib/sds/schema";
import type { ProviderResult } from "@/lib/sds/providers/types";

const RESPONSE_JSON_SCHEMA = JSON.stringify(
  z.toJSONSchema(SdsExtractionSchema),
);

// Claude occasionally wraps JSON in a ```json fence despite instructions.
function stripJsonFence(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : raw).trim();
}

export async function extractWithClaude(text: string): Promise<ProviderResult> {
  // `||` (not `??`) so an empty CLAUDE_MODEL="" falls back to the default.
  const model =
    process.env.CLAUDE_MODEL || "us.anthropic.claude-haiku-4-5-20251001-v1:0";
  if (!process.env.AWS_ACCESS_KEY_ID) {
    return { ok: false, error: "AWS_ACCESS_KEY_ID is not set." };
  }
  const client = new AnthropicBedrock();
  const start = Date.now();
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 16000,
      messages: [
        {
          role: "user",
          content: `${EXTRACTION_PROMPT}\n\nReturn ONLY a JSON object matching this JSON Schema. No prose, no markdown fences.\n${RESPONSE_JSON_SCHEMA}\n\n--- SDS TEXT ---\n${text}`,
        },
      ],
    });
    const raw = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
    if (!raw) {
      return { ok: false, error: "Claude returned no text content." };
    }
    let parsed;
    try {
      parsed = SdsExtractionSchema.safeParse(JSON.parse(stripJsonFence(raw)));
    } catch {
      return {
        ok: false,
        error: "Claude response could not be parsed as JSON.",
      };
    }
    if (!parsed.success) {
      return { ok: false, error: "Claude output failed schema validation." };
    }
    const u = response.usage;
    const usage = {
      input: u?.input_tokens ?? 0,
      output: u?.output_tokens ?? 0,
      ...(u?.cache_read_input_tokens
        ? { cachedInput: u.cache_read_input_tokens }
        : {}),
    };
    return {
      ok: true,
      data: parsed.data,
      model,
      latencyMs: Date.now() - start,
      usage,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Claude error: ${msg}` };
  }
}
