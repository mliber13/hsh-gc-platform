# Cursor Brief — Batch 2A: make every surface agree on the quote total

Part of `docs/V1_HARDENING_PLAN_2026-09.md` Batch 2 (money). **Batch 1 is complete** (1A–1D).
Batch 2 is split: **2A is this brief** — the surfaces that recompute the same number and disagree.
**2B** (per-trade pricing semantics: P1-MONEY-3/4/5/6, tests T2/T3/T5) follows.

Pure TypeScript. **No migration, no live database write.** Read-only MCP is used once, for item 4.

---

## Scope correction before you start

Two items the plan lists under Batch 2 are **already done** and are not in this brief. I verified both:

- **P0-MONEY-2 (FRP ×32)** — closed by `1db8d7b`. `convertQuoteV2ToV3.ts:341` now uses
  `customRateFromV2Total(parseNum(calc.frpMaterialCost), sqft)` instead of the per-sheet rate.
- **P0-MONEY-3 (RC waste + screws)** — closed by the same commit. `:163-164` set
  `waste_pct: parseNum(v2.rcChannelWastePercentage, 0)` and `accessories_in_material_rate: true`.

Do not redo them. **But see item 4** — Mark reported the converter was "still not working quite right"
after that fix and switched a live quote back to v2 to get it out. That was never diagnosed, and item 4
is how we find it without asking him to reproduce anything.

---

## The theme

`computeQuoteV3Totals` is the canonical math and it is correct. The problem is that it is not the *only*
math. Four other surfaces recompute pieces of it from a subset of the inputs, and each drifts differently:

| Surface | What it recomputes | How it drifts |
|---|---|---|
| Order page financial card | direct cost from `drywall` lines only | ignores every component trade (item 1) |
| Bid snapshot | its own labor-burden options | drops project rates and component burden (item 2) |
| Estimated labor / material | its own burden options + no bead sticks | same, plus corner-bead material (items 2, 3) |
| The sidebar | nothing — it uses the canonical path | correct |

Every fix below is the same shape: **stop recomputing, read the canonical breakdown.**

---

## 1. P0-MONEY-1 — the Order page prices a mixed-trade job against drywall-only cost

`src/lib/drywall/projectV3QuoteToV2Shape.ts:64-100`.

`drywallLines` is filtered to `line.type === 'drywall'`, and every cost figure is summed from it:

```ts
const drywallComputed = drywallLines.map((line) => computeLineItem(line, catalogs, laborBurdenOpts))
let materialCostBare = drywallComputed.reduce((sum, c) => sum + c.materialTotal, 0)
let accessoriesCost  = drywallComputed.reduce((sum, c) => sum + c.accessoriesTotal, 0)
let hangerCost       = drywallComputed.reduce((sum, c) => sum + c.hangerLaborTotal, 0)
let finisherCost     = drywallComputed.reduce((sum, c) => sum + c.finisherLaborTotal, 0)
```

Then at line 103: `const finalTotal = v3Totals.acceptedTotal` — **the whole quote**, every trade included.
Revenue is whole-quote, cost is drywall-only, and `componentLaborSubtotal` appears nowhere at all.

On a $40k drywall + $25k metal stud + $10k RC job, the Order page shows roughly 45% margin against
roughly $40k of cost. **The D.4 margin-floor gate reads this number**, so it is blind on exactly the
component-heavy Togal-import jobs being added now.

**Fix.** `routine` is already in scope at line 54 and is a `QuoteV3MarkupBreakdown` carrying every figure
needed. Replace the four per-line reductions with:

```ts
let materialCostBare = routine.materialSubtotal
let accessoriesCost  = routine.accessoriesSubtotal
let hangerCost       = routine.hangerLaborSubtotal
let finisherCost     = routine.finisherLaborSubtotal
let componentCost    = routine.componentLaborSubtotal   // new — currently dropped entirely
```

and include `componentCost` in `totalLaborCost` at line 99.

The alternates loop (lines 82-98) has the same problem — it filters the alternate's lines to `drywall`
and recomputes. `summary.breakdown` is a full `QuoteV3MarkupBreakdown`, so net the same five fields from
it instead, keeping the existing `sign` handling. That also removes the need for `altComputed` and
`computeLineItem` in that loop.

**Two things to check rather than assume:**

- `materialSubtotal` — confirm whether it is bare material or already includes accessories, so you do not
  double-count `accessoriesSubtotal`. Read `lineDirectCostsFromLines` (`quoteV3Math.ts:578-620`) and say
  what you found.
- `drywallLines` is still used above for `hangerRate` / `finisherRate` / `materialRate` averages
  (lines 36-50). Those are *display* rates on the v2 shape, and drywall-only is arguably right for them.
  **Leave those alone**; this item is the cost figures only.

---

## 2. P1-MONEY-1 — one labor-burden builder, not four

The canonical builder is `quoteV3Math.ts:687`, and it is **not exported** — which is why three copies
exist, each missing something different:

| Where | Missing |
|---|---|
| `quoteV3Math.ts:687` (canonical) | — |
| `bidSnapshot.ts:25` | `componentIncludeLaborBurden`, `projectHangerRate`, `projectFinisherRate` |
| `estimatedLabor.ts:113` | `componentIncludeLaborBurden` |
| `projectV3QuoteToV2Shape.ts:58` | `componentIncludeLaborBurden` |

Concretely: a quote with a project-level hanger rate set prices per-line labor one way in the sidebar and
another way in the bid snapshot, and every surface but the sidebar applies component labor burden
inconsistently.

**Fix.** Export `laborBurdenFromQuote` from `quoteV3Math.ts` and delete all three local copies. The
canonical one defaults `componentIncludeLaborBurden` to `true` when unset (`?? true`) — preserve that.

`estimatedLabor.ts` takes `Extract<DrywallQuoteV2V3, { version: 3 }>` rather than `DrywallQuoteV3`.
Confirm those are structurally compatible; if not, widen the exported signature rather than keeping a copy.

---

## 3. P1-MONEY-2 — bead sticks are dropped from the estimate

`lineDirectCostsFromLines` takes a 4th argument, `quoteBeadSticks` (`quoteV3Math.ts:578-582`), which
allocates corner-bead material and the extra mud that goes with it. `computeQuoteV3Totals` passes
`quote.bead_sticks`. `estimatedLabor.ts:157` does not:

```ts
const dc = lineDirectCostsFromLines(quote.lineItems, catalogs, burden)   // no bead sticks
```

So the project cost tiles and the division KPI aggregate under-state material against the sidebar by the
whole bead allowance.

**Fix.** Pass `quote.bead_sticks` as the 4th argument.

**The plan's file reference for this item is stale — do not trust it.** It cites
`estimatedMaterial.ts:312`; that file is 144 lines and does not call `lineDirectCostsFromLines` at all.
Check what `computeEstimatedMaterial` (`estimatedMaterial.ts:135`) actually derives its material figure
from, and whether it has the same gap by a different route. **Report what you find before changing it** —
its consumers are `drywallProjectCostService.ts` and `drywallDivisionAggregateService.ts`, both of which
feed dashboards Mark reads.

---

## 4. The undiagnosed converter discrepancy — find it, do not guess

Mark converted a v2 quote with a Phase 2–4 breakdown, reported that it was "still not working quite
right" after `1db8d7b`, and sent the quote from v2 instead. We never learned which trade or which figure.
The fixture tests pass, so whatever it is, the fixtures do not cover it.

Build a **read-only** per-trade comparison over live data:

- For every project holding both a `legacyV2Snapshot` and a v3 quote, run the v2 calculations
  (`buildDrywallQuoteCalculations`) and `computeQuoteV3Totals`, and report where they disagree
  **per trade**, not just on the grand total. A grand-total-only check is what let this through the first
  time.
- Report absolute and percentage delta per trade per project, sorted by magnitude, plus a count of
  projects that are clean.

There is prior art to reuse rather than reinvent: `scripts/drywall-quote-parity.mjs` does a grand-total
spot check, and `scripts/build-parity-payload-for-project.mjs` already solves fetching a project payload.
Follow whichever pattern needs least new code.

**Credentials:** 1D established there is no local `.env`. Either have Mark supply
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, or pull the payloads with read-only MCP into a JSON file
and run the comparison against that offline. **Do not put a key into a tool call.**

Commit the script under `scripts/`. **Report the output; do not fix anything it finds in this brief** —
whatever it turns up gets its own diagnosis, and a converter change without a red test first is how we
got here.

---

## 5. Tests — T1 and T4

**T1, the cross-surface invariant.** This is the test that stops the whole class recurring, and it is the
main deliverable of this brief. One fixture quote exercising **all eight line types**
(`drywall`, `rc_channel`, `suspended_grid`, `metal_stud`, `insulation`, `acoustic`, `frp`, `door_install`),
plus a non-zero `bead_sticks`, project hanger/finisher rates set, and one **deduct** alternate selected.
Assert they all agree to the cent:

```
computeQuoteV3Totals(q, c).routine.total
  == buildBidSnapshotFromV3Quote(q, c).bidTotal
  == Σ buildQuoteV3PdfLineRows(q, c, …).sellTotal
  == projectV3QuoteToV2Shape(q, c).calculations.finalTotal
```

and separately that the snapshot's per-line sum equals `routine.linesSubtotal`.

Write it **before** the fixes and confirm it fails — a cross-surface test that was green from the start
is not testing anything. Report which assertions failed first.

**T4, the Order-page margin.** A mixed-trade quote — roughly $40k drywall, $25k metal stud, $10k RC —
where the margin computed from `projectV3QuoteToV2Shape` lands near the org target rather than wildly
above it. **This currently fails**; that is the point. Assert the real relationship (direct cost includes
component labor and component material) rather than pinning a magic number.

Existing fixture helpers live in `src/lib/drywall/*.test.ts` and `scripts/fixtures/` — reuse
`quote-v3-parity-fixtures.json` shapes where they fit.

---

## Out of scope

- **P1-MONEY-3/4/5/6** (alternate cleanup semantics, metal-stud rate resolving two ways, the blended-branch
  switch, labor multiplied by material waste) and tests **T2/T3/T5** — brief 2B. Those are "is this formula
  right"; this brief is "do these surfaces agree." Keep them apart so T1 is green before formulas move.
- **Fixing anything item 4 turns up.** Report only.
- `P1-MONEY-7` (`project_actuals` unique index) — Batch 4, and it needs a migration.
- `P1-MONEY-8` — **closed won't-fix.** Mark decided 2026-09-10 that overtime stays at straight time. Do not
  "fix" it.
- `P1-MONEY-9` (crew vs payroll piece-pay sqft) — Batch 3.
- Do not clean up while you are in there. Report, do not fix.

---

## Verification

1. **T1 and T4 written first and observed failing**, then passing. Say which assertions failed.
2. `npx tsc --noEmit` clean.
3. `npx vitest run` — 334 tests plus whatever you add, all green, no pre-existing test modified to pass.
   **If an existing test has to change, stop and report which and why** — that means a number moved that
   something else was pinning, and I want to know before it lands.
4. `npm run build` succeeds.
5. Item 4's scan output, pasted in full if short or summarised with the worst ten rows if long.

### Operator-side — Mark runs these

1. Open a **component-heavy** project (a Togal import with metal stud or grid) → **Order** tab. The margin
   should drop to something believable. **Compare it to the quote stage sidebar for the same project — they
   should now match.** That is the whole point of the batch.
2. A **drywall-only** project → Order tab: the margin should be **unchanged** from before. If it moved,
   something in item 1 is wrong.
3. Project cost tiles on a job with bead sticks: estimated material should rise by the bead allowance.
4. Drywall division dashboard still loads and its totals look sane.

---

## Commit

Three commits.

```
fix(drywall): the Order page priced a mixed-trade job against drywall-only cost

projectV3QuoteToV2Shape summed material, accessories and labor from lines of
type 'drywall' only, then set finalTotal to the whole accepted quote. Revenue was
whole-quote, cost was drywall-only, and component labor was dropped entirely -- so
a job with $25k of metal stud behind $40k of drywall reported margin against about
$40k of cost.

It now reads materialSubtotal, accessoriesSubtotal and the three labor subtotals
off the QuoteV3MarkupBreakdown that was already in scope, and nets accepted
alternates from summary.breakdown rather than recomputing their drywall lines.
The D.4 margin-floor gate reads this number, so it was blind on exactly the
component-heavy jobs Togal imports produce.
```

```
fix(drywall): one labor-burden builder instead of four

laborBurdenFromQuote was private to quoteV3Math, so three surfaces had grown
their own copy and each was missing something different: the bid snapshot dropped
both project rates and component burden, estimated labor and the Order shim
dropped component burden. A quote with a project-level hanger rate priced one way
in the sidebar and another in the snapshot.

Exported the canonical one and deleted the copies. Estimated labor also now
passes bead sticks through to lineDirectCostsFromLines, which it had been
omitting, so the cost tiles no longer under-state material by the bead allowance.
```

```
test(drywall): pin the cross-surface totals invariant

One fixture with all eight line types, bead sticks, project rates and a selected
deduct alternate, asserting the sidebar, bid snapshot, PDF rows and Order
projection agree to the cent. Written red first: it failed on the Order
projection before the fixes above, which is the bug it exists to catch.
```

Plus a fourth if item 4's script is committed separately.

**Exclude from every commit:** `.claude/settings.local.json` and `supabase/.temp/cli-latest`.

---

## STOP — report before going further

1. Which T1 assertions failed before the fixes.
2. What `materialSubtotal` turned out to include (item 1's double-count question).
3. What `computeEstimatedMaterial` derives material from, and whether it has the bead gap (item 3).
4. The item 4 scan output — this is the one I most want to see.
5. Any existing test you had to change, and why.
6. `tsc` / `vitest` / `build`.
7. Anything found and not fixed.
