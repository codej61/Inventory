import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { SdsExtractionSchema, EXTRACTION_PROMPT } from "@/lib/sds/schema";
import type { ProviderResult } from "@/lib/sds/providers/types";

export async function extractWithClaude(text: string): Promise<ProviderResult> {
  const model = process.env.CLAUDE_MODEL ?? "claude-haiku-4-5";
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "ANTHROPIC_API_KEY is not set." };
  }
  const client = new Anthropic();
  const start = Date.now();
  try {
    const response = await client.messages.parse({
      model,
      max_tokens: 16000,
      messages: [
        { role: "user", content: `${EXTRACTION_PROMPT}\n\n--- SDS TEXT ---\n${text}` },
      ],
      output_config: { format: zodOutputFormat(SdsExtractionSchema) },
    });
    if (!response.parsed_output) {
      return { ok: false, error: "Claude returned no structured output." };
    }
    return {
      ok: true,
      data: response.parsed_output,
      model,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Claude error: ${msg}` };
  }
}
