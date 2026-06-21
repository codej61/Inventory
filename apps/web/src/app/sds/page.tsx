"use client";

import { useState } from "react";
import { SdsUploader, type ExtractResponse } from "@/components/sds/SdsUploader";
import { ComparisonView } from "@/components/sds/ComparisonView";
import type { ProviderName, ProviderResult } from "@/lib/sds/providers/types";

export default function SdsPage() {
  const [result, setResult] = useState<ExtractResponse | null>(null);

  function download() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sds-extraction.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">SDS Extractor</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        Upload a Safety Data Sheet PDF, choose a model, and extract all 16 GHS sections.
      </p>
      <SdsUploader onResult={setResult} />

      {result?.meta.warnings.map((w) => (
        <p key={w} className="rounded bg-amber-100 p-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {w}
        </p>
      ))}

      {result && Object.keys(result.providers).length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Results</h2>
            <button onClick={download} className="rounded border px-3 py-1 text-sm">
              Download JSON
            </button>
          </div>
          <ComparisonView providers={result.providers as Partial<Record<ProviderName, ProviderResult>>} />
        </>
      )}
    </main>
  );
}
