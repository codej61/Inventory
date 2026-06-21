"use client";

import { SDS_SECTION_LABELS, type SdsExtraction } from "@/lib/sds/schema";
import type { ProviderName, ProviderResult } from "@/lib/sds/providers/types";

type Providers = Partial<Record<ProviderName, ProviderResult>>;

const ORDER: ProviderName[] = ["claude", "gemini"];

function valueFor(result: ProviderResult | undefined, key: keyof SdsExtraction): string {
  if (!result) return "—";
  if (!result.ok) return `⚠️ ${result.error}`;
  const section = result.data[key];
  if (section == null) return "—";
  return JSON.stringify(section, null, 2);
}

export function ComparisonView({ providers }: { providers: Providers }) {
  const active = ORDER.filter((p) => providers[p]);
  if (active.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2 font-semibold">Section</th>
            {active.map((p) => (
              <th key={p} className="p-2 font-semibold capitalize">
                {p}
                {providers[p]?.ok ? ` · ${providers[p]?.model}` : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(Object.keys(SDS_SECTION_LABELS) as (keyof SdsExtraction)[]).map((key) => {
            const cells = active.map((p) => valueFor(providers[p], key));
            const disagree = cells.length === 2 && cells[0] !== cells[1];
            return (
              <tr key={key} className={`border-b align-top ${disagree ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}>
                <td className="p-2 font-medium whitespace-nowrap">{SDS_SECTION_LABELS[key]}</td>
                {cells.map((c, i) => (
                  <td key={active[i]} className="p-2">
                    <pre className="whitespace-pre-wrap break-words font-mono text-xs">{c}</pre>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
