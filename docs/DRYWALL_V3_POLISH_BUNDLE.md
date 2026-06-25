# Drywall V3 Polish Bundle — Pre-Launch

Six v3-related fixes batched into one detour. Surface during the launch smoke test 2026-06-18. Cursor implements in order; type-check + verify after each item.

**Working assumptions:**
- v3 quote engine math is correct; these are display, default, and integration fixes
- Legacy v2 quotes continue working — only **new** projects skip v2
- Per-line labor rate overrides removed from UI; per-line `custom_hanger_rate` / `custom_finisher_rate` fields remain in schema (no longer settable from UI)

---

## #1 — Default new drywall projects to v3 (~10 min)

**Problem:** New drywall projects load the legacy v2 builder. User has to click "Convert to line items" before getting to v3. v3 is the future; v2 should be detected only when actual v2 data exists.

**Fix:** Update [`QuoteStageRoute.tsx`](../src/components/drywall/quote/QuoteStageRoute.tsx) detection logic:

Current behavior at `setIsV3(isDrywallQuoteV3(quote))`:
- New project → quote is empty `{}` → hydrated to v2 shape → `isDrywallQuoteV3` returns false → v2 builder renders

New behavior:
- Detect if saved quote has **actual v2 data** (any of: `breakdowns.length > 0`, `sqft > 0`, `materialRate > 0`, etc. — anything indicating real v2 content)
- If empty `{}` OR v3 → render v3 builder
- If real v2 content → render v2 builder (legacy projects unchanged)

For empty quotes specifically: auto-convert to v3 on first load by calling `convertQuoteToV3(projectId)` which initializes a fresh v3 envelope.

**Acceptance:**
- New "from scratch" project → lands on v3 quote builder immediately (no Convert banner)
- Existing v2 project with breakdowns → still shows v2 builder + Convert banner
- Existing v3 project → still shows v3 builder

---

## #2 — Sales tax sidebar label (5 min)

**Problem:** [`QuoteTotalsSidebar.tsx`](../src/components/drywall/quote/v3/QuoteTotalsSidebar.tsx) line 142 reads:
```
label={`Sales tax (${formatPctLabel(quote.sales_tax_pct)}% of ${formatQuoteMoney(markupBase + routine.overheadAmount + routine.profitAmount)})`}
```
The "$X" refers to grand total, but sales tax is calculated on **materials only** ($1,234 in the test case, NOT $4,212.73). Misleading.

**Fix:** Change the label to reference materials. Math is right; just the parenthetical needs to read "% of materials" with the actual material subtotal value, OR drop the parenthetical entirely.

Suggested:
```ts
label={`Sales tax (${formatPctLabel(quote.sales_tax_pct)}% on materials)`}
```

**Acceptance:** Sidebar label reads "Sales tax (7.25% on materials)" with the dollar amount on the right unchanged.

---

## #3 — Accessories "incl. waste" hint (5 min)

**Problem:** [`AccessoryBreakdownPopover.tsx`](../src/components/drywall/quote/v3/AccessoryBreakdownPopover.tsx) shows the accessories total but no visual indicator that it scales with waste. Material and Labor both have "incl. waste" hints now (Material since launch; Labor added 06-18). Accessories should too.

**Fix:** Add the same "incl. waste" subscript pattern below the dollar amount when total > 0. Matches [`CurrencyAmountCell.tsx`](../src/components/drywall/quote/v3/CurrencyAmountCell.tsx) pattern.

**Acceptance:** Accessories total cell in line items table shows "incl. waste" below the dollar value on drywall lines with waste > 0.

---

## #4 — Margin calc includes sales tax (~10 min)

**Problem:** D.4's `computeQuoteEstimatedCost(routine, cleanup)` excludes sales tax. But HSH pays sales tax at material purchase (Ohio "real property improvement" model — contractor is consumer of materials). Sales tax IS a cost. Excluding it from the margin denominator makes displayed margin ~2% optimistic.

**Fix:** Update margin computation at the **call sites** in [`QuoteOutcomeBar.tsx`](../src/components/drywall/quote/QuoteOutcomeBar.tsx) and [`FieldMeasurementPage.tsx`](../src/components/drywall/field/FieldMeasurementPage.tsx) to pass `routine.linesSubtotal + routine.cleanupTotal + routine.salesTaxAmount` (or equivalent) as the estimated cost.

For QuoteOutcomeBar: change the `quoteEstimatedCost` prop computation on the parent (QuoteStageV3 line ~220) to include sales tax:
```tsx
quoteEstimatedCost={totals.routine.linesSubtotal + totals.routine.cleanupTotal + totals.routine.salesTaxAmount}
```

For FieldMeasurementPage (PO gate): the PO path doesn't have a routine — it uses `po_estimated_cost_per_sqft × fieldSqft`. That cost is already the all-in rate including tax implicitly. No change for PO path.

For the v3 sidebar's live "Margin vs Floor" indicator at [`QuoteTotalsSidebar.tsx`](../src/components/drywall/quote/v3/QuoteTotalsSidebar.tsx): same change — include `routine.salesTaxAmount` in the estimated cost passed to `evaluateMarginVsFloor`.

**Acceptance:**
- Quote with 30% set profit shows margin ~30% (close to declared profit), NOT 32%
- Below-floor gate fires more accurately
- Test quote: 2,000 sqft × 10% waste, 30% profit, 6% overhead → margin should display ~30% (was 32.2%)

---

## #5 — Order Financial Card v3 compatibility (~30-45 min)

**Problem:** [`OrderPage.tsx`](../src/components/drywall/order/OrderPage.tsx) calls `fetchDrywallQuote` (v2 shape). For v3 projects, this returns an empty v2 (from `v2QuoteFromV3Snapshot` of empty legacyV2Snapshot). `OrderFinancialCard` reads `quote.sqft`, `quote.hangerRate`, `quote.finisherRate`, `quote.prepCleanRate` → all zero/undefined. Financial comparison shows nothing useful.

**Fix:** In OrderPage:
1. Switch fetch to `fetchDrywallQuoteV2V3(projectId)` returning `DrywallQuoteV2V3`
2. Derive a **v2-shape projection** from the v3 quote that populates the fields OrderFinancialCard needs:
   ```ts
   function projectV3QuoteToV2Shape(v3: DrywallQuoteV3, catalogs: OrgDrywallCatalogs): DrywallQuote {
     const drywallLines = v3.lineItems.filter(l => l.type === 'drywall')
     const totalSqft = drywallLines.reduce((sum, l) => sum + (l.quantity || 0), 0)
     const wastePct = drywallLines[0]?.waste_pct ?? 10  // use first line's waste (best heuristic for project-level)

     // Average rates across drywall lines (post-promotion #6, this becomes the project-level rate)
     const hangerRate = avgPositive(drywallLines.map(l => getEffectiveHangerRate(l, catalogs)))
     const finisherRate = avgPositive(drywallLines.map(l => getEffectiveFinisherRate(l, catalogs)))
     const prepCleanRate = v3.prep_clean_rate

     return {
       version: 2,
       sqft: totalSqft,
       wastePercentage: wastePct,
       hangerRate,
       finisherRate,
       prepCleanRate,
       overheadPercentage: v3.overhead_pct,
       profitPercentage: v3.profit_pct,
       salesTaxRate: v3.sales_tax_pct,
       // Note: materialRate is more complex (per-line catalog rate); use weighted average or first line
       materialRate: avgPositive(drywallLines.map(l => getLineMaterialRate(l, catalogs))),
     }
   }
   ```
3. After #6 ships (labor rate promotion), use `v3.project_hanger_rate` / `v3.project_finisher_rate` directly instead of averaging line-level values.

**Acceptance:**
- For a v3 project on the Order tab, OrderFinancialCard shows correct Quoted sqft, hanger/finisher/prep-clean rates, and the variance comparison renders real numbers
- For a v2 project, behavior unchanged

---

## #6 — Promote labor rates from per-line to project-level (~60-90 min)

**Problem:** Per-line `Hanger rate` and `Finisher rate` columns in the line items table are too granular. Most jobs have one hanger rate and one finisher rate; what varies per line is board and finish scope.

**Design (locked Option A):**
- Add `project_hanger_rate?: number` and `project_finisher_rate?: number` to `DrywallQuoteV3` type
- New UI inputs in [`QuoteTotalsSidebar.tsx`](../src/components/drywall/quote/v3/QuoteTotalsSidebar.tsx) Rates section (between Cleanup labor and Overhead %): "Hanger rate (per drywall sqft)" + "Finisher rate (per drywall sqft)"
- Remove `Hanger rate` and `Finisher rate` columns from [`LineItemsTable.tsx`](../src/components/drywall/quote/v3/LineItemsTable.tsx) (header at line 281 area + the corresponding td cells)
- Per-line `custom_hanger_rate` / `custom_finisher_rate` fields stay in schema but no UI to set them (preserved for future advanced use)
- Rate priority in v3 math:
  1. `line.custom_hanger_rate` if set (advanced override, no UI for V1)
  2. `quote.project_hanger_rate` if set
  3. Board's catalog `hanger_rate` (existing fallback)
  Same for finisher: line.custom > quote.project > finish_scope.finisher_rate

**Migration:** No DB migration needed (JSONB). Existing v3 quotes without `project_hanger_rate` fall through priority to per-line / catalog. New quotes use project-level rates.

**Files to modify:**

- `src/types/drywall.ts` — add `project_hanger_rate?: number`, `project_finisher_rate?: number` to `DrywallQuoteV3`
- `src/lib/drywall/createEmptyDrywallQuoteV3.ts` — hydrate logic (defaults from catalog or undefined)
- `src/lib/drywall/quoteV3Math.ts` — update `computeLineItem` priority chain for hanger + finisher rate resolution (line 150-151 area)
- `src/lib/drywall/convertQuoteV2ToV3.ts` — `buildV3FromV2`: set `project_hanger_rate: v2.hangerRate`, `project_finisher_rate: v2.finisherRate` for converted quotes
- `src/lib/drywall/bidSnapshot.ts` — no change (snapshot already uses computed values via `computeLineItem`)
- `src/components/drywall/quote/v3/QuoteTotalsSidebar.tsx` — add two new rate inputs in Rates section; pass through `onChange({ project_hanger_rate, project_finisher_rate })`
- `src/components/drywall/quote/v3/LineItemsTable.tsx` — remove `Hanger rate` and `Finisher rate` columns (headers + cells)
- `src/components/drywall/quote/v3/QuoteStageV3.tsx` — confirm `patchQuote` still accepts these new fields (should via existing Partial<DrywallQuoteV3>)

**Acceptance:**
- New v3 quotes show project_hanger_rate and project_finisher_rate inputs in sidebar (with sensible defaults from BASE_DEFAULTS or first board/finish catalog entries)
- Line items table has 2 fewer columns (no hanger/finisher rate per line)
- Math correctly uses project-level rate as primary source
- Existing v3 quotes without project-level rates fall through to catalog defaults seamlessly
- Converting v2 → v3 preserves `hangerRate` / `finisherRate` as project-level values
- Bid snapshot still reflects correct labor amounts post-promotion

---

## Order of work

Recommended sequence (small → big, with dependencies):

1. **#2 sales tax label** (5 min) — pure cosmetic
2. **#3 accessories hint** (5 min) — pure cosmetic
3. **#1 default to v3** (10 min) — small route logic
4. **#4 margin includes sales tax** (10 min) — needs to ship before #6 (so testing #6 isn't muddied)
5. **#6 labor rates project-level** (60-90 min) — schema + UI + math
6. **#5 Order Financial Card v3 compat** (30-45 min) — benefits from #6 (uses project rate fields directly instead of averaging)

Type-check after each. Stop and report if any item breaks something unexpected.

---

## Total estimate

**2-3 hours of Cursor work.** Smoke test resumes from Path A.6 (Order) after this bundle ships.
