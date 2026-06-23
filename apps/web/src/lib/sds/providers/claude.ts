import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk";
import { z } from "zod";
import { SdsExtractionSchema, EXTRACTION_PROMPT } from "@/lib/sds/schema";
import type { ProviderResult } from "@/lib/sds/providers/types";

// Bedrock's grammar-constrained structured outputs (output_config.format / strict
// tools) cap optional (≤24) and union-typed (≤16) parameters. This 16-section GHS
// schema has ~98 nullable fields and exceeds both. We instead instruct Claude to
// emit JSON matching the schema and validate it client-side with Zod — the same
// approach the Gemini provider uses. No grammar compilation, no limits.
const RESPONSE_JSON_SCHEMA = JSON.stringify(z.toJSONSchema(SdsExtractionSchema));

// Claude occasionally wraps JSON in a ```json fence despite instructions.
function stripJsonFence(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : raw).trim();
}

export async function extractWithClaude(text: string): Promise<ProviderResult> {
  const model =
    process.env.CLAUDE_MODEL ?? "us.anthropic.claude-haiku-4-5-20251001-v1:0";
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
      return { ok: false, error: "Claude response could not be parsed as JSON." };
    }
    if (!parsed.success) {
      return { ok: false, error: "Claude output failed schema validation." };
    }
    return { ok: true, data: parsed.data, model, latencyMs: Date.now() - start };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Claude error: ${msg}` };
  }
}
