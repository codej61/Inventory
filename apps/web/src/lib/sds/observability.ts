import { Langfuse } from "langfuse";
import type { ProviderResult } from "@/lib/sds/providers/types";

// Lazily-constructed singleton. Returns null when Langfuse is not configured
// so extraction keeps working without observability (CI, local, tests).
let client: Langfuse | null | undefined;

export function getLangfuse(): Langfuse | null {
  if (client !== undefined) return client;
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    client = null;
    return client;
  }
  client = new Langfuse({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASEURL,
  });
  return client;
}

// Serverless/route handlers must flush before the function returns, or queued
// events are dropped. Best-effort: never throw out of a flush.
export async function flushTracing(): Promise<void> {
  try {
    await getLangfuse()?.flushAsync();
  } catch {
    // observability must never break the request
  }
}

// Pure mapping from a provider result to the fields used to close its
// generation. Success → usage + DEFAULT level; failure → ERROR + message.
export function generationEndBody(result: ProviderResult) {
  if (result.ok) {
    return {
      output: result.data,
      model: result.model,
      usageDetails: {
        input: result.usage.input,
        output: result.usage.output,
        ...(result.usage.cachedInput
          ? { cache_read_input_tokens: result.usage.cachedInput }
          : {}),
      },
      level: "DEFAULT" as const,
    };
  }
  return {
    output: { error: result.error },
    level: "ERROR" as const,
    statusMessage: result.error,
  };
}
