# SDS PDF Extraction UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a UI in `apps/web` that accepts an SDS PDF, lets the user pick Gemini / Claude / both, converts the PDF to text, and extracts all 16 GHS sections with side-by-side comparison and JSON download.

**Architecture:** Everything runs in the `apps/web` Next.js 16 app on the Node runtime. A client page collects the PDF + provider choice and POSTs `multipart/form-data` to a Route Handler. The handler extracts text once (`unpdf`), then fans out to the selected provider adapters in parallel, each constrained to one shared Zod schema (the single source of truth for the 16-section shape). Display-only; no persistence, no OCR.

**Tech Stack:** Next.js 16 (App Router), TypeScript, TailwindCSS, Vitest, `@anthropic-ai/sdk`, `@google/genai`, `zod`, `zod-to-json-schema`, `unpdf`.

## Global Constraints

- All code lives under `apps/web/`. Run package commands with `pnpm --filter web ...` from the repo root, or `pnpm ...` from inside `apps/web`.
- The extraction Route Handler MUST run on the Node runtime: `export const runtime = "nodejs"`.
- API keys are server-only. Never import provider SDKs or read `process.env.*_API_KEY` in any `"use client"` file.
- Default models, overridable via env: Claude `claude-haiku-4-5` (`CLAUDE_MODEL`), Gemini Flash‑Lite (`GEMINI_MODEL`). Use the exact Claude ID string `claude-haiku-4-5` — never append a date suffix.
- One Zod schema (`SdsExtractionSchema` in `lib/sds/schema.ts`) is the single source of truth, reused by both providers and the UI. Do not redefine the shape anywhere else.
- The `/api/*` proxy rewrite to the Bun server must be narrowed to `/api/bun/*` so Next owns `/api/sds/*`.
- Commit after every task. Use `pnpm --filter web exec vitest run ...` (or `pnpm test` once configured) to run tests.

---

## File Structure

- `apps/web/next.config.ts` — modify: narrow the proxy rewrite.
- `apps/web/.env.example` — create: documents required env vars.
- `apps/web/vitest.config.ts` — create: test runner config.
- `apps/web/src/lib/sds/schema.ts` — create: Zod schema + inferred type + shared prompt.
- `apps/web/src/lib/sds/extractText.ts` — create: PDF Buffer → text.
- `apps/web/src/lib/sds/providers/types.ts` — create: provider result/error contracts.
- `apps/web/src/lib/sds/providers/claude.ts` — create: Anthropic adapter.
- `apps/web/src/lib/sds/providers/gemini.ts` — create: Google GenAI adapter.
- `apps/web/src/app/api/sds/extract/route.ts` — create: POST orchestration.
- `apps/web/src/components/sds/SdsUploader.tsx` — create: upload + provider select.
- `apps/web/src/components/sds/ComparisonView.tsx` — create: side-by-side render.
- `apps/web/src/app/sds/page.tsx` — create: page wiring UI to the API.
- Test files colocated under `__tests__` next to each unit.

---

### Task 1: Project setup — deps, test runner, env, proxy fix

**Files:**
- Modify: `apps/web/package.json` (deps + `test` script)
- Modify: `apps/web/next.config.ts`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/.env.example`
- Test: `apps/web/src/lib/__tests__/setup.test.ts`

**Interfaces:**
- Produces: a working `pnpm --filter web test` command (Vitest); narrowed proxy rewrite; documented env vars.

- [ ] **Step 1: Install dependencies**

Run from the repo root:
```bash
pnpm --filter web add @anthropic-ai/sdk @google/genai zod zod-to-json-schema unpdf
pnpm --filter web add -D vitest
```

- [ ] **Step 2: Add the test script**

In `apps/web/package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create the Vitest config**

Create `apps/web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
  },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
});
```

- [ ] **Step 4: Write a smoke test**

Create `apps/web/src/lib/__tests__/setup.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("test runner", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it to verify the runner works**

Run: `pnpm --filter web test`
Expected: PASS (1 test).

- [ ] **Step 6: Narrow the proxy rewrite**

Replace the `rewrites` block in `apps/web/next.config.ts` with:
```ts
  async rewrites() {
    const apiUrl = process.env.API_URL ?? "http://localhost:3001";
    return [
      {
        // Bun/Hono API is namespaced under /api/bun/* so Next owns the rest of /api/*
        source: "/api/bun/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
```

- [ ] **Step 7: Create `.env.example`**

Create `apps/web/.env.example`:
```
# Server-only. Copy to .env.local and fill in.
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
# Optional model overrides:
CLAUDE_MODEL=claude-haiku-4-5
GEMINI_MODEL=
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml pnpm-lock.yaml apps/web/vitest.config.ts apps/web/.env.example apps/web/next.config.ts apps/web/src/lib/__tests__/setup.test.ts
git commit -m "chore(web): add SDS feature deps, vitest, env example, narrow proxy"
```

---

### Task 2: SDS schema (single source of truth)

**Files:**
- Create: `apps/web/src/lib/sds/schema.ts`
- Test: `apps/web/src/lib/sds/__tests__/schema.test.ts`

**Interfaces:**
- Produces:
  - `SdsExtractionSchema: z.ZodType` — the 16-section Zod object (all fields nullable).
  - `type SdsExtraction = z.infer<typeof SdsExtractionSchema>`.
  - `EXTRACTION_PROMPT: string` — shared instruction text for both providers.
  - `SDS_SECTION_LABELS: Record<keyof SdsExtraction, string>` — human labels for the UI.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/sds/__tests__/schema.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { SdsExtractionSchema, SDS_SECTION_LABELS, EXTRACTION_PROMPT } from "@/lib/sds/schema";

describe("SdsExtractionSchema", () => {
  it("accepts a fully-null extraction (sparse SDS)", () => {
    const empty = Object.fromEntries(
      Object.keys(SDS_SECTION_LABELS).map((k) => [k, null]),
    );
    const parsed = SdsExtractionSchema.safeParse(empty);
    expect(parsed.success).toBe(true);
  });

  it("accepts a populated identification section", () => {
    const sample = {
      identification: {
        productName: "Acetone",
        productCode: "A-100",
        recommendedUse: "Solvent",
        supplier: { name: "Acme", address: "1 St", phone: "555", emergencyPhone: "911" },
      },
    };
    const parsed = SdsExtractionSchema.safeParse(sample);
    expect(parsed.success).toBe(true);
  });

  it("exposes a label for every schema section", () => {
    const shapeKeys = Object.keys(SdsExtractionSchema.shape);
    for (const key of shapeKeys) {
      expect(SDS_SECTION_LABELS[key as keyof typeof SDS_SECTION_LABELS]).toBeTruthy();
    }
  });

  it("has a non-empty shared prompt", () => {
    expect(EXTRACTION_PROMPT.length).toBeGreaterThan(50);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/lib/sds/__tests__/schema.test.ts`
Expected: FAIL ("Cannot find module '@/lib/sds/schema'").

- [ ] **Step 3: Write the schema**

Create `apps/web/src/lib/sds/schema.ts`:
```ts
import { z } from "zod";

// Every field nullable: SDS documents vary wildly in completeness.
const ns = () => z.string().nullable();

const supplier = z
  .object({
    name: ns(),
    address: ns(),
    phone: ns(),
    emergencyPhone: ns(),
  })
  .partial()
  .nullable();

const component = z.object({
  name: ns(),
  casNumber: ns(),
  ecNumber: ns(),
  concentration: ns(),
});

const statement = z.object({ code: ns(), text: ns() });

export const SdsExtractionSchema = z.object({
  identification: z
    .object({
      productName: ns(),
      productCode: ns(),
      recommendedUse: ns(),
      supplier,
    })
    .partial()
    .nullable(),
  hazardsIdentification: z
    .object({
      ghsClassification: z.array(z.string()).nullable(),
      signalWord: ns(),
      hazardStatements: z.array(statement).nullable(),
      precautionaryStatements: z.array(statement).nullable(),
      pictograms: z.array(z.string()).nullable(),
    })
    .partial()
    .nullable(),
  composition: z
    .object({ components: z.array(component).nullable() })
    .partial()
    .nullable(),
  firstAidMeasures: z
    .object({
      inhalation: ns(),
      skinContact: ns(),
      eyeContact: ns(),
      ingestion: ns(),
      notesToPhysician: ns(),
    })
    .partial()
    .nullable(),
  fireFighting: z
    .object({
      extinguishingMedia: ns(),
      specificHazards: ns(),
      protectiveEquipment: ns(),
    })
    .partial()
    .nullable(),
  accidentalRelease: z
    .object({
      personalPrecautions: ns(),
      environmentalPrecautions: ns(),
      cleanupMethods: ns(),
    })
    .partial()
    .nullable(),
  handlingAndStorage: z
    .object({
      handling: ns(),
      storage: ns(),
      incompatibleMaterials: ns(),
    })
    .partial()
    .nullable(),
  exposureControls: z
    .object({
      exposureLimits: z
        .array(z.object({ component: ns(), type: ns(), value: ns() }))
        .nullable(),
      engineeringControls: ns(),
      ppe: z
        .object({ eye: ns(), skin: ns(), respiratory: ns() })
        .partial()
        .nullable(),
    })
    .partial()
    .nullable(),
  physicalChemicalProperties: z
    .object({
      appearance: ns(),
      odor: ns(),
      pH: ns(),
      meltingPoint: ns(),
      boilingPoint: ns(),
      flashPoint: ns(),
      flammability: ns(),
      vaporPressure: ns(),
      density: ns(),
      solubility: ns(),
    })
    .partial()
    .nullable(),
  stabilityReactivity: z
    .object({
      reactivity: ns(),
      chemicalStability: ns(),
      hazardousReactions: ns(),
      conditionsToAvoid: ns(),
      incompatibleMaterials: ns(),
      hazardousDecompositionProducts: ns(),
    })
    .partial()
    .nullable(),
  toxicology: z
    .object({
      routesOfExposure: ns(),
      symptoms: ns(),
      acuteToxicity: z
        .array(z.object({ component: ns(), route: ns(), value: ns() }))
        .nullable(),
      chronicEffects: ns(),
      carcinogenicity: ns(),
    })
    .partial()
    .nullable(),
  ecology: z
    .object({
      ecotoxicity: ns(),
      persistenceDegradability: ns(),
      bioaccumulation: ns(),
      mobility: ns(),
    })
    .partial()
    .nullable(),
  disposal: z
    .object({
      wasteTreatmentMethods: ns(),
      contaminatedPackaging: ns(),
    })
    .partial()
    .nullable(),
  transport: z
    .object({
      unNumber: ns(),
      properShippingName: ns(),
      transportHazardClass: ns(),
      packingGroup: ns(),
      environmentalHazards: ns(),
    })
    .partial()
    .nullable(),
  regulatory: z
    .object({
      safetyHealthEnvRegulations: ns(),
      chemicalSafetyAssessment: ns(),
    })
    .partial()
    .nullable(),
  otherInformation: z
    .object({
      revisionDate: ns(),
      preparedBy: ns(),
      disclaimers: ns(),
      references: ns(),
    })
    .partial()
    .nullable(),
});

export type SdsExtraction = z.infer<typeof SdsExtractionSchema>;

export const SDS_SECTION_LABELS: Record<keyof SdsExtraction, string> = {
  identification: "1. Identification",
  hazardsIdentification: "2. Hazards Identification",
  composition: "3. Composition / Ingredients",
  firstAidMeasures: "4. First-Aid Measures",
  fireFighting: "5. Fire-Fighting Measures",
  accidentalRelease: "6. Accidental Release Measures",
  handlingAndStorage: "7. Handling and Storage",
  exposureControls: "8. Exposure Controls / PPE",
  physicalChemicalProperties: "9. Physical and Chemical Properties",
  stabilityReactivity: "10. Stability and Reactivity",
  toxicology: "11. Toxicological Information",
  ecology: "12. Ecological Information",
  disposal: "13. Disposal Considerations",
  transport: "14. Transport Information",
  regulatory: "15. Regulatory Information",
  otherInformation: "16. Other Information",
};

export const EXTRACTION_PROMPT = [
  "You are an expert at reading chemical Safety Data Sheets (SDS) that follow",
  "the 16-section GHS/OSHA HazCom format. Extract the data from the SDS text",
  "below into the provided schema. Use the exact values from the document.",
  "If a field is not present, set it to null — never guess or invent values.",
  "Preserve hazard (H) and precautionary (P) statement codes with their text.",
].join(" ");
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web exec vitest run src/lib/sds/__tests__/schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/sds/schema.ts apps/web/src/lib/sds/__tests__/schema.test.ts
git commit -m "feat(web): add SDS 16-section extraction schema"
```

---

### Task 3: PDF text extraction

**Files:**
- Create: `apps/web/src/lib/sds/extractText.ts`
- Test: `apps/web/src/lib/sds/__tests__/extractText.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `extractText(data: Uint8Array): Promise<{ text: string; chars: number; isLikelyScanned: boolean }>`. `isLikelyScanned` is `true` when `chars < MIN_TEXT_CHARS` (exported const, value 100).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/sds/__tests__/extractText.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";

// Mock unpdf so the test doesn't need a real PDF binary.
vi.mock("unpdf", () => ({
  extractText: vi.fn(async () => ({ totalPages: 1, text: ["Hello SDS world ".repeat(20)] })),
  getDocumentProxy: vi.fn(async (d: Uint8Array) => d),
}));

import { extractText, MIN_TEXT_CHARS } from "@/lib/sds/extractText";

describe("extractText", () => {
  it("joins page text and reports char count", async () => {
    const result = await extractText(new Uint8Array([1, 2, 3]));
    expect(result.chars).toBeGreaterThan(MIN_TEXT_CHARS);
    expect(result.isLikelyScanned).toBe(false);
    expect(result.text).toContain("Hello SDS world");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/lib/sds/__tests__/extractText.test.ts`
Expected: FAIL ("Cannot find module '@/lib/sds/extractText'").

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/sds/extractText.ts`:
```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web exec vitest run src/lib/sds/__tests__/extractText.test.ts`
Expected: PASS.

> If `unpdf`'s `extractText` signature differs in the installed version, adjust the call to match — confirm with `node -e "console.log(Object.keys(require('unpdf')))"` and the package README. Keep the return contract identical.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/sds/extractText.ts apps/web/src/lib/sds/__tests__/extractText.test.ts
git commit -m "feat(web): add PDF text extraction with scanned-PDF detection"
```

---

### Task 4: Provider contracts + Claude adapter

**Files:**
- Create: `apps/web/src/lib/sds/providers/types.ts`
- Create: `apps/web/src/lib/sds/providers/claude.ts`
- Test: `apps/web/src/lib/sds/providers/__tests__/claude.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export type ProviderName = "claude" | "gemini";
  export interface ProviderSuccess { ok: true; data: SdsExtraction; model: string; latencyMs: number; }
  export interface ProviderFailure { ok: false; error: string; }
  export type ProviderResult = ProviderSuccess | ProviderFailure;
  ```
- Produces (`claude.ts`): `extractWithClaude(text: string): Promise<ProviderResult>`.

- [ ] **Step 1: Write the provider contracts**

Create `apps/web/src/lib/sds/providers/types.ts`:
```ts
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
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/lib/sds/providers/__tests__/claude.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const parseMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { parse: parseMock };
  },
}));

import { extractWithClaude } from "@/lib/sds/providers/claude";

describe("extractWithClaude", () => {
  beforeEach(() => {
    parseMock.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it("returns ok with parsed data on success", async () => {
    parseMock.mockResolvedValue({
      parsed_output: { identification: null, hazardsIdentification: null },
    });
    const result = await extractWithClaude("some sds text");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.model).toBe("claude-haiku-4-5");
  });

  it("returns a failure when the key is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await extractWithClaude("text");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("returns a failure when the SDK throws", async () => {
    parseMock.mockRejectedValue(new Error("boom"));
    const result = await extractWithClaude("text");
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/lib/sds/providers/__tests__/claude.test.ts`
Expected: FAIL ("Cannot find module '.../claude'").

- [ ] **Step 4: Write the Claude adapter**

Create `apps/web/src/lib/sds/providers/claude.ts`:
```ts
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { SdsExtractionSchema, EXTRACTION_PROMPT } from "@/lib/sds/schema";
import type { ProviderResult } from "@/lib/sds/providers/types";

const MODEL = process.env.CLAUDE_MODEL ?? "claude-haiku-4-5";

export async function extractWithClaude(text: string): Promise<ProviderResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "ANTHROPIC_API_KEY is not set." };
  }
  const client = new Anthropic();
  const start = Date.now();
  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      messages: [
        { role: "user", content: `${EXTRACTION_PROMPT}\n\n--- SDS TEXT ---\n${text}` },
      ],
      output_config: { format: zodOutputFormat(SdsExtractionSchema) },
    });
    if (!response.parsed_output) {
      return { ok: false, error: "Claude returned no structured output." };
    }
    return {
      ok: true,
      data: response.parsed_output,
      model: MODEL,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Claude error: ${msg}` };
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter web exec vitest run src/lib/sds/providers/__tests__/claude.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/sds/providers/types.ts apps/web/src/lib/sds/providers/claude.ts apps/web/src/lib/sds/providers/__tests__/claude.test.ts
git commit -m "feat(web): add provider contracts and Claude SDS adapter"
```

---

### Task 5: Gemini adapter

**Files:**
- Create: `apps/web/src/lib/sds/providers/gemini.ts`
- Test: `apps/web/src/lib/sds/providers/__tests__/gemini.test.ts`

**Interfaces:**
- Consumes: `ProviderResult` from `types.ts`; `SdsExtractionSchema`, `EXTRACTION_PROMPT` from `schema.ts`.
- Produces: `extractWithGemini(text: string): Promise<ProviderResult>`.

- [ ] **Step 1: Verify the live SDK shape (no code yet)**

The `@google/genai` structured-output config shape and the current Flash‑Lite
model ID change across versions. Before writing the adapter, confirm against the
installed package and official docs:
```bash
node -e "console.log(Object.keys(require('@google/genai')))"   # confirm GoogleGenAI export
```
Open https://ai.google.dev/gemini-api/docs/structured-output and confirm:
- the `generateContent` config field for JSON mode (`responseMimeType` + `responseSchema`, or the newer `responseFormat` shape), and
- the current cheapest Flash‑Lite model ID.
Use whichever the installed version documents in Step 4 below; set the model ID
as the default for `GEMINI_MODEL`.

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/lib/sds/providers/__tests__/gemini.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const generateContentMock = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock };
  },
}));

import { extractWithGemini } from "@/lib/sds/providers/gemini";

describe("extractWithGemini", () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    process.env.GOOGLE_API_KEY = "test-key";
  });

  it("returns ok with parsed+validated data on success", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({ identification: null, hazardsIdentification: null }),
    });
    const result = await extractWithGemini("sds text");
    expect(result.ok).toBe(true);
  });

  it("returns a failure when the key is missing", async () => {
    delete process.env.GOOGLE_API_KEY;
    const result = await extractWithGemini("text");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/GOOGLE_API_KEY/);
  });

  it("returns a failure when the response is not valid JSON", async () => {
    generateContentMock.mockResolvedValue({ text: "not json" });
    const result = await extractWithGemini("text");
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/lib/sds/providers/__tests__/gemini.test.ts`
Expected: FAIL ("Cannot find module '.../gemini'").

- [ ] **Step 4: Write the Gemini adapter**

Create `apps/web/src/lib/sds/providers/gemini.ts`. Use the JSON-mode config shape and model ID confirmed in Step 1 — the version below uses the `responseMimeType`/`responseSchema` shape; swap to the `responseFormat` shape if that's what the installed version documents:
```ts
import { GoogleGenAI } from "@google/genai";
import { zodToJsonSchema } from "zod-to-json-schema";
import { SdsExtractionSchema, EXTRACTION_PROMPT } from "@/lib/sds/schema";
import type { ProviderResult } from "@/lib/sds/providers/types";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";

export async function extractWithGemini(text: string): Promise<ProviderResult> {
  if (!process.env.GOOGLE_API_KEY) {
    return { ok: false, error: "GOOGLE_API_KEY is not set." };
  }
  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
  const start = Date.now();
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `${EXTRACTION_PROMPT}\n\n--- SDS TEXT ---\n${text}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: zodToJsonSchema(SdsExtractionSchema),
      },
    });
    const raw = response.text;
    if (!raw) return { ok: false, error: "Gemini returned an empty response." };
    const parsed = SdsExtractionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return { ok: false, error: "Gemini output failed schema validation." };
    }
    return { ok: true, data: parsed.data, model: MODEL, latencyMs: Date.now() - start };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Gemini error: ${msg}` };
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter web exec vitest run src/lib/sds/providers/__tests__/gemini.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/sds/providers/gemini.ts apps/web/src/lib/sds/providers/__tests__/gemini.test.ts
git commit -m "feat(web): add Gemini SDS adapter"
```

---

### Task 6: Extraction Route Handler

**Files:**
- Create: `apps/web/src/app/api/sds/extract/route.ts`
- Test: `apps/web/src/app/api/sds/extract/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `extractText`, `extractWithClaude`, `extractWithGemini`, `ProviderName`.
- Produces: `POST(request: Request): Promise<Response>`. Response JSON shape:
  ```ts
  {
    providers: Partial<Record<ProviderName, ProviderResult>>;
    meta: { textChars: number; warnings: string[] };
  }
  ```
  Form fields: `file` (the PDF) and `providers` (comma-separated subset of `claude,gemini`).
- Also exports `export const runtime = "nodejs"` and `MAX_BYTES = 20 * 1024 * 1024`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/api/sds/extract/__tests__/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sds/extractText", () => ({
  MIN_TEXT_CHARS: 100,
  extractText: vi.fn(async () => ({ text: "x".repeat(500), chars: 500, isLikelyScanned: false })),
}));
const claudeMock = vi.fn(async () => ({ ok: true, data: {}, model: "claude-haiku-4-5", latencyMs: 1 }));
const geminiMock = vi.fn(async () => ({ ok: false, error: "GOOGLE_API_KEY is not set." }));
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
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/app/api/sds/extract/__tests__/route.test.ts`
Expected: FAIL ("Cannot find module '.../route'").

- [ ] **Step 3: Write the Route Handler**

Create `apps/web/src/app/api/sds/extract/route.ts`:
```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web exec vitest run src/app/api/sds/extract/__tests__/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the whole suite**

Run: `pnpm --filter web test`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/sds/extract/route.ts apps/web/src/app/api/sds/extract/__tests__/route.test.ts
git commit -m "feat(web): add SDS extraction route handler"
```

---

### Task 7: UI — uploader, comparison view, page

**Files:**
- Create: `apps/web/src/components/sds/SdsUploader.tsx`
- Create: `apps/web/src/components/sds/ComparisonView.tsx`
- Create: `apps/web/src/app/sds/page.tsx`

**Interfaces:**
- Consumes: the `/api/sds/extract` response shape; `SdsExtraction`, `SDS_SECTION_LABELS` from `schema.ts`; `ProviderName`, `ProviderResult` from `providers/types.ts`.
- Produces: a route at `/sds`.

This task is UI-only (no unit tests); verify by running the dev server and manual check in Step 5.

- [ ] **Step 1: Build the comparison view**

Create `apps/web/src/components/sds/ComparisonView.tsx`:
```tsx
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
```

- [ ] **Step 2: Build the uploader**

Create `apps/web/src/components/sds/SdsUploader.tsx`:
```tsx
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
```

- [ ] **Step 3: Build the page**

Create `apps/web/src/app/sds/page.tsx`:
```tsx
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
```

- [ ] **Step 4: Type-check / build**

Run: `pnpm --filter web build`
Expected: compiles successfully; route `/sds` listed in the output.

- [ ] **Step 5: Manual verification**

Create `apps/web/.env.local` from `.env.example` with real keys. Then:
```bash
pnpm --filter web dev
```
Open http://localhost:3000/sds, upload a text-based SDS PDF, select "claude", and confirm a populated 16-section table renders. Select both and confirm two columns with amber highlighting on differing rows. Click "Download JSON" and confirm the file downloads. Upload a non-PDF and confirm the inline error.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/sds/ apps/web/src/app/sds/page.tsx
git commit -m "feat(web): add SDS upload UI with side-by-side comparison"
```

---

## Self-Review

**Spec coverage:**
- §2A Next Route Handlers → Task 6. §2B 16 sections → Task 2. §2C side-by-side → Task 7 (`ComparisonView`). §2D display + JSON download → Task 7. §2E models → Tasks 4/5 (env-overridable defaults). §2F unpdf + no OCR → Task 3.
- §3 routing fix → Task 1 Step 6. §4 components → Tasks 2–7 (all files present). §5 data model → Task 2. §6 data flow → Task 6. §7 error handling → Tasks 4/5 (per-provider, missing-key) + Task 6 (validation, scanned-PDF warning). §8 config → Task 1 (`.env.example`, Node runtime). §9 testing → Tasks 2–6 tests. §11 dependencies → Task 1.

**Placeholder scan:** No "TBD"/"handle errors appropriately". The one live-verify step (Task 5 Step 1) is a concrete action — confirm the `@google/genai` config shape + model ID against the installed package — not a deferred requirement; the adapter code is provided in full with the documented shape.

**Type consistency:** `ProviderResult`/`ProviderName` defined in Task 4 `types.ts`, consumed unchanged in Tasks 5–7. `SdsExtraction`/`SdsExtractionSchema`/`SDS_SECTION_LABELS`/`EXTRACTION_PROMPT` defined in Task 2, consumed in Tasks 4–7. `extractText` return shape (`{text, chars, isLikelyScanned}`) defined in Task 3, consumed in Task 6. Response shape `{providers, meta}` produced in Task 6, consumed in Task 7.
