# SDS PDF Extraction UI — Design

**Date:** 2026-06-19
**Status:** Approved (design); pending spec review
**Location:** `apps/web` (Next.js 16, App Router, Node runtime)

## 1. Purpose

A UI that accepts a Safety Data Sheet (SDS) PDF, lets the user choose which LLM(s)
to run (Gemini via Google API, Claude via Anthropic API, or both), converts the
PDF to text, and uses the selected LLM(s) to extract structured data for all 16
GHS SDS sections. When both are selected, results are shown side-by-side for
comparison. Output is display-only with a JSON download — no persistence in v1.

## 2. Decisions (locked)

| # | Decision | Choice |
|---|----------|--------|
| A | Where extraction runs | Next.js Route Handlers in `apps/web` (single Vercel deploy; keys server-side) |
| B | Data extracted | Full 16 GHS sections, structured |
| C | "Both" presentation | Side-by-side, field-by-field, conflict highlighting |
| D | Output | Display only + JSON download (no storage) |
| E | Default models | Claude **Haiku 4.5** (`claude-haiku-4-5`); Gemini **Flash-Lite** (`gemini-2.5-flash-lite`-class, exact ID confirmed at impl). Both env-overridable. |
| F | PDF→text | Text extraction first (`unpdf`), then feed text to the LLM. No OCR in v1. |

## 3. Routing conflict fix (prerequisite)

`apps/web/next.config.ts` currently rewrites **all** `/api/*` → the Bun server on
`:3001`, which would shadow a Next Route Handler at `/api/sds/extract`.

**Fix:** narrow the Bun proxy to a dedicated prefix:

```
/api/bun/:path*  →  http://localhost:3001/api/:path*
```

Next then owns the rest of `/api/*`, including `/api/sds/extract`. The Bun API
stays reachable (namespaced under `/api/bun`) for future use.

## 4. Architecture & components

```
apps/web/src/
├─ app/
│  ├─ sds/page.tsx                 ← UI (client component)
│  └─ api/sds/extract/route.ts     ← POST handler: orchestrates extraction (Node runtime)
├─ lib/sds/
│  ├─ schema.ts                    ← 16-section TS type + JSON Schema + shared extraction prompt
│  ├─ extractText.ts               ← PDF Buffer → text (unpdf); detects empty/scanned PDFs
│  └─ providers/
│     ├─ types.ts                  ← ProviderResult, ProviderError contracts
│     ├─ claude.ts                 ← Anthropic call (structured output) → typed 16-section result
│     └─ gemini.ts                 ← Google GenAI call (responseSchema) → typed result
└─ components/sds/
   ├─ SdsUploader.tsx              ← file picker + provider selection (Gemini / Claude / Both)
   └─ ComparisonView.tsx           ← side-by-side, field-by-field, conflict highlighting
```

Each unit has one purpose and a defined interface:
- `extractText(buffer): Promise<{ text: string; chars: number }>` — pure PDF→text.
- `schema.ts` — single source of truth for the output shape, imported by both providers and the UI.
- `providers/*.ts` — each exposes `extract(text): Promise<SdsExtraction>`; identical return shape so the UI is provider-agnostic.
- `route.ts` — orchestration only (parse upload → extract text → fan out to providers → assemble response).

## 5. Data model (the 16 GHS sections)

`SdsExtraction` mirrors the GHS standard. All fields nullable (SDS quality varies):

1. **identification** — productName, productCode, recommendedUse, supplier {name, address, phone, emergencyPhone}
2. **hazardsIdentification** — ghsClassification[], signalWord, hazardStatements[] (H-codes + text), precautionaryStatements[] (P-codes + text), pictograms[]
3. **composition** — components[] {name, casNumber, ecNumber, concentration}
4. **firstAidMeasures** — inhalation, skinContact, eyeContact, ingestion, notesToPhysician
5. **fireFighting** — extinguishingMedia, specificHazards, protectiveEquipment
6. **accidentalRelease** — personalPrecautions, environmentalPrecautions, cleanupMethods
7. **handlingAndStorage** — handling, storage, incompatibleMaterials
8. **exposureControls** — exposureLimits[] {component, type, value}, engineeringControls, ppe {eye, skin, respiratory}
9. **physicalChemicalProperties** — appearance, odor, pH, meltingPoint, boilingPoint, flashPoint, flammability, vaporPressure, density, solubility (each nullable string)
10. **stabilityReactivity** — reactivity, chemicalStability, hazardousReactions, conditionsToAvoid, incompatibleMaterials, hazardousDecompositionProducts
11. **toxicology** — routesOfExposure, symptoms, acuteToxicity[] {component, route, value}, chronicEffects, carcinogenicity
12. **ecology** — ecotoxicity, persistenceDegradability, bioaccumulation, mobility
13. **disposal** — wasteTreatmentMethods, contaminatedPackaging
14. **transport** — unNumber, properShippingName, transportHazardClass, packingGroup, environmentalHazards
15. **regulatory** — safetyHealthEnvRegulations, chemicalSafetyAssessment
16. **otherInformation** — revisionDate, preparedBy, disclaimers, references

Plus top-level metadata: `{ model, provider, latencyMs, textChars, warnings[] }`.

JSON Schema constraints follow each provider's structured-output limits (no
`minLength`/`maximum`; `additionalProperties: false` on objects for Claude).

## 6. Data flow

1. User selects a PDF and one of {Gemini, Claude, Both} → `POST /api/sds/extract`
   as `multipart/form-data` (fields: `file`, `providers`).
2. Handler validates: content-type is `application/pdf`, size ≤ 20 MB.
3. `extractText()` runs once; result shared across providers. If extracted text is
   below a small threshold (e.g. < 100 chars), return a structured warning
   ("PDF appears to be scanned/image-only; OCR not supported in v1") and stop.
4. Selected providers run **in parallel** (`Promise.allSettled`), each constrained
   to the shared JSON Schema:
   - **Claude** — `client.messages.create` with `output_config.format` (json_schema), model `claude-haiku-4-5`.
   - **Gemini** — Google GenAI with `responseSchema` / JSON mode, Flash-Lite model.
5. Response:
   ```jsonc
   {
     "providers": {
       "claude": { /* SdsExtraction | { error } */ },
       "gemini": { /* SdsExtraction | { error } */ }
     },
     "meta": { "textChars": 12345, "warnings": [] }
   }
   ```
6. UI renders: single result → one panel; both → `ComparisonView` with field-by-field
   columns, highlighting where Claude ≠ Gemini. "Download JSON" exports the raw response.

## 7. Error handling

- **Validation** (wrong type / too large): 400 with a clear message before any LLM call.
- **Per-provider isolation** (`Promise.allSettled`): one provider failing or its key
  missing populates `providers.<name>.error`; the other still renders. UI shows the
  error in that provider's column.
- **Missing API key**: explicit message naming the env var (`ANTHROPIC_API_KEY` /
  `GOOGLE_API_KEY`).
- **Scanned/image-only PDF**: detected via low extracted-text length → warning, no
  silent empty extraction. OCR is explicitly out of scope for v1.
- **LLM/SDK errors**: typed-exception handling (Anthropic SDK typed errors); surfaced
  per provider, never crash the whole request.

## 8. Configuration

`.env.local` (and committed `.env.example`):
```
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
CLAUDE_MODEL=claude-haiku-4-5            # override default
GEMINI_MODEL=gemini-2.5-flash-lite       # exact ID confirmed at impl
```
Route runs on the Node runtime (`export const runtime = "nodejs"`) — `unpdf` and the
SDKs need Node, not Edge.

## 9. Testing

- `extractText` — unit test against a small text-based sample PDF; assert non-empty
  text and the low-text warning path on an image-only fixture.
- `schema` — validate a representative extraction object against the JSON Schema.
- Provider adapters — unit tests with the SDK calls mocked; assert mapping to
  `SdsExtraction` and error propagation.
- Route handler — integration test: multipart parse, validation rejects, parallel
  fan-out with one provider mocked to fail (partial result returned).

## 10. Scope / YAGNI (v1)

Out of scope: persistence/database, OCR for scanned PDFs, authentication, streaming
responses, batch/multi-file upload, editing/correcting extracted fields. The
`SdsExtraction` shape is designed so persistence can be layered on later without
reshaping the result.

## 11. Dependencies to add (in `apps/web`)

- `@anthropic-ai/sdk` — Claude
- `@google/genai` (or current Google GenAI JS SDK; confirmed at impl) — Gemini
- `unpdf` — serverless-friendly PDF text extraction
```

(All via `pnpm --filter web add ...`.)
