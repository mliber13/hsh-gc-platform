# Quote-Trust Batch — implementation brief (v2→v3)

## Goal
Stop the v2→v3 drywall quote convert from **under-pricing**. Three linked defects:
1. Converter **drops material** for insulation, acoustic, metal_stud, suspended_grid.
2. Migrated component lines are **un-editable** (rate cells greyed out) and **wipe their
   carried rate** the moment a catalog is picked.
3. Component catalogs are empty, so new component lines (incl. Door Install) are un-pickable.

This is **financially sensitive** — the acceptance bar is v2==v3 grand total at ~$0.00 delta.

---

## Fix 1 — Converter carries material (`convertQuoteV2ToV3.ts`, `buildComponentStarterLines`)
For the four trades that currently omit `custom_material_rate`, set it by back-computing from the
v2 material total so the **dollar amount is preserved** (the per-unit rate becomes a blended figure —
that's fine; we're preserving totals, not unit fidelity).

Read the **base, pre-tax** material field from `v2.calculations` (v3 applies sales tax separately —
do NOT use the `*TotalMaterialCost`/`*SalesTax` siblings):

| Trade | v2 material field | Divisor (the line `quantity` already computed) | custom_material_rate |
|---|---|---|---|
| metal_stud | `metalStudMaterialCost` | `totalLf` (Σ metalStudEntries.wallLf) | `matCost / totalLf` |
| suspended_grid | `suspendedGridMaterialCost` | `suspendedGridSqft` (or v2.sqft fallback) | `matCost / qty` |
| acoustic | `acousticCeilingMaterialCost` | `acousticCeilingSqft` (or perimeter fallback) | `matCost / qty` |
| insulation | `insulationMaterialCost` | **Σ of ALL insulation entries' sqft** (see below) | blended, see below |

- **Guard divide-by-zero:** if the divisor is 0 (or NaN), do **not** set `custom_material_rate` (leave
  undefined) — never divide by zero.
- **Only set it when the v2 material total > 0** (skip trades with no material).

### ⚠️ Insulation is the tricky one (highest risk — get this right)
The converter emits **one v3 line per `v2.insulationEntries[]` entry**, but `insulationMaterialCost` is a
**single aggregate across all entries**. Do NOT do `insulationMaterialCost / entry.sqft` per line — that
overcounts material by (number of entries). Correct approach: compute a **blended rate once** =
`insulationMaterialCost / (Σ entry.sqft over all insulation entries)`, then apply that SAME
`custom_material_rate` to every insulation line. Then Σ(line.qty × blendedRate) == insulationMaterialCost.
Compute `Σ entry.sqft` before the per-entry loop.

(rc_channel and frp already carry material — leave them unchanged.)

---

## Fix 2 — Make component rate cells editable + stop wiping (the key UX fix)
This also **sidesteps the empty-catalog problem** for converted AND new component lines.

### 2a. Component lines are always rate-editable — `quoteV3CatalogResolve.ts`
Relax the two gates so **component (non-drywall) lines are always editable**, catalog optional
(drywall stays catalog-gated as today):
```ts
export function isMaterialRateEnabled(line: QuoteLineItem): boolean {
  return line.type === 'drywall' ? Boolean(line.catalog_id) : true
}
export function isComponentLaborRateEnabled(line: QuoteLineItem): boolean {
  return line.type !== 'drywall'   // components always editable
}
```
Effect: migrated component lines (empty `catalog_id`, carried custom rate) show their rate and are
editable; net-new component lines (incl. door_install) can take a typed custom rate with no catalog.
The cell shows the effective rate (custom override if set, else catalog default) — unchanged logic in
`getEffective*Rate`, just no longer disabled.

### 2b. Stop wiping carried rates on catalog pick — `LineItemsTable.tsx` (~line 431-450)
The catalog `<select>` onChange currently nulls the customs:
```jsx
patch({ catalog_id: e.target.value, custom_material_rate: undefined, custom_labor_rate: undefined })
```
Change it to **preserve** the carried rates — just set the catalog:
```jsx
patch({ catalog_id: e.target.value })
```
Rationale: picking a catalog categorizes the line; it must not silently zero a migrated rate (that's the
under-pricing bug). The custom rate remains an explicit override; the operator can clear the field to
fall back to the catalog default. (Optional polish: a small "use catalog rate" link that clears the
override — nice-to-have, not required.)

---

## Fix 3 — Catalogs (now optional for correctness)
With Fix 2, converted and new component lines are editable without a catalog, so empty catalogs no
longer block correctness. **No code change strictly required.** (Seeding `catalogSeeds.ts` only affects
brand-new orgs anyway — existing org resolves to `[]` via the parser.) Note for Mark: populate the
Metal Stud / Suspended Grid / Door Install catalogs in Settings → Catalogs for reusable defaults, but
it's convenience, not a blocker.

---

## Existing converted projects (e.g. Lisbon) — the Refresh path
The material-carry fix flows to already-converted quotes via **"Refresh from v2 snapshot"**
(`QuoteV3ConvertBanner` → `refreshQuoteV3FromSnapshot` → `buildFreshV3FromSnapshot` → `buildV3FromV2`).
After this ships, clicking Refresh on a previously-converted project backfills the dropped material.
`describeRefreshFieldChanges` already diffs `custom_material_rate` per line, so the change will surface.

---

## Verification (must pass — this is money)
1. **Parity:** the v2→v3 parity engine (`scripts/lib/quoteV3ParityEngine.ts`) already folds the six
   component material fields into v2 `materialDirect` but only compares the aggregate. Add/enable
   **per-trade component-material assertions** and run the parity harness with tight tolerance:
   `scripts/quote-v3-parity.harness.test.ts` (run explicitly — it's excluded from the default vitest
   scope). The dropped material currently shows as a v2>v3 shortfall in `varianceByCategory.material`
   /`misc`; after the fix that variance should go to ~0.
2. The Stangl fixture asserts a hard-coded total `toBeCloseTo(17957.5, 2)`. If Stangl includes any of the
   four trades, its correct total will **rise** after the fix — update the constant to the new expected
   value and document why (was under-counting component material).
3. **Manual:** convert a v2 project that has metal stud + suspended grid + insulation + acoustic →
   confirm the v3 grand total matches the v2 grand total (was lower before). Then edit a migrated
   component line's material rate (should be editable now) and pick a catalog on it (rate must NOT
   reset to 0). Add a net-new metal_stud line with no catalog and type a custom rate (should work).
4. `npx tsc --noEmit` clean; existing quote tests green.

## Build order
1. Fix 2a + 2b first (small, unblocks editing/wiping) — verify a migrated line is editable and catalog
   pick preserves the rate.
2. Fix 1 converter material-carry (per table; insulation blended) — verify parity delta → ~0.
3. Parity test assertions + Stangl constant.
4. (Optional) catalog seeding / "use catalog rate" polish.
