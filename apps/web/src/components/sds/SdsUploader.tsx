"use client";

import { useState } from "react";
import type { ProviderName } from "@/lib/sds/providers/types";

export interface ExtractResponse {
  providers: Record<string, { ok: boolean; error?: string; model?: string; data?: unknown }>;
  meta: { textChars: number; warnings: string[] };
}

export function SdsUploader({ onResult }: { onResult: (r: ExtractResponse) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [providers, setProviders] = useState<ProviderName[]>(["claude"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(p: ProviderName) {
    setProviders((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) return setError("Choose a PDF first.");
    if (providers.length === 0) return setError("Pick at least one model.");
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("providers", providers.join(","));
      const res = await fetch("/api/sds/extract", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Extraction failed.");
      onResult(body as ExtractResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block"
      />
      <fieldset className="flex gap-4">
        <legend className="mb-1 font-medium">Model(s)</legend>
        {(["claude", "gemini"] as ProviderName[]).map((p) => (
          <label key={p} className="flex items-center gap-2 capitalize">
            <input type="checkbox" checked={providers.includes(p)} onChange={() => toggle(p)} />
            {p}
          </label>
        ))}
      </fieldset>
      <button
        type="submit"
        disabled={busy}
        className="w-fit rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {busy ? "Extracting…" : "Extract SDS data"}
      </button>
      {error && <p className="text-red-600">{error}</p>}
    </form>
  );
}
