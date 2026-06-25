# D.4 — Margin Floor (30%) Enforcement

**Anchor:** [DRYWALL_DIVISION_OPERATIONS_PLAN.md](DRYWALL_DIVISION_OPERATIONS_PLAN.md) — Phase D.4; decisions #17 (30% org-wide floor), #21 (margin formula), KPI #3 (bid margin discipline).

**Working assumptions:**
- All drywall data lives in `projects.metadata.legacy.*` JSONB.
- Existing org-level catalog config lives on `org_drywall_catalogs` table (one row per org; JSONB columns for each catalog).
- Margin formula matches decision #21: `(bid_total - estimated_cost) / bid_total`.
- Below-floor sends ARE allowed but require a reason — the gate is a checkpoint, not a hard block.

---

## Goal

Two gates that fire when projected margin < 30%:

1. **Quote-driven projects** — at "Mark Sent". Margin uses `routineSubtotal + cleanupTotal` as estimated cost.
2. **PO projects** — at field measurement → order transition. Margin uses `field_measured_sqft × po_estimated_cost_per_sqft` as estimated cost (since PO has no quote math).

Both gates: open a confirmation dialog requiring a free-text reason. Approval is recorded to `metadata.legacy.below_floor_approvals[]` with timestamp + author + margin + reason for KPI #3 attribution.

Plus a **live margin indicator** in the quote stage sidebar so operators see the discipline target while estimating.

## Schema changes

### Supabase migration

New file: `supabase/migrations/20260616120000_drywall_margin_targets.sql`

```sql
BEGIN;

ALTER TABLE public.org_drywall_catalogs
  ADD COLUMN IF NOT EXISTS margin_floor_target numeric NOT NULL DEFAULT 0.30,
  ADD COLUMN IF NOT EXISTS po_estimated_cost_per_sqft numeric NOT NULL DEFAULT 2.50;

COMMENT ON COLUMN public.org_drywall_catalogs.margin_floor_target IS
  'D.4: Org-wide minimum acceptable margin (cost-vs-bid ratio). Below this triggers reason-required confirmation at quote send / PO field-measurement → order.';
COMMENT ON COLUMN public.org_drywall_catalogs.po_estimated_cost_per_sqft IS
  'D.4: Estimated all-in cost per sqft used to compute margin on PO projects at field measurement time (no quote math available).';

COMMIT;
```

### Types

Extend `OrgDrywallCatalogs` in `src/types/drywallCatalogs.ts`:

```ts
export interface OrgDrywallCatalogs {
  // ... existing catalogs
  marginFloorTarget: number              // default 0.30
  poEstimatedCostPerSqft: number          // default 2.50
}
```

Add to `src/types/drywall.ts`:

```ts
export interface BelowFloorApproval {
  approvedAt: string                      // ISO timestamp
  approvedBy: string                      // user_id
  approvedByName?: string                 // denormalized display name
  trigger: 'quote_send' | 'field_measurement_to_order'
  marginAtApproval: number                // computed margin at approval moment
  bidTotal: number
  estimatedCost: number
  floorTarget: number                     // floor at time of approval (in case it changes later)
  reason: string
}
```

Persisted at `metadata.legacy.below_floor_approvals: BelowFloorApproval[]` (append-only).

## Pure helpers — `src/lib/drywall/marginFloor.ts` (NEW)

```ts
export interface MarginFloorEvaluation {
  bidTotal: number
  estimatedCost: number
  marginPct: number | null                // null if bidTotal === 0
  floorTarget: number
  belowFloor: boolean                     // true when marginPct != null && marginPct < floorTarget
}

export function evaluateMarginVsFloor(
  bidTotal: number,
  estimatedCost: number,
  floorTarget: number,
): MarginFloorEvaluation
// Pure: returns { bidTotal, estimatedCost, marginPct, floorTarget, belowFloor }
// marginPct = (bidTotal - estimatedCost) / bidTotal when bidTotal > 0; else null.

export function computeQuoteEstimatedCost(routineSubtotal: number, cleanupTotal: number): number
// Returns routineSubtotal + cleanupTotal. Used for quote-driven projects at Mark Sent.

export function computePoEstimatedCost(fieldMeasuredSqft: number, costPerSqft: number): number
// Returns fieldMeasuredSqft * costPerSqft. Used for PO projects at field measurement → order.
```

Unit test all three: zero inputs, normal values, edge cases.

## Service additions — `src/services/drywallProjectsService.ts`

```ts
export async function recordBelowFloorApproval(
  projectId: string,
  entry: Omit<BelowFloorApproval, 'approvedAt' | 'approvedBy' | 'approvedByName'>,
): Promise<BelowFloorApproval>
// 1. Resolve current user (id + display name via profile lookup if available).
// 2. Append to metadata.legacy.below_floor_approvals[].
// 3. Persist via persistLegacyMetadata.
// 4. Return the appended entry.

export function getBelowFloorApprovalsFromLegacy(
  legacy: Record<string, unknown>,
): BelowFloorApproval[]
// Read-helper. Defensive parse; returns [] when missing/malformed.
```

## Service additions — `src/services/drywallCatalogsService.ts`

Extend existing catalogs fetch to include the two new columns. Add:

```ts
export async function updateDrywallMarginTargets(
  marginFloorTarget: number,
  poEstimatedCostPerSqft: number,
): Promise<void>
// Validates: 0 < marginFloorTarget <= 1, poEstimatedCostPerSqft > 0
// Updates the org's catalogs row.
```

## UI — live margin indicator on quote sidebar

Modify [`src/components/drywall/quote/v3/QuoteTotalsSidebar.tsx`](../src/components/drywall/quote/v3/QuoteTotalsSidebar.tsx).

Add a "Margin vs Floor" row near the bid total. Calls `evaluateMarginVsFloor(routine.total, routine.linesSubtotal + routine.cleanupTotal, catalogs.marginFloorTarget)`.

- If `belowFloor`: red text/icon, value formatted as percentage with `(floor: 30%)` caption.
- If 5% above floor (`marginPct >= floor && marginPct < floor + 0.05`): yellow.
- Else: green.

Always visible while editing. No interaction — drives estimating discipline before "Mark Sent" is reached.

## UI — extend QuoteOutcomeBar's Mark Sent dialog

Modify [`src/components/drywall/quote/QuoteOutcomeBar.tsx`](../src/components/drywall/quote/QuoteOutcomeBar.tsx).

Before opening the existing Mark Sent confirm dialog:
1. Fetch current quote totals + catalogs.
2. Compute `evaluateMarginVsFloor`.
3. If `belowFloor === true`, swap to a **"Send Below Target Margin"** variant of the dialog:
   - Title: "Send below target margin?"
   - Body: explains current margin vs floor with specific numbers
   - **Required textarea**: "Reason for sending below floor" (cannot submit empty)
   - Confirm button label: "Mark Sent (below floor)" — destructive variant
4. On confirm:
   - Call `recordBelowFloorApproval` first with trigger='quote_send' + reason
   - Then call existing `markQuoteSent`
   - Both must succeed; if approval log fails, abort send and surface error

If `belowFloor === false`, existing flow unchanged.

## UI — gate at field measurement → order

Modify [`src/components/drywall/field/FieldMeasurementPage.tsx`](../src/components/drywall/field/FieldMeasurementPage.tsx).

Find the action that calls `saveFieldTakeoffAndAdvance` (advances status to 'order'). Before that call:

1. Fetch project + catalogs.
2. Get `intakeSource` from legacy. Only run the gate for PO projects (`intakeSource === 'po'`).
3. Get `field_measured_sqft` from current takeoff state (`fieldTakeoffWithTotals(takeoff).totalMeasuredSqft`).
4. Get bid total from `legacy.quote.bidSnapshot.total` (set at PO intake in D.2).
5. Compute estimated cost via `computePoEstimatedCost(fieldSqft, catalogs.poEstimatedCostPerSqft)`.
6. Evaluate margin. If `belowFloor === true`:
   - Open the same "Send Below Target Margin" dialog variant — title/body adjusted to "Continue below target margin?" wording
   - Required reason textarea
   - On confirm: `recordBelowFloorApproval` (trigger='field_measurement_to_order') then proceed with the existing advance action

For quote-driven projects (`intakeSource !== 'po'`), no gate at field measurement (the gate already fired at Mark Sent earlier). Pass through.

## UI — new "Targets" tab on CatalogsPage

Modify [`src/components/drywall/settings/CatalogsPage.tsx`](../src/components/drywall/settings/CatalogsPage.tsx).

Add a "Targets" tab alongside Boards, Finish Scopes, etc.

Tab contents:
- **Margin Floor Target** input — numeric, 0–100%, default 30%
  - Caption: "Quote sends and field-measurement-to-order transitions below this trigger a reason-required approval dialog."
- **PO Estimated Cost per Sqft** input — currency, default $2.50
  - Caption: "Used to estimate PO project margin at field measurement. Set to your typical all-in drywall cost per sqft."
- Save button → calls `updateDrywallMarginTargets`

Reuse existing settings input patterns from BoardsTab / FinishScopesTab.

## Acceptance criteria

1. Type-check passes. Unit tests for `evaluateMarginVsFloor`, `computeQuoteEstimatedCost`, `computePoEstimatedCost` pass.
2. Migration applies cleanly; both new columns default correctly.
3. Settings tab "Targets" appears on `/drywall/settings/catalogs`. Operator can edit + save the two values; persists to `org_drywall_catalogs`.
4. QuoteTotalsSidebar shows live "Margin vs Floor" row that updates as quote inputs change.
5. **Quote-driven happy path** (margin ≥ floor): Mark Sent shows the existing dialog; no reason required.
6. **Quote-driven below floor**: Mark Sent shows "Send below target margin?" variant; reason textarea required; cannot submit empty; on confirm, both `below_floor_approvals[]` entry written AND `markQuoteSent` succeeds.
7. **PO happy path** (margin ≥ floor): Field measurement → order advances normally; no extra dialog.
8. **PO below floor**: Field measurement → order opens reason-required dialog; on confirm, approval logged + status advances.
9. `metadata.legacy.below_floor_approvals` entries carry correct `trigger`, `marginAtApproval`, `floorTarget`, `bidTotal`, `estimatedCost`, `reason`, timestamp, user id.
10. Approval log is append-only — repeated below-floor events on the same project create multiple entries.
11. Floor value change in settings does NOT retroactively change recorded `floorTarget` on prior approvals (snapshotted).
12. Smoke verification: create a low-margin quote, send it below floor; PO project with high cost/sqft setting, advance from field — confirm both gates trigger and log correctly.

## Out of scope (later phases)

- KPI #3 (bid margin discipline) dashboard surfacing — reads `below_floor_approvals[]` aggregates, deferred to D.5
- Soft-block / hard-block escalation (e.g. owner override required for >5% below floor) — V1 is uniform reason-required confirmation
- Per-customer or per-project-type margin floor overrides — V1 is single org-wide value (decision #4)
- Historical chart of margin trends — D.5 KPI dashboard work
- Email/notification on below-floor approval — V1 is in-app only

## Estimated effort

1-2 sessions. Pure helpers + small UI additions + migration + settings tab. Main risk is finding the exact field measurement advance action in `FieldMeasurementPage.tsx` to wrap the gate around.

---
