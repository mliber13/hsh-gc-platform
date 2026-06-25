# Quote v3 Math Parity Report (Q.C.4)

**Date:** 2026-06-08  
**Harness:** `node scripts/quote-v3-parity-test.mjs` (read-only; uses org catalogs + v2 quote payloads)  
**Method:** For each test project, recompute v2 grand total via `buildDrywallQuoteCalculations` + `calculateQuoteTotals`, build a simulated v3 quote via `buildV3FromV2`, compute v3 via `computeQuoteV3Totals` with live org catalogs.

---

## Executive summary

After Q.C.4 parity fixes, **converted v3 quotes match v2 grand totals exactly** on all four prod projects in the harness (±$0.00). The original McCamon ~$4,617 gap was caused primarily by **stacking explicit v3 accessories on top of v2’s blended `materialRate`**, plus several formula alignment bugs in v3 markup/labor/waste handling.

**Goodwill Multi** (Section 13 dual-view reference) was **not found** in prod DB at test time — substituted **Kent - Murphy** as the zero-breakdown simple project (9,888 sqft, 0% waste).

---

## Per-project variance table (after fixes)

| Project | v2 total | v3 total (converted) | Δ | Δ % |
|---------|----------|----------------------|---|-----|
| Hartville - Irwin | $11,900.02 | $11,900.02 | $0.00 | 0.00% |
| Stangl | $17,957.50 | $17,957.50 | $0.00 | 0.00% |
| McCamon | $16,727.80 | $16,727.80 | $0.00 | 0.00% |
| Kent - Murphy | $16,718.41 | $16,718.41 | $0.00 | 0.00% |

### Before fixes (representative pre-Q.C.4 run)

| Project | Approx Δ | Primary drivers |
|---------|----------|-----------------|
| Hartville - Irwin | −$220 (−1.9%) | Labor on pre-waste sqft; cleanup on base sqft; tax order |
| Stangl | −$888 (−4.9%) | Same labor/waste bugs × 5 breakdown lines |
| McCamon | −$904 (−5.4%) | Same + accessory double-count when suppression missing |
| Kent - Murphy | +$790 (+4.7%) | `wastePercentage: 0` coerced to 10% on convert |

---

## Category variance (methodology note)

The harness prints material / labor / accessory / cleanup / markup buckets. **Grand totals match** even when markup vs misc buckets offset (±$200–425) because v2 stores sales tax inside direct material cost while the harness allocates tax into “markup/tax” for v3 — a reporting artifact, not a total mismatch.

---

## Findings by classification

### Bugs fixed in Q.C.4 (shipped)

| # | Issue | Fix | Files |
|---|-------|-----|-------|
| 1 | **Accessory double-count on convert** — v2 `materialRate` blends board + accessories; v3 Q.C.1 added explicit accessories on top | Set `accessories_in_material_rate: true` on migrated lines; skip `computeLineAccessories` when flag set | `convertQuoteV2ToV3.ts`, `quoteV3Accessories.ts`, `drywall.ts` |
| 2 | **Sales tax order** — v3 taxed after profit; locked plan says tax on materials only (OH → profit → tax on materials) | Restructured `computeMarkupBreakdown` to match v2 `applyPricingPipeline` | `quoteV3Math.ts` |
| 3 | **Labor burden missing** — v2 applies 25% burden on hanger/finisher/prep-clean by default | Carry v2 toggles on convert; apply `applyLaborBurden` in v3 line + cleanup math | `drywall.ts`, `convertQuoteV2ToV3.ts`, `quoteV3Math.ts` |
| 4 | **Drywall labor on pre-waste sqft** — material used waste-adjusted sqft; hanger/finisher did not | Apply `wasteMult` to hanger/finisher labor qty | `quoteV3Math.ts` |
| 5 | **Cleanup on base sqft** — v2 prep/clean uses finish sqft with waste | `computeCleanupTotal` uses waste-adjusted drywall sqft | `quoteV3Math.ts` |
| 6 | **Zero waste coerced to 10%** — `parseNum(waste) \|\| 10` turned Kent-Murphy 0% into 10% | Preserve `wastePercentage: 0` on convert | `convertQuoteV2ToV3.ts` |
| 7 | **Accessory qty without waste** — accessory formulas should use waste-adjusted sqft when not suppressed | Use `(quantity × (1 + waste%))` in `computeLineAccessories` | `quoteV3Accessories.ts` |

### Design differences (accept for MVP)

| Topic | v2 behavior | v3 behavior | Decision |
|-------|-------------|-------------|----------|
| **Material + accessories** | Single blended `materialRate` per quote | Board catalog `material_rate` + explicit accessory line costs | **Accept** for *new* v3 quotes; converted lines keep blended rate + suppressed accessories until Mark decomposes rates |
| **Mixed finish scopes** | One finisher rate; finish metadata narrative only | One finish scope per line; split lines for mixed scopes | **Accept** — Mark splits lines manually post-convert (Hartville garage stomp vs Level 4) |
| **Multi-breakdown** | Geography breakdowns, rates null | One line per breakdown with carried rates | **Accept** — Stangl parity holds with per-line overrides |
| **Goodwill Multi dual-view** | Single row, multiple mental rates | Requires separate lines per scope/rate | **Defer** — post-MVP conversion demo (project not in prod DB) |

### Mark decisions surfaced (no code change yet)

| # | Question | Context | Recommendation |
|---|----------|---------|----------------|
| M1 | When should converted lines drop `accessories_in_material_rate`? | After Mark sets board catalog material rates that exclude accessories | UI hint on migrated lines: “Decompose material rate to enable accessory calc” |
| M2 | New v3 quotes: match v2 blended total or show true board+accessory split? | New quotes will diverge from v2 until catalog rates tuned | **Show true split** — locked Option A; Mark adjusts catalog seeds |
| M3 | Per-line finish scope for McCamon (wall L4 / ceiling L5) | Convert picks one scope (`level_4`); v2 uses single finisher rate | **OK for convert parity**; Mark splits to two lines when ready |
| M4 | Suspended grid + acoustic labor model ($/sqft vs $/unit) | Q.C.2 polish deferral 2026-06-08 | Revisit in Q.E if commercial jobs need parity |

---

## Recommendations

### Ship in MVP (done in Q.C.4)

- Parity harness in CI/manual: `node scripts/quote-v3-parity-test.mjs --fixtures scripts/fixtures/quote-v3-parity-fixtures.json`
- All seven bug fixes above

### Defer to Q.E / post-MVP

- Goodwill Multi conversion UX (dual-rate → multi-line wizard)
- Auto-generate payroll piece entries from quote (Q.C.3 deferral)
- Board-specific hanger rates in payroll
- Decomposition wizard: split blended `materialRate` → catalog board rate + accessories with preview

---

## How to re-run

```bash
# Offline (committed fixtures + org catalog snapshot)
node scripts/quote-v3-parity-test.mjs --fixtures scripts/fixtures/quote-v3-parity-fixtures.json

# Live Supabase (requires .env credentials)
node scripts/quote-v3-parity-test.mjs

# Refresh fixtures from prod-shaped data
node scripts/build-parity-fixtures.mjs
```

---

## Related docs

- Locked plan §9.3 — parity testing
- Locked plan §13 — prod data findings
- Q.C.1 accessories — explicit costs (design shift from blended v2 rate)

---

## Appendix — hydrate field-stripping bug (2026-06-08)

### Symptom

Parity harness (Path A only) reported **$0.00** Δ for Stangl, but the browser quote page showed **$19,410.78** vs v2 **$17,957.50** (+$1,453.28).

### Root cause

`hydrateDrywallQuoteV3` / `hydrateLineItem` did not round-trip Q.C.4 fields from JSONB:

| Field | Level | Effect when dropped |
|-------|-------|---------------------|
| `accessories_in_material_rate` | line | Explicit accessories computed on converted lines → double-count vs v2 blended `materialRate` |
| `accessoryOverrides` | line | Per-line accessory toggles / corner bead LF lost |
| `hanger_include_labor_burden` | quote | Burden toggles lost (undefined → burden ON by default, but explicit `false` from DB was ignored) |
| `finisher_include_labor_burden` | quote | same |
| `prep_clean_include_labor_burden` | quote | same |

DB rows stored the flags correctly; browser load ran `fetch → hydrateDrywallQuoteV3 → computeQuoteV3Totals`, so math ran as if lines were native v3.

### Fix

`src/lib/drywall/createEmptyDrywallQuoteV3.ts` — preserve the fields above on hydrate. `accessories_in_material_rate` defaults to **undefined** when absent (native v3 lines still get explicit accessories). Labor burden booleans use `optionalBool` (undefined when missing → same as pre-fix `applyLaborBurden` default).

### Harness extension

`scripts/lib/quoteV3ParityEngine.ts` now runs two paths per project:

- **Path A:** `buildV3FromV2(v2)` → `computeQuoteV3Totals` (convert math only)
- **Path B:** `buildV3FromV2(v2)` → `prepareDrywallQuoteV3ForSave` → `hydrateDrywallQuoteV3` → `computeQuoteV3Totals` (browser cycle)

Both must match v2 baseline; Path B must match Path A within **$0.01**. A synthetic native-v3 smoke case asserts explicit accessories when the flag is unset.

Re-run: `node scripts/quote-v3-parity-test.mjs --fixtures scripts/fixtures/quote-v3-parity-fixtures.json`

### Stale v3 convert backfill (2026-06-08)

Early converts (2026-06-04–07) stored v3 envelopes **before** Q.C.4 flags (`accessories_in_material_rate`, correct `waste_pct`, quote-level burden toggles). Browser totals diverged while parity harness (fresh `buildV3FromV2`) passed.

**Audit:** `node scripts/stale-v3-convert-audit.mjs --payload scripts/fixtures/stale-v3-convert-live-payload.json`

**Batch apply:** `node scripts/apply-stale-convert.mjs` (archives to `metadata.legacy.quote_v3_archive_2026_06_08` first).

**UI:** v3 quote stage → “Refresh from v2 snapshot” (owner only) archives to `quote_v3_archive_<timestamp>` then re-converts.
