import type { SdsExtraction } from "@/lib/sds/schema";

export type ProviderName = "claude" | "gemini";

export interface ProviderSuccess {
  ok: true;
  data: SdsExtraction;
  model: string;
  latencyMs: number;
}

export interface ProviderFailure {
  ok: false;
  error: string;
}

export type ProviderResult = ProviderSuccess | ProviderFailure;
