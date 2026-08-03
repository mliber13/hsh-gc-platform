# Suspended Drywall Grid — detailed v3 port (Option B)

_Design brief, 2026-08-03. Quote due the 12th, so design-first. Goal: give the v3 quote engine the same **itemized** suspended-grid estimating the v2 engine has (mains / cross-tees / wire / lags / wall-angle counts × rates + carpenter labor), instead of the current flat blended $/sqft line. Money-sensitive — acceptance bar is v3 == v2 total at ~$0.00 for the same inputs._

---

## Where it stands today
- **v2** (`calculations/suspendedGridCalc.ts`, `@ts-nocheck`) computes component **counts** from sqft + perimeter + waste, then material = Σ(count × rate), labor = sqft × carpenter rate, then labor tax → sales tax → overhead → profit.
- **v3** treats `suspended_grid` as the generic component line: `material = qty × material_rate`, `labor = qty × labor_rate` (`quoteV3Math.ts:225` else-branch). No itemization.
- The `suspended_grid` catalog is **empty** (`catalogSeeds.ts:190`).
- RC channel (`quoteV3Math.ts:200-224`) is the proven pattern for a detailed component in v3: dedicated line fields (`rc_surface`, `rc_spacing_in`, `rc_wall_height`) + a math branch + catalog rates.

## The v2 count formulas (to preserve exactly — `suspendedGridCalc.ts:20-25`)
Given `sqft` (after waste) and `perimeter` (after waste; derived `4 × √sqft` if not entered):
- **wall angle (shiny90):** `ceil(perimeter / 8)` → × `shiny90Rate` ($/pc)
- **mains (12ft):** `ceil((sqft / 4) / 12)` → × `mainsRate` ($/pc)
- **cross-tees (4ft):** `ceil((sqft / 16) × 2)` → × `tees4ftRate` ($/pc)
- **wire:** `ceil(sqft / 5)` LF → × `wireRate` ($/LF)
- **lags:** `ceil(wireLF / 8)` → × `lagsRate` ($/pc)
- **carpenter labor:** `sqft × carpenterRate` ($/sqft), then labor burden.

---

## Design (mirror the RC-channel pattern)

### 1. Catalog — extend the `suspended_grid` entry
Add the itemized rates so they're set once, org-level (Settings → Catalogs), like RC channel's per-piece rate:
- `shiny90_rate`, `mains_rate`, `tees_rate`, `lags_rate` — $/piece
- `wire_rate` — $/LF
- `carpenter_rate` — $/sqft (labor)
- `default_waste_pct` (optional)
- **Keep the existing `material_rate`** (blended) for backward compat / converted lines.
- **Seed** these from the existing v2 `suspendedGridPricing` defaults + `carpenterRate` (exact values pulled at build time).

### 2. Line fields — add to `QuoteLineItem` for `suspended_grid`
- `quantity` = base grid **sqft** (existing).
- `grid_perimeter?: number` — optional; derived `4 × √sqft` when blank (new field).
- `waste_pct` (existing line field).
- _(Converted lines keep their `custom_material_rate` / `custom_labor_rate` — see §5.)_

### 3. Math — new `else if (line.type === 'suspended_grid')` in `quoteV3Math.ts`
- If the line has a **`custom_material_rate`** set (i.e. a converted/blended line) → price blended: `material = qty × custom_material_rate`. Else → compute counts (reuse the v2 formulas) × catalog rates → material. Same fallback for labor (`custom_labor_rate` → blended; else `sqft × carpenter_rate`).
- Apply labor burden (`componentIncludeLaborBurden`) like other components; sales tax stays applied at the quote level (v3 applies tax separately).
- Return the computed counts on the line-computed object so the UI + PDF can show the breakdown.

### 4. Edit dialog — `LineItemEditDialog` suspended-grid section
- Inputs: sqft (qty), **perimeter** (optional override), waste %.
- Show the **computed counts** (mains / tees / wire / lags / angle) with their catalog rates — transparency for the estimator.
- **[DECISION — see below]** allow per-count overrides, or computed-only.

### 5. Converter — leave unchanged
`convertQuoteV2ToV3.ts:252-266` keeps back-computing blended `custom_material_rate`/`custom_labor_rate` for converted grid lines. Those price via the blended fallback in §3, so **converted quotes keep $0.00 parity** and are not retro-detailed. Only NEW lines use the itemized path.

### 6. Verification (acceptance bar)
- Add a **parity assertion** (reuse `scripts/lib/quoteV3ParityEngine.ts` from the quote-trust batch): a v3 detailed grid line must equal the v2 grid total for the same sqft/perimeter/waste/rates at ~$0.00.
- `npx tsc --noEmit` clean; existing quote tests green.
- Manual: build the real commercial quote (drywall + RC + grid) end-to-end and sanity-check the grid material breakdown against a hand takeoff.

---

## Open decisions for Mark
1. **Count overrides** — should the estimator be able to hand-override the computed mains/tees/wire/lags/angle counts per line (v2 allowed this, useful for odd commercial layouts), or is **computed-from-sqft+perimeter** enough for now? _Recommend: computed + shown, with overrides — commercial estimators use them, and it's cheap on top of this build._
2. **Rates in catalog** — confirm the itemized rates live in the `suspended_grid` catalog (org-level, editable in Settings), seeded from the v2 defaults. _Recommend: yes — matches RC channel + v3 architecture._
3. **Converted lines stay blended** — confirm we don't retro-detail already-converted grid lines (preserves parity). _Recommend: yes._

## Build order (once signed off)
1. Catalog schema + seed (with the v2 default rates).
2. `QuoteLineItem` field (`grid_perimeter`) + `createEmptyDrywallQuoteV3` defaults.
3. `quoteV3Math.ts` suspended-grid branch (+ blended fallback) + expose counts.
4. `LineItemEditDialog` grid section (+ overrides if chosen).
5. Parity assertion + tests.
6. (If needed) PDF line breakdown shows grid components.
