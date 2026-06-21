import { extractText, MIN_TEXT_CHARS } from "@/lib/sds/extractText";
import { extractWithClaude } from "@/lib/sds/providers/claude";
import { extractWithGemini } from "@/lib/sds/providers/gemini";
import type { ProviderName, ProviderResult } from "@/lib/sds/providers/types";

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

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { text, chars, isLikelyScanned } = await extractText(bytes);

  const warnings: string[] = [];
  if (isLikelyScanned) {
    warnings.push(
      `Extracted only ${chars} characters (< ${MIN_TEXT_CHARS}). The PDF appears to be scanned/image-only; OCR is not supported.`,
    );
    return Response.json({ providers: {}, meta: { textChars: chars, warnings } });
  }

  const settled = await Promise.all(
    requested.map(async (name) => [name, await RUNNERS[name](text)] as const),
  );
  const providers = Object.fromEntries(settled) as Partial<Record<ProviderName, ProviderResult>>;

  return Response.json({ providers, meta: { textChars: chars, warnings } });
}
