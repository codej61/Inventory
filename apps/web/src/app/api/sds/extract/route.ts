import { extractText, MIN_TEXT_CHARS } from "@/lib/sds/extractText";
import { extractWithClaude } from "@/lib/sds/providers/claude";
import { extractWithGemini } from "@/lib/sds/providers/gemini";
import type { ProviderName, ProviderResult } from "@/lib/sds/providers/types";
import {
  getLangfuse,
  flushTracing,
  generationEndBody,
} from "@/lib/sds/observability";

export const runtime = "nodejs";
export const MAX_BYTES = 20 * 1024 * 1024;

const RUNNERS: Record<ProviderName, (text: string) => Promise<ProviderResult>> = {
  claude: extractWithClaude,
  gemini: extractWithGemini,
};

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return Response.json({ error: "File must be a PDF." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "PDF exceeds the 20 MB limit." }, { status: 400 });
  }

  const requested = String(form.get("providers") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter((p): p is ProviderName => p === "claude" || p === "gemini");
  if (requested.length === 0) {
    return Response.json({ error: "Select at least one provider." }, { status: 400 });
  }

  const trace = getLangfuse()?.trace({
    name: "sds-extraction",
    tags: ["sds", "ghs-16-section"],
    metadata: {
      filename: file.name,
      fileSizeBytes: file.size,
      providersRequested: requested,
    },
  });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const extractSpan = trace?.span({ name: "extract-text" });
  const { text, chars, isLikelyScanned } = await extractText(bytes);
  extractSpan?.end({
    output: { chars, isLikelyScanned },
    metadata: { chars, isLikelyScanned },
  });
  trace?.update({ metadata: { textChars: chars, isLikelyScanned } });

  const warnings: string[] = [];
  if (isLikelyScanned) {
    warnings.push(
      `Extracted only ${chars} characters (< ${MIN_TEXT_CHARS}). The PDF appears to be scanned/image-only; OCR is not supported.`,
    );
    await flushTracing();
    return Response.json({
      providers: {},
      meta: { textChars: chars, warnings, traceId: trace?.id },
    });
  }

  const results = await Promise.all(
    requested.map(async (name) => {
      const generation = trace?.generation({
        name: `${name}-extract`,
        input: text,
      });
      let result: ProviderResult;
      try {
        result = await RUNNERS[name](text);
      } catch (e) {
        result = { ok: false, error: String(e) };
      }
      generation?.end(generationEndBody(result));
      return [name, result] as const;
    }),
  );
  const providers = Object.fromEntries(results) as Partial<Record<ProviderName, ProviderResult>>;

  await flushTracing();
  return Response.json({
    providers,
    meta: { textChars: chars, warnings, traceId: trace?.id },
  });
}
