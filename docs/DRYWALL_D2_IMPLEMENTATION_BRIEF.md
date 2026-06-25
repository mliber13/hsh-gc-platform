# D.2 — PO Intake / Degenerate Quote

**Anchor:** [DRYWALL_DIVISION_OPERATIONS_PLAN.md](DRYWALL_DIVISION_OPERATIONS_PLAN.md) — Phase D.2; decisions #1 (PO multi-line collapse), #19 / #18 (cost data), #21 (margin formula), #29 (3-4 dedicated customer focus = Schumacher pattern is the high-priority use case).

**Working assumptions** (same as D.1):
- All drywall data lives in `projects.metadata.legacy.*` JSONB — no schema migrations.
- Top-level `projects.status` is source of truth; `metadata.legacy.status` is the mirror.
- Existing pattern: read via `fetchDrywallProjectById`, mutate via `persistLegacyMetadata`.

---

## Goal

PO-origin drywall projects skip the quote-build phase entirely. Operator enters PO data once → project lands at `field-measurement` with a frozen bid baseline = `customerSqft × agreedUnitRate`. The Quote tab renders a **PO Summary card** instead of the v3 quote builder. All downstream cost / margin / variance math (D.1.4) works unchanged — the bid snapshot is the variance baseline regardless of how it was created.

## What ships

### Types

Add to `src/types/drywall.ts`:

```ts
export interface DrywallPoData {
  poReference: string                // PO#
  customerSqft: number
  agreedUnitRate: number              // $/sqft
  scopeText: string                   // operator-entered, defaults to "Drywall hang and finish per PO"
  expectedStartDate?: string          // ISO date (optional)
  customerContact?: string            // optional free-text (email/phone/name combined)
  intakeAt: string                    // ISO timestamp of intake submission
  lastEditedAt?: string               // ISO timestamp of last "Edit PO" save
}
```

Persisted at `metadata.legacy.po`.

`metadata.legacy.intakeSource` and `metadata.legacy.poReference` were already added in D.1.1. `legacy.poReference` becomes a denormalized convenience (same value as `legacy.po.poReference`); keep both populated for backward compat with anything that reads the shorthand.

### Pure helper

`src/lib/drywall/poBidSnapshot.ts` (NEW)

```ts
export function buildPoBidSnapshot(
  customerSqft: number,
  agreedUnitRate: number,
  scopeText: string,
  at: string,
): BidSnapshot
// Synthesizes a BidSnapshot matching the D.1.2 shape:
// {
//   total: sqft * rate,
//   at,
//   payload: {
//     routineSubtotal: sqft * rate,
//     cleanupTotal: 0,
//     overhead: 0,
//     profit: 0,
//     salesTax: 0,
//     bidTotal: sqft * rate,
//     lineItems: [{ id: 'po-line-1', type: 'drywall', description: scopeText, computed_line_total: sqft*rate }],
//     alternates: [],
//   }
// }
```

Unit-test it: zero inputs → throws; valid inputs → exact totals match.

### Service additions

`src/services/drywallProjectsService.ts`:

```ts
export interface CreateDrywallProjectFromPoInput {
  name: string                       // typically uses customer + PO# or address
  client: string                     // customer/company name
  address?: string
  poData: Omit<DrywallPoData, 'intakeAt' | 'lastEditedAt'>
}

export async function createDrywallProjectFromPo(
  input: CreateDrywallProjectFromPoInput,
): Promise<string>  // returns projectId
// 1. Validate: poData.customerSqft > 0, poData.agreedUnitRate > 0, poData.poReference non-empty.
// 2. Insert projects row: name, client, address, status='field-measurement', type='drywall',
//    organization_id, user_id, created_by, updated_at, metadata={
//      app_scope: 'DRYWALL_ONLY',
//      visibility: { gc: false, drywall: true },
//      source: 'drywall_app',
//      legacy: {
//        ...projectInfoMirror (name, client, address, status, createdAt, updatedAt, notes:''),
//        intakeSource: 'po',
//        poReference: input.poData.poReference,
//        po: { ...input.poData, intakeAt: now },
//        quote: {
//          version: 3,
//          outcome: 'approved',
//          outcomeTimestamps: { approvedAt: now },
//          bidSnapshot: buildPoBidSnapshot(sqft, rate, scopeText, now),
//          lineItems: [],
//          alternates: [],
//          prep_clean_rate: 0,
//          overhead_pct: 0,
//          profit_pct: 0,
//          sales_tax_pct: 0,
//          updatedAt: now,
//        },
//      },
//    }
// 3. Return new project id.

export async function updateDrywallProjectPoData(
  projectId: string,
  poData: Omit<DrywallPoData, 'intakeAt' | 'lastEditedAt'>,
): Promise<void>
// 1. Load existing project + guard: legacy.intakeSource must === 'po'.
// 2. Validate input (same as create).
// 3. Update legacy.po with new fields + preserve intakeAt + set lastEditedAt = now.
// 4. Re-synthesize legacy.quote.bidSnapshot with new sqft × rate.
// 5. Keep outcome='approved' (don't transition).
// 6. Persist via persistLegacyMetadata (no status change).
```

### UI — entry point dropdown

Modify [DrywallProjectsListPage.tsx](../src/components/drywall/DrywallProjectsListPage.tsx):

Replace the existing `<Button onClick={handleCreate}>New Drywall Project</Button>` with a dropdown menu (use shadcn `DropdownMenu`):

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button disabled={creating}>
      <PlusCircle className="mr-2 h-4 w-4" />
      {creating ? 'Creating…' : 'New Drywall Project'}
      <ChevronDown className="ml-1 h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onClick={() => void handleCreate()}>
      New from scratch
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => setPoIntakeOpen(true)}>
      Create from PO
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

Embed `<PoIntakeDialog open={poIntakeOpen} onOpenChange={setPoIntakeOpen} onCreated={(id) => navigate('/drywall/projects/${id}/info')} />` at the bottom of the page.

### UI — PO intake dialog

`src/components/drywall/intake/PoIntakeDialog.tsx` (NEW)

shadcn Dialog with a form. Two modes:
- **Create mode** — submitting calls `createDrywallProjectFromPo`
- **Edit mode** — submitting calls `updateDrywallProjectPoData` (props pass `mode='edit'`, `projectId`, `initialValues`)

Form fields (mark required with `*`):

| Field | Type | Required | Notes |
|---|---|---|---|
| Project Name | text | ✓ | Pre-fill suggestion: "{Client} — PO {poReference}" |
| Customer / Client | text | ✓ | |
| Customer Contact | text | optional | Free-text (email/phone/name) |
| Address | text | optional | |
| PO Number | text | ✓ | |
| Customer's Sqft | number | ✓ | > 0 |
| Agreed Unit Rate $/sqft | number | ✓ | > 0 |
| Scope Text | textarea | optional | Defaults to "Drywall hang and finish per PO" |
| Expected Start Date | date | optional | |

**Live computed display** below fields: `Total Bid = {sqft} × ${rate} = ${total}` (formatted). Updates as operator types.

**Submit:**
- Disabled until required fields filled + sqft > 0 + rate > 0
- Loading state during request
- On success: close dialog + toast + (create mode: navigate to new project's /info) (edit mode: refresh parent's data)
- Error: toast error message; dialog stays open

In edit mode, also show a small footer note: "Saving will refresh the bid baseline to ${new total}."

### UI — Quote tab branches on intakeSource

Modify the v3 quote stage route (look at [QuoteStageRoute.tsx](../src/components/drywall/quote/QuoteStageRoute.tsx) or its v3 equivalent — the wrapper that decides which builder to render).

Add a branch at the top:

```tsx
const legacy = project.legacy
if ((legacy?.intakeSource as string) === 'po') {
  return <PoSummaryCard projectId={projectId} />
}
// ... existing v3 builder path
```

If the existing structure puts the routing logic inside `QuoteStage.tsx` or `QuoteStageV3.tsx`, add the branch there at the top of the render.

The PO branch does NOT render `<QuoteOutcomeBar>` — the outcome lifecycle (Drafted → Sent → Approved | Lost) doesn't apply to PO projects.

### UI — PoSummaryCard component

`src/components/drywall/quote/PoSummaryCard.tsx` (NEW)

```tsx
interface PoSummaryCardProps {
  projectId: string
}

export function PoSummaryCard({ projectId }: PoSummaryCardProps) {
  // Fetch project + legacy.po + legacy.quote.bidSnapshot
  // Render a single Card:
  //   - Header: "Purchase Order" + status pill (Approved + intakeAt date)
  //   - Sections:
  //     - PO Details: PO #, customer, contact, address
  //     - Pricing: Sqft × $/sqft = Total Bid (large display)
  //     - Scope: scopeText
  //     - Schedule: Expected Start (if set)
  //     - Bid baseline: "Bid baseline: ${total} locked on {intakeAt}"
  //   - Actions: "Edit PO" button (opens PoIntakeDialog in edit mode), "Download PO PDF" disabled with "Coming soon" tooltip
}
```

Hide the Edit PO button for viewers (use `usePermissions` + `canWriteDrywallProject`).

## Acceptance criteria

1. Type-check passes; new unit tests for `buildPoBidSnapshot` pass.
2. Drywall projects list page shows a dropdown menu on the "New Drywall Project" button with two items: "New from scratch" + "Create from PO".
3. "New from scratch" preserves existing behavior (creates blank project, navigates to /info).
4. "Create from PO" opens `PoIntakeDialog` in create mode.
5. Filling required fields + submit:
   - Creates a project with status='field-measurement' (top-level + legacy mirror)
   - `legacy.intakeSource='po'`, `legacy.poReference` set, `legacy.po` populated with all input fields + `intakeAt`
   - `legacy.quote.outcome='approved'`, `outcomeTimestamps.approvedAt` set
   - `legacy.quote.bidSnapshot` synthesized correctly via `buildPoBidSnapshot`: `total === sqft * rate`
6. Required-field validation enforces non-empty PO Number / Customer / sqft / rate; sqft and rate must be > 0.
7. Navigating to the new project's Project Info shows the customer + address pre-filled.
8. Navigating to the Quote tab shows `PoSummaryCard` — NOT the v3 quote builder, NOT the QuoteOutcomeBar.
9. PoSummaryCard displays PO #, customer, sqft × rate = total, scope, expected start, bid baseline.
10. "Edit PO" button opens `PoIntakeDialog` in edit mode with current values pre-filled.
11. Editing + submit:
    - Updates `legacy.po` (preserves `intakeAt`, sets `lastEditedAt`)
    - Re-synthesizes `legacy.quote.bidSnapshot` with new sqft × rate
    - PoSummaryCard refreshes with new total
12. Production widget (after status advances to `production`) shows correct Margin vs Bid using the PO bid snapshot.
13. Quote tab for non-PO projects (existing intakeSource='quote' or unset) renders the v3 builder + QuoteOutcomeBar — no regression.

## Out of scope

- **PO PDF attachment** — defer to post-launch (button stub shown with "Coming soon" tooltip).
- **Multi-line POs** — decision #1 already locks single-line collapse; not in V1.
- **PO-to-quote-builder migration** — if a PO project ever needs full v3 quote treatment, that's a manual flow operators don't need yet.
- **Customer contact directory** — V1 is free-text only.
- **Billing terms field on the form** — defer; can be added later via Edit PO if needed (existing quote pay-terms field per decision #14 covers normal quote-driven projects).

## Estimated effort

1-2 sessions. Mostly composition:
- Pure helper + unit test (small)
- Two service functions (modest, follow existing patterns)
- Dropdown + dialog UI (modest — dialog has ~9 form fields + computed total)
- PoSummaryCard (small)
- Branch in Quote stage to render PoSummaryCard

Biggest risk: finding the right insertion point in the existing v3 quote stage to branch on `intakeSource`. The component tree may need a small refactor if the routing logic is split across multiple files.
