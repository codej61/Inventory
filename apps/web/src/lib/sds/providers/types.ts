import type { SdsExtraction } from "@/lib/sds/schema";

export type ProviderName = "claude" | "gemini";

export interface TokenUsage {
  input: number;
  output: number;
  cachedInput?: number;
}

export interface ProviderSuccess {
  ok: true;
  data: SdsExtraction;
  model: string;
  latencyMs: number;
  usage: TokenUsage;
}

export interface ProviderFailure {
  ok: false;
  error: string;
}

export type ProviderResult = ProviderSuccess | ProviderFailure;
