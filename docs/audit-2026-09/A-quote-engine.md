# Review A — Drywall Quote Engine (v1 hardening)

Read-only review, 2026-09-03. All paths relative to repo root. Line numbers are from the current working tree (HEAD `6796d12`).

## 1. Inventory

### Money-computing modules

| File | Lines | Era | Role |
|---|---|---|---|
| `src/lib/drywall/quoteV3Math.ts` | 846 | v3 | `computeLineItem` (all 8 trades), `computeMarkupBreakdown`, `computeQuoteV3Totals`, alternates |
| `src/lib/drywall/quoteV3Accessories.ts` | 434 | v3 | drywall accessory engine, RC screws, bead-stick allocation, quote rollup |
| `src/lib/drywall/quoteV3CatalogResolve.ts` | 388 | v3 | rate/unit/label resolution per trade |
| `src/lib/drywall/quoteV3PdfModel.ts` | 519 | v3 | proportional sell-price allocation per line for the customer PDF |
| `src/lib/drywallQuotePdfV3.ts` | 662 | v3 | jsPDF renderer (own material/labor split per trade, L607-620) |
| `src/lib/drywall/createEmptyDrywallQuoteV3.ts` | 412 | v3 | hydrate / defaults / legacy-field migration |
| `src/lib/drywall/convertQuoteV2ToV3.ts` | 582 | bridge | v2→v3 converter (calls v2 engine at L153) |
| `src/lib/drywall/staleV3ConvertAudit.ts` | 159 | bridge | "Refresh from v2 snapshot" |
| `src/lib/drywall/projectV3QuoteToV2Shape.ts` | 148 | bridge | v3 → fake-v2 `calculations` blob for Order page |
| `src/lib/drywall/buildDrywallQuoteCalculations.ts` | 1101 | v2 | the v2 engine (`@ts-nocheck`, formulas triplicated inside) |
| `src/lib/drywall/quoteCalculations.ts` | 348 | v2 | second v2 totals pass (`calculateQuoteTotals`), re-derives breakdown math |
| `src/lib/drywall/quotePricingEngine.ts` | 76 | v2 | pipeline helpers, 1 caller |
| `src/lib/drywall/calculations/{rcChannelLineTotal,suspendedGridCalc,acousticCeilingGridCalc,quantityUtils}.ts` | 283 | v2 (+acoustic shared) | pure calc helpers; `LABOR_TAX_RATE=0.25` lives in `quantityUtils.ts:17` |
| `src/lib/drywallQuotePdf.ts` + `tradePdfBreakdown.ts` | 881+189 | v2 | v2 customer PDF |
| `src/lib/drywall/bidSnapshot.ts` | 182 | both | locks totals on Sent/Approved |
| `src/lib/drywall/orderFinancialComparison.ts` | 235 | v2-shaped | Order page margin; consumes v2 `calculations` |
| `src/lib/drywall/estimatedLabor.ts` / `estimatedMaterial.ts` | 187 / 144 | both | project-cost + KPI feeds |
| `src/lib/drywall/quoteTakeoffImport.ts` / `quoteTakeoffImportV3.ts` | 320 / 290 | v2 / v3 | Togal importers |
| `src/lib/drywall/catalogSeeds.ts` / `catalogUtils.ts` | 216 / 256 | v3 | catalog defaults |
| `src/components/drywall/quote/*.tsx` (v2 UI) | ~4,900 | v2 | `QuoteStage` + 14 panels; `QuoteTotalsSummary.tsx` re-implements RC math at L111-120 |
| `src/components/drywall/quote/v3/*.tsx` | ~5,900 | v3 | `LineItemsTable` 935, `LineRateCells` 725, `LineItemEditDialog` 635, three pivots 1,202 |

10 files in the domain carry `// @ts-nocheck` (all v2-era): `buildDrywallQuoteCalculations`, `quoteCalculations`, `quotePricingEngine`, `orderFinancialComparison`, `drywallQuoteSchema`, `accessoryCalc`, `quoteTakeoffImport`, and three `calculations/*` helpers.

### v2 engine reachability (callers of `buildDrywallQuoteCalculations` / `calculateQuoteTotals` outside the v2 quote UI)

| Caller | Why | Notes |
|---|---|---|
| `src/lib/drywall/bidSnapshot.ts:135-136` | v2 quotes on Sent/Approved | Only for `version===2` quotes |
| `src/lib/drywall/orderFinancialComparison.ts:158` | Order page margin for **every** project | v3 projects arrive through `projectV3QuoteToV2Shape` (OrderPage.tsx:107-108) → `calculateQuoteTotals` runs on a synthetic v2 blob |
| `src/lib/drywall/convertQuoteV2ToV3.ts:153` | component starter lines | needed only while v2 quotes exist |
| `src/services/drywallProjectsService.ts:878` | `revertQuoteToV2` | rollback path from `QuoteV3RevertToV2Button` |
| `src/lib/drywallQuotePdf.ts` (×6) | v2 PDF | reachable only from `QuoteStage.tsx:8` (v2 UI) |
| `src/components/drywall/field/FieldMeasurementPage.tsx:112-113` | passes `v2QuoteFromV3Snapshot(quote.legacyV2Snapshot)` to `FieldAccessoriesSection` | field accessories for a v3 project read the **stale v2 snapshot**, not live v3 lines |
| `src/services/crewWorkspaceService.ts:648,677` | crew scope add-on lines from v2 snapshot | same staleness |
| `estimatedLabor.ts:125-150` / `estimatedMaterial.ts:280-300` | v2 branch reads stored `calculations` blob | not the engine, but the blob format |

Routing: `QuoteStageRoute.tsx:44-55` — v3 if `version===3`; else v2 only if `shouldUseV2QuoteStage` (has real v2 data or `preferV2QuoteEditor`), otherwise auto-converts. So **every old v2 quote with sqft>0 still opens the v2 editor** until someone clicks Convert. There is no telemetry on how many remain.

## 2. Correctness findings

### High

**H1. Order-page margin ignores every non-drywall trade on v3 quotes.**
`projectV3QuoteToV2Shape.ts:65-100` builds `calculations.totalDirectCost` from *drywall lines only* (`drywallLines.map(computeLineItem…)`), then attaches the **whole-quote** `routine.overheadAmount`/`profitAmount`/`salesTaxAmount` and `finalTotal = acceptedTotal`. `orderFinancialComparison.ts:158-171` then computes `baselineProfit = baselineTotal − baselineDirect`.
Scenario: v3 quote = $40k drywall + $25k metal stud + $10k RC. Order page shows direct cost ≈ $40k-ish vs bid $75k → margin ~45% when the true margin is the org's ~25-30%. The D.4 margin-floor gate on the Order page is therefore blind to component-heavy commercial jobs (exactly the Togal-import jobs being added now).
Also L65-67 calls `computeLineItem` without `allocatedBeadSticks`, so accessories are under-counted even for drywall.
Fix: stop re-deriving; take `routine.materialSubtotal + accessoriesSubtotal` for material, `hanger+finisher+componentLabor+cleanup` for labor, `routine.markupBase` for direct (all already in `QuoteV3MarkupBreakdown`). Net accepted alternates via `summary.breakdown.*` (already linear). ~40 lines.

**H2. v2→v3 conversion of FRP multiplies material by ~32×.**
`convertQuoteV2ToV3.ts:270-283` sets `custom_material_rate = frpSheetRate` on a line whose `quantity` is **sqft**. In v2, `frpSheetRate` is $/sheet (`QuoteFrpPanel.tsx:26` "Sheets = SF ÷ 32"; engine L409-421 `sheets = sf/32 … sheetsWithWaste × sheetRate`). It also drops adhesive/division-bar/corner/J-mold sticks entirely. The parity fixtures contain no FRP project (`scripts/fixtures/quote-v3-parity-fixtures.json` has only acoustic/insulation/metal-stud/grid flags), so the "$0.00 parity" claim never exercised this path. Fix: `custom_material_rate = calc.frpMaterialCost / frpSqft` (blended, like insulation at L180-187).

**H3. v2→v3 conversion of RC channel silently changes waste and adds screws.**
Converter (L155-169) never sets `waste_pct` or `accessories_in_material_rate` on the RC line. `computeLineItem` then applies `waste_pct ?? 10` (`quoteV3Math.ts:274`) whereas v2 defaults RC waste to 0 (`buildDrywallQuoteCalculations.ts:238`), and `computeRcChannelScrews` adds fine-thread screw boxes (L286-291) that v2 never priced. Labor also shifts from `ceil(pieces×waste) × $/piece` to `LF×1.1 × $/piece÷12`. Again untested: no RC fixture. Fix: set `waste_pct: parseNum(v2.rcChannelWastePercentage, 0)` and `accessories_in_material_rate: true` on converted RC lines.

### Medium

**M1. Bid snapshot per-line totals use catalog rates, not project rates.**
`bidSnapshot.ts:25-31` `laborBurdenFromV3Quote` omits `projectHangerRate`/`projectFinisherRate` (and bead sticks). `computeLineItem` (L43) therefore prices hanger/finisher at the board/finish-scope catalog rate while `totals` (L39) used project rates. `payload.lineItems[].computed_line_total` disagree with `bidTotal`. Today the only consumer (`drywallScopeRevenue.ts`) is dead (see §4), so impact is latent — but the snapshot is the permanent audit record. Fix: reuse `laborBurdenFromQuote` from `quoteV3Math.ts:687` (export it) everywhere: `bidSnapshot.ts`, `estimatedLabor.ts:113`, `projectV3QuoteToV2Shape.ts:58`.

**M2. Estimated material (project cost page, KPI aggregate) omits bead-stick accessories.**
`estimatedMaterial.ts:312` `computeLineItem(line, catalogs)` — no `allocatedBeadSticks` → corner bead LF, extra lite-weight boxes and Easy Sand bags (`quoteV3Accessories.ts:141-157,303-308`) vanish. `drywallProjectCostService.ts:369` and `drywallDivisionAggregateService.ts:299` under-report estimated material vs the quote sidebar. Fix: use `lineDirectCostsFromLines(..., quote.bead_sticks).byTrade` instead of per-line recompute (same fix shape as H1).

**M3. Alternates never carry cleanup labor; deduct alternates don't reduce it.**
`quoteV3Math.ts:746-755` passes `cleanupTotal=0` for every alternate; `projectV3QuoteToV2Shape.ts:92` nets `summary.breakdown.cleanupTotal` which is always 0. A deduct alternate that removes 3,000 sqft still bills prep/clean on those sqft in the contract total, while `acceptedSqft` (L775) drops. Decide: either alternates get `computeCleanupTotal(alt.lineItems, prepCleanRate, laborBurden)` or document that cleanup is base-only. ~10 lines either way.

**M4. Metal-stud labor rate resolves two different ways.**
`computeLineItem` uses `getMetalStudLaborRate(catalogs, size, gauge)` (L400-403, keyed on size×gauge) but `getCatalogDefaultComponentLaborRate` (`quoteV3CatalogResolve.ts:133-134`) looks up `catalog_id`, which metal-stud lines never set (`createQuoteLineItem` L370-402). Consequences: `laborAmountTooltip` (`quoteV3LineAmountTooltips.ts:90`) and `ComponentLaborRateCell` show $0.00 labor rate while the line prices at $12/LF. The tooltip also says `qty × rate` for all component trades while the engine uses `qty × waste × rate × burden`.

**M5. Tax basis for the margin-floor check differs by surface.**
`QuoteStageV3.tsx:222-226` sends `linesSubtotal + cleanup + salesTax` as estimated cost; `marginFloor.ts:51-53` `computeQuoteEstimatedCost` (used by v2 stage / snapshots) excludes sales tax. Same quote, two margins. Also `QuoteOutcomeBar` receives `currentBidTotal={totals.routine.total}` (base only) while the snapshot stores `acceptedTotal` — a selected deduct alternate is invisible to the below-floor gate.

**M6. Typing a material rate on a grid/acoustic/metal-stud line silently disables itemization.**
`isMaterialRateEnabled` (`quoteV3CatalogResolve.ts:264-268`) returns true for all component lines; any value in `MaterialRateCell` sets `custom_material_rate`, and `computeLineItem` L309/356/405 then takes the "converted/blended" branch — no warning, `gridBreakdown` disappears from the pivot. Should be gated: blended branch only when `override_reason === V3_LINE_MIGRATION_OVERRIDE_REASON` or via an explicit "lump-sum" toggle.

**M7. Field measurement / crew scope read the stale v2 snapshot for v3 projects.**
`FieldMeasurementPage.tsx:110-115` and `crewWorkspaceService.ts:648,677` derive accessories and add-on scope lines from `legacyV2Snapshot`, which is frozen at conversion time. A v3 quote edited after convert (new RC lines, changed finish) is not reflected in field accessories or the crew's scope card. Native-v3 quotes (no snapshot) get an empty v2 shell. This is the biggest functional reason v2 can't be retired yet.

### Low

**L1.** Labor for insulation/FRP/door_install is multiplied by material waste (`quoteV3Math.ts:457-460`); a 10% waste on doors pays 10% more install labor. Metal stud does the same (L438-439) but that matches v2 (L471). Decide per trade; at minimum doors should not.
**L2.** `computeQuoteV3Totals` (L716) runs `computeQuoteAccessoryRollup` over routine **and alternates** and stores it as `routine.accessoryByCategory` — never read by any UI (grep: only `quoteV3Math.ts`). Wasted compute on every keystroke plus a misleading field.
**L3.** RC LF formula exists twice: `quoteV3Math.ts:268-275` and `quoteV3Accessories.ts:333-346` (`rcChannelLfFromLine`), plus a third in `LineItemEditDialog.tsx:61-72`. Grid counts exist in `quoteV3Math.ts:303-307`, `LineItemEditDialog.tsx:84-90` and `calculations/suspendedGridCalc.ts:98-103`.
**L4.** Acoustic convert fallback `sqft = acousticCeilingPerimeter` (`convertQuoteV2ToV3.ts:205-207`) prices a ceiling by its perimeter when sqft is blank.
**L5.** `createQuoteLineItem` defaults `custom_labor_rate: 2.0` for grid/acoustic (`createEmptyDrywallQuoteV3.ts:400`) — a hardcoded rate that bypasses the catalog and will look like an "override" forever.
**L6.** Togal v3 import: `parseStudSizeGauge` treats any "18"/"25" substring as gauge (`quoteTakeoffImportV3.ts:80-82`) — "3 5/8" 25ga @ 18' " is ambiguous; and the metal-stud branch uses `qtySf` as LF when no LF column exists (L140).
**L7.** `LABOR_TAX_RATE` is duplicated as the literal `1.25`/`(1 + LABOR_TAX_RATE)` in 9 places across the v2 engine and helpers instead of `applyLaborBurden`; only v3 goes through the helper.

## 3. Duplication / consolidation

| What | Where (copies) | Consolidation shape | Size |
|---|---|---|---|
| Drywall breakdown item math (material/labor/tax/OH/profit) | `buildDrywallQuoteCalculations.ts` L631-684, L731-775, L777-823 (three near-identical reduces); `quoteCalculations.ts` L175-214 | v2 only — do not refactor, retire (§5) | — |
| RC piece/labor math | v2 engine L251-290 + L858-942 (two more copies), `rcChannelLineTotal.ts`, `QuoteTotalsSummary.tsx:111-120`, `QuoteRcChannelPanel.tsx:42,67,139` | v2 only — retire | — |
| RC LF (v3) | `quoteV3Math.ts:268-279`, `quoteV3Accessories.ts:333-346`, `LineItemEditDialog.tsx:61-72` | one `rcChannelGeometry(line, catalogs)` returning `{lf, lfWasted, pieces}` used by all three | S |
| Grid / acoustic counts (v3) | `quoteV3Math.ts:299-307,340-354`, `LineItemEditDialog.tsx:76-113`, `AcousticPivotSection.tsx:31-70` (`acousticRows`), `suspendedGridCalc.ts:87-114` | expose `gridBreakdown`/`acousticBreakdown` from `computeLineItem` (already returns `gridBreakdown`) and have UI read it; delete UI copies | S-M |
| Labor-burden option builders | `quoteV3Math.ts:687`, `quoteV3PdfModel.ts:103`, `bidSnapshot.ts:25`, `estimatedLabor.ts:113`, `projectV3QuoteToV2Shape.ts:58` (three of five are incomplete → M1) | export one `laborBurdenFromQuote` | S |
| Per-trade material/labor sell split | `drywallQuotePdfV3.ts:607-620`, `tradePdfBreakdown.ts` (v2), `QuoteTotalsSidebar.tsx:120-170` reads `byTrade` directly | PDF should consume `routine.byTrade` via one `splitTradeSell(byTrade, subtotal)` helper in `quoteV3PdfModel.ts` | S |
| Pivot sections | `RcChannelPivotSection` 493, `MetalStudPivotSection` 394, `AcousticPivotSection` 315 — each re-implements `byLocation` grouping (RC L67-79, MS L59-68), `LocationRenameInput` (RC L406-439, duplicated in MS), `RateInput` draft-commit pattern, section header/subtotal chrome | extract `TradePivotShell` (header, location grouping, rename input, add/remove, subtotal) + `DraftNumberInput`; each trade supplies a spec-header renderer and a row renderer. Expect ~1,200 → ~650 lines | M |
| Three "v2-shape" projections of v3 | `projectV3QuoteToV2Shape.ts` (Order), `estimatedLabor/Material` v3 branches, `bidSnapshot` v3 branch | all should read `computeQuoteV3Totals().routine` fields, not recompute lines | S each |

## 4. Dead or dormant code (verified by grep, tests excluded)

| Symbol / file | Evidence |
|---|---|
| `src/lib/drywall/drywallScopeRevenue.ts` (+ test) | `deriveDrywallScopeRevenue` has zero callers |
| `applyProjectMarkup`, `enrichLineWithComputed`, `enrichQuoteAlternates` in `quoteV3Math.ts` | only referenced inside their own file |
| `summarizeAccessoryItems`, `computeQuoteAccessoryRollup` (external), `routine.accessoryByCategory` | rollup called only from `quoteV3Math.ts:716`; output never consumed |
| `QuoteLineItem.computed_material_total/labor/accessories` fields (`types/drywall.ts:577-579`) | written only by dead `enrichLineWithComputed` |
| `DrywallQuoteTotals` type (`types/drywall.ts`) | no references |
| `calcSuspendedGridComponentCounts` | only v2 panel `QuoteSuspendedGridPanel.tsx` |
| `quotePricingEngine.ts` | single caller `quoteCalculations.ts` (v2) |
| `tradePdfBreakdown.ts` | single caller v2 PDF |
| `quoteV3Feature.ts` | hardcoded `true`, gate is vestigial |
| `QuoteV3RevertToV2Button` + `revertQuoteToV2` | live but is the v2-resurrection path; keep until §5 step 4 |

Not dead but dormant: `accessoryCalc.ts` (v2 field accessories, still used by `FieldAccessoriesSection`), `deriveAddonFlagsFromData.ts` (v2 stage + revert).

## 5. v2 retirement readiness

Still depends on v2 engine or v2 shape:

1. Unconverted v2 quotes → `QuoteStage` v2 editor (route gate `QuoteStageRoute.tsx:49`).
2. Order page → `projectV3QuoteToV2Shape` → `orderFinancialComparison` (H1).
3. Field accessories + crew scope → `legacyV2Snapshot` (M7).
4. Bid snapshot v2 branch, v2 PDF, `estimatedLabor/Material` v2 branches — needed only for projects whose quote is still v2 **or** whose snapshot/`calculations` blob is v2-shaped (approved historical jobs keep their v2 `bidSnapshot`; that's fine — snapshot is data, not code).
5. `convertQuoteV2ToV3.ts` calls the engine for component starter lines (L153).

Sequenced plan:

| Step | Action | Confirms |
|---|---|---|
| 0 | Add `scripts/scan-quote-versions.mjs` (mirror `scan-drywall-quotes.mjs`): count `legacy.quote.version` ∈ {2, 3, missing}, outcome, and last `updatedAt` per project. | Baseline: how many live v2 quotes exist and which are drafted vs sent/approved. |
| 1 | Fix H2/H3, add RC + FRP fixtures to `scripts/fixtures/quote-v3-parity-fixtures.json`, re-run `quote-v3-parity.harness.test.ts`. | Converter is safe for all 7 v2 trades. |
| 2 | Rewrite `projectV3QuoteToV2Shape` (H1) *or* give `orderFinancialComparison` a native v3 input (`routine.markupBase`, labor by trade). Field/crew pages read live v3 lines for accessories/scope (M7) with `legacyV2Snapshot` as fallback only. | Order/Field/Crew no longer need a v2 blob for v3 projects. |
| 3 | Bulk convert remaining drafted v2 quotes (existing `convertQuoteToV3`); leave sent/approved v2 quotes as-is (they're locked) or convert with snapshot. Route gate becomes: `version===3 ? v3 : convert`. | Scan from step 0 returns zero `version===2` with outcome `drafted`. |
| 4 | Delete v2 UI (`QuoteStage.tsx` + 14 panels, ~4,900 lines), `drywallQuotePdf.ts`, `tradePdfBreakdown.ts`, `quoteCalculations.ts`, `quotePricingEngine.ts`, `rcChannelLineTotal.ts`, `suspendedGridCalc.ts`, `quoteTakeoffImport.ts`, `QuoteV3RevertToV2Button`/`revertQuoteToV2`. Keep `buildDrywallQuoteCalculations.ts` only if the converter still needs it (or precompute the blended rates once at convert and drop it too). | `grep buildDrywallQuoteCalculations` → converter only. |
| 5 | Keep `legacyV2Snapshot` on converted quotes (read-only rollback evidence; ~5-20 KB each, cheap after the metadata cleanup) but remove the "Revert to v2" UI. Keep `estimatedLabor/Material` v2 branches only for reading historical `calculations` blobs on closed jobs, or backfill those to a v3-shaped snapshot. | — |

Rollback value of `legacyV2Snapshot`: high until step 3 completes (it powers refresh-from-snapshot and the audit in `staleV3ConvertAudit.ts`); after step 4 it is archival only.

## 6. Test coverage

Covered (all in `src/lib/drywall/*.test.ts`): RC channel geometry/burden/screws; suspended grid itemized parity + overrides; metal stud stud/track/deflection; generic waste+burden; bead-stick allocation; labor-rate override precedence + tooltip parity; hydrate round-trip of geometry; PDF line allocation and tax modes; Togal v3 parse; estimated labor/material v2+v3 (partially); change-order and contract-value math; acoustic counts.

Untested critical math: `computeMarkupBreakdown` order of operations (tax → OH → profit) on its own; `computeQuoteV3Totals` alternates (add/deduct, `acceptedTotal`, `acceptedSqft`); acoustic `computeLineItem` (only the count helper is tested); door_install/FRP lines; `convertQuoteV2ToV3` for RC/FRP/acoustic/insulation (only via parity fixtures, which lack RC and FRP); `bidSnapshot.buildBidSnapshotFromV3Quote`; `projectV3QuoteToV2Shape`; `orderFinancialComparison` on a v3-projected quote; `estimatedMaterial` v3 with bead sticks.

Five highest-value tests to add:
1. **Cross-surface totals invariant**: for a fixture quote with all 8 trades + bead sticks + one deduct alternate, assert `computeQuoteV3Totals().routine.total` equals (a) `buildBidSnapshotFromV3Quote().payload.bidTotal`, (b) sum of `buildQuoteV3PdfLineRows` sell totals, (c) `projectV3QuoteToV2Shape().calculations.finalTotal`; and that snapshot `lineItems` sum equals `routine.linesSubtotal`. Catches H1, M1, M2 at once.
2. **Converter per-trade parity for RC and FRP** (`convertQuoteV2ToV3`): v2 fixture with `includeRcChannel` (waste 0) and `includeFRP` → v3 `byTrade.rc_channel`/`frp` material+labor within $0.01 of `calc.rcChannel*`/`calc.frp*`. Catches H2/H3 and pins future converter edits.
3. **Alternates netting**: deduct alt of 1,000 sqft drywall → `acceptedTotal = routine.total − alt.magnitude`, `acceptedSqft` drops 1,000, and (after M3 decision) cleanup behaves as specified.
4. **Order-page margin on v3**: `buildOrderFinancialComparison(projectV3QuoteToV2Shape(q))` for a mixed-trade quote yields `baselineDirect ≈ routine.markupBase` and margin ≈ org target — currently fails.
5. **Metal-stud rate resolution consistency**: `getEffectiveComponentLaborRate(line)` equals the rate used by `computeLineItem` for a metal-stud line with empty `catalog_id`; and `laborAmountTooltip` reproduces `computed.laborTotal` for every component trade (extend the existing drywall-only test).

## 7. Top 10 actions (value/risk order)

| # | Action | Size |
|---|---|---|
| 1 | Fix H1: derive Order-page direct cost from `routine` (component trades + accessories included); add test #4 | S |
| 2 | Fix H2 + H3 in converter; add RC + FRP parity fixtures; re-run harness (test #2) | S |
| 3 | Export one `laborBurdenFromQuote`; use it in bidSnapshot, estimatedLabor, projectV3QuoteToV2Shape, PDF model (M1) | S |
| 4 | Replace per-line recompute in `estimatedMaterial`/`estimatedLabor`/`bidSnapshot`/`projectV3QuoteToV2Shape` with `lineDirectCostsFromLines(..., bead_sticks)` / `routine.byTrade` (M2) + invariant test #1 | S-M |
| 5 | Write `scan-quote-versions.mjs`; get the real count of live v2 quotes (retirement step 0) | S |
| 6 | Decide alternate cleanup semantics (M3) and unify margin-floor cost basis + accepted-total input (M5) | S |
| 7 | Gate the blended `custom_material_rate` branch on migration marker / explicit lump-sum flag (M6); fix metal-stud rate resolution + component tooltip formula (M4) | S |
| 8 | Field/crew pages read live v3 lines for accessories & scope, snapshot as fallback (M7) — unblocks retirement | M |
| 9 | Delete dead code (§4): `drywallScopeRevenue.ts`, `enrich*`/`applyProjectMarkup`, accessory rollup + `accessoryByCategory`, `computed_*` line fields, `DrywallQuoteTotals`, `quoteV3Feature` | S |
| 10 | Extract `TradePivotShell` + shared geometry helpers (RC LF, grid counts) so the next trade is a row renderer, not a 400-line file (§3) | M |

Then, once #5 shows zero drafted v2 quotes: retirement steps 3-4 (delete ~7,500 lines of v2 UI/engine/PDF).
