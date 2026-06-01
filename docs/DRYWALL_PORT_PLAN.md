# Drywall Workspace Port Plan

**Status:** Design locked (merge plan step 5). Implementation follows phases below. **No production code or migrations in this doc.**

**Goal:** Port the HSH Drywall app's **Project Info → Quote → Field Measurement → Order** workflow into the HSH GC Platform as a top-level **Drywall** workspace, reusing the shared Supabase spine where it already exists.

**Stacks:**

| | Drywall app | GC Platform |
|---|-------------|-------------|
| Language | JavaScript | TypeScript |
| React | 18 | 19 |
| Vite | 4 | 7 |
| Routing | Hash (`#/…`) + `currentView` state | React Router 7 (`/drywall/…`) |
| UI | shadcn (older tokens) | shadcn + design tokens |
| Project persistence | Full app object in `projects.metadata.legacy` | Typed `Project` + `metadata` wrapper; GC estimate in `estimates`/`trades` |

**Authoritative RBAC target:** `docs/RBAC_PLAN.md` (Drywall column in workspace matrix — wiring in Phase F).

**Related docs:** `docs/HR_PORT_PLAN.md` (port pattern reference), `docs/QUOTE_DOCUMENT_PLAN.md` (GC **commercial** project quotes — **not** drywall quotes), `docs/RESTORE_PROJECT_VISIBLE_IN_GC.md` (visibility flags).

---

## Section 0 — Hard rule: two quote pipelines on one project row

**Drywall quote** and **GC project quote** are distinct concepts. They are two separate quote pipelines that may coexist on the same `public.projects` row (e.g. Goodwill Multi). This is a **hard architectural rule**, not a temporary deferral.

| | Drywall quote | GC project quote |
|---|---------------|------------------|
| **Where built** | Drywall workspace | Projects workspace (`docs/QUOTE_DOCUMENT_PLAN`) |
| **Math / scope** | Sqft, hangers, finishers, RC channel, breakdown components | Whole-project estimate / trade rollup |
| **Storage** | `metadata.legacy.quote` (JSONB) | `estimates` / `trades` + quote document subsystem |
| **PDF** | Drywall-branded (`drywallQuotePdf.ts` / React-PDF or jsPDF) | `clientQuotePdf.ts` / `quote-documents` bucket |
| **Code** | `src/lib/drywallQuote*` + `src/components/drywall/quote/*` | `src/lib/clientQuotePdf.ts`, `clientQuoteService.ts` |

**Never** share code, schema, or merge logic between these pipelines. No "unified quote" in V1 or any planned future phase. On shared projects, the operator maintains numeric parity manually if needed.

---

## Executive summary

- **Active workflow:** four stages (~11k LOC in stage components; `QuoteStage.jsx` ~6,850 lines). **Delivery** and **Audit** stages are **dropped** — not ported (orphan components only).
- **Navigation (locked):** **Option B** — sibling sub-routes with visual progress stepper and non-blocking prerequisite warnings; strict gates optional later as org setting.
- **Data (locked):** Keep full project blob in `metadata.legacy` for V1 (same call as `org_team.payload` in HR port). Merge-on-write discipline in Phase A is mandatory.
- **Drywall workspace list (locked):** Surface projects that **have drywall data** (`metadata.legacy.quote` populated). Do **not** auto-set `visibility.drywall` when GC adds a drywall trade.
- **Customer quotes (locked):** Mark uses **manual PDF download + email** today. No server-side `quoteStatus` in prod; **no approval-link migration**. Server-backed approval URLs ship in Phase C for future use; any legacy bookmarks die at cutover.
- **Field users (locked):** `field_drywall` V1 = **HR TimeClock + own `time_entries` only**; assigned-projects model deferred to Phase 4 RBAC when first field user onboards.
- **Production (May 2026):** **117** drywall-tagged projects; **99** `DRYWALL_ONLY`; **102** with `legacy.quote`; **93** at `status = quote`; **0** `project_milestones`; **1** `time_entries` (GC test); **0** pending customer approvals.
- **Legacy app:** **Freeze at end of Phase F** (Mark stops editing in drywall app). **Full retirement** = merge plan step 6 after comfort window on GC-only workflow.

**Section 1 feature count (in-scope stages):** **45** active features across Project Info (4), Quote (16), Field Measurement (9), Order (8), plus shell (5). Customer/public quote-request and approval-link flows are **out of V1 scope** except optional server-backed approval in Phase C.

---

## Section 1 — Drywall feature inventory by stage

### 1.1 App shell & navigation

| # | Feature | Drywall file(s) | UX (operator-visible) | Supabase / data | Complexity | Port |
|---|---------|-----------------|------------------------|-----------------|------------|------|
| 1 | Project dashboard | `src/App.jsx` | List/filter projects; create; open detail | `projects` via `supabaseSpine` | **M** | **Yes** — filter `hasDrywallData(legacy.quote)` |
| 2 | Stage navigation | `App.jsx` | Four stages (legacy: linear tabs) | `projects.status` | **M** | **Yes** — Option B sub-routes + stepper |
| 3 | Milestones tab | `App.jsx` | Milestones alongside stages when connected | `project_milestones` | **S** | **Defer** — 0 prod rows; schedule bridge is future work, not Drywall port |
| 4 | Quote requests inbox | `QuoteRequestsList.jsx` | Inbound requests → project | localStorage only | **—** | **No** — deferred; leads via email/text |
| 5 | Settings / rate sheet | `App.jsx` | Company defaults, rate sheet | localStorage + `defaults.js` | **S** | **Defer** post-V1 |

### 1.2 Project Info (`status: project-info`)

| # | Feature | Drywall file(s) | UX | Data touched | Complexity | Port |
|---|---------|-----------------|-----|--------------|------------|------|
| 6 | Create project | `App.jsx` | Empty project + nested `quote`, `fieldTakeoff` | `projects` INSERT; `metadata.legacy`; `type: 'drywall'` | **M** | **Yes** |
| 7 | Job name / client / address / notes | `ProjectInfoStage.jsx` | Debounced save | `name`, `client`, `address` + `legacy` mirror | **S** | **Yes** |
| 8 | Continue to Quote | `ProjectInfoStage.jsx` | Requires job name; updates status | `status` → `quote` | **S** | **Yes** — explicit action, not route gate |
| 9 | Dual-view metadata on save | `supabaseSpine.js` `buildProjectMetadata` | When GC `estimates` exist, may set dual visibility on **drywall save** | `metadata`, `estimates` COUNT | **M** | **Partial** — preserve existing behavior on drywall write; **no** auto-promote from GC trade alone (locked) |

### 1.3 Quote (`status: quote`)

| # | Feature | Drywall file(s) | UX | Data touched | Complexity | Port |
|---|---------|-----------------|-----|--------------|------------|------|
| 10 | Quote builder (core) | `QuoteStage.jsx` | Sqft, rates, waste, OH/profit/tax, breakdowns | `metadata.legacy.quote` | **L** | **Yes** |
| 11 | Drywall scope modes | `QuoteStage.jsx` | hang_and_finish \| hang_only \| finish_only | `quote.drywallScope` | **M** | **Yes** |
| 12 | Line-item breakdowns | `QuoteStage.jsx` | Per-area components | `quote.breakdowns[]` | **L** | **Yes** |
| 13 | Project-level add-ons | `QuoteStage.jsx` | Insulation, acoustic ceiling, FRP, … | `quote.include*` | **M** | **Yes** |
| 14 | Quote options / alternates | `QuoteStage.jsx` | Optional priced options | `quote.options[]` | **M** | **Yes** |
| 15 | Takeoff import | `QuoteStage.jsx` | Import takeoff into quote | `takeoffData`, `takeoffNotes` | **M** | **Yes** |
| 16 | Quote calculations | `quoteCalculations.js`, `quotePricingEngine.js` | Totals pipeline | `quote.calculations` cache | **L** | **Yes** → `drywallQuoteMath.ts` |
| 17 | Quote schema v2 | `quoteSchemaAdapter.js` | normalize v2 / legacy compat | `quote.version`, nested objects | **M** | **Yes** → `drywallQuoteSchema.ts` |
| 18 | Field measurement prep | `QuoteStage.jsx` | Site contact, access notes | `fieldMeasurementPrep` | **S** | **Yes** |
| 19 | Send quote / approval link | `SendQuoteModal.jsx` | Email UI (`hasBackend = false`) | `quoteStatus`, `approvalLink`, … | **—** | **Replace** — V1: PDF download + email only; server approval route Phase C (greenfield) |
| 20 | Manual approve/reject | `QuoteStage.jsx` | Office approve/reject | `quote.quoteStatus` | **S** | **Yes** (office-only) |
| 21 | Quote PDF (React-PDF) | `QuotePDF.jsx` | Branded export | Client | **L** | **Yes** — consolidate to one PDF stack |
| 22 | Quote PDF (jsPDF) | `SendQuoteModal.jsx`, `OrderStage.jsx` | Second stack | Client | **M** | **Merge** into single drywall PDF module |
| 23 | Advance to Field Measurement | `QuoteStage.jsx` | Requires `fieldMeasurementPrep.ready` | `status` → `field-measurement` | **S** | **Yes** — explicit action |
| 24 | Duration estimate | `durationService.js` | Hang/finish duration | Derived | **S** | **Yes** |
| 25 | Suspended grid / RC calcs | `calculations/*` | Sub-calculators | Breakdown math | **M** | **Yes** |

### 1.4 Field Measurement (`status: field-measurement`)

| # | Feature | Drywall file(s) | UX | Data touched | Complexity | Port |
|---|---------|-----------------|-----|--------------|------------|------|
| 26 | Site / job address | `FieldMeasurementStage.jsx` | Contact, address, access | `fieldTakeoff.*` | **S** | **Yes** |
| 27 | Per-area measurements | `FieldMeasurementStage.jsx` | Boards, sqft per area | `fieldTakeoff.measurements[]` | **L** | **Yes** |
| 28 | Accessories auto-calc | `FieldMeasurementStage.jsx` | From sqft + finish levels | `fieldTakeoff.accessories` | **M** | **Yes** |
| 29 | Checklist (4 items) | `FieldMeasurementStage.jsx` | Required before complete action | `fieldTakeoff.checklist` | **S** | **Yes** |
| 30 | Variance vs quote sqft | `FieldMeasurementStage.jsx` | Compare to `quote.sqft` | `variance.*` | **M** | **Yes** |
| 31 | Submit for office review | `FieldMeasurementStage.jsx` | `pending_review` | `reviewStatus`, timestamps | **M** | **Yes** |
| 32 | Complete stage (skip review) | `FieldMeasurementStage.jsx` | Advance to Order | `status` → `order` | **S** | **Yes** — explicit action |
| 33 | Photo attachments | `FieldMeasurementStage.jsx` | Field photos (replacing BuilderTrend upload loop) | `fieldTakeoff.photos[]` + **Storage** blobs | **L** | **Yes** — Phase D includes `drywall-field-photos` bucket (see Section 2) |
| 34 | Order while pending review | `App.jsx` | Order route usable during review | UI pattern | **S** | **Yes** — sibling route always reachable |

### 1.5 Order (`status: order`)

| # | Feature | Drywall file(s) | UX | Data touched | Complexity | Port |
|---|---------|-----------------|-----|--------------|------------|------|
| 35 | Office review panel | `OrderStage.jsx` | Labor rate review, financial comparison | `fieldTakeoff`, `quote` | **L** | **Yes** |
| 36 | Approve review → draft orders | `OrderStage.jsx` | Creates `orders[]` | `orders[]`, `reviewApprovedRates` | **L** | **Yes** |
| 37 | Material orders lifecycle | `OrderStage.jsx` | draft → sent → confirmed → complete | `orders[]` | **L** | **Yes** |
| 38 | Change orders | `OrderStage.jsx` | CO lines | `changeOrders[]` | **M** | **Yes** |
| 39 | Material order PDF | `OrderStage.jsx` | jsPDF export | Client-only | **M** | **Yes** — **client-only jsPDF** (no Express/edge) |
| 40 | Email import (orders) | `EmailImportModal.jsx` | Parse supplier emails | `orders[]` | **M** | **Optional** post-V1 |
| 41 | Reject field review | `OrderStage.jsx` | `reviewStatus: rejected` | `fieldTakeoff` | **S** | **Yes** |
| 42 | Financial comparison UI | `OrderStage.jsx` | Quoted vs field-adjusted | `quote`, `fieldTakeoff` | **M** | **Yes** |

### 1.6 Customer-facing / public — scope per locked decisions

| # | Feature | Drywall file(s) | V1 port |
|---|---------|-----------------|---------|
| 43 | Public quote request | `PublicQuoteRequest.jsx` | **No** — deferred; Mark creates projects manually |
| 44 | Public quote approval | `PublicQuoteApproval.jsx` | **No migration**; Phase C may add server route for **future** use; legacy bookmarks unsupported |
| 45 | GC vendor quote portal | GC `/vendor-quote/:token` | **Out of scope** — different product |

### 1.7 Dropped (not ported)

| Feature | File | Reason |
|---------|------|--------|
| Delivery stage | `DeliveryStage.jsx` | Not routed in active app — **dropped** |
| Audit stage | `AuditStage.jsx` | Not routed — **dropped** |
| Variance stage (legacy) | README / migrations | Mapped to `order` in legacy app |

### 1.8 Service layer inventory (`hsh-drywall-app/src/services/`)

| Module | Role | External surface |
|--------|------|------------------|
| `supabaseSpine.js` | Projects CRUD, hydrate `metadata.legacy`, milestones, time entries | Supabase Auth + PostgREST |
| `projectsAdapter.js` | Supabase vs localStorage routing | — |
| `quoteSchemaAdapter.js` | Quote v2 normalization | — |
| `quoteCalculations.js` / `quotePricingEngine.js` | Quote math | — |
| `teamAdapter.js` / `payrollAdapter.js` | HR — **already in GC HR workspace** | `org_team`, `pay_periods` |
| `durationService.js` | Quote duration | — |
| `calculations/*` | RC channel, suspended grid | — |

**Edge functions:** None in drywall app. **Email send API:** not used (`hasBackend = false`). **Express PDF server:** **not ported** — client-only jsPDF per locked decision.

**Section 1 totals (in-scope):**

| Stage | Feature count |
|-------|----------------|
| App shell & nav (in-scope) | 2 (+3 deferred/dropped) |
| Project Info | 4 |
| Quote | 16 |
| Field Measurement | 9 |
| Order | 8 |
| **Active subtotal** | **39** numbered in-scope rows (45 including deferred shell items in original inventory) |

---

## Section 1 appendix — Quote JSONB shape (`metadata.legacy.quote`)

The drywall app stores the **entire in-memory project** under `projects.metadata.legacy`, not only the quote sub-object.

### Project root keys (inside `metadata.legacy`)

```
id, name, client, address, notes, status, createdAt, updatedAt,
quote, fieldTakeoff, fieldMeasurementPrep, orders[], changeOrders[],
order{}, delivery{}, audit{}, variance{}, quoteRequestId?,
legacyId?, metadata? (wrapper copy)
```

### Canonical quote v2 (`quoteSchemaAdapter.js`)

When `quote.version === 2`: nested `pricing`, `defaults`, `breakdowns`, `options`, plus `legacy` flat compat object (see prior research in git history).

### `fieldTakeoff.photos[]` (Storage V1)

Each photo entry in JSONB holds **references** (storage path, mime, caption, takenAt). Binary files live in Supabase Storage bucket **`drywall-field-photos`** (new bucket; GC precedent: `project-documents`, `quote-documents`, `selection-images`). Path pattern: `{organization_id}/{project_id}/{photo_id}.{ext}`.

---

## Section 2 — Data layer reuse vs. refactor

| Table / blob | V1 decision | RLS today | Implementation notes |
|--------------|-------------|-----------|----------------------|
| **`public.projects`** | **Keep JSONB** `metadata.legacy`; typed adapter + merge-on-write | Org SELECT; UPDATE `user_can_edit()` | Phase A: `drywallProjectService.ts`; never clobber `legacy` from GC saves |
| **`projects.metadata` wrapper** | **Keep** `app_scope`, `visibility`, `source` | Same row | `projectVisibility.ts`; **no** auto `visibility.drywall` from GC trade |
| **`metadata.legacy.quote`** | **Keep JSONB**; defer normalization | — | **Drywall workspace inclusion criterion** — project appears in list when quote blob exists / is non-empty |
| **`public.estimates` / `trades`** | **Separate** from drywall quote (Section 0) | Org RLS | Dual-view rows may have both |
| **`public.project_milestones`** | **Not used in Drywall port** | Org CRUD | 0 prod rows — future schedule work only |
| **`public.time_entries`** | **Reuse**; field users via HR TimeClock | HR RLS | 1 GC test row; no drywall punch history to migrate |
| **`org_team` / `pay_periods`** | HR workspace only | HR RLS | Out of scope |
| **Quote requests (inbound)** | **Deferred** — no table V1 | — | Manual intake |
| **Customer approval** | **No migration**; optional Phase C server route | — | Prod `quoteStatus` all null |
| **Field photos** | **Supabase Storage V1** (Phase D) | Bucket policies org-scoped | JSONB refs in `fieldTakeoff.photos[]`; bucket `drywall-field-photos` |

### RLS implications

- V1 operator is Mark (`owner`) — existing `projects` policies suffice for initial ship.
- Before **Phase 4 RBAC** (first `field_drywall` user): extend policies so field roles cannot read unrelated projects' `metadata.legacy` PII.
- **`field_drywall` V1:** no Drywall workspace project list access — **TimeClock + own `time_entries` only** via HR workspace (locked).

### JSONB vs normalize?

| Data | V1 | Rationale |
|------|-----|-----------|
| Drywall quote | **JSONB** | Same call as HR `org_team.payload`; single-operator; proven pattern |
| Field takeoff | **JSONB** + Storage for binaries | Photos need Storage; structure stays in legacy |
| Orders | **JSONB** `legacy.orders[]` | 15 prod projects with orders — low volume |
| Project Info | **Top-level columns** | Already dual-written |

Revisit normalization only if multi-user concurrent editing or cross-project analytics require SQL reporting.

---

## Section 3 — UI port mapping (drywall → GC)

| Drywall surface | GC target | Strategy |
|-----------------|----------|----------|
| `App.jsx` dashboard | `/drywall` list | Filter projects with `metadata.legacy.quote` populated |
| Stage tabs | `/drywall/projects/:id/{info\|quote\|field\|order}` | Option B + `DrywallProjectStepper` |
| `ProjectInfoStage` | `DrywallProjectInfoPage.tsx` | 1:1 port |
| `QuoteStage` | `DrywallQuotePage.tsx` + sub-panels | Split monolith |
| `FieldMeasurementStage` | `DrywallFieldMeasurementPage.tsx` | 1:1 + Storage upload UI (Phase D) |
| `OrderStage` | `DrywallOrderPage.tsx` | 1:1; material PDF client jsPDF only |
| Quote send | `DrywallQuoteExportDialog.tsx` | Download PDF + copy email fields — **no** approval-link V1 |
| `QuotePDF` / jsPDF | `src/lib/drywallQuotePdf.ts` | Single pipeline; **no** shared code with `clientQuotePdf.ts` |
| `PublicQuoteRequest` / `QuoteRequestsList` | — | **Not ported** V1 |
| `PublicQuoteApproval` | Optional `/public/drywall/quote-approval` | Phase C greenfield only; no cutover migration |
| Milestones tab | — | **Not in Drywall port** |
| Rate sheet / settings | — | Defer |

### UX — locked choices

| Topic | Decision |
|-------|----------|
| Stage navigation | **Option B** — sibling routes, stepper, non-blocking warnings |
| Drywall list | Projects with **drywall quote data**; not `visibility.drywall` auto from GC trade |
| Drywall quote vs GC estimate | **Section 0** — never merge |
| Customer delivery | Manual PDF + email |
| Field photos | Storage bucket in Phase D — replaces BuilderTrend photo workflow |

---

## Section 4 — Stage-gate model (locked: Option B)

Port the four stages as **sibling sub-routes**:

```
/drywall/projects/:projectId/info
/drywall/projects/:projectId/quote
/drywall/projects/:projectId/field
/drywall/projects/:projectId/order
```

- **Visual progress stepper** on project shell (derived from `projects.status` + data presence).
- **Non-blocking warnings** when prerequisites are missing (e.g. Order opened without approved field review).
- **Explicit actions** retain legacy side effects: "Submit for review", "Mark stage complete", status updates on `projects.status`.
- **Strict linear gates** may ship later as an **org-setting toggle** — not in V1 routing.

Legacy drywall app linear tab locks are **not** replicated in V1 GC routing.

---

## Section 5 — One-row-two-views handling

### Visibility patterns

| Pattern | GC Projects dashboard | Drywall workspace list |
|---------|----------------------|------------------------|
| `DRYWALL_ONLY` | **Hidden** (`isVisibleInGcApp`) | **Shown** (read-only for `office_gc` per RBAC) |
| Dual-view (Goodwill Multi) | Shown | Shown when `legacy.quote` exists |
| GC project + drywall trade, no legacy quote | Shown in GC | **Not shown** until drywall quote data exists |

### Locked: Drywall workspace surfacing criterion

A project appears in the **Drywall workspace** when it **has drywall data** — operational rule: **`metadata.legacy.quote` is populated** (non-empty quote object). Implement `hasDrywallWorkspaceData(project)` in Phase A/B.

- **Do not** auto-set `metadata.visibility.drywall` when GC adds a drywall trade or estimate line.
- Adding a drywall trade in GC **does not** promote the project into the Drywall workspace until drywall quote work creates `legacy.quote`.

### List UI

**One unified list** with optional filters:

| Filter | Rule |
|--------|------|
| All (default) | `hasDrywallWorkspaceData` |
| Drywall-only | `app_scope === 'DRYWALL_ONLY'` |
| Shared with GC | `visibility.gc && visibility.drywall` (existing dual-view rows) |

### `office_gc` + `DRYWALL_ONLY` (locked)

Already correct: hidden on GC Projects dashboard; **visible read-only** in Drywall workspace per RBAC matrix. **No change.**

### Schedule / milestones

`schedule_items` and `project_milestones` are **out of Drywall port scope** (0 milestone rows in prod). Future schedule workspace work may bridge later.

---

## Section 6 — Customer-facing flows (locked)

| Topic | Locked behavior |
|-------|-----------------|
| **Current operator pattern** | Mark downloads drywall quote PDF and emails directly — **no** live approval-link usage |
| **Prod data** | All `quote.quoteStatus` null; **no** server-side pending approvals; **no migration** required |
| **Legacy approval URLs** | localStorage-only in old app; any bookmarks **die at cutover** — no redirect obligation |
| **Phase C** | May ship **server-backed** `/public/drywall/quote-approval` for **future** customer self-serve — greenfield, not cutover |
| **Public quote request form** | **Deferred** — leads via email/text; Mark creates in Drywall workspace |
| **GC vendor quote** | `/vendor-quote/:token` unchanged — unrelated |

### PDF stacks (locked)

| Document | Stack | Shared with GC commercial quotes? |
|----------|-------|-----------------------------------|
| Drywall quote PDF | `drywallQuotePdf.ts` (client) | **No** — Section 0 |
| Material order PDF | Client jsPDF only | **No** |
| GC project quote PDF | `clientQuotePdf.ts` / `QUOTE_DOCUMENT_PLAN` | N/A |

---

## Section 7 — RBAC integration

From `docs/RBAC_PLAN.md` (wire in **Phase F**):

| Role | Drywall workspace |
|------|-------------------|
| `owner` | admin |
| `office_drywall` | write |
| `office_gc` | read (includes `DRYWALL_ONLY` projects in Drywall list) |
| `field_drywall` | read (workspace matrix) — **V1 effective access: HR TimeClock only** |
| `viewer` | read |
| Others | none |

### `field_drywall` (locked)

**V1 read-own = TimeClock + own `time_entries` only.**

- Use existing **HR workspace TimeClock** as canonical punch surface (`source_app: 'DRYWALL'` when implemented).
- **No** Drywall workspace project list, Field Measurement, or Order access for field role in V1.
- **Assigned-projects** model (`project_assignments`, field-scoped RLS) deferred to **Phase 4 RBAC activation** when first drywall field user is onboarded — no assignment infrastructure in V1.

### Phase 4 RBAC note

Drywall role activation deferred until first field user. Phase F ships matrix + gates; Mark (`owner`) is sole operator initially.

---

## Section 8 — Workspace shell + nav wiring (Phase F)

| Artifact | Change |
|----------|--------|
| `src/hooks/useActiveWorkspace.ts` | Add `'drywall'`; `WORKSPACE_HOME: '/drywall'`; path prefix `/drywall` |
| `src/lib/rbac.ts` | `WORKSPACE_ACCESS.drywall` per RBAC plan |
| `src/components/WorkspaceSwitcher.tsx` | Drywall entry |
| `src/components/AppSidebar.tsx` | `drywallNav`: Projects list; per-project routes via detail shell |
| `src/components/drywall/DrywallWorkspaceShell.tsx` | Thin `<Outlet />` (HR pattern) |
| `src/routes/index.tsx` | `/drywall/*` + `RequireWorkspaceAccess workspace="drywall"` |

### Route tree (locked — Option B)

```
/drywall                                    → project list (hasDrywallWorkspaceData)
/drywall/projects/new                     → create
/drywall/projects/:projectId              → shell + stepper → default …/info
/drywall/projects/:projectId/info
/drywall/projects/:projectId/quote
/drywall/projects/:projectId/field
/drywall/projects/:projectId/order
/public/drywall/quote-approval            → Phase C optional (future)
```

**Not in V1 routes:** `/drywall/quote-requests`, `/public/drywall/quote-request`.

**TimeClock:** `/hr/time-clock` only — not duplicated under `/drywall`.

---

## Section 9 — Phased rollout plan

```
Phase A ─ Adapters + merge-safe legacy writes + hasDrywallWorkspaceData helper
    ↓
Phase B ─ Project list + Project Info (routes stub)
    ↓
Phase C ─ Quote (math, builder, drywall PDF, optional future public approval)
    ↓
Phase D ─ Field Measurement + Supabase Storage (drywall-field-photos)
    ↓
Phase E ─ Order (+ review workflow, client jsPDF material orders)
    ↓
Phase F ─ Workspace shell + RBAC + legacy drywall app FREEZE
    ↓
Phase G ─ Full drywall repo retirement (merge plan step 6, comfort window after F)
```

### Phase A — Adapters (blocking)

| Work item | Files |
|-----------|-------|
| `drywallProjectService.ts` — load/save `metadata.legacy` merge | `src/services/drywallProjectService.ts` |
| `hasDrywallWorkspaceData()` list filter | `src/services/projectVisibility.ts` or `drywallProjectService.ts` |
| GC `updateProject` never wipes `legacy` | `src/services/supabaseService.ts` |
| Types | `src/types/drywallProject.ts` |

### Phase B — Project Info + list

| Work item | Files |
|-----------|-------|
| `DrywallProjectsDashboard.tsx` | `src/components/drywall/` |
| `DrywallProjectInfoPage.tsx`, `DrywallProjectShell.tsx` + stepper | |
| Routes under `/drywall` | `src/routes/index.tsx` |

**Phase B retrospective (list surfacing):** The workspace list uses `belongsInDrywallWorkspace()` — `app_scope === 'DRYWALL_ONLY'` **or** `hasDrywallWorkspaceData()` (real quote content). The latter alone hid new in-progress projects; the combined rule keeps placeholders out of GC while surfacing empty DRYWALL_ONLY creates. See `projectVisibility.ts`.

### Phase C — Quote (largest; split C1–C3 if needed)

| Work item | Notes |
|-----------|-------|
| `drywallQuoteMath.ts`, `drywallQuoteSchema.ts` | Port calculators |
| `DrywallQuotePage.tsx` + panels | Split monolith |
| `drywallQuotePdf.ts` | **Separate** from `clientQuotePdf.ts` (Section 0) |
| Quote export dialog | PDF download + email fields — **no** approval-link V1 |
| Optional: public approval route | Server-backed greenfield; **no** legacy migration |

### Phase D — Field Measurement + Storage (**expanded scope**)

| Work item | Notes |
|-----------|-------|
| `DrywallFieldMeasurementPage.tsx` | Measurements, checklist, variance, review submit |
| **Supabase Storage bucket** `drywall-field-photos` | Org-scoped policies; upload from field UI |
| Photo refs in `fieldTakeoff.photos[]` | path, url, metadata — blobs in Storage |
| Replaces BuilderTrend photo workflow | Operator-confirmed regular use post-port |

### Phase E — Order

| Work item | Notes |
|-----------|-------|
| `DrywallOrderPage.tsx` | Review panel, orders, change orders |
| Material order PDF | **Client-only jsPDF** — no Express, no edge function |

### Phase F — Workspace + RBAC + **legacy app freeze** (**expanded scope**)

| Work item | Notes |
|-----------|-------|
| WorkspaceSwitcher, AppSidebar, `useActiveWorkspace`, `rbac.ts` | Mirror HR Phase E |
| `RequireWorkspaceAccess workspace="drywall"` | |
| **Legacy drywall app freeze** | End of Phase F: Mark stops editing in standalone drywall app |
| Freeze mechanism | Env flag / read-only banner / redirect to GC `/drywall` — implementation choice in Phase F PR |
| Drywall app shows banner | "Use GC Platform → Drywall workspace" |

### Phase G — Full retirement (comfort window)

| Work item | Notes |
|-----------|-------|
| Merge plan **step 6** | After Mark uses GC Drywall workspace exclusively for agreed period |
| DNS / hash redirects | Old drywall app URLs → GC |
| Repo archive or decommission | Not immediate with Phase F freeze |

### Files touched (estimated)

| Phase | Approx. files |
|-------|----------------|
| A | 3–5 |
| B | 5–8 |
| C | 15–25 |
| D | 5–8 (+ Storage bucket setup) |
| E | 3–6 |
| F | 6–10 (+ legacy app banner) |

---

## Section 10 — Production data & scope implications (May 2026)

| Metric | Value | Scope implication |
|--------|-------|-----------------|
| Drywall-tagged projects | **117** | Quote-stage work dominates port priority |
| `DRYWALL_ONLY` | **99** | Hidden on GC dashboard; visible in Drywall workspace |
| `metadata.legacy.quote` | **102** | List filter aligns with prod data |
| `status = quote` | **93** | Optimize Phase C first |
| Non-empty `orders[]` | **15** | Phase E still required but smaller audience |
| `quote.quoteStatus` | **all null** | Confirms no approval migration |
| `project_milestones` | **0 rows** | **Do not** lean Drywall port on milestone bridge — over-built for current usage; flag for future **Schedule** work |
| `time_entries` | **1** row (`GC`, test) | TimeClock = HR canonical surface; **no** drywall punch migration |
| Pending customer approvals | **0** | No cutover risk |
| Delivery/Audit components | Orphan in repo | **Dropped**, not ported |

### Dual-view exemplar

**Goodwill Multi** — `visibility.gc/drywall`, `legacy.quote` + GC `estimates` — both quote pipelines on one row per Section 0.

---

## Section 11 — Locked decisions (canonical)

| # | Topic | Locked decision |
|---|--------|-----------------|
| **0** | **Drywall quote vs GC project quote** | **Two separate pipelines** on one `projects` row (Section 0). Never share code, schema, or merge logic. No unified quote in any planned phase. |
| 1 | Stage-gate model | **Option B.** Sibling sub-routes (`/info`, `/quote`, `/field`, `/order`), visual stepper, non-blocking prerequisite warnings. "Submit for review" / "Mark stage complete" remain explicit actions updating `projects.status`. Strict gates optional later as org-setting toggle. |
| 2 | JSONB retention | **V1 keep `metadata.legacy` JSONB; defer normalization.** Same rationale as HR `org_team.payload`. Revisit only for multi-user editing or cross-project analytics. |
| 3 | Customer approval cutover | **No migration.** No live server-side `quoteStatus`. Server-backed approval URLs in **Phase C** (greenfield). Legacy bookmarks die at cutover. Operator uses **manual PDF + email** today. |
| 4 | `field_drywall` read-own | **V1 = TimeClock + own `time_entries` only** (HR workspace). Assigned-projects model deferred to Phase 4 RBAC when first field user onboards. No assignment infra in V1. |
| 5 | Drywall quote PDF | **Separate stack** from `docs/QUOTE_DOCUMENT_PLAN` / `clientQuotePdf.ts`. No shared code. Architectural rule (Section 0). |
| 6 | Quote requests public form | **Deferred.** Leads via email/text; Mark creates projects manually. Server-backed quote-request table is a future feature. |
| 7 | Legacy drywall app lifecycle | **Freeze at end of Phase F** (Mark stops editing in legacy app). **Full retirement = merge plan step 6** after comfort window on GC-only workflow. |
| 8 | Drywall workspace surfacing | **No auto-set `visibility.drywall`.** Criterion: **has drywall data** (`metadata.legacy.quote` populated). GC drywall trade alone does not promote into Drywall workspace. |
| 9 | `office_gc` + `DRYWALL_ONLY` | **Already locked:** hidden on GC Projects dashboard; read-only in Drywall workspace per RBAC. No change. |
| 10 | Field photos | **Supabase Storage in V1 (Phase D).** Bucket `drywall-field-photos`; refs in `fieldTakeoff.photos[]`. Replaces BuilderTrend upload loop. |
| 11 | Material order PDF | **Client-only jsPDF.** Same pattern as drywall quote PDF and GC payroll PDFs. No Express server, no edge function. |
| 12 | Customer-link verification | **No follow-up.** Mark confirmed PDF + email only; no approval-link bookmarks in the wild. |

---

## Section 12 — GC Platform reference pattern (Projects workspace)

| Layer | Projects (reference) | Drywall (target) |
|-------|---------------------|------------------|
| List | `ProjectsDashboard.tsx` | `DrywallProjectsDashboard.tsx` |
| Detail shell | `ProjectDetailView.tsx` + nested routes | `DrywallProjectShell.tsx` + stage routes |
| Service | `hybridService.ts`, `supabaseService.ts` | `drywallProjectService.ts` |
| Visibility | `projectVisibility.ts` | + `hasDrywallWorkspaceData` |
| RBAC | `RequireWorkspaceAccess` | `workspace="drywall"` |
| Public routes | `/vendor-quote/:token` (GC subs) | Optional `/public/drywall/quote-approval` Phase C only |

**HR workspace** is the template for Phase F shell wiring (`HrWorkspaceShell.tsx`, `/hr` + `<Outlet />`).

---

## Section 13 — Existing GC references to drywall

| Location | Behavior | Action at port |
|----------|----------|----------------|
| `src/services/projectVisibility.ts` | `isVisibleInGcApp`, `isVisibleInDrywallApp` | Extend with `hasDrywallWorkspaceData` for new list |
| `src/services/hybridService.ts` | Hides `DRYWALL_ONLY` from GC list | **Keep** |
| `src/services/scheduleService.ts` | Portfolio `gc` \| `drywall` \| `all` | **Keep** — not Drywall workspace |
| `src/components/ProjectMilestonesSection.tsx` | GC/Drywall milestone tabs | **Keep** on GC project detail — not Drywall port |
| `src/components/ProjectsDashboard.tsx` | No `DRYWALL_ONLY` by default | **Keep** |
| `src/lib/rbac.ts` | No `drywall` workspace yet | **Add Phase F** |
| `src/lib/clientQuotePdf.ts` | GC commercial quotes | **Do not import** from drywall quote code |
| `VITE_INCLUDE_DRYWALL_ONLY_PROJECTS` | Dev GC dashboard flag | Dev-only |

---

## Appendix A — Drywall file reference

```
hsh-drywall-app/
  src/App.jsx
  src/components/workflow/ProjectInfoStage.jsx
  src/components/workflow/QuoteStage.jsx          (~6,850 LOC)
  src/components/workflow/FieldMeasurementStage.jsx (~2,000 LOC)
  src/components/workflow/OrderStage.jsx            (~2,700 LOC)
  src/components/workflow/DeliveryStage.jsx         (DROPPED)
  src/components/workflow/AuditStage.jsx            (DROPPED)
  src/services/supabaseSpine.js
  src/services/quoteSchemaAdapter.js
  src/services/quoteCalculations.js
  src/components/QuotePDF.jsx
```

## Appendix B — Proposed GC files (implementation)

```
src/
  services/drywallProjectService.ts
  types/drywallProject.ts
  lib/drywallQuoteMath.ts
  lib/drywallQuoteSchema.ts
  lib/drywallQuotePdf.ts
  components/drywall/
    DrywallWorkspaceShell.tsx
    DrywallProjectsDashboard.tsx
    DrywallProjectShell.tsx
    DrywallProjectStepper.tsx
    DrywallProjectInfoPage.tsx
    DrywallQuotePage.tsx (+ sub-panels)
    DrywallFieldMeasurementPage.tsx
    DrywallOrderPage.tsx
```

---

*Document status: design locked, May 2026. Implementation per Section 9 phases.*
