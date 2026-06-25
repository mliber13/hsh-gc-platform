# Drywall Quote Stage Redesign Plan

**Revision history:** 2026-06-04: Decision #6 revised to split hang and finish labor rates per real-use signal from McCamon convert testing.

**Status:** **Design locked — MVP execution charter.** No production code, migrations, or prod writes in this doc until Phase Q.A.

**Goal:** Replace the project-level drywall scope + optional component toggles model with a **unified spreadsheet-style line-item model** where each row is discrete work with catalog-driven rates, per-line waste, optional overrides, and trade-appropriate units (sqft / LF / each).

**Hard rule (unchanged from `docs/DRYWALL_PORT_PLAN.md` Section 0):** Drywall quote pipeline remains **separate** from GC commercial project quotes (`estimates` / `trades` / `clientQuotePdf.ts`).

**Related docs:** `docs/DRYWALL_PORT_PLAN.md`, `docs/HR_PORT_PLAN.md`, `docs/QUOTE_DOCUMENT_PLAN.md` (unchanged).

**Prod baseline (June 2026):** **105** projects with `metadata.legacy.quote`; research findings in Section 13.

---

## Operating Context

| Context | Locked implication |
|---------|-------------------|
| **Operator** | Mark is the **only V1 operator** (same precedent as Settings / HR early rollout). UX optimizes for one expert estimator, not multi-user concurrency edge cases. |
| **Strategic** | Drywall workspace is the **template for future in-house trade workspaces**. Line-item + org catalogs pattern should generalize (roofing, paint, etc.) without redesigning storage. |
| **MVP charter** | Prove the line-item model on **real new v3 quotes** before committing to migration of **105 existing v2 quotes**. Full fleet migration is post-MVP. |
| **Feature flag rollout** | **v2 default** at launch → Mark **opts each new project into v3** explicitly → after **4–6 weeks** of successful v3 quotes on real jobs, **flip default to v3 for new projects**. Existing v2 projects unchanged until per-project **Convert to line-items**. |
| **UAT targets** | **1st:** Hartville - Irwin (simple, ~4,180 sqft, single floor, known math parity). **2nd:** Stangl (multi-stage, field measurement + 2 orders). **Not** Goodwill Multi first (dual-view shared project adds unnecessary complexity). |

---

## Executive summary — MVP charter

| Topic | Locked decision |
|-------|-----------------|
| **Schema** | `quote.version === 3` with unified `lineItems[]` + `alternates[]` |
| **Scope** | **Option A — all trades in one spreadsheet MVP** (drywall + RC + grid + insulation + acoustic + metal stud + FRP) |
| **Catalog storage** | `org_drywall_catalogs` org-scoped JSONB table; RLS owner + `office_drywall` write, all org reads; seeded from code on first access |
| **Migration** | **(c)** backward-compat + **per-project** "Convert to line-items" only; **no batch**; `legacyV2Snapshot` **forever** |
| **Markup** | **Project-level only** (OH → profit → tax on materials); per-line flexibility via **custom rate overrides** |
| **Payroll** | Finish scope **`payroll_piece_key` wired in Q.C** — scope key **is** the piece key |
| **Orders** | v3 lines feed **material order suggestions** in Order stage (Phase E integration) |
| **MVP phases** | **Q.0 → Q.A → Q.B → Q.C → Q.D (PDF)** shipped; Q.E (migration polish), Q.F (v2 deprecation) **deferred post-MVP validation** |
| **MVP effort** | **~280–350 hours** (~9–11 weeks one dev) — Mark accepted Option A tradeoff vs drywall-only ~140–190 |

---

## Section 1 — Current state inventory

*(Research baseline — unchanged facts; v2 remains prod default until Mark opts into v3.)*

### 1.1 Legacy + GC quote model (summary)

- **Project-level** `sqft`, single `materialRate` / `finisherRate` / `hangerRate`, global `drywallScope`.
- **`breakdowns[]`** = geographic sqft splits only — **no per-row rates** in prod.
- **Add-on toggles** (`includeRcChannel`, etc.) + embedded breakdown sub-sections — **retire in MVP**.
- **Finish fields** (`ceilingFinish`, `wallFinish`) populate on 89/105 quotes but **do not drive dollars** today.
- **v2 `components[]` adapter path** exists in `drywallQuoteSchema.ts` but calculators use flat compat — not a line-item estimator.

### 1.2 GC files replaced or retired in MVP

| Retiring in MVP | Replacement |
|-----------------|-------------|
| `QuoteBreakdownsSection.tsx` | Unified `QuoteLineItemsTable.tsx` |
| `QuoteOptionalAddons.tsx` | Trade lines in same table |
| `BreakdownOptionalSections.tsx` | Trade-specific catalog columns on rows |
| `QuoteRatesPanel.tsx` project sqft/waste/rates | Summary strip + project markup card only |
| Project-level `wastePercentage` | Per-line `wasteRate` |

**Unchanged until post-MVP:** v2 `QuoteStage.tsx` path for unmigrated projects.

### 1.3 Prod gap (why redesign)

See Section 13. Headline: **80% zero breakdowns**, breakdowns never carry rates, finisher rate variance is Mark's workaround for mixed finish intensity on one material rate.

---

## Section 2 — Why the current model falls short

*(Unchanged business rationale — mixed-scope commercial jobs need priced rows, not blended rates + exception prose.)*

**Example (target v3 quote):**

| Line | Location | Sqft | Board | Finish | Material $/sqft | Finisher $/sqft |
|------|----------|------|-------|--------|-----------------|-----------------|
| Corridors | L1 | 5,000 | 5/8 Type X | Firetape Only | 0.82 | 0.08 |
| Units | L2–4 | 8,000 | 5/8 Regular | Level 4 | 0.66 | 0.45 |
| Wet areas | L2–4 | 3,000 | 1/2 MR | Level 4 | 0.72 | 0.45 |

**v2 Goodwill Multi today:** 48,140 sqft × $0.725 / $0.45 — one row mentally, one rate triple in JSONB.

---

## Section 3 — v3 quote envelope

```typescript
quote.version === 3

quote.lineItems[]      // routine scope — all trade types in one array
quote.alternates[]     // customer opt-ins — each has own lineItems[] + totalAdd
quote.pricing          // { overheadPercentage, profitPercentage, salesTaxRate, laborBurden toggles }
quote.summary          // computed cache — see Section 5
quote.catalogVersion   // optional audit stamp
quote.legacyV2Snapshot // permanent rollback blob after conversion (Section 8)
```

**Removed in v3:** `breakdowns[]`, project-level `sqft`, `wastePercentage`, `materialRate` / `finisherRate` / `hangerRate` as inputs, add-on `include*` flags, `options[]` (migrated to `alternates[]`).

---

## Section 4 — Catalog model (locked)

### 4.1 Storage — `org_drywall_catalogs`

**Locked:** New table, org-scoped JSONB, **independent of Settings workspace**.

```sql
-- Phase Q.A migration (not created in this doc pass)
CREATE TABLE org_drywall_catalogs (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id),
  board_catalog jsonb NOT NULL DEFAULT '[]',
  finish_scope_catalog jsonb NOT NULL DEFAULT '[]',
  rc_channel_catalog jsonb NOT NULL DEFAULT '[]',
  suspended_grid_catalog jsonb NOT NULL DEFAULT '[]',
  insulation_catalog jsonb NOT NULL DEFAULT '[]',
  acoustic_ceiling_catalog jsonb NOT NULL DEFAULT '[]',
  metal_stud_catalog jsonb NOT NULL DEFAULT '[]',
  frp_catalog jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES profiles(id)
);
```

| Policy | Rule |
|--------|------|
| **RLS read** | All active org members (same as drywall workspace read) |
| **RLS write** | `owner` + `office_drywall` (same as drywall workspace write) |
| **Seed** | On first fetch, if row empty → INSERT from `src/lib/drywall/catalogSeeds.ts` |
| **Admin UI** | `/drywall/settings/catalogs` — Mark seeds/edits during Q.A |

**Sheet length is NOT in board catalog** — field measurement concern; estimation uses **$/sqft** only.

### 4.2 Board catalog — 14 locked seed entries

Each entry: `{ id, display_name, material_rate, hanger_rate, default_waste_pct, notes }` — **`default_waste_pct = 10` for all V1**.

Boards carry **material_rate** and **hanger_rate** ($/sqft): hang effort is board-dependent (heavier/larger boards take more hanging effort). Mark sets both in org catalog admin.

| id | display_name (seed) |
|----|---------------------|
| `5_8_type_x` | 5/8" Type X |
| `5_8_regular` | 5/8" Regular |
| `5_8_mr` | 5/8" Moisture-Resistant |
| `5_8_cement` | 5/8" Cement Board |
| `5_8_sound` | 5/8" Sound Board |
| `5_8_densglass` | 5/8" DensGlass |
| `1_2_regular` | 1/2" Regular |
| `1_2_mr` | 1/2" Moisture-Resistant |
| `1_2_cement` | 1/2" Cement Board |
| `1_2_type_x` | 1/2" Type X |
| `1_2_sound` | 1/2" Sound Board |
| `1_2_densglass` | 1/2" DensGlass |
| `3_8_regular` | 3/8" Regular |
| `1_4_regular` | 1/4" Regular |

**`material_rate` values:** Mark supplies during Q.A seed session (not hardcoded in plan). Structure is locked; dollars are org data.

### 4.3 Finish scope catalog — 10 locked seed entries

Each entry:

```
id, display_name, applies_to_locations (wall | ceiling | both),
finisher_rate ($/sqft), accessories_applied { joint_compound, tape, screws, corner_bead },
payroll_piece_key, notes
```

| id | display_name | payroll_piece_key |
|----|--------------|-------------------|
| `firetape_only` | Firetape Only | `firetape_only` |
| `level_3` | Level 3 | `level_3` |
| `level_4` | Level 4 | `level_4` |
| `level_5` | Level 5 | `level_5` |
| `stomp_knockdown` | Stomp Knockdown | `stomp_knockdown` |
| `knockdown` | Knockdown | `knockdown` |
| `splatter` | Splatter | `splatter` |
| `splatter_knockdown` | Splatter Knockdown | `splatter_knockdown` |
| `roll_texture` | Roll Texture | `roll_texture` |
| `hang_only` | Hang Only | `hang_only` |

**`payroll_piece_key` = finish scope id** for v3 lines. Legacy v2 quotes continue generic keys (`finisher`, `hanger`) until converted.

#### Accessories map (default booleans per scope)

| Scope | joint_compound | tape | screws | corner_bead |
|-------|----------------|------|--------|-------------|
| `firetape_only` | **true (reduced formula)** | true | true | **false** |
| `level_3` | true | true | true | true |
| `level_4` | true | true | true | true |
| `level_5` | true | true | true | true |
| `stomp_knockdown` | true | true | true | true |
| `knockdown` | true | true | true | true |
| `splatter` | true | true | true | true |
| `splatter_knockdown` | true | true | true | true |
| `roll_texture` | true | true | true | false |
| `hang_only` | false | false | true | false |

**Firetape special case (locked):** Default uses **reduced joint compound** per Mark's firetape formula. Mark may **override per line** when using a firetape product that needs **no compound** (`accessoryOverrides` on line).

**Hang + finish on one row (locked):** Single line = one board catalog + one finish scope combo. **Two labor rates** on the row — hanger ($/sqft, from board catalog) and finisher ($/sqft, from finish scope catalog). No separate hang row + finish row for same area.

### 4.4 Accessory catalog — Q.C.1 (shipped)

Stored in `org_drywall_catalogs.payload.accessories` alongside boards/finish scopes. Seeded from v2 `accessoryCalc.ts` sqft formulas; Mark edits $/unit via `/drywall/settings/catalogs` **Accessories** tab.

Each entry: `{ id, display_name, category, unit, material_rate, sqft_per_unit, notes }`

| category | Gated by finish scope `accessories_applied` |
|----------|---------------------------------------------|
| `joint_compound` | All-purpose (+ lite weight + Easy Sand 90 except firetape) |
| `tape` | Paper + mesh rolls |
| `screws` | Screw boxes |
| `corner_bead` | Manual LF via line `accessoryOverrides.corner_bead_lf` |

**Accessory direct costs flow into `linesSubtotal` → markup base** (OH / profit / tax) alongside material, labor, and cleanup.

### 4.5 Component catalogs — Q.A seed work (Mark)

All ship in Q.A alongside board/finish catalogs. Component catalog entries define **default unit**, **material rate**, and **`labor_rate`** (Q.C.2 — $/unit matching entry unit; RC channel uses $/LF installed).

Component line labor: `quantity × effective_labor_rate` (catalog default or line `custom_labor_rate` override). Flows into `linesSubtotal` → markup base. No accessories on component lines. Sidebar displays per-trade labor rows (RC Channel, Insulation, Metal Stud, etc.) — not a generic component lump sum.

**Metal stud labor (Q.C.2):** `labor_rate` is **$/LF installed** (v2 `metalStudLaborRate × totalWallLf` parity). Material remains $/piece.

**Suspended grid + acoustic ceiling labor model (deferred 2026-06-08):** Q.C.2 ships per-catalog-entry `labor_rate` for these trades, but the intended model is **$/sqft of installed area** (similar to insulation), not per grid component entry. Current per-entry rates are placeholders until Mark defines labor structure — likely a project-level or per-line installed sqft field driving labor independent of component breakdown. Revisit during Q.D or post-MVP polish; not blocking Q.C MVP.

| Catalog JSONB column | Seed content (Mark during Q.A) | Default unit |
|----------------------|--------------------------------|--------------|
| `rc_channel_catalog` | Sizes, gauges, spacings, material + labor $/LF | **LF** |
| `suspended_grid_catalog` | Mains, tees, wire, lags, hangers, shiny 90s — component rates | **LF** / **each** |
| `insulation_catalog` | R-values × faced/unfaced × rigid types | **sqft** |
| `acoustic_ceiling_catalog` | Tile types + grid components | **sqft** / **each** |
| `metal_stud_catalog` | Stud sizes + gauges, track sizes; labor **$/LF** | **LF** |
| `frp_catalog` | Sheet types, adhesive, corner pieces | **sqft** / **each** |

**V1 units (locked):** `sqft`, `LF`, `each`. Line `quantityUnit` comes from the **component catalog entry** (or board/finish pair for drywall rows).

---

## Section 5 — Line item data model (locked)

### 5.1 `DrywallQuoteLineItem`

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | UUID |
| `sortOrder` | number | Spreadsheet order (independent of alternates) |
| `tradeType` | enum | `drywall` \| `rc_channel` \| `suspended_grid` \| `insulation` \| `acoustic_ceiling` \| `metal_stud` \| `frp` |
| `description` | string | Free text |
| `location` | string | Floor/area label — **grouping key for UI section headers** |
| `quantity` | number | |
| `quantityUnit` | `'sqft' \| 'lf' \| 'each'` | From catalog for component trades |
| `wasteRate` | number | **Per-line**; inherits **10%** from board catalog default; overridable |
| **Drywall rows** | | |
| `boardCatalogId` | string | One of 14 board ids |
| `finishScopeCatalogId` | string | One of 10 finish ids; hang+finish on **one row** |
| **Component rows** | | |
| `componentCatalogId` | string | FK into trade-specific catalog |
| `componentInputs` | object | Trade-specific dimensions (spacing, gauge, tile size, …) |
| **Overrides (locked: yes)** | | |
| `customMaterialRate` | number \| null | null → catalog default |
| `customHangerRate` | number \| null | Hanger override ($/sqft); default from board catalog |
| `customFinisherRate` | number \| null | Finisher override ($/sqft); default from finish scope catalog (renamed from combined `customLaborRate`) |
| `overrideReason` | string | Optional note when material and/or hanger/finisher rates are overridden |
| `accessoryOverrides` | object | Per-line accessory toggles / firetape no-compound |
| `payrollPieceKey` | string | **Copied from finish scope** at line create; flows to payroll |
| **Computed cache** | | |
| `computed.*` | object | materialDirect, laborDirect, salesTax, lineDirectTotal |

### 5.2 Summary rollup (locked formulas)

```
totalSqft = Σ line.quantity WHERE line.quantityUnit = 'sqft'   // routine lines only
totalSqftWithWaste = Σ line.quantity × (1 + line.wasteRate)  // same filter

Summary strip displays: "Total sqft with waste: {totalSqftWithWaste}"
```

**Project-level `wastePercentage` retires.** Each line starts at catalog `default_waste_pct` (10%).

### 5.3 Location grouping (replaces breakdowns)

**Breakdowns retire as a data structure (locked).** UI derives section headers from distinct `location` values:

```
▸ First Floor (subtotal: $X)
    row, row, row
▸ Detached Garage (subtotal: $Y)
    row
```

No separate breakdown entity or JSONB array.

### 5.4 Payroll linkage (Q.C — locked in MVP)

**v3 piece key namespace** (`src/lib/drywall/payrollPieceKeys.ts`):

| Piece work | Piece key | Rate source (payroll UI) |
|------------|-----------|--------------------------|
| Hanger | `drywall_hanging` (generic; board-specific `drywall_hanging_*` deferred post-MVP) | Manual entry for MVP — board `hanger_rate` lookup deferred |
| Finisher | Finish scope id / `payroll_piece_key` (e.g. `level_4`, `firetape_only`) | `finish_scopes[].finisher_rate` (editable override) |
| Component labor | Trade-prefixed keys (`rc_channel_labor`, `insulation_labor`, …) | Matching component catalog `labor_rate` (editable override) |

- Each finish scope catalog entry carries `payroll_piece_key` (typically equals scope `id`).
- v3 quote lines expose `payrollPieceKey` on save.
- Payroll piece entries store `piece_key` + optional `catalog_source: 'v3_drywall'` in `pay_periods.payload` JSONB (no schema migration).
- **v2 fallback:** legacy `workType` values (`hang`, `finisher`, `prepClean`, `carpenter`, `rcChannel`, `other`) remain in the payroll dropdown under "Legacy (v2)"; rate still pulled from v2 quote fields via `getRateFromJob`. Entries saved before Q.C.3 display correctly using `workType` alone.

**Deferred post-MVP:** "Generate piece entries from completed quote line items" — see Section 11.

### 5.5 Field variance + orders (workflow)

| Topic | MVP |
|-------|-----|
| **Per-line field variance** | **Deferred** — current overall variance vs quote sqft continues |
| **Order stage material suggest** | **Phase E (post-MVP charter extension):** v3 lines contribute board quantities; accessories rollup across lines (extends takeoff-suggest pattern) |

---

## Section 6 — Customer alternates (locked)

### 6.1 Shape

```typescript
quote.alternates[] = {
  id, name, description, sortOrder,
  lineItems: DrywallQuoteLineItem[],  // same shape as routine
  totalAdd: number                    // fully marked-up add-on (see 6.3)
}
```

- **Separate array** — not a flag on routine lines.
- Reorderable **independently** of routine `lineItems` ordering.

### 6.2 PDF (locked — Section 10)

- Routine quote totals **first**.
- **Separate "Customer Alternates" section at bottom** — name, description, add-on cost per alternate.
- **No inline checkboxes** on main line table.

### 6.3 Markup on alternates (locked)

**Same OH / profit / tax model as routine lines.** `totalAdd` = fully marked-up alternate scope (direct + OH + profit + tax). Displayed as **"Add $X"**.

### 6.4 Migration mapping

| v2 source | v3 target |
|-----------|-----------|
| `options[]` | Auto-map → `alternates[]` during conversion |
| Breakdown name matches `/optional\|alternate/i` | **Confirmation dialog:** "This breakdown looks like an alternate. Convert to a customer alternate? **[Yes / No / Cancel]**" — user decides **per project** (Bennett Beers "Optional Penthouse" pattern) |

---

## Section 7 — UI design (locked — Option A)

### 7.1 Unified spreadsheet — all trades

**One table** for drywall + RC + suspended grid + insulation + acoustic + metal stud + FRP.

| Column | Drywall row | Component row |
|--------|-------------|---------------|
| Description | text | text |
| Location | text (group header source) | text |
| Qty | number | number |
| Unit | sqft | sqft / LF / each (from catalog) |
| Catalog | Board ▼ + Finish ▼ | Component ▼ |
| Material $ | catalog or override | catalog or override |
| Labor $ | catalog or override | catalog or override |
| Waste % | per-line (default 10%) | per-line where applicable |
| Line total | computed | computed |
| ⋮ | duplicate / delete / reorder | same |

**Retired:** `QuoteOptionalAddons.tsx`, per-breakdown component sub-sections.

### 7.2 Layout sketch

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Quote — Hartville - Irwin                    [Download PDF] [Save] [→ Field] │
│ Customer PDF (Q.D) — line total per row, no internal rate breakdown       │
├──────────────────────────────────────────────────────────────────────────┤
│ Total sqft: 4,180 │ Total sqft with waste: 4,598 │ Base: $XX │ Grand: $XX │
├────────────────────────────────────────────┬─────────────────────────────┤
│ UNIFIED LINE ITEMS TABLE                   │ TOTALS + ACCESSORIES ROLLUP │
│ [+ Add line]  [trade type picker]          │ OH / Profit / Tax           │
│                                            │ Accessories (from lines)    │
│ ▸ Main Floor (subtotal)                    │ Payroll keys preview (Q.C)│
│   rows…                                    │                             │
├────────────────────────────────────────────┴─────────────────────────────┤
│ CUSTOMER ALTERNATES — [+ Add alternate]  (separate sub-tables)           │
├──────────────────────────────────────────────────────────────────────────┤
│ PROJECT MARKUP: OH % │ Profit % │ Tax % │ Labor burden toggles           │
├──────────────────────────────────────────────────────────────────────────┤
│ v2 project banner: [Convert to line-items]  (per-project migration)       │
│ New project: [Use line-item quote (v3)] when v2 still default             │
└──────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Feature flag UX (locked)

| Period | Behavior |
|--------|----------|
| MVP launch | **v2 default**; explicit **"Use line-item quote (v3)"** on new project create or quote stage |
| After 4–6 weeks successful v3 quotes | **Flip default to v3** for new projects only |
| Existing v2 | Unchanged until **Convert to line-items** |

### 7.4 Override affordance

Cells with `customMaterialRate` or `customLaborRate` show visual indicator; `overrideReason` optional tooltip.

---

## Section 8 — Migration strategy (locked)

### 8.1 Approach: **(c) backward-compat + explicit per-project upgrade**

| Rule | Detail |
|------|--------|
| v2 quotes | **Keep working unchanged** in legacy Quote stage |
| Conversion trigger | **"Convert to line-items"** button when project opened in v3-aware mode |
| Batch migration | **None** — per-project only |
| Snapshot | `metadata.legacy.quote.legacyV2Snapshot` — **retained forever**; rollback path; does not affect v3 math |
| Breakdowns | **Retire** — each breakdown → line(s) with `location = breakdown.description` |
| Multi-breakdown (21 prod) | One line per breakdown sqft split minimum; Mark refines board/finish per line after conversion |
| Ambiguous breakdowns | Pattern match `Optional\|Alternate` → confirmation dialog (Section 6.4) |
| `options[]` | Auto-map → `alternates[]` |

### 8.2 Conversion wizard (MVP subset in Q.C; polish in deferred Q.E)

1. Preview proposed lines from v2 sqft / breakdowns / add-on toggles → trade lines.
2. Mark picks default board + finish for guessed drywall lines.
3. Confirm ambiguous alternates.
4. Write `version: 3`; store `legacyV2Snapshot`.
5. **Rollback:** restore snapshot → v2 (admin action).

### 8.3 MVP migration scope

**MVP proves new quotes on Hartville - Irwin and Stangl.** Mass migration of 105 quotes is **post-MVP** (Q.E polish phase).

---

## Section 9 — Math engine (locked — unified all trades in MVP)

### 9.1 Architecture

```
Per line (all trade types):
  Drywall: material + hanger labor + finisher labor + accessories (Q.C.1)
  Components: material + labor (Q.C.2, catalog labor_rate × qty)

Roll up routine lineItems:
  quoteV3Math.ts → Σ material + labor + accessories → linesSubtotal → + cleanup → markup base → OH → profit → tax

Alternates:
  Same stack → totalAdd (marked up)

Accessories (Q.C.1 — `quoteV3Accessories.ts`):
  finish scope accessories_applied × line sqft → per-line cost → Σ into linesSubtotal → markup base
  UI: Accessories $ column + project sidebar rollup

Payroll export:
  line.payrollPieceKey × line finish sqft → HR piece entry (Q.C)
```

### 9.2 Reuse vs rewrite

| Module | MVP action |
|--------|------------|
| `calculations/quantityUtils.ts` | **Reuse** — labor burden |
| `calculations/suspendedGridCalc.ts`, RC math, insulation helpers | **Refactor into per-line kernels** — same formulas, new caller |
| `accessoryCalc.ts` | **Refactor** — driven by `accessories_applied` map + firetape reduced compound |
| `buildDrywallQuoteCalculations.ts` | **Keep v2 branch** for unmigrated quotes; **v3 path new file** |
| Add-on rollup in legacy engine | **Retire for v3** — all trades are lines |

**Estimate:** ~45% formula reuse, ~55% new orchestration — higher than drywall-only due to **Option A all-trades unification**.

### 9.3 Parity testing (MVP)

**Harness (Q.C.4):** `node scripts/quote-v3-parity-test.mjs` — read-only comparison of v2 totals vs simulated v3 convert (`buildV3FromV2`) using org catalogs. Offline fixtures: `--fixtures scripts/fixtures/quote-v3-parity-fixtures.json`. Full report: [QUOTE_V3_PARITY_REPORT.md](./QUOTE_V3_PARITY_REPORT.md).

| Project | Test |
|---------|------|
| **Hartville - Irwin** | v3 convert grand total = v2 (±$0 after Q.C.4 fixes); UAT walkthrough |
| **Stangl** | 5 breakdown lines → 5 v3 lines; grand total parity |
| **McCamon** | Original ~$4.6k gap traced to accessory double-count + labor/waste/tax bugs — closed in Q.C.4 |
| **Kent - Murphy** | Zero-breakdown simple quote; 0% waste edge case |
| **Goodwill Multi** | Section 13 reference — not in prod DB; defer dual-view convert demo |

**Exit criteria:** Harness shows $0.00 Δ on Hartville, Stangl, McCamon, Kent-Murphy for converted v3; new native v3 quotes may diverge until Mark decomposes catalog board rates from blended v2 `materialRate` (by design).

---

## Section 10 — PDF generation (Q.D — shipped in MVP)

**Shipped 2026-06-08** per Mark's 2026-06-03 decision to pull PDF into MVP. Implementation: `src/lib/drywallQuotePdfV3.ts` (independent from v2 `drywallQuotePdf.ts`).

**Customer detail level (a) — locked:** single **Line Total** per row; no internal material/labor/rate breakdown on customer PDF.

| Section | Content |
|---------|---------|
| Header | HSH company block + logo, project, quote #, issue/validity dates |
| Scope of work | `quote.scope_of_work` with line breaks preserved |
| Routine lines | Grouped by trade — **Location**, **Line Total** only (board/finish in scope of work, not per line) |
| Trade subtotals | Per-trade subtotal row |
| Base bid totals | **Total Base Bid** only (cleanup/OH/profit/tax rolled in; not itemized on customer PDF) |
| **Customer Alternates** | Name, description, per-line **Location \| Line Total** table when alternate has line items, alternate total footer |
| Footer | Payment terms, validity, optional notes, signature block |
| Accessories appendix | **Skipped V1** — internal detail; not customer-facing |

**No inline checkboxes.** Routine totals first, alternates second.

**PDF settings:** `quote.pdf_settings` on v3 envelope (`payment_terms`, `validity_days`, `signature_lines`, `notes_for_customer`). Carried from v2 `pdfSettings` on convert. V1 uses sensible defaults; dedicated settings UI is polish-deferred.

---

## Section 11 — Phased rollout (MVP vs post-MVP)

### MVP phases (ship target)

#### Phase Q.0 — Lock plan doc ✓

| Deliverable | Status |
|-------------|--------|
| This document — locked decisions | **Complete** |
| Feature flag name: `drywall_quote_v3` | Locked |

**Hours:** 4–8 (review — done)

---

#### Phase Q.A — Catalogs + storage

| Work item | Files |
|-----------|-------|
| Migration `org_drywall_catalogs` + RLS | `supabase/migrations/…` |
| Seed file — 14 boards + 10 finish scopes + component stubs | `src/lib/drywall/catalogSeeds.ts` |
| Types | `src/types/drywallCatalog.ts` |
| Service seed-if-empty | `src/services/drywallCatalogService.ts` |
| Catalog admin UI | `src/components/drywall/settings/DrywallCatalogPage.tsx` |
| Route | `/drywall/settings/catalogs` |

**Exit:** Mark edits board/finish/component rates in UI; persists to Supabase.

**Hours:** 48–64 *(component catalogs increase Q.A vs drywall-only)*

---

#### Phase Q.B — Unified line-item Quote UI

| Work item | Files |
|-----------|-------|
| v3 types + factory | `src/types/drywall.ts`, `createEmptyDrywallQuoteV3.ts` |
| Unified table (all trades) | `QuoteLineItemsTable.tsx` |
| Location section headers + subtotals | derived UI in table |
| Alternates section | `QuoteAlternatesSection.tsx` |
| v3 stage shell | `QuoteStageV3.tsx` |
| Feature flag + v2 coexistence | `QuoteStage.tsx` |
| Save/load v3 | `drywallProjectsService.ts` |
| Retire add-on/breakdown panels for v3 path | mark deprecated, not deleted until Q.F |

**Exit:** Mark builds **new v3 quote** on Hartville - Irwin test project; saves/loads.

**UAT:** Hartville - Irwin — manual walkthrough.

**Hours:** 80–104

---

#### Phase Q.C — Unified math engine + payroll keys

| Work item | Files |
|-----------|-------|
| Accessory catalog + engine (Q.C.1 ✓) | `quoteV3Accessories.ts`, `AccessoriesTab.tsx` |
| Component labor wiring (Q.C.2 ✓) | `labor_rate` on component catalogs, `quoteV3Math.ts`, `LineRateCells.tsx` |
| v3 rollup | `buildDrywallQuoteCalculationsV3.ts`, `quoteCalculationsV3.ts` |
| Payroll piece key on lines | types + totals panel preview |
| Conversion wizard **(minimal)** | `migrateQuoteV2ToV3.ts`, `QuoteMigrateV2Dialog.tsx` |
| Parity harness | `scripts/quote-v3-parity-test.mjs` (+ `docs/QUOTE_V3_PARITY_REPORT.md`) |
| Tests | `__tests__/lineItemCost.test.ts` |

**Exit:** Live totals match spreadsheet; Hartville conversion optional; Stangl end-to-end second UAT.

**Hours:** 72–96

---

### MVP summary

| Phase | Hours |
|-------|-------|
| Q.0 | 4–8 |
| Q.A | 48–64 |
| Q.B | 80–104 |
| Q.C | 72–96 |
| **MVP total** | **204–272** |
| QA + Mark UAT (+15%) | **~235–315** |
| **Charter estimate (rounded)** | **~280–350 hours** |

*(Charter rounds up for Option A integration risk and catalog seed sessions with Mark.)*

---

### Post-MVP phases (deferred until MVP validated on real new quotes)

| Phase | Focus | Hours (est.) |
|-------|-------|--------------|
| **Q.D** | PDF rewrite — locked design Section 10 | 32–40 |
| **Q.E** | Migration wizard polish, ambiguous breakdown UX, rollback hardening | 32–40 |
| **Q.F** | Default v3 for new projects (after 4–6 week window), v2 deprecation, order-stage line suggest | 40–56 |
| **Phase E (orders)** | v3 lines → material order suggestions | 16–24 |

**Fleet migration of 105 v2 quotes:** Explicitly **out of MVP charter** — Mark converts projects as needed after validation.

### Open product enhancements — post-MVP review (added 2026-06-04)

These are product-decision deferrals (distinct from phase-deferrals above). The V1 implementation ships a simpler version; the more sophisticated version waits for real-use signal that it earns its keep.

#### Cleanup / general labor

**V1 locked decision (shipped during Q.B polish):** Project-level `prep_clean_rate` ($/sqft) on `DrywallQuoteV3`. Default $0.03 (matches v2 `prepCleanRate`). Math: `cleanup_total = sum(drywall_lines.quantity) × prep_clean_rate`. Drywall sqft only (skips RC channel, insulation, etc. — cleanup ties to drywall scope). Lives in `QuoteTotalsSidebar` above OH%. Included in OH/profit markup base. Excluded from waste calc.

**Deferred enhancement — Option D: General Labor as its own trade-tied line type.**

Concept: a dedicated "General Labor" line type that can be added to any trade section (drywall, RC channel, etc.) where each entry **ties dynamically to a parent trade's quantity**. Examples from Mark's operational reality:

- **Residential houses:** typically just one prep/cleanout entry tied to drywall sqft × piece rate.
- **Commercial drywall cleanout:** same pattern but at scale (drywall sqft × rate).
- **Commercial RC channel:** general labor for a laborer to move RC channel material around, sweep up during install — tied to RC channel sqft or LF.
- **Other trades:** ancillary labor patterns specific to each trade (sweeping during insulation, scaffolding for high-ceiling acoustic, etc.).

Each general-labor line item could carry:
- `parent_trade` (or `parent_line_id`) — which trade's quantity drives the basis
- `quantity_basis` — `sum_drywall_sqft` / `sum_rc_channel_lf` / `sum_insulation_sqft` / `parent_line_qty` / `fixed`
- `rate` — $/unit
- Computed: `quantity_basis × rate`

UX implications:
- Each trade section could have its own "+ Add General Labor" affordance separate from "+ Add Line."
- Or general labor lives as a separate cross-cutting section that lists all GL entries with their trade ties visible.
- Payroll piece key flow: GL entries get their own piece keys for laborer pay attribution (separate from finisher / hanger / etc.).

When to revisit: after Mark uses project-level `prep_clean_rate` on real new quotes for several weeks. Signal that triggers the upgrade: jobs where cleanup is materially heavier in some areas than others (project-level rate loses fidelity) or commercial jobs where laborer pay attribution to specific non-drywall trades becomes a payroll need.

Pre-MVP this was considered as Cluster F option (d) during the line-item-vs-component-trade decision; deferred in favor of getting Option A (all trades as line items) shipped first.

#### Auto-generate payroll piece entries from v3 quote (deferred — Q.C.3 polish)

**V1 shipped (Q.C.3):** Payroll run piece-entry dropdown is catalog-driven — finish scope keys, `drywall_hanging`, component labor keys, plus legacy v2 work types. Rates auto-fill from org catalogs where applicable (finish scope `finisher_rate`, component `labor_rate`; hanger rate manual for MVP).

**Deferred enhancement:** A "Generate piece entries from quote" button on the payroll run that walks a v3 quote's completed line items and pre-fills piece entries per line × worker assignment (using each line's `payrollPieceKey` and catalog rates). Reduces Mark's manual re-entry after job completion.

When to revisit: after several pay periods where Mark enters v3 piece keys manually and signals the button would save meaningful time.

#### Trade specifications / scope description model — placeholder (added 2026-06-08)

Mark surfaced during Simmerly real-use that v2's drywall specification inputs (finish dropdowns, thickness fields, exception template chips like `CEILING_EXCEPTION_TEMPLATES` and `HANG_EXCEPTION_TEMPLATES`) capture something the v3 line-item model doesn't: **scope description and customer communication structure parallel to the line-by-line pricing data.**

The two concerns are complementary, not redundant:
- **Line items** = pricing math, payroll attribution, internal estimate breakdown
- **Specifications** = scope description, customer communication, contract clarity, PDF prose generation

v2 had this for drywall only. Mark wants it refined for drywall AND extended to other trades (RC channel, insulation, acoustic, metal stud, FRP).

**Placeholder — needs Mark's brain-dump for design specifics.** When he returns to this, capture:
- What he specifically likes about v2's drywall specs UI (finish dropdowns? exception chips? thickness fields? combination?)
- What feels weak that should improve in the refined version
- Per-trade specification fields he'd want for RC channel, insulation, acoustic, metal stud, FRP
- How specifications relate to the line-item model (separate panel? per-line annotations? both?)
- How specifications feed PDF prose generation (Q.D)
- Whether specifications drive any math (waste defaults? labor adjustments?) or stay purely descriptive

**Placement question (raised 2026-06-08 post-Simmerly):** Mark is musing on whether scope of work / specifications belong on Project Info stage instead of (or in addition to) Quote stage. His reasoning: drywall specs are predictable and often repeated across projects — feels project-characterization-shaped, not pricing-shaped. Three options to consider when designing:
- **(A) Quote stage** (current v2/v3) — scope lives with pricing math
- **(B) Project Info stage** — scope lives with project characterization (name/address/client/scope); carries forward into Quote, Field, Order stages automatically
- **(C) New dedicated "Setup" or "Specifications" stage** — between Project Info and Quote
Mark's lean is currently "content to leave in Quote stage" but the placement question is real. Worth revisiting when specs design is brain-dumped.

When to revisit: after the Simmerly customer quote is out the door and Mark has bandwidth. Could be a meaningful enhancement bundled with Q.D PDF work since scope prose feeds the customer-facing document.

---

## Section 12 — Locked Decisions

All 29 decisions locked with Mark. Organized by cluster.

### Cluster summaries

| Cluster | One-line summary |
|---------|------------------|
| **A — Catalog design** | `org_drywall_catalogs` table; 14 board + 10 finish seeds; boards carry material + hanger rates; component catalogs in Q.A; owner/office_drywall edit; hang+finish one row with two labor rates; sqft/LF/each; per-line rate overrides allowed |
| **B — Migration** | Per-project convert only; no batch; breakdown → location lines; snapshot forever; breakdowns retire |
| **C — Per-line semantics** | Finish scope drives accessories; per-line 10% waste default; sqft-with-waste rollup formula; field variance deferred |
| **D — Alternates** | Separate `alternates[]`; PDF section at bottom; options[] auto-map; ambiguous breakdown dialog; full markup on alternates |
| **E — Markup** | Project-level OH/profit/tax only |
| **F — Redesign scope** | Option A all trades in one spreadsheet MVP; retire component panels |
| **G — Payroll** | Piece keys wired Q.C; scope id = piece key |
| **H — Workflow** | v3 → order suggest (Phase E); v2 default → opt-in v3 → flip default; Hartville then Stangl UAT |

### Full decision table (29 items)

| # | Cluster | Decision |
|---|---------|----------|
| 1 | A | Storage: **`org_drywall_catalogs`** org JSONB table; RLS owner + `office_drywall` write, all org read; seed from code on first access; **independent of Settings** |
| 2 | A | Board catalog: **14 seed entries** (`5_8_type_x` … `1_4_regular`); fields: `id`, `display_name`, `material_rate`, `hanger_rate`, `default_waste_pct` (10%), `notes`; **no sheet length** |
| 3 | A | Finish catalog: **10 seed entries** (`firetape_only` … `hang_only`); fields include `applies_to_locations`, `finisher_rate`, `accessories_applied`, `payroll_piece_key`, `notes` |
| 4 | A | Firetape default accessories: `{ joint_compound: true (reduced), tape: true, screws: true, corner_bead: false }`; **per-line override** for no-compound firetape product |
| 5 | A | Edit permissions: **`owner` + `office_drywall`** |
| 6 | A | **Hang + finish on one row** — single board + finish scope per line, but **two labor rates per row** (hanger from board catalog, finisher from finish scope catalog). Revised 2026-06-04 from real-use signal during McCamon convert. |
| 7 | A | **Units in V1:** sqft, LF, each — component catalogs set unit per entry |
| 8 | A | **Custom material/labor overrides per line:** yes; catalog default + optional `overrideReason` |
| 9 | B | Migration: **(c) backward-compat + per-project "Convert to line-items"** |
| 10 | B | **No auto-batch migration** |
| 11 | B | Breakdown `description` → line **`location`**; multi-breakdown projects split per breakdown |
| 12 | B | **`legacyV2Snapshot` retained forever** in `metadata.legacy.quote.legacyV2Snapshot` |
| 13 | B | **Breakdowns retire** — location grouping is derived UI only |
| 14 | C | Finish scope drives accessories via **`accessories_applied` map** |
| 15 | C | **Per-line waste in V1** — default 10% from board catalog; project global waste **retires** |
| 16 | C | Rollup: **`Σ line.sqft × (1 + line.wasteRate)`** → summary strip "Total sqft with waste" |
| 17 | C | **Per-line field variance deferred** |
| 18 | D | **`quote.alternates[]`** separate array with `{ id, name, description, lineItems[], totalAdd }` |
| 19 | D | PDF: **Customer Alternates section at bottom** — not inline checkboxes *(Q.D)* |
| 20 | D | Legacy **`options[]` → `alternates[]`** on migration; ambiguous breakdown **confirmation dialog** |
| 21 | D | **OH/profit/tax on alternates** — `totalAdd` is fully marked-up |
| 22 | E | **Project-level markup only** — no per-line OH/profit |
| 23 | F | **Option A MVP:** all trades in unified spreadsheet; **retire** `QuoteOptionalAddons` + breakdown component sections |
| 24 | F | **Component catalogs** seeded in Q.A (RC, grid, insulation, acoustic, metal stud, FRP) |
| 25 | F | MVP scope **~280–350 hours** — Mark accepted Option A tradeoff |
| 26 | G | **Payroll piece keys wired in Q.C** — not deferred |
| 27 | G | **Finish scope id = `payroll_piece_key`**; v2 keeps generic fallbacks |
| 28 | H | **v3 lines → order material suggest** (Phase E / post-MVP integration) |
| 29 | H | **Feature flag:** v2 default → opt-in v3 → flip new-project default after 4–6 weeks; UAT **Hartville - Irwin** then **Stangl** |
| 30 | C | **Cleanup labor V1:** project-level `prep_clean_rate` ($/sqft, default 0.03) on `DrywallQuoteV3`; applied to sum of drywall sqft; included in OH/profit markup base. Trade-tied general-labor line type (option d) deferred — see Section 11 "Open product enhancements" |

---

## Section 13 — Prod data findings

*(Research baseline — June 2026, n = 105. Informs migration UX, not MVP blockers.)*

| Finding | Value |
|---------|-------|
| Zero breakdowns | **84 (80%)** |
| Multi-breakdown | **21** — geography only, rates always null |
| `hang_and_finish` | **102/105** |
| Common rate pair | `0.66` / `0.45` (16 quotes) |
| Finisher rate workaround spread | `0.27`–`12.6` on fixed material rate |
| Finish metadata populated | 89 ceiling / 88 wall — **narrative only today** |
| Pseudo-alternate breakdowns | Bennett Beers "Optional Penthouse" — drives **confirmation dialog** rule |
| Add-on usage | RC 8, acoustic 7, grid 4 — **minority but included in Option A MVP** |

**Goodwill Multi** remains a reference for **post-MVP** mixed-scope conversion demo — **not** first UAT target.

---

## Appendix A — MVP file touch matrix

| File / area | Q.A | Q.B | Q.C |
|-------------|-----|-----|-----|
| `supabase/migrations/*catalogs*` | ✓ | | |
| `src/lib/drywall/catalogSeeds.ts` | ✓ | | |
| `src/types/drywallCatalog.ts` | ✓ | | |
| `src/services/drywallCatalogService.ts` | ✓ | | |
| `src/components/drywall/settings/DrywallCatalogPage.tsx` | ✓ | | |
| `src/types/drywall.ts` (v3) | | ✓ | ✓ |
| `QuoteLineItemsTable.tsx` | | ✓ | ✓ |
| `QuoteAlternatesSection.tsx` | | ✓ | |
| `QuoteStageV3.tsx` | | ✓ | ✓ |
| `QuoteStage.tsx` (flag branch) | | ✓ | |
| `drywallProjectsService.ts` | ✓ | ✓ | ✓ |
| `lineItemCost.ts` + trade modules | | | ✓ |
| `buildDrywallQuoteCalculationsV3.ts` | | | ✓ |
| `lineItemAccessories.ts` | | | ✓ |
| `migrateQuoteV2ToV3.ts` (minimal) | | | ✓ |
| `QuoteMigrateV2Dialog.tsx` | | | ✓ |

**Post-MVP:** `drywallQuotePdf.ts` (Q.D), migration polish (Q.E), order suggest (Phase E), v2 removal (Q.F).

---

## Appendix B — v2 → v3 schema diff (locked)

```
REMOVED:  breakdowns[], options[], project sqft/waste/rates, include* toggles,
          QuoteOptionalAddons data paths

ADDED:    lineItems[] (all trades), alternates[], per-line wasteRate,
          catalog FKs, override fields, payrollPieceKey, summary rollups,
          legacyV2Snapshot (after conversion)

RETAINED: pricing { OH, profit, tax, laborBurden }, calculations cache (v3 shape),
          v2 full quote in legacyV2Snapshot after migration
```

---

## Appendix C — Risk register (updated)

| Risk | Mitigation |
|------|------------|
| Option A scope larger than drywall-only | Locked 280–350 hr charter; MVP phases Q.0–Q.C only |
| Mark overwhelmed by catalog seed | Q.A session with Mark; sensible defaults in seed file |
| Dual calc paths drift | v2 branch frozen except bugfixes; parity harness on Hartville |
| Premature fleet migration | **Out of MVP** — per-project convert only |
| PDF gap during MVP | Mark uses on-screen totals + existing v2 PDF for unmigrated quotes |
| Payroll key mismatch | Keys = finish scope ids; document mapping in totals panel |

---

## Appendix D — MVP success criteria

1. Mark creates **new v3 quote** on Hartville - Irwin with **≥2 drywall lines** (different board and/or finish) — totals match manual check.
2. **Unified table** accepts RC / grid / insulation lines with correct units in same view.
3. **v2 quotes unchanged** until Convert clicked.
4. **Catalog edits** persist without deploy.
5. **Payroll piece keys** visible on finish lines in Q.C totals preview.
6. **Stangl** second UAT passes quote → field → existing order flow (order line suggest optional until Phase E).
7. After **4–6 weeks**, flip new-project default to v3 (post-MVP config change).

---

*End of locked execution plan — Phase Q.0 complete. Implementation starts Phase Q.A.*
