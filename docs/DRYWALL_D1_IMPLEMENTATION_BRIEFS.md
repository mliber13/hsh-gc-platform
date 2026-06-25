# D.1 Implementation Briefs

Sub-phase briefs for the D.1 work scoped in [DRYWALL_DIVISION_OPERATIONS_PLAN.md](DRYWALL_DIVISION_OPERATIONS_PLAN.md). Each brief is a self-contained instruction set for Cursor to implement.

## Working assumptions (apply to all D.1.x)

- All drywall data lives in `projects.metadata.legacy.*` JSONB — no dedicated tables.
- Top-level `projects.status` is the source of truth; `metadata.legacy.status` is a mirror, kept in sync by `persistLegacyMetadata`.
- Existing pattern: read via `fetchDrywallProjectById`, mutate via `persistLegacyMetadata`. Stay inside this pattern.
- All new fields are JSONB additions with safe defaults read at hydrate time. No DB migrations required.

---

## D.1.1 — Lifecycle states + UI shells

**Goal:** Extend the drywall project state machine to include Production and Closeout stages, add corresponding tabs + page shells, and lay JSONB foundations for D.1.2-D.1.4. No real cost data yet; widgets show placeholders.

### Schema changes — types only

**`src/types/drywall.ts`:**

Extend `DrywallProjectStatus`:

```ts
export type DrywallProjectStatus =
  | 'project-info'
  | 'quote'
  | 'field-measurement'
  | 'order'
  | 'production'         // NEW — production in progress
  | 'production-complete' // NEW — production work done, point-ups pending
  | 'closed'             // RENAMED from 'complete' — terminal / fully closed
```

`DRYWALL_PROJECT_STATUSES` array extends to include the new values. `DRYWALL_STATUS_LABELS` map:

- `production` → "Production"
- `production-complete` → "Production Complete"
- `closed` → "Closed"

**Backward compat:** existing rows with `status = 'complete'` keep working — add a normalizer in the service layer that maps `'complete'` → `'closed'` on read. Do NOT auto-migrate the DB.

**New JSONB shapes under `metadata.legacy`:**

```ts
// metadata.legacy.intakeSource (new)
type DrywallIntakeSource = 'quote' | 'po'
// default 'quote' when missing — foundation for D.2

// metadata.legacy.poReference (new)
type PoReference = string | null
// default null — foundation for D.2

// metadata.legacy.commsLog (new)
interface DrywallCommsLogEntry {
  id: string
  at: string          // ISO timestamp
  author: string      // user display name (denormalized for log readability)
  authorUserId?: string
  body: string
}
// default [] when missing

// metadata.legacy.productionTimestamps (new)
interface ProductionTimestamps {
  productionStartedAt?: string  // when status → 'production'
  productionCompletedAt?: string // when status → 'production-complete'
  closedAt?: string              // when status → 'closed'
}
// default {} when missing
```

**New JSONB shapes under `metadata.legacy.quote`:**

```ts
// quote.outcome (new) — discriminator for KPI tracking
type DrywallQuoteOutcome = 'drafted' | 'sent' | 'approved' | 'lost'
// default 'drafted' when missing — captured/updated in D.1.2

// quote.outcomeTimestamps (new)
interface QuoteOutcomeTimestamps {
  sentAt?: string
  approvedAt?: string
  lostAt?: string
}
// default {} when missing

// quote.bidSnapshot (new) — frozen at "Mark Quote Sent" in D.1.2
interface BidSnapshot {
  total: number
  at: string
  payload: unknown  // full quote totals at snapshot time
}
// optional; populated in D.1.2
```

Add interfaces to `src/types/drywall.ts` and export them.

### Routing

**`src/routes/index.tsx`:**

Add routes for new stages under `/drywall/projects/:projectId/`:

- `/drywall/projects/:projectId/production` → `ProductionStagePage`
- `/drywall/projects/:projectId/closeout` → `CloseoutStagePage`

Follow the existing pattern for `/drywall/projects/:projectId/order`.

### Files to create

**1. `src/components/drywall/production/ProductionStagePage.tsx` (NEW)**

Page shell shown on the Production tab. Layout:

- Empty-state card if `status ∈ {project-info, quote, field-measurement, order}`:
  - Title: "Production hasn't started yet"
  - Body: "Mark this project's order placed in the Order tab and move into production when crews are ready."
  - Button: "Mark Production Started" (only enabled when `status === 'order'`) — calls `markProductionStarted`
- Production-status panel (placeholder shells) when `status ∈ {production, production-complete}`:
  - Three tiles in a horizontal row:
    - **Running Cost** — shows "—" with caption "Wired in D.1.4"
    - **Margin vs Bid** — shows "—" with caption "Wired in D.1.4"
    - **Current Crew** — shows "—" with caption "Wired in D.1.4"
  - Production milestone action below:
    - Button "Mark Production Complete" (visible only when `status === 'production'`) — calls `markProductionComplete`
    - Status pill showing current state ("In Progress" / "Production Complete")

**2. `src/components/drywall/closeout/CloseoutStagePage.tsx` (NEW)**

Page shell shown on the Closeout tab. Layout:

- Empty-state card if `status !== 'production-complete'` and `status !== 'closed'`:
  - Title: "Closeout not available yet"
  - Body: "Mark production complete first."
- Closeout view if `status ∈ {production-complete, closed}`:
  - Three placeholder tiles:
    - **Final Total Cost** — "—" / caption "Wired in D.1.4"
    - **Final Margin vs Bid** — "—" / caption "Wired in D.1.4"
    - **After-Production Cost** — "—" / caption "Wired in D.1.4"
  - Button "Mark Fully Closed" (visible only when `status === 'production-complete'`) — calls `markFullyClosed`
  - Once `status === 'closed'`: show "Closed on {closedAt}" + button "Reopen to Production Complete" — calls `revertCloseoutToProductionComplete`

**3. `src/components/drywall/comms/CommsLogPanel.tsx` (NEW)**

Embedded inside the existing Project Info tab (decision #13). Layout:

- Header "Comms Log" with subtitle "Notes on customer/crew comms — appended only, latest at top"
- Textarea + "Add Entry" button (appends to `commsLog` via `addCommsLogEntry`)
- List of existing entries, latest-first:
  - Header line: `{author} • {relative time, e.g. "2h ago"}` (use existing date-fns or similar; format absolute on hover)
  - Body: rendered as plain text, preserving line breaks

### Files to modify

**1. `src/components/drywall/DrywallProjectShell.tsx`**

- Extend `STAGE_ROUTES` array with two new entries:
  ```ts
  { key: 'production', path: 'production', label: 'Production' },
  { key: 'closeout', path: 'closeout', label: 'Closeout' },
  ```
  (Note: `closeout` is the route path, not a `DrywallProjectStatus` value — the corresponding status is `production-complete` or `closed`. STAGE_ROUTES `key` field type may need to widen; see below.)
- Widen the `key` field type in STAGE_ROUTES to accept the route key independent of `DrywallProjectStatus`. The existing 4 tabs are status-matched; the new 2 are NOT direct status equivalents (Production tab covers both `production` and `production-complete` statuses; Closeout covers `production-complete` and `closed`). Cleanest fix: change `STAGE_ROUTES` keys to be route identifiers (`'info' | 'quote' | 'field' | 'order' | 'production' | 'closeout'`), not status values.
- Add a **status badge** next to the project name in the header. Use a colored pill:
  - `project-info` → gray "Setup"
  - `quote` → blue "Quote"
  - `field-measurement` → blue "Field"
  - `order` → amber "Order"
  - `production` → green "Production"
  - `production-complete` → green "Production Complete"
  - `closed` / `complete` → slate "Closed"
- Project shell fetches status from `fetchDrywallProjectById` and passes to badge.

**2. `src/types/drywall.ts`**

- Add the new types/interfaces specified in Schema changes above.
- Export `DrywallIntakeSource`, `DrywallCommsLogEntry`, `ProductionTimestamps`, `DrywallQuoteOutcome`, `QuoteOutcomeTimestamps`, `BidSnapshot`.

**3. `src/services/drywallProjectsService.ts`**

Add a normalizer used by `mapDetailRow` / hydrate paths that maps legacy `'complete'` → `'closed'` for reads. Do NOT write `'closed'` back to projects that already have `'complete'` — leave the DB row alone until the project transitions through the new states.

Add new service functions (all follow the `loadProjectLegacyForMerge` → `persistLegacyMetadata` pattern):

```ts
export async function markProductionStarted(projectId: string): Promise<void>
// sets status → 'production'
// sets metadata.legacy.productionTimestamps.productionStartedAt = now
// requires current status === 'order' (throw if not)

export async function markProductionComplete(projectId: string): Promise<void>
// sets status → 'production-complete'
// sets productionTimestamps.productionCompletedAt = now
// requires current status === 'production'

export async function markFullyClosed(projectId: string): Promise<void>
// sets status → 'closed'
// sets productionTimestamps.closedAt = now
// requires current status === 'production-complete'

export async function revertProductionStarted(projectId: string): Promise<void>
// sets status → 'order', clears productionStartedAt
// requires current status === 'production'

export async function revertProductionComplete(projectId: string): Promise<void>
// sets status → 'production', clears productionCompletedAt
// requires current status === 'production-complete'

export async function revertCloseoutToProductionComplete(projectId: string): Promise<void>
// sets status → 'production-complete', clears closedAt
// requires current status === 'closed'

export async function addCommsLogEntry(
  projectId: string,
  body: string,
  author: string,
  authorUserId?: string,
): Promise<DrywallCommsLogEntry>
// generates id (use crypto.randomUUID or generateFieldId), sets at = now
// appends to metadata.legacy.commsLog (init [] if missing)
// returns the created entry
```

Deprecate `markDrywallProjectComplete` and `revertDrywallProjectComplete` — keep as thin wrappers around the new functions for backward compat, mark `/** @deprecated use markFullyClosed */`.

Update `DrywallProjectListItem` (the list projection) — add `status` is already there; verify it round-trips the new status values without filtering them out.

**4. `src/components/drywall/DrywallProjectsListPage.tsx`**

Add a **status filter** (decision #10 — current status filtering only, no advanced filters yet):

- Dropdown above the project list, options:
  - "All" (default)
  - "Setup" (project-info)
  - "Quote"
  - "Field"
  - "Order"
  - "Production"
  - "Production Complete"
  - "Closed"
- Filters the rendered list by `project.status`
- Persist filter in URL query string (`?status=production`) so it survives reload + share

**5. Project Info tab page (find via STAGE_ROUTES `info` path)**

- Embed `<CommsLogPanel projectId={projectId} />` below the existing Project Info form.

### Acceptance criteria

1. Type-check passes.
2. Existing drywall projects with `status = 'complete'` continue to render correctly; they show as "Closed" in the badge + list filter without DB migration.
3. New tabs (Production, Closeout) appear in the project shell, navigate to their respective shells.
4. On a project at `status = 'order'`:
   - Production tab shows the "Mark Production Started" button (enabled).
   - Closeout tab shows the empty state.
5. After clicking "Mark Production Started":
   - Status updates to `production` on the project row + legacy mirror.
   - `productionStartedAt` populates with ISO timestamp.
   - Production tab now shows the placeholder cost tiles + "Mark Production Complete" button.
   - Status badge in header reads "Production".
6. After "Mark Production Complete": status → `production-complete`, `productionCompletedAt` populates, Closeout tab unlocks.
7. After "Mark Fully Closed": status → `closed`, `closedAt` populates, Closeout shows "Closed on …" + reopen button.
8. Comms Log panel on Project Info: typing an entry + clicking "Add Entry" appends it; entry shows with author + relative time; persists to `metadata.legacy.commsLog`.
9. List page status filter narrows the rendered list by selected status; URL reflects choice.
10. Reverting state transitions work and clear the corresponding timestamps.

### Out of scope (covered in later D.1.x)

- Quote-outcome state machine + send button + bid snapshot capture → **D.1.2**
- Labor allocation grid → **D.1.3**
- Wiring the production-status panel tiles with real cost data → **D.1.4**
- QB sync extension for drywall projects → **D.1.4**
- Production Complete / Final / After-Production Cost computation → **D.1.4**
- Margin floor enforcement (30% gate) → **D.4** (separate phase, not part of D.1)

### Estimated effort

1 focused Cursor session. Mostly mechanical: type extension, route plumbing, page shells, service functions, list filter. The Comms Log panel is the only piece with real interaction logic and it's small.

---

## D.1.2 — Bid snapshot + quote outcome state machine

**Goal:** Add outcome lifecycle to drywall quotes — `drafted → sent → approved | lost` — with a frozen bid snapshot captured at "Mark Sent" so KPI #4 (bid-to-actual variance) has a stable baseline. Approval auto-advances the project to Field Measurement.

**Anchors:**
- Decisions #17/#21 (margin formula, 30% floor)
- KPIs #1 (bid rate), #2 (win rate at target margin), #4 (variance), #6 (estimate turnaround)
- D.1.1 already added the JSONB schema fields on `metadata.legacy.quote`

### Schema refinement

`BidSnapshot.payload` (added as `unknown` in D.1.1) needs a concrete shape so D.1.4 can consume it for variance math. Refine `src/types/drywall.ts`:

```ts
export interface BidSnapshotPayload {
  routineSubtotal: number       // sum of line items before markup/tax
  cleanupTotal: number
  overhead: number
  profit: number
  salesTax: number
  bidTotal: number              // === BidSnapshot.total at top level
  lineItems: Array<{
    id: string
    type: string                // QuoteLineItemType
    description: string
    location?: string
    computed_line_total: number
  }>
  alternates: Array<{
    id: string
    name: string
    totalAdd: number
    selected: boolean
  }>
}

export interface BidSnapshot {
  total: number                  // top-line bid total (customer-facing)
  at: string                     // ISO timestamp of capture
  payload: BidSnapshotPayload
}
```

**Source of truth for the payload:** read the output of the v3 math engine (`computeQuoteV3Totals` or similar in `src/lib/drywall/quoteV3Math.ts`) and map to `BidSnapshotPayload`. For any v2 quote still active when "Mark Sent" is called, use `buildDrywallQuoteCalculations` output mapped to the same shape.

### Service layer additions (`src/services/drywallProjectsService.ts`)

All follow the `loadProjectLegacyForMerge` → `persistLegacyMetadata` pattern.

```ts
export async function markQuoteSent(projectId: string): Promise<void>
// Guards: current quote.outcome must be 'drafted' OR undefined.
// Reads current quote (v2 or v3), runs the math engine, captures BidSnapshot.
// Writes: quote.outcome='sent', quote.outcomeTimestamps.sentAt=now, quote.bidSnapshot=…
// Does NOT change project.status.

export async function markQuoteApproved(projectId: string): Promise<void>
// Guards: current quote.outcome must be 'sent'.
// Writes: quote.outcome='approved', quote.outcomeTimestamps.approvedAt=now.
// Side effect: if normalize(project.status) === 'quote', advance project.status → 'field-measurement'.
// If status is already past 'quote' (field-measurement, order, etc.), leave it.

export async function markQuoteLost(
  projectId: string,
  reason?: string,
): Promise<void>
// Guards: current quote.outcome must be 'sent'.
// Writes: quote.outcome='lost', quote.outcomeTimestamps.lostAt=now,
//         quote.outcomeReason = (reason if provided).
// Does NOT change project.status (stays at 'quote').

export async function unlockQuoteForRevision(projectId: string): Promise<void>
// Guards: current quote.outcome ∈ {'sent', 'approved', 'lost'}.
// Writes: quote.outcome='drafted', clears outcomeTimestamps, clears bidSnapshot,
//         clears outcomeReason if present.
// Does NOT revert project.status — if approval already advanced it to 'field-measurement',
// keep that. Reason: status change may have triggered downstream work (schedule entries,
// orders); only the quote outcome resets.

export function getQuoteOutcomeFromLegacy(legacy: Record<string, unknown>): {
  outcome: DrywallQuoteOutcome
  outcomeTimestamps: QuoteOutcomeTimestamps
  bidSnapshot: BidSnapshot | null
  outcomeReason: string | null
}
// Read-only helper for components. Normalizes missing fields to defaults
// (outcome='drafted', timestamps={}, bidSnapshot=null, outcomeReason=null).
```

### New types

Add to `src/types/drywall.ts`:

```ts
// Optional reason text — captured by "Mark Lost" dialog, cleared on unlock.
export interface DrywallQuoteWithOutcome {
  outcomeReason?: string
}
// Add to both DrywallQuote and DrywallQuoteV3 interfaces (or extend via intersection).
```

### UI — new component

**`src/components/drywall/quote/QuoteOutcomeBar.tsx` (NEW)**

Compact header strip rendered at the top of the v3 quote stage page (just inside the stage content, above the existing quote builder UI).

Props: `{ projectId: string; onOutcomeChange: () => void }`

Layout — flex row, space-between:

**Left side — outcome badge with color + timestamp:**
- `drafted` → gray pill "Drafted"
- `sent` → blue pill "Sent on {Mar 15, 2026}" + small label "Bid baseline: $X,XXX.XX"
- `approved` → green pill "Approved on {date}"
- `lost` → red pill "Lost on {date}" + optional reason on hover

**Right side — action buttons based on outcome:**
- `drafted` → primary button "Mark Sent"
- `sent` → primary "Mark Approved" + secondary "Mark Lost"
- `approved` or `lost` → outline "Unlock for Revision"

Hidden entirely in viewer/read-only role (no transitions for non-writers).

**Confirmation dialogs (use existing shadcn `AlertDialog`):**

| Action | Body | Confirm button |
|---|---|---|
| Mark Sent | "Lock in this bid as sent? The current computed total ($X) becomes the variance baseline. You can unlock for revision later if needed." | "Mark Sent" |
| Mark Approved | "Mark this quote approved? Project will advance to Field Measurement if it hasn't already." | "Mark Approved" |
| Mark Lost | textarea "Reason for loss (optional — e.g. price, scope, timing)" | "Mark Lost" |
| Unlock for Revision | "Unlocking clears the bid snapshot and outcome timestamps. The project status badge is NOT reverted — if approval already advanced this project to Field Measurement, it stays there. Continue?" | "Unlock" |

### UI — modify existing quote stage

Find the v3 quote stage component (likely `src/components/drywall/quote/QuoteStage.tsx` or a v3-specific variant). Add:

1. Embed `<QuoteOutcomeBar projectId={projectId} onOutcomeChange={refetchQuote} />` at the top of the stage content.
2. Compute `readOnly = outcome !== 'drafted' || existing-viewer-role`. Thread `readOnly` through all editable subcomponents (line items, alternates, scope text, markup inputs, etc.).
3. When `outcome !== 'drafted'`, show a soft banner under the OutcomeBar:
   - For `sent` / `approved` / `lost`: "Quote is locked. Click 'Unlock for Revision' to edit."
4. Save button + auto-save: disabled when `readOnly`.

**Implementation note:** the existing v3 quote stage probably already has multiple subcomponents (sidebar, line items table, etc.). Don't refactor — pass a `readOnly` boolean down to each. Use a shared context if propagation is awkward.

### Acceptance criteria

1. Type-check passes.
2. **Drafted state:** new project with no `quote.outcome` renders "Drafted" badge + "Mark Sent" button. Quote stage is editable.
3. **Mark Sent:**
   - Confirmation dialog shows current computed total.
   - On confirm: `quote.outcome='sent'`, `sentAt` populates, `bidSnapshot` captures with all `BidSnapshotPayload` fields.
   - Quote stage becomes read-only (all inputs disabled; save disabled).
   - Badge shows "Sent on …" + "Bid baseline: $…".
4. **Mark Approved (from sent):**
   - `quote.outcome='approved'`, `approvedAt` populates.
   - If project.status was `quote`, advances to `field-measurement`; shell badge updates.
   - If project.status was past `quote`, leaves alone.
5. **Mark Lost (from sent):**
   - Dialog with optional reason textarea.
   - `quote.outcome='lost'`, `lostAt` populates, `outcomeReason` saved if provided.
   - Project status unchanged.
6. **Unlock for Revision:**
   - Confirmation dialog explains snapshot/timestamps clear, status preserved.
   - On confirm: `quote.outcome='drafted'`, timestamps + snapshot + reason all cleared.
   - Quote stage becomes editable.
   - Project status badge unchanged.
7. Reload preserves all state (outcome, timestamps, snapshot, reason).
8. Reverse-direction guards: calling `markQuoteApproved` on a `drafted` quote throws; calling `markQuoteSent` on a `sent` quote throws.
9. v2 quotes still functional (if any active): bid snapshot captures from `buildDrywallQuoteCalculations` output mapped to `BidSnapshotPayload`.

### Out of scope

- Quote outcome chip on project list cards (possible D.5 / post-launch)
- Structured "Lost reason" taxonomy (V1 is free text only)
- "Mark Sent" auto-triggered by PDF download (decision #2 above — operator self-attests, not auto)
- PO intake setting `outcome='approved'` + snapshot at intake — implemented in **D.2** using these same service functions
- KPI dashboard surfaces — D.5

### Estimated effort

1 session. Main risk: identifying the right v3 math output to snapshot. Cursor should grep `quoteV3Math.ts` and the QuoteTotalsSidebar to find the totals computation.

---

---

## D.1.3 — Drywall project labor aggregation

**Scope corrected 2026-06-15.** Original outline called for a "labor allocation grid" extending PayrollRunTab. Recon revealed [PayrollPersonRow.tsx](../src/components/hr/payroll/PayrollPersonRow.tsx) already does per-person × per-project allocation (Q.C.3 work). Mark confirmed (06-15) the existing per-person UI works fine. The actual gap is the **read side**: there's no service that asks "what's the total labor cost for project X so far?" That's what D.1.4 needs to wire into the Production widget.

**Goal:** Provide a per-drywall-project labor cost aggregation service that D.1.4 consumes for Production widget tiles + Production Complete Assessment + Final Assessment. No new UI work.

**Anchors:**
- Decision #18 (drywall 1099 subs run through payroll — include in labor cost)
- Decision #20 (operator labor allocation grid = existing per-person UI; no new entry surface)
- Decision #12 (mid-week projected labor — Mark confirmed this is nice-to-have, not blocker; deferred to post-launch)

### Schema

No schema changes. Reads existing `pay_periods` table where each row's `payload` carries `entries: PayrollEntry[]`. Each `hourEntry` and `pieceEntry` carries a `jobId` that matches a drywall project id when allocated.

### Files to create

**1. `src/services/drywallLaborService.ts` (NEW)**

Data layer — supabase queries only, no compute.

```ts
export interface PayPeriodForLabor {
  id: string
  startDate: string
  endDate: string
  locked: boolean
  completedAt: string | null
  entries: PayrollEntry[]
}

export async function fetchPayPeriodsForDrywallLabor(): Promise<PayPeriodForLabor[]>
// Pulls all pay_periods for current org, ordered by endDate desc.
// Mirrors hrPayrollService pattern. Returns periods with full entries[] for downstream filtering.
// No projectId filter here — caller filters in memory (periods are small-N).

export async function fetchDrywallProjectLaborSummary(
  projectId: string,
  options?: { window?: 'all' | 'production' | 'after-production' | 'pre-production' },
): Promise<DrywallProjectLaborSummary>
// Convenience wrapper: pulls periods + extracts entries for projectId + summarizes.
// window option uses the project's productionTimestamps to filter (see below).
```

**2. `src/lib/drywall/projectLaborMath.ts` (NEW)**

Pure helpers — fully testable, no I/O.

```ts
export interface DrywallProjectLaborEntryFlat {
  payPeriodId: string
  periodStart: string
  periodEnd: string
  periodLocked: boolean
  periodCompletedAt: string | null
  personId: string
  personType: PayrollPersonType | string
  personName?: string
  source: 'hour' | 'piece'
  pieceKey?: string                       // piece entries
  workType?: string                       // piece entries / legacy
  hours?: number                          // hour entries
  overtimeType?: string                   // hour entries
  pieces?: number                         // piece entries: phasesCompleted × jobTotalSqft
  amount: number                          // computed gross for this single entry
  category: 'hanger' | 'finisher' | 'components' | 'legacy' | 'hourly' | 'other'
}

export interface DrywallProjectLaborSummary {
  totalCost: number
  totalHours: number
  totalOvertimeHours: number
  totalPieces: number
  byCategory: Record<DrywallProjectLaborEntryFlat['category'], number>
  byPayPeriod: Array<{
    payPeriodId: string
    periodStart: string
    periodEnd: string
    locked: boolean
    cost: number
  }>
  entries: DrywallProjectLaborEntryFlat[]
}

export function extractProjectLaborEntries(
  periods: PayPeriodForLabor[],
  projectId: string,
  catalogs: OrgDrywallCatalogs | null,
): DrywallProjectLaborEntryFlat[]
// For each period, for each entry, for each hour/piece entry: if jobId matches projectId,
// compute amount, classify category, push to result.
// Use existing payrollMath helpers (calculateGross / recalcPieceEntryAmount equivalents) — DO NOT
// reinvent overtime/piece-rate math. Compose what's already there.

export function summarizeProjectLabor(
  entries: DrywallProjectLaborEntryFlat[],
): DrywallProjectLaborSummary
// Pure aggregation. Sums + groups.

export function splitLaborByProductionWindow(
  entries: DrywallProjectLaborEntryFlat[],
  timestamps: {
    productionStartedAt?: string | null
    productionCompletedAt?: string | null
    closedAt?: string | null
  },
): {
  preProduction: DrywallProjectLaborEntryFlat[]    // periodEnd <= productionStartedAt (rare; pre-prod work?)
  duringProduction: DrywallProjectLaborEntryFlat[] // productionStartedAt < periodEnd <= productionCompletedAt
  afterProduction: DrywallProjectLaborEntryFlat[]  // productionCompletedAt < periodEnd <= (closedAt || now)
  unbounded: DrywallProjectLaborEntryFlat[]        // missing one of the timestamps — anything that doesn't bucket
}
// D.1.4 uses this to compute Production Complete Assessment (sum duringProduction)
// + After-Production Cost (sum afterProduction).
```

### Category classification rules

| `piece_key` value | Category |
|---|---|
| `'drywall_hanging'` or starts with `'drywall_hanging_'` | `hanger` |
| Matches any finish scope `id` or `payroll_piece_key` in catalogs | `finisher` |
| Matches any value in `COMPONENT_LABOR_PIECE_KEYS` | `components` |
| Matches `PAYROLL_WORK_TYPES` value (legacy) | `legacy` |
| Hour entry (no `piece_key`) | `hourly` |
| Anything else | `other` |

Reuse helpers from [payrollPieceKeys.ts](../src/lib/drywall/payrollPieceKeys.ts): `isDrywallHangerKey`, `isComponentLaborKey`, `isFinishScopePieceKey`, `isLegacyPayrollWorkType`.

### What to include / exclude

**Include in `totalCost`:**
- All hour entry amounts (hours × resolved rate × overtime multiplier)
- All piece entry amounts (computed via existing payroll math)
- Both W2 (`personType === 'w2'`) AND 1099 (`personType === '1099'`) — per decision #18

**Exclude from `totalCost`:**
- `reimbursement` (personal/material expense, not labor)
- `perDiem` (personal comp, not project-attributable)
- `bankedHoursUsed` / `hoursToBank` (accounting transfer, not new cost)

These exclusions are V1 simplifications. Reimbursements with project tags could be added later as "other project cost"; not in scope for D.1.3.

### Acceptance criteria

1. Type-check passes.
2. `fetchPayPeriodsForDrywallLabor()` returns all pay_periods for the current org, ordered by `endDate desc`.
3. `extractProjectLaborEntries(periods, projectId, catalogs)`:
   - Returns one `DrywallProjectLaborEntryFlat` per matched hour or piece entry
   - Each entry has correct `amount` matching what `calculateGross`/`recalcPieceEntryAmount` would produce for that single entry
   - Category classification matches the rules above
4. `summarizeProjectLabor(entries)`:
   - `totalCost = sum(entry.amount)`
   - `totalHours = sum(hour entries' hours)`, `totalOvertimeHours = sum(hour entries with overtimeType !== 'regular')`
   - `totalPieces = sum(piece entries' pieces)`
   - `byCategory` totals sum to `totalCost`
   - `byPayPeriod` rows ordered by period start; cost sums per-period
5. `splitLaborByProductionWindow`:
   - Bucketing uses `periodEnd` timestamp comparisons against timestamps
   - If `productionCompletedAt` is null → all post-`productionStartedAt` entries go to `duringProduction`
   - If `productionStartedAt` is null → entries go to `unbounded`
6. `fetchDrywallProjectLaborSummary(projectId)` integration: returns correct totals for a project with known historic entries.
7. 1099 contractor entries included in totals.
8. Reimbursements / per diems / banked hours excluded.
9. Smoke verification: pick an active drywall project, sum its labor manually from a recent pay period in the UI, confirm `fetchDrywallProjectLaborSummary` matches.

### Out of scope (post-launch)

- **Mid-week projected labor** from in-progress draft entries — requires draft persistence, deferred per Mark's Q4 answer
- **TimeClock integration** — Buildertrend exit handles this post-launch
- **Per-employee project allocation editor** — existing per-person flow works (Q3 confirmed)
- **Cross-pay-period labor cost charting** — D.5 KPI dashboard work, post-launch
- **Reimbursements/per diems with project tags** — V1 simplification

### Estimated effort

1 session. Service + pure helpers + types. Most of the math composes existing `payrollMath` utilities. Main risk is correctly replicating the per-entry amount math — if `calculateGross` only returns person-level totals, we need a per-entry computation helper. Cursor checks payrollMath and adds a thin per-entry helper if missing.

---

---

## D.1.4 — Cost reconciliation engine + assessments

**Goal:** Combine labor (D.1.3) + material + sub costs into a per-drywall-project cost summary. Wire the Production widget tiles and Closeout widget tiles with real data. Compute Production Complete Assessment, Final Assessment, and After-Production Cost using time-windowed cost data.

**Anchors:**
- Decision #17 (30% margin floor, color coding)
- Decision #19 (extend GC QB sync to drywall projects) — **scope-corrected:** data layer already works (drywall project_id can be tagged on material_entries / subcontractor_entries). The UI gap (QB reassign picker filters out drywall) is **deferred to post-launch**.
- Decision #21 (margin formula: `(bid - cost) / bid`)
- KPI #4 (bid-to-actual variance ±3%)
- KPI #7 (division profitability)

### Architecture: "Recompute on Demand" (not snapshotted)

**Two options considered:**
- (a) **Snapshot on transition** — when status → production-complete, freeze the assessment payload to `metadata.legacy`. Pros: audit trail. Cons: data corrections after transition don't reflect.
- (b) **Recompute on demand** — assessments computed live from current data + status timestamps. Filter entries by window using D.1.3's `splitLaborByProductionWindow` (+ a parallel material/sub split). Pros: corrections reflect immediately. Cons: no immutable record.

**Locked: (b) recompute on demand.** Simpler implementation. If audit is needed later, add a "Save snapshot" button that freezes the current computation to a `metadata.legacy.assessments.archived[]` list.

### What the existing data layer gives us

Per recon of [actualsHybridService.ts](../src/services/actualsHybridService.ts):

- `material_entries` table — `project_id`, `date`, `amount` (and unit_cost, quantity, vendor, etc.). Already queryable by project_id.
- `subcontractor_entries` table — `project_id`, `date`, `amount`. (Per decision #18, drywall subs flow through payroll — this table will be near-empty for drywall projects, but we still sum for safety.)
- `labor_entries` table — **GC-side labor only.** Drywall labor lives in `pay_periods` JSONB. Skip `labor_entries` for drywall.

### Files to create

**1. `src/lib/drywall/projectCostMath.ts` (NEW)** — pure helpers

```ts
export interface MaterialEntryFlat {
  id: string
  date: string                      // ISO
  description: string
  vendor: string | null
  amount: number
}

export interface SubEntryFlat {
  id: string
  date: string                      // ISO
  subcontractorName: string
  description: string
  amount: number
}

export interface DrywallProjectCostSummary {
  labor: {
    totalCost: number
    summary: DrywallProjectLaborSummary
  }
  material: {
    totalCost: number
    entries: MaterialEntryFlat[]
  }
  sub: {
    totalCost: number
    entries: SubEntryFlat[]
  }
  totalCost: number                 // labor + material + sub
}

export function splitMaterialByProductionWindow(
  entries: MaterialEntryFlat[],
  timestamps: ProductionTimestamps,
): {
  preProduction: MaterialEntryFlat[]
  duringProduction: MaterialEntryFlat[]
  afterProduction: MaterialEntryFlat[]
  unbounded: MaterialEntryFlat[]
}
// Mirrors splitLaborByProductionWindow signature. Filters by entry.date.

export function splitSubByProductionWindow(
  entries: SubEntryFlat[],
  timestamps: ProductionTimestamps,
): { /* same shape */ }
// Same shape, same logic.

export function summarizeMaterial(entries: MaterialEntryFlat[]): {
  totalCost: number
  entries: MaterialEntryFlat[]
}

export function summarizeSub(entries: SubEntryFlat[]): {
  totalCost: number
  entries: SubEntryFlat[]
}

export function combineProjectCost(
  labor: DrywallProjectLaborSummary,
  material: { totalCost: number; entries: MaterialEntryFlat[] },
  sub: { totalCost: number; entries: SubEntryFlat[] },
): DrywallProjectCostSummary
// Sums into the unified DrywallProjectCostSummary.

export function computeMarginVsBid(
  costSummary: DrywallProjectCostSummary,
  bidSnapshot: BidSnapshot | null,
): {
  marginPct: number | null
  marginUsd: number | null
  marginColor: 'green' | 'yellow' | 'red' | 'neutral'
}
// Decision #21 formula: (bid - cost) / bid
// Color thresholds (decision #17): green ≥ 0.30, yellow 0.25-0.30, red < 0.25, neutral if no bid

export function computeCurrentCrew(
  summary: DrywallProjectLaborSummary,
  options?: { maxNames?: number },
): { names: string[]; total: number }
// Distinct personNames from the LATEST pay period in summary.byPayPeriod
// (most recent periodStart). Returns up to maxNames (default 5) for tile display.
```

**2. `src/services/drywallProjectCostService.ts` (NEW)** — data layer

```ts
export async function fetchDrywallProjectMaterialEntries(
  projectId: string,
): Promise<MaterialEntryFlat[]>
// Supabase: material_entries where project_id = projectId, ordered by date desc.
// Maps to MaterialEntryFlat (date as ISO string, not Date object — matches existing labor entries).

export async function fetchDrywallProjectSubEntries(
  projectId: string,
): Promise<SubEntryFlat[]>
// Supabase: subcontractor_entries where project_id = projectId.

export async function fetchDrywallProjectCostSummary(
  projectId: string,
  options?: { window?: 'all' | 'production' | 'after-production' | 'pre-production' },
): Promise<DrywallProjectCostSummary>
// Parallel:
//   - fetchDrywallProjectLaborSummary(projectId, { window })
//   - fetchDrywallProjectMaterialEntries(projectId) → split by window if needed
//   - fetchDrywallProjectSubEntries(projectId) → split by window if needed
// Combines via combineProjectCost. window 'all' skips splits.

export interface DrywallProjectAssessment {
  currentCost: DrywallProjectCostSummary
  bidSnapshot: BidSnapshot | null
  margin: ReturnType<typeof computeMarginVsBid>
  productionComplete: DrywallProjectCostSummary | null
  final: DrywallProjectCostSummary | null
  afterProductionCost: number | null
  productionTimestamps: ProductionTimestamps
  currentCrew: { names: string[]; total: number }
  computedAt: string
}

export async function fetchDrywallProjectAssessment(
  projectId: string,
): Promise<DrywallProjectAssessment>
// One-shot fetch that produces everything the Production + Closeout pages need.
// - currentCost = all-window summary (full history)
// - bidSnapshot = from getQuoteOutcomeFromLegacy
// - margin = computeMarginVsBid(currentCost, bidSnapshot)
// - productionComplete = window='production' summary (only if productionStartedAt set)
// - final = window='all' summary frozen at fully-closed time (only if status='closed')
//   For V1: final = productionComplete + afterProduction (live recompute)
// - afterProductionCost = sum of after-production window costs
// - currentCrew = computeCurrentCrew(currentCost.labor.summary)
```

### Files to modify

**1. [src/components/drywall/production/ProductionStagePage.tsx](../src/components/drywall/production/ProductionStagePage.tsx)**

Replace `PlaceholderTile` calls with real-data tiles:

```tsx
// Inside the inProduction render branch
<RunningCostTile cost={assessment.currentCost.totalCost} />
<MarginVsBidTile margin={assessment.margin} bidTotal={assessment.bidSnapshot?.total ?? null} />
<CurrentCrewTile crew={assessment.currentCrew} />
```

Where:
- **RunningCostTile**: formatted USD; caption "Labor + Material" with smaller line "Labor: $X · Material: $Y · Sub: $Z"
- **MarginVsBidTile**:
  - If `margin.marginPct === null`: render "—" + caption "No bid baseline" (quote not Sent yet)
  - Else: render `{(marginPct * 100).toFixed(1)}%` with color from `margin.marginColor`
  - Subline: `Bid $X • Cost $Y`
- **CurrentCrewTile**: comma-joined `crew.names.join(', ')` with count "+N more" if total > names.length; caption "Latest pay period"

Replace the existing placeholder tile components in-file — keep the visual styling pattern (Card / CardHeader / CardContent) consistent with D.1.1.

Load assessment via `fetchDrywallProjectAssessment(projectId)` in the existing `load()` callback. Add a manual "Refresh" button next to the production status pill.

**2. [src/components/drywall/closeout/CloseoutStagePage.tsx](../src/components/drywall/closeout/CloseoutStagePage.tsx)**

Replace placeholders:

```tsx
// Inside the canCloseout render branch
<FinalTotalCostTile cost={(assessment.final ?? assessment.currentCost).totalCost} />
<FinalMarginVsBidTile margin={assessment.margin} bidTotal={assessment.bidSnapshot?.total ?? null} />
<AfterProductionCostTile cost={assessment.afterProductionCost} />
```

- **FinalTotalCostTile**: prefer `final` summary if present (i.e. status='closed'), else `currentCost`. Caption notes "Live" vs "As of closeout".
- **FinalMarginVsBidTile**: same as Production-side MarginVsBidTile.
- **AfterProductionCostTile**: shows the dollar amount + (afterProductionCost / final.totalCost) as percentage caption when both numbers present.

### Acceptance criteria

1. Type-check passes.
2. `fetchDrywallProjectMaterialEntries(projectId)` returns material entries from supabase ordered by date desc.
3. `fetchDrywallProjectSubEntries(projectId)` returns sub entries — empty array is OK (likely common for drywall).
4. `fetchDrywallProjectCostSummary(projectId)`:
   - Returns combined labor + material + sub totals
   - `totalCost === labor.totalCost + material.totalCost + sub.totalCost`
   - Window option filters correctly using `splitMaterialByProductionWindow` / `splitSubByProductionWindow` + D.1.3's labor window
5. `fetchDrywallProjectAssessment(projectId)`:
   - On a project with no bidSnapshot: `margin.marginPct === null`, `margin.marginColor === 'neutral'`
   - On a project with bidSnapshot $10k, current cost $7k: `marginPct = 0.30`, `marginColor = 'green'`
   - On a project with bidSnapshot $10k, current cost $7.2k: `marginPct = 0.28`, `marginColor = 'yellow'`
   - On a project with bidSnapshot $10k, current cost $7.6k: `marginPct = 0.24`, `marginColor = 'red'`
6. ProductionStagePage Running Cost tile shows the live cost when `status ∈ {production, production-complete}`.
7. ProductionStagePage Margin vs Bid renders "—" when bidSnapshot is null; correct % + color otherwise.
8. ProductionStagePage Current Crew lists distinct personNames from the most recent pay period; shows "+N more" if total names > display limit.
9. CloseoutStagePage Final Total Cost tile renders the live cost when status='production-complete' (using `currentCost`); same value when status='closed' (using `final`).
10. CloseoutStagePage After-Production Cost shows the correct delta and percent when status='closed'.
11. Manual "Refresh" button on ProductionStagePage re-runs `fetchDrywallProjectAssessment`.
12. Pure helpers `splitMaterialByProductionWindow`, `summarizeMaterial`, `combineProjectCost`, `computeMarginVsBid`, `computeCurrentCrew` covered by unit tests.

### Out of scope (post-launch)

- **QB transaction reassign picker including drywall projects** (decision #19 follow-through — UI gap, not data gap)
- **Frozen assessment snapshots** (V1 is recompute on demand)
- **Real-time mid-week labor projection from in-progress draft entries** (deferred from D.1.3, awaits Buildertrend TimeClock exit)
- **Cost variance attribution / drill-down per cost category** — D.5 KPI dashboard work
- **Material entries with sales tax disambiguation** — V1 treats `material_entries.amount` as authoritative regardless of tax treatment

### Estimated effort

1-2 sessions. Composition-heavy: pure helpers + service combining existing queries + tile wiring + tests. Most risk is the production-window date arithmetic on material/sub entries — must mirror D.1.3's labor windowing semantics precisely.

---
