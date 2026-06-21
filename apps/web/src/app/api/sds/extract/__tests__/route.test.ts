import { describe, it, expect, vi, beforeEach } from "vitest";

const { claudeMock, geminiMock } = vi.hoisted(() => ({
  claudeMock: vi.fn(async () => ({ ok: true, data: {}, model: "claude-haiku-4-5", latencyMs: 1 })),
  geminiMock: vi.fn(async () => ({ ok: false, error: "GOOGLE_API_KEY is not set." })),
}));

vi.mock("@/lib/sds/extractText", () => ({
  MIN_TEXT_CHARS: 100,
  extractText: vi.fn(async () => ({ text: "x".repeat(500), chars: 500, isLikelyScanned: false })),
}));
vi.mock("@/lib/sds/providers/claude", () => ({ extractWithClaude: claudeMock }));
vi.mock("@/lib/sds/providers/gemini", () => ({ extractWithGemini: geminiMock }));

import { POST } from "@/app/api/sds/extract/route";

function makeRequest(fields: { file?: Blob; providers?: string }): Request {
  const form = new FormData();
  if (fields.file) form.set("file", fields.file, "sds.pdf");
  if (fields.providers) form.set("providers", fields.providers);
  return new Request("http://localhost/api/sds/extract", { method: "POST", body: form });
}

function pdfBlob(): Blob {
  return new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: "application/pdf" });
}

describe("POST /api/sds/extract", () => {
  beforeEach(() => {
    claudeMock.mockClear();
    geminiMock.mockClear();
  });

  it("rejects when no file is provided", async () => {
    const res = await POST(makeRequest({ providers: "claude" }));
    expect(res.status).toBe(400);
  });

  it("rejects a non-PDF file", async () => {
    const txt = new Blob(["hello"], { type: "text/plain" });
    const res = await POST(makeRequest({ file: txt, providers: "claude" }));
    expect(res.status).toBe(400);
  });

  it("runs only the requested providers and isolates failures", async () => {
    const res = await POST(makeRequest({ file: pdfBlob(), providers: "claude,gemini" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.providers.claude.ok).toBe(true);
    expect(body.providers.gemini.ok).toBe(false);
    expect(claudeMock).toHaveBeenCalledOnce();
    expect(geminiMock).toHaveBeenCalledOnce();
  });

  it("isolates a provider that throws (still 200)", async () => {
    claudeMock.mockRejectedValueOnce(new Error("kaboom"));
    const res = await POST(makeRequest({ file: pdfBlob(), providers: "claude,gemini" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.providers.claude.ok).toBe(false);
    expect(body.providers.gemini.ok).toBe(false);
  });
});
