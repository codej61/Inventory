import { extractText as unpdfExtractText, getDocumentProxy } from "unpdf";

export const MIN_TEXT_CHARS = 100;

export async function extractText(
  data: Uint8Array,
): Promise<{ text: string; chars: number; isLikelyScanned: boolean }> {
  const pdf = await getDocumentProxy(data);
  const { text } = await unpdfExtractText(pdf, { mergePages: false });
  const joined = (Array.isArray(text) ? text : [text]).join("\n\n").trim();
  return {
    text: joined,
    chars: joined.length,
    isLikelyScanned: joined.length < MIN_TEXT_CHARS,
  };
}
