# Drywall Division Operations Plan

**Status:** 29 foundational decisions locked. D.1 SHIPPED 2026-06-15 (lifecycle states + bid snapshot + labor aggregation + cost reconciliation). D.6 scope corrected 06-15: Twilio customer SMS DEFERRED to post-launch; D.6 narrowed to in-app crew/sub messaging only. 7/1 plan = D.1 (done) + D.2 + D.4 + D.6 (narrowed). Customer narrowing to 3-4 dedicated GC relationships (#29) makes in-app customer comms viable later post-launch.

**Trigger:** Drywall splits from HSH Contractor into its own division/profit center on **2026-07-01**. Mark becomes Director of Drywall Operations (P&L owner). Platform needs to support the operational loops that let Mark hit the KPIs in `H:\Shared drives\HSH Shared Drive\HR & Personnel\HR Docs\Job Descriptions\Director_of_Drywall_Operations_JD.pdf`.

**Related docs:** `docs/DRYWALL_PORT_PLAN.md`, `docs/QUOTE_STAGE_REDESIGN_PLAN.md`, `docs/HR_PORT_PLAN.md`.

---

## Locked Decisions (2026-06-09)

| # | Decision | Locked answer |
|---|---|---|
| 1 | PO multi-line handling | **Distilled to single line at intake.** Some POs have multi-line breakdowns, but the operator collapses to one drywall sqft line at PO intake. Degenerate quote stays single-line. |
| 2 | Quote request V1 shape | **Operator-entered queue.** No public form V1. Mark or office staff enters requests received via email/text/phone into a queue. Customer-facing form is post-launch (D.8). |
| 3 | Material cost capture | **QuickBooks pull.** Same pattern as GC platform's existing QB actuals integration. Supplier invoices flow from QB → tagged to project for reconciliation. |
| 4 | Margin floor scope | **Single org-wide number.** One target margin floor across all drywall work. Per-project-type tiering (residential vs commercial) deferred unless real operational signal demands it. |
| 5 | Phase priority order | **D.1 → D.5 confirmed.** Production Complete + assessments first, then PO intake, then quote request queue, then margin floor, then KPI dashboard. |
| 6 | Pre-July-1st must-haves | **D.1 through D.5 must ship before 2026-07-01.** D.6–D.8 (schedule integration, pricing model feedback loop, public quote request form) are post-launch increments. |
| 7 | Bid-to-actual margin variance target | **±3% max** — Mark picked the tight end of the JD's ±3-5% range. Drives KPI #4 target. |
| 8 | Customer communication channels | **REVISED 2026-06-11.** Originally out-of-platform — superseded by decisions #22-26 below (in-platform comms hub via Twilio SMS for customers + in-app messaging for crew + voicemail transcription). |
| 9 | Production-status visibility on project page | **Three signals: running cost to date, margin vs bid, current crew assignment.** Not surfaced V1: days vs planned, % complete, next milestone, open issues. Focused, fits at-a-glance. |
| 10 | Projects list filtering | **Current status filtering only.** No "behind schedule" / "over budget" advanced filters V1. |
| 11 | Material cost timing | **QuickBooks import.** Same integration pattern as GC platform's existing QB sync. Supplier invoices flow from QB → tagged to project automatically. |
| 12 | Labor cost cadence during the week | **Running projected labor total updates between payroll runs.** Aggregates TimeClock punches × rate to give Mark a current view, so he isn't caught off guard at payroll close. Reconciles against actual at payroll period end. |
| 13 | Customer comms logging | **Light log — free-text notes section on project page.** Operator (Mark or office) types in "called 6/9 — schedule slip 1 day" with timestamp + author auto-captured. No structured channels; no formal comm tracking. |
| 14 | Billing milestones | **Per-job, no standard scheme.** Most jobs bill complete at end. Some (e.g. 70% after hang / 30% completion). Already handled by existing **quote pay-terms** field on the quote document — it generates onto the customer-facing PDF. No new field needed; D.1 doesn't touch this. |
| 15 | Invoice generation | **QB handles it.** Quote/PO data flows from drywall app → QB → invoice generated in QB → sent to customer from QB. Drywall app does not generate or send invoices. |
| 16 | Invoice status tracking | **QB owns it.** Drywall app does not track invoice status. Mark looks at QB for payment status. |
| 17 | Org-wide margin floor target | **30%** — single value applied to bid-projected margin. Drives the margin gate on quote approval and the warning state when a bid falls below. JD KPI #1 ("achieve and maintain target margin") anchors here. |
| 18 | Sub cost data source | **Drywall 1099 subs run through payroll.** "Sub cost" is not a separate cost stream — it folds into labor cost via TimeClock + payroll. Simplifies the assessment data model. |
| 19 | QB material → project tagging | **Extend existing GC QB sync to include drywall projects.** Plumbing exists; current filter excludes non-GC projects. D.1 prereq: broaden filter + verify drywall projects round-trip cost tags correctly. |
| 20 | Drywall labor data source (V1) | **Operator labor allocation grid (Path B).** Reality: crew doesn't use any time clock today — they text Mark hours/pieces per project and he enters payroll from texts. V1 codifies this: per-employee pay-period grid where Mark splits hours/pieces by project; lands in BOTH payroll and per-project cost tracking from one entry. Extends existing [PayrollRunTab.tsx](../src/components/hr/payroll/PayrollRunTab.tsx) (Q.C.3 stood up the piece-key namespace already). HSH TimeClock direct-entry by crew is a post-launch improvement, not a 7/1 blocker. |
| 21 | Margin definition (for 30% floor + KPIs) | **Cost-vs-bid:** `(bid_total - total_cost) / bid_total`. Standard contractor margin. Same formula used at quote time (against estimated cost) and at closeout (against actual cost) so bid-vs-actual variance is apples-to-apples. |
| 22 | Comms hub architecture — number | **DEFERRED to post-launch (2026-06-15).** Originally locked as single Twilio number for customer SMS + voice. Reframed: V1 keeps customer comms external (phone/text/email on Mark's cell + paste-into-comms-log on project page). Twilio customer SMS evaluated post-launch only if real friction emerges. |
| 23 | Customer comms routing | **DEFERRED with #22.** Sender-phone lookup logic only needed when Twilio customer SMS ships. |
| 24 | Crew comms channel | **In-app messaging, not SMS — STILL IN SCOPE for 7/1.** Crew + 1099 subs open HSH app, select project, send messages → threads in project's Comms tab. Cleaner than SMS (project explicitly tagged, no parsing needed). Implies crew uses HSH app actively — a behavior shift but consistent with #26 (Buildertrend exit). |
| 25 | Voice handling | **DEFERRED with #22.** Without Twilio number, calls continue routing to Mark's cell as today. No change to V1. |
| 26 | Buildertrend exit for drywall | **Progressive migration.** HSH replaces Buildertrend for drywall in stages: pre-7/1 the platform handles all NEW drywall ops (D.1-D.6); Buildertrend runs in parallel as backstop/legacy through July-August; full cancellation end of summer. Big-bang exit by 7/1 is not realistic given scope. |
| 27 | Field-facing project view (formerly "selections") | **Mark doesn't use Buildertrend Selections, but wants a surface where field guys see what they're getting into.** Not customer-pick selections — read-only scope/specs view for crew. Includes scope of work text, board specs, finish level, accessory list, location, schedule, field measurement notes. Largely re-using existing drywall project pages with mobile-friendly crew-permissioned view. Ships with D.6 (crew is in the app for messaging anyway). |
| 28 | "Subcontractor coordination" for drywall | **Not a separate need.** Drywall 1099 subs work like employees to a large extent. Coordination is covered by the same surfaces as crew employees: comms hub (D.6) + operator labor grid (#20) + project view (#27). No standalone sub-coordination surface required. |
| 29 | Customer base narrowing | **Locked 2026-06-15.** Drywall division focuses on 3-4 dedicated GC/builder customer relationships (Schumacher pattern) rather than mass one-off residential bids. Implication: in-app customer comms becomes viable later (small N of accounts to manage); validates deferral of Twilio customer SMS to post-launch. Estimating discipline + relationship-management beats volume bidding. |

---

## Operating Context

| Context | Implication |
|---------|-------------|
| **Role** | Director of Drywall Operations — full ownership of drywall division as profit center. Estimating accuracy, margin discipline, delivery quality, division net result all owned. |
| **Effective date** | 2026-07-01 — platform must support new workflow by then, even if some pieces are still rough |
| **KPIs as design anchors** | 8 KPIs from JD drive what the platform needs to surface. Every workflow decision should ask: "does this help Mark hit his KPIs?" |
| **Strategic** | Drywall is the template for future in-house trades. Decisions made here generalize. |

**JD KPIs and what each requires from the platform:**

| KPI | Platform need |
|---|---|
| 1. Bid rate | Quote request intake + count of bids issued per period |
| 2. Win rate at target margin | Quote status lifecycle (sent → approved/lost) + margin captured at issuance |
| 3. Bid margin discipline | Margin floor enforcement in pricing model + warning when quote drops below |
| 4. Bid-to-actual margin variance (±3-5%) | **The big one.** Bid total locked at issue + actual labor (payroll) + actual material (supplier invoices) + actual subs → reconciled per closed job |
| 5. Change-order capture | Change order tracking per job (already built in v3 Order stage) |
| 6. Estimate turnaround | Quote request received-at + sent-at timestamps → cycle time |
| 7. Division profitability | Rolled-up reconciled margin across all closed jobs in period |
| 8. Job-costing completeness | Every cost (labor, material, sub) tagged to a project; "unassigned" report = zero |

---

## Lifecycle Map

```
┌──────────────────┐    ┌────────────────────┐
│ Quote Request    │    │ PO Received        │
│ (customer asks)  │    │ (customer's sqft + │
└────────┬─────────┘    │  agreed pricing)   │
         │              └────────┬───────────┘
         │                       │
         ▼                       ▼
┌──────────────────┐    ┌────────────────────┐
│ Mark produces    │    │ "Degenerate quote" │
│ quote via v3     │    │ auto-created from  │
│ Quote stage      │    │ PO (single line)   │
└────────┬─────────┘    └────────┬───────────┘
         │                       │
         ▼                       │
┌──────────────────┐              │
│ Quote sent →     │              │
│ approved or lost │              │
└────────┬─────────┘              │
         │                       │
         └───────┬───────────────┘
                 │
                 ▼
    ┌────────────────────────┐
    │ Job created            │
    │ (Approved or PO state) │
    └────────────┬───────────┘
                 │
                 ▼
    ┌────────────────────────┐
    │ Tentative schedule +   │
    │ Field measurement      │
    │ scheduled              │
    └────────────┬───────────┘
                 │
                 ▼
    ┌────────────────────────┐
    │ Field measurement done │
    │ → order generated      │
    │ → labor rate refresh   │
    │ → financial estimate   │
    │   (quote vs field)     │
    └────────────┬───────────┘
                 │
                 ▼
    ┌────────────────────────┐
    │ Manual schedule        │
    │ refinement (Mark)      │
    │ — scaffolding, manpower│
    │   tweaks based on      │
    │   field findings       │
    └────────────┬───────────┘
                 │
                 ▼
    ┌────────────────────────┐
    │ Production             │
    │ (Schedule workspace    │
    │  tracks daily/weekly   │
    │  adjustments)          │
    └────────────┬───────────┘
                 │
                 ▼
    ┌────────────────────────┐
    │ Production Complete    │
    │ → Production Complete  │
    │   Assessment           │
    │   (financial snapshot) │
    └────────────┬───────────┘
                 │
                 ▼
    ┌────────────────────────┐
    │ Point-up trips         │
    │ (~2 typical, varies)   │
    │ → adds post-production │
    │   labor + material     │
    └────────────┬───────────┘
                 │
                 ▼
    ┌────────────────────────┐
    │ Fully Closed           │
    │ → Final Assessment     │
    │   (full bid vs actual) │
    │ → After-Production Cost│
    │   = Final − Production │
    │     Complete delta     │
    └────────────┬───────────┘
                 │
                 ▼
    ┌────────────────────────┐
    │ Pricing model feedback │
    │ — reconciled actuals   │
    │ feed catalog rate      │
    │ adjustments over time  │
    └────────────────────────┘
```

---

## Two Intake Paths

### Quote Path (Mark-driven pricing)

1. Customer requests quote (email, text, phone, future: web form)
2. Quote request lands in intake queue
3. Mark builds quote via v3 Quote stage (existing — catalog-driven pricing, line items, alternates)
4. Margin floor enforced — quote can't be sent below target margin without owner approval (JD)
5. Quote sent → status tracking (Sent → Approved | Lost)
6. If approved → job created → lifecycle continues

### PO Path (customer-driven pricing — Schumacher pattern)

1. Customer (e.g. Schumacher Homes) does their own sqft takeoff — single number
2. Customer sends PO: `their sqft × pre-agreed unit rate = total`
3. **PO intake creates a "degenerate quote"** in the v3 envelope:
   - Single drywall line: customer's sqft, board defaulted (e.g. 5/8" Type X), finish scope defaulted (likely Level 4)
   - Catalog rates apply (board catalog rate + accessories), OR `custom_material_rate` set to customer-agreed unit rate
   - No scope-build phase by Mark
4. Job goes straight to scheduled state — no Approval step (PO IS the approval)
5. Mark **still does field measurement** for production planning, supplier ordering, scaffolding needs
6. Bid-vs-actual variance on PO jobs measures pricing model validation, not estimating skill

**Key insight:** Both paths converge after the bid is locked. Lifecycle from Field Measurement onward is identical.

---

## What Exists Today vs What's New

### Already shipped (works as-is)

| Feature | Where |
|---|---|
| v3 Quote stage with line items, catalogs, alternates | `/drywall/projects/:id/quote` (Q.B + Q.C) |
| Pricing model (catalogs: boards, finish scopes, accessories, components) | `/drywall/settings/catalogs` (Q.A) |
| Customer-facing PDF | v3 quote stage download (Q.D) |
| Field Measurement stage with variance vs quote, photos, accessory auto-calc | `/drywall/projects/:id/field` |
| Order stage with auto-suggest from field, change orders, status, PDFs | `/drywall/projects/:id/order` |
| Schedule workspace (separate top-level) | `/schedule` |
| Payroll system with v3 piece keys wired | `/hr/payroll` |
| Drywall project state machine: Project Info → Quote → Field → Order → Complete | DrywallProjectShell stepper |
| Bid-vs-actual partial: quote total locked in JSONB; payroll actuals tagged per project | Existing |

### What's new for July 1st

| Need | Notes | Priority |
|---|---|---|
| Quote request intake | Inbound queue. V1 could be operator-entered from email/phone; V2 customer-facing form | **Must-have (light V1)** |
| PO intake → degenerate quote creation | New flow on `/drywall/projects/new` (or similar). Captures PO# / customer ref / sqft / unit rate / scope text → auto-creates v3 quote envelope | **Must-have** |
| Production Complete state | New intermediate status between "Active" and "Complete" on Order stage | **Must-have** |
| Production Complete Assessment | Financial snapshot at production end — bid vs actual to that moment | **Must-have** |
| Final Assessment (existing Complete trigger) | Adds post-production costs → full bid vs actual | **Must-have** |
| After-Production Cost as a tracked metric | Delta between Production Complete and Final Assessment — surfaces rework cost as its own number | **Must-have** |
| Bid-vs-actual reconciliation engine | Math layer that aggregates labor + material + sub actuals per job and compares against bid | **Must-have** |
| KPI dashboard (light V1) | Surface KPIs 1, 2, 4, 7 minimally. Other KPIs follow. | **Must-have (light V1)** |
| Margin floor enforcement | Warning/block when v3 quote drops below target margin | **Must-have** |
| Schedule auto-create on approval | When job approved or PO received, auto-add tentative schedule entry + field measurement task | Nice-to-have |
| Field → schedule signal bridge | Show field findings (scaffolding need, board count delta, duration impact) in schedule view for Mark's manual review | Nice-to-have |
| Customer-facing quote request form | Public web form on hshcontractor.com (or similar) | Post-launch |
| Pricing model feedback loop | Reconciled actuals suggest catalog rate adjustments | Post-launch |
| Material invoice capture | How supplier invoices flow into actual cost tracking — manual entry vs QB integration | **Must-have (basic)** |

---

## Dual Financial Assessment Design

### Why two assessments

Most contractors lump everything into "final job cost" and lose visibility into rework. Splitting at Production Complete vs Fully Closed lets Mark see post-production cost as its own number — a quality / rework indicator that ties directly to his JD ("accountable for minimizing rework").

### Production Complete Assessment

Triggered when Mark marks job state → Production Complete.

Snapshot captures:

- Labor cost (payroll piece + hourly through production end)
- Material cost (supplier invoices logged through production end)
- Sub cost (subs logged through production end)
- **Total cost at production complete**
- Margin vs bid

Persisted on the project record (or job record) so the snapshot doesn't drift if more costs are logged later.

### Final Assessment

Triggered when Mark marks job state → Fully Closed (after point-ups).

Adds since Production Complete:

- Point-up labor (return-trip hours + piece work)
- Point-up material (any additional purchases for fixes)
- Any subs back for fix-up work

Computes:

- **Final total cost**
- Final margin vs bid → **this is the KPI #4 number (bid-to-actual margin variance)**
- **After-Production Cost = Final Total − Production Complete Total**
- After-Production % of total cost — surfaces jobs where rework was disproportionate

### What this enables

- **Operational learning:** consistent high after-production cost → process issue worth investigating
- **Quality KPI:** rework percentage as a tracked metric (not in current JD KPI list but emerges naturally — worth a conversation with Mark about whether to add it)
- **Clean bid-vs-actual:** Final Assessment is what feeds KPI #4

---

## Open Design Questions

### Intake

- **Quote request V1 shape:** operator-entered queue (no public form) OR public form on hshcontractor.com?
- **What fields does a quote request capture?** Customer name, contact info, project address, scope description, requested-by date, files attached, source (referral / web / repeat customer)
- **Quote request → quote linkage:** when Mark produces a quote from a request, does the request stay linked? (Probably yes — needed for estimate turnaround KPI #6)
- **PO intake fields:** PO#, customer reference, customer's sqft, agreed unit rate, scope text, expected start, billing terms, customer contact, any attached PO PDF
- **PO multi-line:** does a PO ever have multiple line items / phases? If yes, degenerate quote needs to support multi-line PO conversion.

### State machine

- **Current Order stage states:** Active → Complete. Need to add Production Complete between them.
- **What triggers Production Complete?** Operator marks it (Mark's call).
- **What triggers Fully Closed?** Operator marks it (probably). Optionally: auto-suggest after N days of no further cost activity.
- **Should Quote stage have its own state machine?** Quote Request → Quote Drafted → Quote Sent → Approved / Lost → Job Created. This drives KPIs 1, 2, 6.

### Bid-vs-actual reconciliation

- **Material cost capture:** how do supplier invoices flow into the system?
  - Manual entry per delivered order (Mark or office staff)
  - Or QuickBooks integration (we already have QB tokens)
  - Probably QB import for V1 — operator confirms each as "tagged to project X"
- **Labor cost capture:** payroll system already tags piece + hourly to projects. Just needs an aggregation query.
- **Sub cost capture:** existing subcontractor entries in actuals.
- **Reconciliation refresh cadence:** real-time as costs are logged, or on-demand when Mark marks production complete / fully closed?

### KPI dashboard

- **Location:** `/drywall/dashboard` (new) or part of `/drywall` projects list page (stats strip already exists there)?
- **Refresh frequency:** real-time? Periodic background recompute?
- **Date range:** This week / month / quarter / YTD / custom?
- **Drill-down:** click a KPI to see contributing jobs?

### Pricing model feedback loop

- **Detection:** when reconciled actuals show consistent variance from catalog rates (e.g. hanger labor +15% over catalog for 6 jobs running), surface as alert?
- **Update model:** Mark manually updates catalog after review, OR system suggests adjustment with one-click apply?
- **Cadence:** monthly review window? After each closeout?

### Schedule integration

- **Auto-create on approval:** what does the auto-created schedule entry look like? Just placeholder dates? Or full work allocation requiring further config?
- **Field → schedule bridge UX:** Mark wants to do this manually. Platform's job is to surface signals — show field measurement summary in schedule edit view so he doesn't have to context-switch.

---

## Suggested Phasing for 2026-07-01 Launch

### Phase D.1 — Production Complete + Final Assessment (foundational)

- New project state: Production Complete between Active and Complete
- Production Complete Assessment data capture (snapshot at state change)
- Final Assessment math (existing Complete now triggers this with the after-production delta visible)
- After-Production Cost metric per project
- Bid-vs-actual reconciliation per job (basic — material via manual entry or QB pull, labor from payroll, subs from existing actuals)

Why first: unblocks KPI #4 measurement, which is the highest-leverage KPI.

### Phase D.2 — PO intake + degenerate quote

**What ships:**
- New entry point on drywall projects list: "Create from PO" alongside existing "New Project"
- PO intake form: PO#, customer, customer's sqft, agreed unit rate, scope text, expected start date, billing terms (free text per #14), customer contact, optional PO PDF attachment
- On submit: creates drywall project with `intake_source='po'` + auto-creates v3 quote envelope (single drywall line; `custom_material_rate` = agreed unit rate; default board 5/8" Type X; default finish Level 4)
- Project skips Approval step — PO IS the approval. Lands directly in scheduled state, ready for Field Measurement
- Bid total = customer's sqft × agreed unit rate, locked at intake

**Data model:**
- Add `intake_source: 'quote' | 'po'` column to drywall projects
- Add `po_reference: text` column for PO#
- Reuse existing v3 quote envelope + `custom_material_rate` finish-scope override
- PO PDF attachment via existing project files surface

**Prereqs:** None. Purely additive on top of existing v3 quote infrastructure.

**Effort:** Medium — 2-3 sessions. New form, project-creation branching, intake-source routing on project shell.

**Open questions:**
- Defaults — confirm 5/8" Type X + Level 4 as the V1 defaults for PO degenerate quotes, with operator override?
- Does customer's sqft include waste, or do we add waste % on top for our internal supplier order math? Field measurement will recompute actuals — but bid total is locked.
- Approval step: is "PO received" its own status, or does it land directly in the post-approval "Scheduled" state?

### Phase D.3 — Quote request intake (light V1)

**What ships:**
- New surface — either `/drywall/quote-requests` route or a tab on the projects list
- Operator-entered queue: customer name, contact (email/phone), project address, scope description, requested-by date, source (referral/web/repeat/other), file attachments
- Status lifecycle: `received → in_progress → quoted → won | lost`
- "Convert to Project" action that creates a drywall project pre-filled from request + links request → project for cycle time tracking
- Status auto-advances: creating quote project flips request to `quoted`; project approval flips request to `won`; explicit "Mark Lost" flips to `lost`

**Data model:**
- New `drywall_quote_requests` table: id, org_id, customer fields, scope_description, requested_by_date, source, status, created_at, quoted_at, decided_at, quote_project_id (FK)
- Status enum: received | in_progress | quoted | won | lost
- File attachments via existing storage surface

**Prereqs:** None. Independent surface.

**Effort:** Medium — 2-3 sessions. New table + new list/detail surface + intake-to-project conversion.

**Open questions:**
- Where in nav: own route `/drywall/quote-requests` or tab on `/drywall` projects list?
- Source values — exact list (referral / web / repeat / other)?
- Notes/comments on request — needed for scope clarification back-and-forth, or skip V1?
- Minimum required fields to log — probably customer name + contact only, everything else optional?

### Phase D.4 — Margin floor enforcement (30%)

**What ships:**
- Settings surface (extends `/drywall/settings`) gains `margin_floor_target` field (default 0.30)
- v3 Quote stage sidebar gets margin-vs-floor visual treatment (green ≥30%, yellow 25-30%, red <25%)
- When operator marks quote as "Sent" with margin < floor: confirmation dialog with "Send Below Target Margin" requiring a free-text reason
- Below-floor sends logged to a per-project `below_floor_approvals` JSONB field for later KPI #3 attribution

**Data model:**
- Extend org drywall settings with `margin_floor_target: numeric` (default 0.30)
- Add `below_floor_approvals: jsonb` to drywall projects (array of {timestamp, user_id, margin_at_send, reason})

**Prereqs:** None — QuoteTotalsSidebar already computes margin. Just needs the threshold comparison + warning UX.

**Effort:** Small-medium — 1-2 sessions. Settings field + sidebar warning + confirmation dialog.

**Open questions:**
- Which margin definition is the gate — gross routine markup (profit %), net after-overhead, or the "bid profit / bid total" ratio shown in sidebar today? Need to pin one.
- Warning thresholds — confirm green/yellow/red bands (≥30% / 25-30% / <25%)?
- Does this affect PO jobs too? PO bid total is set by customer; margin is whatever it is. Probably show the indicator but skip the block dialog for PO intake.

### Phase D.5 — KPI dashboard (light V1)

**What ships:**
- New route `/drywall/dashboard`
- 4 KPIs surfaced minimally:
  - **#1 Bid Rate** — count of quotes sent in date range
  - **#2 Win Rate at Target Margin** — `won / (won + lost)` % among quotes at/above 30% margin at issuance
  - **#4 Bid-to-Actual Margin Variance** — average |bid_margin − actual_margin| across closed jobs in range
  - **#7 Division Profitability** — sum of final-assessment profit across closed jobs in range
- Date range selector: This Week / This Month / Quarter / YTD / Custom
- Drill-down — click KPI → modal or inline list of contributing jobs
- KPIs 3, 5, 6, 8 deferred to v1.5 (post-launch)

**Data model:**
- No new tables. Aggregation queries across `drywall_projects`, `drywall_quote_requests`, `final_assessments` (from D.1)
- Optional: materialized view for dashboard query perf

**Prereqs:**
- **D.1** for KPI #4 + #7 (Final Assessment data)
- **D.3** for KPI #1 (request → project tracking gives bid-rate denominator)
- **Cross-phase gap (see below)** — quote-send timestamp + bid-total snapshot are not captured today

**Effort:** Medium-large — 2-3 sessions. Read-only surface but cross-table aggregation queries; needs care on perf as data grows.

**Open questions:**
- Drill-down — modal vs separate route?
- Comparison vs target on the dashboard tiles (e.g. "Bid Rate: 12 (target: 15)")? If yes, target values need to be settable per KPI.
- Empty-state UX — what does dashboard show on July 1 when no closed-job data exists yet?
- Aggregation cadence — real-time on page load vs scheduled refresh?

---

## Cross-Phase Prereqs (gaps that span D.1-D.5)

These aren't owned by any single phase but block multiple. Best caught now, addressed in D.1 implementation since that's first.

### Bid total snapshot at quote send

**Problem:** Today v3 quote total is computed dynamically from current state. Final Assessment needs the bid total *as it was at the moment the quote was sent or approved* — otherwise KPI #4 (bid-to-actual variance) measures against a moving target.

**Fix:** Add `bid_total_snapshot: numeric` + `bid_snapshot_at: timestamptz` + `bid_snapshot_payload: jsonb` (full quote totals at send-time) columns to drywall projects. Populated when operator marks "Quote Sent" or PO intake completes. Immutable after.

**Owner:** D.1 implementation (used by D.1's Final Assessment + D.5's KPI #4)

### Quote outcome state machine

**Problem:** Today drywall projects have lifecycle states for the project itself (Project Info → Quote → Field → Order → Complete). They don't clearly capture quote-document outcomes (Drafted → Sent → Approved | Lost). KPIs #1 and #2 need these.

**Fix:** Add `quote_outcome: 'drafted' | 'sent' | 'approved' | 'lost'` + outcome timestamps to drywall projects. Sent timestamp drives KPI #1 numerator. Won/lost outcome drives KPI #2.

**Owner:** D.1 implementation (state machine extension; D.3 lights it up via request→quote→outcome flow)

### Comms Log placement

**Problem:** Decision #13 (light comms log) needs a home on the project page.

**Fix:** Add a "Comms Log" panel inside the **Project Info / Project Details** tab on the drywall project shell. Timestamped append-only entries — operator types a line, auto-stamped with date + author. No edit-history; latest at top.

**Note:** Billing terms (decision #14) is NOT a new field. The existing quote pay-terms field on the quote document already covers it. D.1 doesn't touch this.

**Owner:** D.1 implementation (small UI surface).

**⚠ Open scope change (2026-06-11):** Mark is reconsidering whether comms should stay external (light log) or move in-app (Path II SMS hub). Adds field-worker comms to scope. See "Path II Conceptualization" below.

### Phase D.6 (post-launch) — Schedule integration

- Auto-create schedule entry on approval / PO received
- Field → schedule signal bridge in schedule edit view

### Phase D.7 (post-launch) — Pricing model feedback loop

- Detect catalog rate variance from actuals
- Surface suggested adjustments to Mark

### Phase D.8 (post-launch) — Customer-facing quote request form

- Public web form
- Captures structured intake data
- Feeds the quote request queue

---

## Connections to Existing Work

| Existing | How this plan touches it |
|---|---|
| v3 Quote stage | Extended to support degenerate quote from PO + margin floor warning |
| Order stage | New Production Complete state between Active and Complete |
| Schedule workspace | Future auto-create + signal bridge |
| Payroll | Already feeds labor actuals per project; aggregation query needed for reconciliation |
| QuickBooks integration | Could be used for supplier invoice material capture |
| Drywall workspace shell | Add KPI dashboard route + quote request queue route |
| v3 catalogs | Add `target_margin_floor` field for margin discipline KPI |

---

## What Mark Should Decide Next

Foundational scoping complete. All 20 decisions locked. D.2-D.5 scoped 2026-06-11 (see Suggested Phasing).

**Implementation-blocking opens (need answers before each phase brief):**

- **D.2:** Defaults for PO degenerate quote (5/8" Type X + L4?). Customer sqft = raw or waste-inclusive? PO status = own state or jumps to Scheduled?
- **D.3:** Nav location. Source values list. Notes/comments on request — V1 or skip?
- **D.4:** Which margin definition is the gate (gross routine markup % vs sidebar-shown margin)? Banding thresholds. PO behavior?
- **D.5:** Drill-down UX (modal vs route). Per-tile targets? Empty-state UX. Refresh cadence.

Each phase brief asks these before code starts.

---

## Step 5 — Captured 2026-06-09

Production tracking, customer comms, and billing are answered. See decisions #9-16 in the Locked Decisions table.

**Architectural takeaways:**

- **QuickBooks is the system of record for money in/out.** Material cost actuals, invoice generation, invoice status — all owned by QB. Drywall app sends data TO QB but doesn't own these surfaces.
- **TimeClock + Payroll are the source of truth for labor actuals.** The platform aggregates TimeClock punches × rate during the week to give Mark a projected labor cost; reconciles at payroll period end.
- **Customer comms stay informal.** Phone/text/email handled out-of-platform. A free-text notes log on the project gives Mark personal-records visibility without forcing structured channels.
- **Billing has no V1 standard structure.** Each job's billing terms are captured as free text per project (e.g. "70% after hang / 30% at completion" or "Net 30 at completion"). Platform doesn't enforce a milestone scheme.
- **Production-page focus is narrow:** running cost / margin / current crew. No "% complete" or "days vs planned" — those are visible elsewhere (Schedule workspace handles timing).

---

*End of draft — design not locked. Iterate against this document; lock decisions as Mark refines.*
