# Door Install trade — v3 quote implementation brief

## Goal
Add **Door Install** as a first-class trade in the **v3** drywall quote model.
Pricing model: **count of doors × labor-per-door**, plus an **optional material rate per door**
(frame/hardware/slab). Catalog-backed default rate, overridable per line. Unit = **each (per door)**.

## Design decisions (locked)
- **v3 only.** Do NOT touch v2 (`quoteCalculations.ts`, `buildDrywallQuoteCalculations.ts`,
  `QuoteMetalStudPanel.tsx`, `deriveAddonFlagsFromData.ts`, `tradePdfBreakdown.ts`,
  `drywallQuoteSchema.ts`). Door Install never existed in v2, so no v2 fields and no
  `convertQuoteV2ToV3.ts` mapping are needed.
- **Mirror `metal_stud` / `frp`.** Door Install is a plain quantity-based component trade. The math
  needs **zero** changes — `computeLineItem`'s generic `else` branch already computes
  `qty × labor_rate` for labor and `qty × material_rate` for material (non-drywall lines use
  `wasteMult = 1`).
- **Material is sales-taxed** like every other material (flows through `materialSubtotal`). This is
  intended and consistent. Leave material rate at $0 for labor-only doors.
- **New catalog array `door_install`** on `OrgDrywallCatalogs`. Backward-safe: `parseOrgDrywallCatalogs`
  rebuilds the object every load, so existing orgs get `door_install: []` with **no migration / no DB
  backfill**.

## Compiler tripwires (these WILL fail the build until updated — good)
1. `QUOTE_LINE_TYPE_LABELS` — `Record<QuoteLineItemType, string>`
2. `TRADE_SECTION_THEMES` — `Record<QuoteLineItemType, TradeSectionTheme>`

The `switch` statements below have `default` cases and will **silently no-op** if missed — they won't
fail compilation, so add every one deliberately.

---

## File-by-file edits

### 1. `src/types/drywall.ts` (~line 496)
Add `door_install` to the union:
```ts
export type QuoteLineItemType =
  | 'drywall'
  | 'rc_channel'
  | 'suspended_grid'
  | 'insulation'
  | 'acoustic'
  | 'metal_stud'
  | 'frp'
  | 'door_install'
```

### 2. `src/types/drywallCatalogs.ts`
Add the catalog entry interface (after `FrpCatalogEntry`, ~line 147):
```ts
export interface DoorInstallCatalogEntry {
  id: string
  display_name: string
  /** $ per door — hardware/frame/slab; optional (leave 0 for labor-only). */
  material_rate: number
  /** $ per door installed. */
  labor_rate: number
  notes?: string
}
```
Add the array to `OrgDrywallCatalogs` (after `frp: FrpCatalogEntry[]`, ~line 158):
```ts
  door_install: DoorInstallCatalogEntry[]
```

### 3. `src/lib/drywall/catalogUtils.ts`
In `parseOrgDrywallCatalogs`, add after the `frp:` block (~line 207):
```ts
    door_install: parseArray(p.door_install, (item) =>
      parseGenericEntry(item, (o, base) => ({
        ...base,
        material_rate: toNum(o.material_rate),
        labor_rate: toNum(o.labor_rate),
        notes: o.notes != null ? String(o.notes) : undefined,
      })),
    ),
```
In `isEmptyCatalogPayload`, add `'door_install'` to the `keys` array (~line 241).

### 4. `src/lib/drywall/catalogSeeds.ts`
In `createDefaultDrywallCatalogSeeds`, add after `frp: [],` (~line 194):
```ts
    door_install: [],
```
> Note: seeds only apply to brand-new orgs. Mark's existing org gets `[]` via the parser — he adds
> a Door Install catalog entry through the new admin tab (see post-build steps).

### 5. `src/lib/drywall/quoteV3CatalogResolve.ts`
- `QUOTE_LINE_TYPE_LABELS` (~line 4) — **required (Record)**:
  ```ts
  door_install: 'Door Install',
  ```
- `catalogColumnLabel` (~line 15) — add `case 'door_install':` to the `'Component'` group.
- `getCatalogDefaultMaterialRate` (~line 49) — add:
  ```ts
  case 'door_install':
    return catalogs.door_install.find((e) => e.id === line.catalog_id)?.material_rate ?? 0
  ```
- `getCatalogDefaultComponentLaborRate` (~line 116) — add:
  ```ts
  case 'door_install':
    return catalogs.door_install.find((e) => e.id === line.catalog_id)?.labor_rate ?? 0
  ```
- `materialRateUnitSuffix` (~line 160) — add `case 'door_install':` returning `'/door'`.
- `materialRateHeaderForType` (~line 186) — add `case 'door_install':` returning `'Mat. rate ($/door)'`.
- `componentLaborRateHeaderForType` (~line 227) — add `case 'door_install':` returning `'Labor rate ($/door)'`.
- `getLineUnit` (~line 264) — add explicit `case 'door_install': return 'each'` (the door count is "each").
- `getLineCatalogLabel` (~line 290) — add:
  ```ts
  case 'door_install':
    return catalogs.door_install.find((e) => e.id === line.catalog_id)?.display_name ?? '—'
  ```
- `catalogOptionsForLineType` (~line 311) — add:
  ```ts
  case 'door_install':
    return catalogs.door_install.map((e) => ({ id: e.id, label: e.display_name }))
  ```

### 6. `src/lib/drywall/quoteV3Math.ts`
- `QuoteV3ComponentLaborByTrade` interface (~line 70) — add `door_install_labor: number`.
- `emptyComponentLaborByTrade` (~line 25) — add `door_install_labor: 0,`.
- `componentLaborTradeKey` (~line 36) — add:
  ```ts
  case 'door_install':
    return 'door_install_labor'
  ```
- **No change to `computeLineItem`** — generic `else` branch already handles it.

### 7. `src/lib/drywall/quoteV3TradeTheme.ts` — **required (Record)**
Import an icon (e.g. `DoorOpen`) from `lucide-react`, then add to `TRADE_SECTION_THEMES` (use `indigo`,
which is unused by other trades):
```ts
  door_install: {
    icon: DoorOpen,
    borderClass: 'border-l-indigo-500',
    headerClass: 'bg-indigo-500/10 text-indigo-950 dark:text-indigo-100',
    subtotalRowClass: 'bg-indigo-500/8 border-t border-indigo-500/20',
    locationSubtotalClass: 'bg-indigo-500/5 border-t border-indigo-500/15',
  },
```

### 8. `src/components/drywall/quote/v3/LineItemsTable.tsx` (~line 47)
Add `'door_install'` to the `LINE_TYPES` array (drives the "Add line" menu + section grouping).

### 9. `src/components/drywall/quote/v3/QuoteTotalsSidebar.tsx` (~line 369)
Add to the component-labor rows array:
```ts
  { key: 'door_install_labor', label: 'Door Install Labor' },
```

### 10. `src/lib/drywall/estimatedLabor.ts` (~line 28)
Add to `COMPONENT_LABELS` (`COMPONENT_KEYS` derives from it automatically):
```ts
  door_install_labor: 'Door Install',
```
Do NOT add to `V2_COMPONENT_FIELDS` (v2 has no door install).

### 11. `src/lib/drywall/estimatedMaterial.ts`
- Add `door_install: 'Door Install'` to the labels map (~line 22).
- Add `'door_install'` to the trade-order array (~line 40).
- Do NOT touch the V2 field map.

### 12. `src/lib/drywall/payrollPieceKeys.ts`
Add `door_install` to all **three** maps:
- trade → piece key (~line 30): `door_install: 'door_install_labor',`
- piece key → label (~line 48): `door_install_labor: 'Door Install Labor',`
- piece key → trade (~line 58): `door_install_labor: 'door_install',`

### 13. `src/lib/drywall/quoteV3PdfModel.ts` (~line 29)
Add `'door_install'` to `PDF_TRADE_ORDER`.

### 14. `src/lib/drywall/quoteScopeOfWorkGenerate.ts` (~line 10)
Add `'door_install'` to `TRADE_ORDER`. (Scope prose is generated generically from label + qty + unit,
so no per-type sentence template is needed.)

### 15. `src/services/crewWorkspaceService.ts` (~line 487)
Add after the `frp` line in the scope-line generator:
```ts
  if (types.has('door_install')) lines.push('Door Installation: Labor and material per plans and specs.')
```

### 16. Catalog admin UI — Door Install tab
- `src/components/drywall/settings/catalogs/ComponentCatalogTabs.tsx`: add a `DoorInstallTab`
  component modeled on `MetalStudTab`/`FrpTab`, but simpler — only fields are **Display name**,
  **Material rate ($/door)**, **Labor rate ($/door)**, **Notes**. Import `DoorInstallCatalogEntry`.
  Use `generateCatalogEntryId('door')`. Columns: Name, Mat $/door, Labor $/door.
- `src/components/drywall/settings/CatalogsPage.tsx`: register the new tab in the tab list next to
  Metal Stud / FRP (grep this file for `FrpTab` / `MetalStudTab` and add `DoorInstallTab` in parallel —
  add a trigger label "Door Install" and the panel).

### 17. `src/lib/drywall/structuredScopePdf.ts` — verify
This file appears in the trade-token search. Grep it for `metal_stud` / `frp`; if it enumerates trade
types (e.g. a scope-by-trade section), add a parallel `door_install` branch. If it only consumes shared
resolver helpers, no change is needed.

---

## Verification
1. `npx tsc --noEmit` — the two Record tripwires (labels, themes) confirm you hit the required spots.
2. `npm test` (or the drywall quote test subset) — watch `quoteV3*`, `estimatedLabor`, `estimatedMaterial`
   parity tests. None should reference door install; they should stay green.
3. Manual smoke in a v3 quote:
   - Settings → Catalogs → **Door Install** → add "Standard Door" with e.g. labor $45/door, material $0.
   - Open a v3 quote → **Add line → Door Install** → pick "Standard Door", set location "Phase 3",
     quantity = door count. Confirm the line total = doors × $45 and it rolls into the Phase 3
     location subtotal, the Door Install section subtotal, and the "Door Install Labor" row in the
     totals sidebar.
   - Generate the quote PDF → confirm a Door Install section appears.

## Post-build — how Mark uses it on the waiting project
1. Add the Door Install catalog entry (Settings → Catalogs → Door Install) — his existing org starts
   with an empty list, so this is required before a door line can pull a rate.
2. On the target project (currently v2): click **Convert to v3** (existing button; trades that already
   calculate correctly convert at $0.00 delta).
3. Add a **Door Install** line, set location to the right Phase, enter the door count. Override the
   per-line labor rate if this job differs from the catalog default.
