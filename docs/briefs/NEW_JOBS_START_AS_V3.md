# New drywall jobs start as v3 quotes (2026-10-14)

## What was happening

A new drywall job is created with an **empty quote** (`legacy.quote = {}`, `createDrywallProject`).
Nothing writes a v2 quote on purpose. The first time the Quote page opened:

1. `quoteV2V3FromLegacy` read `{}` and hydrated it into a **blank v2** quote;
2. `QuoteStageRoute` saw no real v2 data (`shouldUseV2QuoteStage` false) and called `convertQuoteToV3`;
3. `buildV3FromV2` converted the blank v2 and kept it as **`legacyV2Snapshot`**.

So every job since June carried an empty v2 snapshot — 71 of 91 v3 quotes — and showed
"Converted from v2" and an owner-only "Revert to v2" (Mark, on Lakewood - Sweeney: "that job never
was in v2"). The read side was fixed first (`e5d06d3`: banner and revert only for a real v2).

## The change

**A quote that was never started is built as v3 directly** (`initialV3Quote.ts`): absent or `{}` →
`createEmptyDrywallQuoteV3()`, no snapshot. A quote with anything stored still converts through
`buildV3FromV2` and keeps its snapshot — that path is unchanged.

The decision point stays where the conversion already was (first open of the quote), not at job
creation. Writing a quote at creation would change what job lists and workspace filters see for a
brand-new job (several key off "has quote data"), for no gain: the job still never holds a v2.

## The trap this avoided

A fresh v3 quote was **not** the same as a v3 converted from a blank v2. The conversion supplied
eight fields `createEmptyDrywallQuoteV3` lacked: the three labour-burden switches, build type,
complexity, paper floors, custom-scope off, and the **PDF document settings** (cost breakdown,
120-day validity, taxes shown separately). Switching paths alone would have quietly changed new
quotes' PDFs. Those defaults are now in `createEmptyDrywallQuoteV3`, and
`initialV3Quote.test.ts` holds the two equal field for field (minus the snapshot) — it fails if
one is dropped.

## Left alone, deliberately

- **The 71 existing empty snapshots.** Harmless now that the banner/revert read them correctly
  (`hasRealV2Snapshot`, which now delegates to `hasRealDrywallV2QuoteData` — one rule for "is this
  a real v2"). Deleting them would be a data change with nothing to show for it.
- **`createDrywallProject` still writes `{}`.** See above.
