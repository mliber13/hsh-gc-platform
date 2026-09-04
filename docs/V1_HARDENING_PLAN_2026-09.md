# HSH Platform — v1 Hardening Audit & Next-Phase Plan

_Compiled 2026-09-03 from six parallel read-only code reviews (quote engine, drywall services, security/RLS, GC side, HR/payroll/crew, platform/infra) plus orchestrator spot-checks. Baseline at HEAD `6796d12`: `tsc --noEmit` clean, 42 test files / 240 tests green, `supabase/pending` reconciled except one file (see P1-SEC-10). File:line references are current as of this date._

**Scope locked with Mark (2026-09-03):** this cycle is **harden + consolidate, surface fixes only**. No structural refactors (v2 quote retirement, `supabaseService` split, hybrid-layer removal, schedule unification, time-clock unification) — those are analysed and queued in §7. GC estimating, budgets/actuals, and project documents are **ACTIVE-CORE** and get fixes; other GC workspaces are assessed for dormancy but not deleted without row-count evidence.

Full per-domain reports (with every finding, table, and line ref) are in `docs/audit-2026-09/` — this document is the synthesis and the plan.

---

## 0. Executive summary

The app is in materially better shape than the April audit: the earlier cleanup runbooks are executed, quote-trust and anon-lockdown batches shipped, push rotation fixed, foreman/comms/supplier work landed. What remains clusters into **four cross-cutting themes**, and almost every high-severity finding is an instance of one of them:

| Theme | What it is | Where it bites |
|---|---|---|
| **T1 — Whole-blob last-writer-wins** | Three JSONB blobs are read → mutated client-side → written back whole, with no version/`updated_at` guard | `projects.metadata` (33 writers + supplier edge fn + 4 RPCs), `pay_periods.payload` (3 independent writers, client-only lock), `org_team` (roster RMW as a payroll side effect) |
| **T2 — Money math drift across surfaces** | The v3 quote sidebar is correct; every *projection* of it (Order-page margin, bid snapshot lines, estimated material/labor, converter) recomputes with a subset of inputs | Order margin ignores component trades; v2→v3 FRP ×32; RC waste/screws; bead sticks dropped; 3 incomplete burden builders |
| **T3 — RLS is org-scoped, not role/assignment-scoped** | Policies gate on org membership; `crew` accounts can read every project's pricing, every employee's pay period, all contacts; and any user can UPDATE their own `profiles` row including `roles[]` | Privilege escalation (Critical), pay-data exposure, quote-token RPCs without expiry |
| **T4 — Fossils with live consequences** | The "offline localStorage mode" dual path is dead in prod but its functions leak through the `@/services` barrel; ~11k LOC of GC code has zero callers; no CI, no error boundary, one 4.55 MB chunk | GC change orders never persist online; "Duplicate project" and "Reset to defaults" are no-ops; a render throw white-screens `/crew` |

**Recommended path:** stop feature work for roughly 6 focused sessions and run the seven batches in §6 in order — security first (T3 has a live escalation path), then money, then data-safety, then GC active-core, then egress/resilience, then the dead-code sweep. Declare v1 at the end of Batch 6. Everything structural waits for the post-v1 window.

---

## 1. P0 — Must fix before calling it v1

Defects that lose data, mis-state money, or escalate privilege. All are CONFIRMED by reading code unless marked SUSPECTED.

### Security

| ID | Finding | Where | Fix | Size |
|---|---|---|---|---|
| **P0-SEC-1** | **Privilege escalation via self-UPDATE on `profiles`.** Policy "Users can update own profile" is `USING (auth.uid() = id AND is_user_active())` with no column restriction, no BEFORE UPDATE trigger, no column REVOKE. `roles[]` is only CHECK-constrained to allowed values. Any authenticated user (a crew invite is enough) can `update profiles set roles='{owner}', can_run_payroll=true, is_field_foreman=true, linked_employee_id='<someone else>'` via PostgREST. | `20260425_a5c2_pilot.sql:82-83`; `20260527000002` (roles), `20260616130000` (linked_*), `20260728121344` (is_field_foreman) | Migration: BEFORE UPDATE trigger on `profiles` that raises unless `user_is_rbac_owner()`/`user_is_admin()` when any of `role, roles, can_run_payroll, is_field_foreman, organization_id(_uuid), linked_employee_id, linked_contractor_id, hr_person_id, hr_person_type, is_active` changes. Keep self-update for name/avatar/theme. Verify live with an anon+crew smoke. | S |
| **P0-SEC-2** | **Crew can read org-wide sensitive tables directly.** `roles=['crew']` accounts pass every `ORG ACT` SELECT policy: `projects` (full `metadata` — quotes, margins, comms, takeoffs), `schedule_items` (all projects; assignment filter is client-side), `pay_periods` (linked person receives the **entire payload** — everyone's pay — via the `OR pay_period_includes_linked_person` clause), `contacts`/partner tables, `labor_entries`/`material_entries`, `org_drywall_catalogs` (rates, margin floor), `estimates`. | Review C §A.1 | (a) `pay_periods`: drop the linked-person OR clause; crew reads only via `get_my_paystub_entries`/`list_my_paystubs` (already exist). (b) `projects`/`schedule_items` SELECT: add `AND (NOT user_has_crew_role() OR user_can_edit() OR crew_is_assigned_to_project(id))` — the crew app already fetches only assigned projects (`crewWorkspaceService.ts:442,554`) so this is a no-op for legitimate use. (c) `contacts`, `*_entries`, `estimates`, catalogs: exclude pure-crew (`user_has_crew_role() AND NOT user_can_edit()`); crew materials come from `metadata` + catalog RPC — verify `user_can_read_drywall_catalogs()` still admits crew for the fields it needs, or move the crew catalog read behind an RPC that returns only rates. | M |
| **P0-SEC-4** | **Two edge functions accept calls with no user check.** `send-quote-email` (sends from the company Resend account) and `deal-coach-chat` (spends the Anthropic key) never call `auth.getUser` — anyone holding the public anon key can invoke them. | `supabase/functions/send-quote-email/index.ts`; `deal-coach-chat/index.ts` | `requireUser(req)` in both (every other user-triggered function already does this), or delete `send-quote-email` with the RFQ chain. | S |
| **P0-SEC-3** | Vendor-quote token RPCs: `get_quote_request_by_token` has no `expires_at` check and performs an anon UPDATE side effect; `submit_vendor_quote` has no expiry/status check → unlimited resubmits, unbounded `p_line_items`. **The whole RFQ chain is dead by construction** (no UI creates `quote_requests` since 2026-02-26) — so the cheapest fix is removal (see P2-DEL-3). If kept: add expiry + status guards. | `20260730120000_anon_lockdown_rpcs.sql:55,85`; `QuoteRequestForm.tsx` unreferenced | Decision item (§8 Q2). Default: remove chain + RPCs + route + edge fn `send-quote-email` callers. | S |

### Data safety (T1)

| ID | Finding | Where | Fix | Size |
|---|---|---|---|---|
| **P0-DATA-1** | **Lost update on `projects.metadata`.** `persistLegacyMetadata` spreads a client-held `prevLegacy` and writes the whole blob with no guard. Reachable today: operator opens Order page → supplier confirms via share link (edge fn rewrites `legacy.orders`) → operator clicks Save → confirmation reverted. Same shape drops crew comms entries posted via RPC while an operator saves anything; two operator tabs → last save wins for all sub-keys. | `drywallProjectsService.ts:651-687` (+ `updateDrywallProjectInfo` L485-539 own copy, `updateDrywallProjectPoData` L2202); `supplier-order-share/index.ts:115-153` | (a) `loadProjectLegacyForMerge` returns `updated_at`; `persistLegacyMetadata` does `.eq('updated_at', loadedAt)` and throws a typed "changed elsewhere — reload" error on 0 rows; surface in the four stage Save handlers. (b) Supplier edge fn writes with `jsonb_set(metadata, '{legacy,orders}', …)` in one UPDATE, not read-replace. (c) Later (§7): comms out of the blob. | S |
| **P0-DATA-2** | **Payroll last-writer-wins + client-only lock.** `savePayPeriod` is a plain upsert used by the editor, `LaborAssignmentAudit` (writes from its own cached `periods[]`; never refreshes `PayrollPage.runs`), and `LaborBreakdownModal`. RLS has no lock check. Concrete: reassign a line in the audit tab, Save in the Run tab → reassignment lost. `handleToggleLock` writes the stored run under an open dirty draft. | `hrPayrollService.ts:229`; `PayrollRunTab.tsx:269-339`; `drywallLaborAuditService.ts:582-740`; RLS `20260528000001:321-334` | New `save_pay_period(p_id, p_payload, p_expected_updated_at)` SECURITY DEFINER RPC: rejects when `locked` (unless the call is the unlock itself) or when `updated_at` differs; route all three writers through it; refresh `runs` after audit/modal writes; block Save when loaded run is behind. | M |
| **P0-DATA-3** | **Silent pay loss on time-clock import.** Import creates draft entries keyed by punch `person_id`; `buildRunPayloadFromDraft` only retains roster (+archived) people, so hours for a stale/orphan linked id are dropped from the saved payload with a success toast. | `PayrollPage.tsx:659-737, 427-477` | Refuse (toast + list) import rows whose `person_id` is not on the roster; surface orphan ids on `CrewAccountsPage`. Write the red test first. | S |
| **P0-DATA-4** | **Schedule cascade persistence swallows errors and writes every row.** `persistCascadedDates` fires N parallel updates, never reads `.error`, and writes all items not just `result.changes` → half-cascaded schedule with a success toast. | `scheduleService.ts:420-434, 455` | Collect results, throw on first error; write only `changes`. (Foreman path already has `foreman_apply_schedule_changes`; consider one RPC for the operator path too.) | S |
| **P0-DATA-5** | **Deprecated lifecycle shortcuts are live.** Order tab "Mark project complete" jumps `order→closed` with no guard and no `productionCompletedAt`, so the job vanishes from Financials/Labor/Estimating analytics; Reopen goes `closed→order` leaving timestamps; list pill allows any→any. | `OrderPage.tsx:367` → `drywallProjectsService.ts:1486`; `ReopenProjectConfirmDialog.tsx:35` → L1504; `DrywallProjectsListPage.tsx:159` | Delete both `@deprecated` fns; Order tab button → "Start production"; constrain list pill to the guarded one-step transitions. **Product decision:** this changes closeout behaviour on the Order tab (§8 Q4). | S |

### Money (T2)

| ID | Finding | Where | Fix | Size |
|---|---|---|---|---|
| **P0-MONEY-1** | **Order-page margin ignores every non-drywall trade on v3 quotes.** `projectV3QuoteToV2Shape` sums direct cost from `drywallLines` only, then attaches whole-quote OH/profit/tax and `finalTotal = acceptedTotal`. A $40k drywall + $25k metal stud + $10k RC job shows ~45% margin at ~$40k direct cost; the D.4 margin-floor gate on the Order page is blind to exactly the component-heavy Togal-import jobs being added now. Also omits `allocatedBeadSticks`. | `projectV3QuoteToV2Shape.ts:65-100`; `orderFinancialComparison.ts:158-171` | Read `routine.materialSubtotal + accessoriesSubtotal`, `hanger+finisher+componentLabor+cleanup`, `routine.markupBase` from `QuoteV3MarkupBreakdown` instead of recomputing; net accepted alternates via `summary.breakdown.*`. Add the cross-surface invariant test (§5 T1). | S |
| **P0-MONEY-2** | **v2→v3 FRP conversion multiplies material ~32×.** Converter puts v2's $/sheet `frpSheetRate` on a per-sqft line and drops adhesive/division-bar/corner/J-mold sticks. Parity fixtures contain no FRP (or RC) project, so the "$0.00 parity" never exercised it. | `convertQuoteV2ToV3.ts:270-283` | `custom_material_rate = calc.frpMaterialCost / frpSqft` (blended, like insulation L180-187). Add FRP fixture. | S |
| **P0-MONEY-3** | **v2→v3 RC channel conversion silently adds 10% waste and screw boxes.** Converter sets neither `waste_pct` (v3 default 10 vs v2 default 0) nor `accessories_in_material_rate`; labor formula also shifts. | `convertQuoteV2ToV3.ts:155-169`; `quoteV3Math.ts:274,286` | `waste_pct: parseNum(v2.rcChannelWastePercentage, 0)`, `accessories_in_material_rate: true`. Add RC fixture. | S |

### GC active-core (T4)

| ID | Finding | Where | Fix | Size |
|---|---|---|---|---|
| **P0-GC-1** | **GC change orders never persist for online users.** `ChangeOrders.tsx` imports `updateProject` from `@/services` → `projectService.updateProject` (synchronous localStorage). Page always loads empty online; save writes to `localStorage['hsh_gc_projects']`; `ProjectActuals` CO rollup is therefore always $0. The `change_orders` table has no app writer. | `ChangeOrders.tsx:11,78,101`; `services/index.ts:12`; `projectService.ts:94` | New `changeOrderService.ts` writing `change_orders` (RLS exists); load in `ChangeOrders.tsx` and `ProjectActuals.tsx:199`. | S/M |
| **P0-GC-2** | **Backup export cross-org fall-through.** `orgFilter` falls through to unfiltered `select('*')` when `organizationId` is null/non-UUID; reachable from the sidebar "Backup Data". | `backupService.ts:89-98`; `SidebarUserMenu.tsx:88` | Throw if org is not a UUID. | S |

### Resilience

| ID | Finding | Where | Fix | Size |
|---|---|---|---|---|
| **P0-INFRA-1** | **No error boundary anywhere.** One render throw = white screen, including `/crew` on a phone. | `grep ErrorBoundary src` = 0 | One global boundary (reload + copy error) and one around `/crew` and each workspace layout. | S |

---

## 2. P1 — Should fix this cycle

### Security & access (finish T3)

| ID | Finding | Where | Fix | Size |
|---|---|---|---|---|
| P1-SEC-1 | Core definer helpers without `SET search_path`: `is_user_active`, `get_user_role`, `user_can_edit`, `user_is_admin`, `handle_new_user`, `get_form_completion_percentage`, `is_form_fully_signed_off`. Note `user_can_edit()` does not check `is_active`. | `20000201000000:250-270`; `20260429000002:271-286`; `007:175,198` | One migration re-creating them with `SET search_path = public` and `is_active` in `user_can_edit`. | S |
| P1-SEC-2 | `append_drywall_comms_log_entry` trusts client-supplied `p_author`, `p_author_user_id`, `p_author_role` → author spoofing. | `20260617130000:74` | Derive author from `auth.uid()` server-side; ignore the params. | S |
| P1-SEC-3 | `consume_crew_invite_token` overwrites an existing full-app user's `roles` → `['crew']` if they consume a link (email match only if `invited_email` set). | `20260616130000:87` | Refuse when caller already has non-crew roles. | S |
| P1-SEC-4 | `organizations` table is not created by any migration (dashboard object); prior audit found it anon-readable. `unsynced_qb_entries` view lacks `security_invoker`, unused by app. **SUSPECTED — needs live check.** | `20000301000000:42` | Verify via `scripts/supabase-audit-recon.mjs`; add RLS to `organizations`; drop the view. | S |
| P1-SEC-5 | `next_drywall_quote_number(p_org)`/`next_client_quote_number(p_org)` trust the passed org (single-org today). `display_name(s)_for_user` resolve any uid cross-org. `push_subscriptions.organization_id` client-supplied, unchecked. `sow_templates` DELETE lets any org user delete system templates. **Add (found 2026-09-04):** `comms_user_is_office(uid)` takes an explicit uid, so an anon caller who already knows a user's UUID can read back whether that person is office/foreman. No message content is reachable, and the `anon=X` grant comes from the schema-wide `ALTER DEFAULT PRIVILEGES`, not from the migration — but the whole family should be `REVOKE … FROM anon`. | various (Review C §A.4); `20260904120000_project_comms_lanes.sql:75` | Check `p_org = get_user_organization_uuid()`; scope names to org; derive push org server-side; restrict system-template delete to admin; revoke anon on the uid-taking predicates. Bundle into one migration. | S |
| P1-SEC-6 | `drywall-field-photos` storage: crew SELECT/DELETE is org-wide, not assignment-scoped. `quote-attachments`/`quote-documents` buckets public (by design for the dead vendor chain — moot if P2-DEL-3). | `20260626120000`, `20260627130000`, `017` | Path-scope crew delete to assigned projects; make quote buckets private when the chain is removed. | S |
| P1-SEC-7 | `crew_clock_in/out`, `foreman_*` RPCs skip `is_user_active`; `crew_clock_in/out` use `COALESCE(linked_employee_id, linked_contractor_id)` (empty-string shadows contractor id). | `20260716210000:11,90`; `20260805120000` | Add `is_user_active()`; `NULLIF(linked_employee_id,'')`. | S |
| P1-SEC-8 | No security headers on Vercel: public share pages (`/quote/:token`, `/customer/:token`, `/supplier/:token`) are clickjackable; no `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. | `vercel.json` | Add headers; `frame-ancestors 'none'`; explicit `immutable` for `/assets/*`. | S |
| P1-SEC-9 | Two parallel role systems: legacy `profiles.role` (admin/editor/viewer → `user_can_edit`) gates ~40 tables' writes; `profiles.roles[]` gates HR/drywall/crew. Client effective role = `roles[0]`; SQL helpers use `&&`/`ANY` — a `['crew','office_drywall']` profile is crew in the UI, operator in SQL. | `rbac.ts:99-107`; Review C §A | Document as a rule for now (CLAUDE.md); RBAC Phase 3 reconciliation stays deferred. Make `deriveEffectiveRole` pick the highest-privilege role rather than index 0. | S |
| P1-SEC-11 | Write policies gated on org membership only (no `user_can_edit`): `sub_items`, `project_documents`, `selection_*`, `deals*`, `tenant_pipeline_prospects`, `org_holidays`, `subcontractor_unavailability`, `communication_log_entries`, `trade_categories` — a `viewer` or crew account can insert/update/delete. | Review C §A.1 | One migration adding the `EDIT` predicate to those write policies. | S |
| P1-SEC-12 | Two archived smoke scripts embed the anon JWT literally (`scripts/a5c2-c1-smoke.mjs:13`, `a5c2-c2-smoke.mjs:16`). Anon key is public by design; no service-role or third-party secrets were found in `src/`, `scripts/`, or functions. | as listed | Read from env; archive the scripts. | S |
| P1-SEC-10 | `supabase/pending/20260730120100_anon_lockdown_drop_policies.sql` still staged although memory says Batch A Part B was applied via MCP on 2026-07-30 (and the migrations dir has the same file). Reconcile so `pending/` is empty or truthful. | `supabase/pending/` | Verify against remote; delete the staged copy. | S |

### Money consistency (finish T2)

| ID | Finding | Where | Fix | Size |
|---|---|---|---|---|
| P1-MONEY-1 | Three incomplete copies of the labor-burden option builder (omit project hanger/finisher rates and/or bead sticks) → bid-snapshot per-line totals, estimated labor, and Order projection drift from the sidebar. | `bidSnapshot.ts:25`, `estimatedLabor.ts:113`, `projectV3QuoteToV2Shape.ts:58` vs `quoteV3Math.ts:687` | Export one `laborBurdenFromQuote`; use everywhere. | S |
| P1-MONEY-2 | Estimated material (project cost tiles, KPI aggregate) omits bead-stick accessories (corner bead LF, extra mud). | `estimatedMaterial.ts:312`; consumers `drywallProjectCostService.ts:369`, `drywallDivisionAggregateService.ts:299` | Use `lineDirectCostsFromLines(..., quote.bead_sticks).byTrade`. | S |
| P1-MONEY-3 | Alternates never carry cleanup labor (deduct alternate lowers sqft but not prep/clean). Margin-floor cost basis differs by surface (v3 stage includes sales tax; `marginFloor.computeQuoteEstimatedCost` excludes it); `QuoteOutcomeBar` gets base total, snapshot stores `acceptedTotal` → a selected deduct alternate is invisible to the below-floor gate. | `quoteV3Math.ts:746-755`; `QuoteStageV3.tsx:222-226`; `marginFloor.ts:51-53` | Decide alternate cleanup semantics (§8 Q3); one cost-basis helper; pass `acceptedTotal` to the outcome bar. | S |
| P1-MONEY-4 | Metal-stud labor rate resolves two ways (engine: size×gauge; rate cell/tooltip: `catalog_id`, never set) → cell shows $0.00 while the line prices at $12/LF. Component tooltip formula omits waste × burden. | `quoteV3Math.ts:400-403`; `quoteV3CatalogResolve.ts:133-134`; `quoteV3LineAmountTooltips.ts:90` | Single `getEffectiveComponentLaborRate(line)`; tooltip reproduces `computed.laborTotal`. | S |
| P1-MONEY-5 | Typing any material rate on a grid/acoustic/metal-stud line silently switches to the blended "converted" branch (itemization disappears, no warning). | `quoteV3CatalogResolve.ts:264-268`; `quoteV3Math.ts:309/356/405` | Gate blended branch on the migration override reason or an explicit lump-sum toggle. | S |
| P1-MONEY-6 | Labor for insulation/FRP/door_install is multiplied by material waste (10% waste on doors pays 10% more install labor). | `quoteV3Math.ts:457-460` | Decide per trade; doors at minimum should not. | S |
| P1-MONEY-7 | GC: `project_actuals` has no UNIQUE on `project_id`; SELECT-then-INSERT races create duplicate rows and `limit(1)` hides half the entries (also affects drywall cost reads). | `supabaseService.ts:2495-2540`; `001_initial_schema.sql:202-219` | Unique index + upsert. | S |
| P1-MONEY-8 | Payroll: overtime defaults to straight time (40h cap computes `asOT` but multiplier is 1 unless manually flagged; imports set `'regular'`). Compliance exposure for W2 hourly. | `payrollMath.ts:301-330, 783`; `PayrollPage.tsx:699` | Default hours beyond 40 to 1.5× for W2 hourly on import/add, operator override. **Decision §8 Q5.** | S |
| P1-MONEY-9 | Crew phone and payroll disagree on piece-pay sqft (crew adds accepted change-order sqft; payroll default uses field-measured only). | `crewWorkspaceService.ts:880-889` vs `PayrollPage.tsx:670` | Shared `crewPayBasis.ts` resolver used by both. | M |

### Dates & timezones (same class as the Aug fixes, still open)

| ID | Finding | Where | Fix | Size |
|---|---|---|---|---|
| P1-DATE-1 | "Today" = UTC date at 5 sites (after ~8 PM ET the default start date / production-ready cutoff is tomorrow). 8 local-midnight→`toISOString().slice` sites in schedule code work only in negative-UTC offsets. | `ScheduleItemDialog.tsx:161`, `TimeOffManagerSheet.tsx:56`, `GenerateStandardScheduleDialog.tsx:31`, `productionReadyService.ts:40`, `scheduleService.ts:371`; `ScheduleItemDialog.tsx:215-444`, `scheduleService.ts:426`, `scheduleDateMath.ts:44,52`; `TimeClockPage.tsx:60-63` | One `todayKey()` / `toDateKey()` helper; run schedule tests under `TZ=Europe/Berlin`. | S |
| P1-DATE-2 | Time-clock range query `'${from}T00:00:00'` (no zone) against `timestamptz` under a UTC session → evening punches after 8 PM local fall into next week's import. | `hrTimeService.ts:176-177` | Explicit local-zone bounds or an RPC comparing `(clock_in AT TIME ZONE 'America/New_York')::date`. | S |
| P1-DATE-3 | No max punch duration: forgotten Friday clock-out → 60h entry imported into payroll without a flag; crew can clock in to any project ever assigned. | `crew_clock_in` `20260716210000:50-58`; `hrTimeService.ts:191, 216-236` | Reject/flag open punches older than N hours; require a current assignment. | S |

### People-data integrity

| ID | Finding | Where | Fix | Size |
|---|---|---|---|---|
| P1-HR-1 | Banked hours are a whole-roster RMW as a side effect of payroll save; an open Team page save restores pre-payroll balances; the `Math.max(0,…)` clamp makes delete-reversal non-invertible. | `hrPayrollService.ts:160-208`; `TeamPage.tsx:137` | Move the delta into the P0-DATA-2 RPC with a `jsonb_set` on the single member (or derive balances from pay_periods). | M |
| P1-HR-2 | Linkage drift has no operator remedy: nothing in src writes `linked_*`; deleting + re-adding a team member orphans the crew profile (blank materials/pay, punches under a dead id → P0-DATA-3). `updateHrPersonLink` has zero callers; `TimeClockPage` "Visit Team" dead-ends. | `CrewAccountsPage.tsx`; `TeamPage.tsx:115-131`; `userService.ts:204` | Operator "Link / re-link account" action on `CrewAccountsPage` (writes `linked_*` + `hr_person_*`); guard Team delete on active links. | M |
| P1-HR-3 | Tool repayment deducts `weeklyAmount` every run forever; nothing writes `amountPaid`. `bankedHoursUsed` not validated against balance. | `payrollMath.ts:57-68, 375` | Accumulate `amountPaid` on save; validate overdraw. | S |
| P1-HR-4 | `PayrollPage` has no unsaved-work guard → PWA auto-reload on deploy loses an in-progress run. | `main.tsx:17-23`; `lib/unsavedWork.ts` used only by `CrewMeasurePage` | `setUnsavedWork('payroll', isDirty)` + `beforeunload`. | S |

### Egress / performance (finish the July work)

| ID | Finding | Where | Fix | Size |
|---|---|---|---|---|
| P1-EGRESS-1 | Production/Closeout assessment fans out: ~7 full-blob project reads **plus 3× `fetchPayPeriods()` (all payroll JSON) and 3× `fetchTeam()`** per visit. Order page = 6 blob reads. | `drywallProjectCostService.ts:396-420`; `drywallLaborService.ts:100-118`; `OrderPage.tsx:94-102` | Load periods/team/project once and split windows in memory (`splitLaborByProductionWindow` exists). Shell loads the project once and exposes `{project, reload}` via outlet context; pages derive sub-records with the existing sync helpers. | M |
| P1-EGRESS-2 | Dashboard execution is an N+1 `fetchDrywallProjectById` over every active project just to run `estimateCostsForQuote`. | `drywallDivisionAggregateService.ts:707-709, 261` | Denormalize `estMaterial`/`estLabor` at `markQuoteSent`/`Approved` next to `finalTotal`; read list scalars. | M |
| P1-EGRESS-3 | Scalar-only readers still selecting full `metadata`: `scheduleService.fetchPortfolioProjects` L83 (reads `app_scope`), `drywallLaborAuditService` L219 (uses `id`), `crewWorkspaceService` L442/L554 (list + calendar, every assigned project), `DrywallProjectShell` L56. | as listed | JSON-path projections (`metadata->'app_scope'`, `->'legacy'->'quote'->>'outcome'`, `->'fieldTakeoff'->>'reviewStatus'`) or a scalars view. | S |
| P1-EGRESS-4 | `markQuoteSent` does three full reads per send; `persistLegacyMetadata` runs a `count` on `estimates` every save (3 round trips). | `drywallProjectsService.ts:1854-1893, 661-664` | Thread `prevLegacy`; derive GC wrapper from `metadata.visibility`/`app_scope`. | S |
| P1-EGRESS-5 | `refreshQuoteV3FromSnapshot`/`revertQuoteToV2` archive the entire previous quote under a timestamp key every call — the same bloat class cleaned 2026-07-21, re-created. | `drywallProjectsService.ts:844, 882` | Cap to one archive entry. | S |
| P1-EGRESS-6 | Public customer share page polls every 20 s from an anonymous link; `CustomerCommsCard` 20 s. | `CustomerSchedulePage.tsx:216`; `CustomerCommsCard.tsx:93` | 60–120 s + visibility gate. | S |
| P1-EGRESS-7 | Project documents upload: no size cap, no server mime check, `storage.listBuckets()` + alternate-bucket probe on **every** upload. 200 MB print sets can land in Supabase storage (the egress-incident class). Same gap in `PlanEditor`. | `supabaseService.ts:4226-4295`; `ProjectDocuments.tsx:278` | 25 MB cap + allowlist; delete the probe. (Drive-link for prints stays the P2 design.) | S |

### GC active-core polish

| ID | Finding | Where | Fix | Size |
|---|---|---|---|---|
| P1-GC-1 | `actualsHybridService` falls back to localStorage with `console.warn` on any DB failure → entry appears, gone on reload. | `actualsHybridService.ts:46-193` | Toast + rethrow; no LS write. | S |
| P1-GC-2 | QB import name-match fallback assigns transactions to the wrong job when two projects share a name. | `QuickBooksImport.tsx:369-372, 426-428` | Require explicit selection on ambiguous match. | S |
| P1-GC-3 | "Duplicate project" (localStorage only, toasts success, creates nothing) and ItemLibrary "Reset to defaults" (scary confirm, then no-op online). | `ProjectDetailView.tsx:381`; `ItemLibrary.tsx:123-128` | Hide both (or implement duplicate in DB). | S |
| P1-GC-4 | `EstimateBuilder` N+1 sub-item fetch per trade on load. | `EstimateBuilder.tsx:187-193` | Batch by `trade_id IN (...)`. | S |
| P1-GC-5 | `VarianceReport.tsx` has zero importers — the 2026-07-29 P0-7 fix landed in dead code; the live variance is `PrintableReport`. `ImportEstimate` (Excel import) is not routed — **confirm with Mark whether Excel import is used** (§8 Q1). | `VarianceReport.tsx`; `ImportEstimate.tsx` | Delete VarianceReport; route or delete ImportEstimate. | S |

### Quality infrastructure

| ID | Finding | Fix | Size |
|---|---|---|---|
| P1-QA-1 | No CI: `.github/`, eslint, prettier, hooks all absent; tests never run automatically; two AI agents commit to `master`. | One GitHub Actions workflow: `npm ci` → `tsc --noEmit` → `vitest run` → `vite build`. Make it required on `master`. Add `lint`/`typecheck` scripts + ESLint flat config (the 6 `eslint-disable` comments already assume it). | S–M |
| P1-QA-2 | `supabase db reset` from scratch is impossible: `org_team`, `project_events`, `work_packages`, `pay_periods`, `time_entries`, `project_milestones` have no `CREATE TABLE` in any migration; RPC `increment_use_count` is called but never defined. | Baseline migration (dump live DDL for the orphans) placed before `20260427000009`; define or remove `increment_use_count`. | M |
| P1-QA-3 | Edge functions: `qb-find-vendor` is invoked (`quickbooksService.ts:263`) but has no source in the repo; three empty function dirs (`accept-invitation`, `invite-user`, `qb-suggest-allocation`); no `supabase/config.toml` (per-function `verify_jwt` is Dashboard-only state); `std@0.168.0` + unpinned `supabase-js@2` in all 23. | Recover `qb-find-vendor` source from Dashboard or remove the call; delete empty dirs; add `config.toml` + `deno.json` import map. | S |

---

## 3. P2 — Cleanup & consolidation (no behaviour change)

### Safe deletions (verified zero callers; one commit per row so revert stays surgical)

| ID | What | LOC | Cascades |
|---|---|---|---|
| P2-DEL-1 | `ProFormaGenerator.tsx` (DealWorkspace absorbed it 2026-04-20) | 5,149 | `proformaSummaryService.ts` (168); 5 project-proforma fns in `supabaseService.ts:3332-4217` |
| P2-DEL-2 | `DealDocuments.tsx` | 671 | `supabaseService.ts:4661-5069` (~410) |
| P2-DEL-3 | Vendor RFQ chain: `QuoteReviewDashboard.tsx` (1,146), `QuoteRequestForm.tsx` (686), 8 quote `_Hybrid` wrappers, `quoteService` creator paths, `VendorQuotePortal` + `/vendor-quote/:token` + `/quote/:token` routes, `get_quote_request_by_token`/`submit_vendor_quote` RPCs, `send-quote-email` edge fn. **Decision §8 Q2.** | ~3,000 | closes P0-SEC-3 and the two public buckets |
| P2-DEL-4 | `ProjectMilestonesSection.tsx`, `WorkPackagesSection.tsx` | 700 | 8 hybrid wrappers, `supabaseService.ts:871-1174` (~300), 2 type files, 2 tables |
| P2-DEL-5 | `VarianceReport.tsx`, `FeedbackManagement.tsx`, `formService.ts`, `src/scripts/*` (2 one-off migrations, 34 of the 93 `console.log`s), `supabaseService` `fetchProjects`/`deleteQuotePDF`/`getQuotePDFSignedUrl` | ~1,500 | — |
| P2-DEL-6 | Drywall quote: `drywallScopeRevenue.ts` (+test), `applyProjectMarkup`/`enrichLineWithComputed`/`enrichQuoteAlternates`, accessory rollup + `routine.accessoryByCategory` (computed every keystroke, never read), `computed_*` line fields, `DrywallQuoteTotals`, `quoteV3Feature` | ~400 | — |
| P2-DEL-7 | Drywall services: `emptyDivisionExecutionRollUp`, `fetchDivisionMarginRollUp`, `buildDivisionMarginJob`; `drywallLaborEntryEditService` (duplicate of the audit service's reassign/retag with a weaker staleness check — point `LaborBreakdownModal` at the audit service) | ~250 | — |
| P2-DEL-8 | HR: paystub RPC wrappers (`fetchMyPaystubs`, `fetchMyPaystubEntries` — never wired to a page), `updateHrPersonLink`, ~25 unused exports in `payrollMath`/`hrTeamUtils`/`payrollPieceKeys`/`crewWorkspaceService` | ~300 | — |
| P2-DEL-9 | `dealService.convertDealToProjects`, `backupService.restoreFromBackup` ("coming soon", uncalled) | ~70 | or wire them — decision |
| P2-DEL-10 | Unused deps: `@radix-ui/react-checkbox`, `@radix-ui/react-toast`, `@types/uuid`, `workbox-window`; root `deno.lock`; empty edge-fn dirs; `send-deal-document-share/index-standalone.ts`; `docs/QBO_PASTE_QB_GET_JOB_TRANSACTIONS.ts` | — | — |

Total: **~11k LOC of GC + ~1k of drywall/HR** removable with zero behaviour change (~23% of top-level GC code).

### Repo & docs hygiene (one afternoon)

- Delete the 30 stale Oct-2025 root runbooks, 3 QR-code docs, business `.txt/.docx/.zip` + `docx_extract/`, `figmasrc.zip`, `styles/`, `clear-projects.html`, `fix_rls_policies.sql`, `item_templates_import.csv`, `agent-tools-migration-payload.json`. Git history keeps them.
- Move the 6 implementation briefs (`FIELD_FOREMAN_ROLE_BRIEF`, `SCHEDULE_CHANGE_LOG_BRIEF`, `PUSH_NOTIFICATIONS_BRIEF`, `QUOTE_TRUST_BATCH_BRIEF`, `SUSPENDED_GRID_V3_PORT_BRIEF`, `DOOR_INSTALL_IMPLEMENTATION_BRIEF`) to `docs/briefs/`.
- `docs/` → `docs/{ops,history,ideas,briefs,audit-2026-09}` + `docs/INDEX.md` (≤60 lines). Full bucket list in Review F §4.
- Write root `CLAUDE.md` (~80 lines: commands, architecture map, conventions, gotchas — outline in Review F §4).
- `git rm -r --cached supabase/.temp` + gitignore; gitignore `scripts/.*.tmp.json`; track `.claude/launch.json`; move `scripts/push-spike/` and the one-off A5/parity scripts to `scripts/archive/`; locate `payroll-recovery-scratch/` (referenced in memory, not in repo) and check the tools in under `scripts/maintenance/` minus data.
- Trim `package.json` metadata (`"main": "postcss.config.js"`, ISC licence); drop the two redundant `vercel.json` rewrites.
- Resize the three 158 KB PWA/logo PNGs; drop Cyrillic/Latin-ext font subsets from precache.

### Consolidations that are safe this cycle (small, local)

| ID | What | Size |
|---|---|---|
| P2-CON-1 | `todayKey()`/`toDateKey()`/`dateInput` helpers replacing the duplicated date code in Production/Closeout pages and the 13 sites in P1-DATE-1 | S |
| P2-CON-2 | One `laborBurdenFromQuote` (P1-MONEY-1); one `rcChannelGeometry(line, catalogs)` replacing 3 RC LF copies; UI reads `gridBreakdown`/`acousticBreakdown` from `computeLineItem` instead of recomputing | S |
| P2-CON-3 | `requireOnline(msg)` helper replacing 37 inline `isOnlineMode()` guards in `drywallProjectsService`; use `parseQuoteRecord`/`parseTakeoffRecord` at the 10 inline extraction sites | S |
| P2-CON-4 | Dedupe `isRlsOrPermissionError` ×4, `personKey` ×3, `fetchMyOpenPunch` ×2, photo-thumb component ×2, pull-to-refresh JSX ×3 | S |
| P2-CON-5 | GC schedule: gate the per-project `ScheduleBuilder` owner-only like the portfolio already is (`rbac.ts:39-42`). **Correction to `GC_WORKSPACE_LESSONS.md`:** GC does *not* write a JSONB schedule blob — both sides read/write the relational `schedule_items` table since `20260507000002`; the "dual-storage" risk is a non-issue. Residual: GC's delete-then-upsert rewrites every row per save. | S |
| P2-CON-6 | Mount the existing `ProjectDocuments` in the drywall project shell (same table, one UI) — the cheap half of the P2 "job documents" idea | S |

### Dormancy pass (needs live row counts before acting)

Run once via Cursor MCP, then gate anything with no rows since June behind owner-only in `rbac.ts`/`moduleItems`:

```sql
select 'deals' t, count(*) c, max(updated_at) last from deals where updated_at > '2026-06-01'
union all select 'deal_proforma_versions', count(*), max(created_at) from deal_proforma_versions where created_at > '2026-06-01'
union all select 'tenant_pipeline_prospects', count(*), max(updated_at) from tenant_pipeline_prospects where updated_at > '2026-06-01'
union all select 'selection_books', count(*), max(updated_at) from selection_books where updated_at > '2026-06-01'
union all select 'selection_schedule_versions', count(*), max(created_at) from selection_schedule_versions
union all select 'client_quotes', count(*), max(updated_at) from client_quotes
union all select 'project_forms', count(*), max(created_at) from project_forms where created_at > '2026-06-01'
union all select 'sow_templates', count(*), max(updated_at) from sow_templates
union all select 'quote_requests', count(*), max(created_at) from quote_requests where created_at > '2026-03-01'
union all select 'meeting_submissions', count(*), max(created_at) from meeting_submissions where created_at > '2026-07-01'
union all select 'plans_used', count(*), max(created_at) from projects where plan_id is not null and created_at > '2026-06-01';
```

`SelectionSchedules` (0 rows in April) is the standing delete candidate from `FEATURE_CLEANUP.md` 3b.

---

## 4. Corrections to prior docs / memory

- `GC_WORKSPACE_LESSONS.md` §0: GC schedule is relational, not JSONB (see P2-CON-5). Unification is not needed; per-item saves are the real residual.
- `VERSION_1_5_ROADMAP.md`: P0-7 "fake numbers in reports" was fixed in `VarianceReport.tsx`, which is unreachable — the live surface is `PrintableReport`. `excelParser` half of that fix is likewise in the unrouted `ImportEstimate` path.
- Memory `drywall_kpi_dashboard`: `drywallScopeRevenue.ts` is now dead (zero callers) — revenue-per-sqft no longer uses it.
- Memory `supabase_security_batch_a`: the anon lockdown is in `supabase/migrations`; `supabase/pending/` still holds a stale copy.
- `scan-drywall-quotes.mjs` / `payroll-recovery-scratch/` referenced in memory are not in the repo.

---

## 5. Tests to add (money math + data safety first)

| # | Test | Pins |
|---|---|---|
| T1 | **Cross-surface totals invariant**: fixture quote with all 8 trades + bead sticks + one deduct alternate → `computeQuoteV3Totals().routine.total` == bid snapshot `bidTotal` == Σ PDF sell rows == `projectV3QuoteToV2Shape().calculations.finalTotal`; snapshot line sum == `linesSubtotal` | P0-MONEY-1, P1-MONEY-1/2 |
| T2 | Converter parity for RC (waste 0) and FRP → v3 `byTrade` within $0.01 of v2 `calc.*`; add both fixtures to `quote-v3-parity-fixtures.json` | P0-MONEY-2/3 |
| T3 | Alternates netting: deduct 1,000 sqft → `acceptedTotal`, `acceptedSqft`, cleanup per §8 Q3 | P1-MONEY-3 |
| T4 | Order-page margin on a mixed-trade v3 quote ≈ org target (currently fails) | P0-MONEY-1 |
| T5 | Component labor rate resolution + tooltip reproduces `computed.laborTotal` for every trade | P1-MONEY-4 |
| T6 | Lifecycle transition table: every `mark*/revert*` × every starting status → status + timestamps | P0-DATA-5 |
| T7 | `persistLegacyMetadata`: sibling keys + GC wrapper preserved; stale `updated_at` rejected; `saveOrderStageSnapshot` keeps DB `supplierConfirmedAt/status` that post-date the client snapshot | P0-DATA-1 |
| T8 | Schedule cascade: only changed rows written; update error surfaces; date-key round trip under `TZ=Europe/Berlin` and `America/New_York` | P0-DATA-4, P1-DATE-1 |
| T9 | Payroll: `calculateHourlyPayWithOvertimeCap` (48h mixed types, override, cap) and `calculateGross` (salary + piece + helper deduction + banked + tool repayment + per diem; W2 vs 1099) | P1-MONEY-8 |
| T10 | `groupPunchesForImport` extracted + tested: quarter-hour rounding, open punch excluded, 60h punch flagged, evening boundary | P1-DATE-2/3 |
| T11 | `applyImportRowsToDraft` + `buildRunPayloadFromDraft`: off-roster `person_id` must not vanish (write red first) | P0-DATA-3 |
| T12 | `applyBankedDelta` round-trips to zero; clamp case documented | P1-HR-1 |
| T13 | `computeProjectedBillings` + `computeDashboardAlerts` fixtures; `computeFinancialsMetrics` | dashboard math currently untested |
| T14 | GC: `changeOrderService` round trip; `getOrCreateActualsId` idempotent under the new unique index | P0-GC-1, P1-MONEY-7 |

---

## 6. Execution plan — seven batches

Each batch is one Cursor brief (or a direct Claude session for the S items), one commit bundle, tsc + vitest green, and a short operator smoke. Order matters: security first because P0-SEC-1 is a live escalation path; money before data-safety because the invariant test (T1) makes the later refactor-adjacent fixes safe.

| Batch | Contents | Sessions | Needs live DB (Cursor MCP) |
|---|---|---|---|
| **0 — Hygiene + CI** | Repo/docs cleanup (§3 hygiene), `CLAUDE.md`, `docs/INDEX.md`, unused deps, `.temp` untrack, empty fn dirs, P1-QA-1 CI workflow, P1-QA-3 `qb-find-vendor` check, P1-SEC-10 pending reconcile | ½ | verify `qb-find-vendor` in Dashboard |
| **1 — Security** | P0-SEC-1, P0-SEC-2, P0-SEC-3 (decision), P1-SEC-1…9 as one or two migrations + `vercel.json` headers; error boundary (P0-INFRA-1) rides along | 1–2 | yes — apply migrations, run anon + crew smoke, `supabase-audit-recon.mjs`, `organizations` RLS check |
| **2 — Money** | P0-MONEY-1/2/3, P1-MONEY-1…6, `scan-quote-versions.mjs` (v2-retirement step 0), tests T1–T5 | 1–2 | no (pure TS); re-run parity harness against a real project payload |
| **3 — Data safety** | P0-DATA-1…5, P1-HR-1…4, P1-DATE-1…3, P1-MONEY-8/9, tests T6–T12 | 2 | yes — `save_pay_period` RPC, supplier edge fn redeploy, clock RPC changes |
| **4 — GC active-core** | P0-GC-1/2, P1-MONEY-7, P1-GC-1…5, P1-EGRESS-7, test T14 | 1 | unique index migration |
| **5 — Egress + resilience** | P1-EGRESS-1…6, route-level code splitting + dynamic import of `xlsx`/`jspdf`/`recharts`/`framer-motion`/`react-markdown` (mechanical, main chunk 4.55 MB → <1 MB), P1-QA-2 migration baseline | 1–2 | `db reset` smoke against a throwaway Postgres |
| **6 — Dead-code sweep + dormancy gate** | P2-DEL-1…10 one commit each, P2-CON-1…6, dormancy SQL → owner-only gating, `SelectionSchedules` decision | 1 | row-count queries |

**≈ 8–10 sessions total.** After Batch 6: tag `v1.0`, update `VERSION_1_5_ROADMAP.md` → `docs/history/`, and this document becomes the changelog anchor.

---

## 7. Deferred — explicitly out of this cycle (queued for post-v1)

Analysed in the per-domain reports; each is a real improvement but structural, so it waits for Mark's "refactor window".

| Item | Why it matters | Prereq done in this cycle | Size |
|---|---|---|---|
| **Retire the v2 quote dual-path** (~7,500 LOC: `QuoteStage` + 14 panels, v2 engine, v2 PDF, `revertQuoteToV2`) | Largest structural debt; 10 `@ts-nocheck` files; every old v2 quote with sqft>0 still opens the v2 editor until converted | Batch 2 fixes the converter for all 7 trades and adds `scan-quote-versions.mjs`; remaining blocker is that Field accessories + crew scope read the frozen `legacyV2Snapshot` (`FieldMeasurementPage.tsx:112`, `crewWorkspaceService.ts:648,677`) — make them read live v3 lines, then bulk-convert drafted v2 quotes, then delete | L |
| **Kill the offline/localStorage fossil** (`isOnlineMode()` ×365, `storage.ts` shadow DB, 86 dead branches in `supabaseService`, `planService`/`itemTemplateService`/`estimateTemplateService` LS fallbacks) | Root cause of P0-GC-1 and P1-GC-3; stale-template bugs across devices | Batch 4 removes the three leak sites | L |
| **`supabaseService.ts` split** (5,074 LOC → project documents, POs, change orders, actuals, estimates, GC schedule, deal workspace) | Highest-leverage god file; extraction order in Review D §4 | Batch 6 deletes ~900 LOC of dead sections first | M/L |
| ~~**Move drywall comms log out of `metadata.legacy`** into a table~~ | **DONE 2026-09-04** — pulled forward because message-lane gating requires it: RLS is row-level and cannot hide a key inside `projects.metadata`, which crew read directly (`crewWorkspaceService.ts:442,554`). New `project_comms` table + lane RLS (`20260904120000_project_comms_lanes.sql`). Also closes P1-SEC-2 (author spoofing) and removes one `projects.metadata` writer. The legacy array stays read-only as a rollback net. | — | — |
| **`drywallProjectsService.ts` split** (repo / quote / takeoff / orders / lifecycle / PO) | Pure normalizers become testable without Supabase mocks | T6/T7 tests written in Batch 3 | M/L |
| **Time-clock unification** (single `linked_*` identity, one `clock_in` RPC, delete `hr_person_*`) | Full-app users can't use the HR clock today; two identity columns | P1-HR-2 re-link action ships now | M |
| **Edge `_shared` consolidation** (10 CORS copies, 14 auth copies, 7 Resend, `Deno.serve`, pinned versions) | Boilerplate + drift | `config.toml` + `deno.json` in Batch 5 | M |
| **`TradePivotShell`** extraction (RC/metal-stud/acoustic pivots ~1,200 → ~650 lines) | Next trade becomes a row renderer, not a 400-line file | — | M |
| **Stage-page single load** beyond the Shell context (full `useDrywallProject` pattern), portfolio toolbar dedupe (~70% of a 1,144-line page) | Egress + maintainability | Batch 5 does the Shell part | M |
| **Type generation** (`supabase gen types`, `createClient<Database>`), `as any` burn-down (173), `noUnusedLocals: true`, jsdom + crew-page smoke tests | Type safety | CI in Batch 0 | L |
| **RBAC Phase 3** (reconcile legacy `role` vs `roles[]`), GC mobile/dialog parity, GC schedule per-item saves, `confirm()` → shared dialog (29 sites) | Product-level | — | M–L |
| Roadmap P2 features (billing-from-estimate via QB, multi-round takeoffs, job documents + Drive links, AI scope-of-work, D.3 quote-request queue, corner-bead spec group, height-aware accessories) | Unchanged from `VERSION_1_5_ROADMAP.md` | v1 declared | — |

---

## 8. Open decisions for Mark

1. **Excel estimate import** (`ImportEstimate.tsx`, unrouted): is it used? If yes it's a wiring bug to fix in Batch 4; if no it's ~1,000 LOC to delete in Batch 6.
2. **Vendor RFQ / quote-portal chain** (P0-SEC-3 / P2-DEL-3): remove entirely (recommended — nothing can create a request since February), or keep and add expiry/resubmit guards?
3. **Alternate cleanup semantics** (P1-MONEY-3): should a deduct alternate reduce prep/clean labor proportionally, or is cleanup base-only by design? (Recommend proportional.)
4. **Order-tab "Mark project complete"** (P0-DATA-5): replacing it with "Start production" enforces `order → production → production-complete → closed`. Confirm that no job legitimately closes straight from Order.
5. **Overtime default** (P1-MONEY-8): default W2 hourly hours beyond 40 to 1.5× on import/add? (Recommend yes, with per-row override.)
6. **Dormancy gating**: after the row-count pass, gate workspaces with no activity since June (likely Deals, Tenants, Selection Schedules, SOW, client quotes, meetings) behind owner-only? Nothing gets deleted; it just leaves the sidebar for non-owners.
7. **Code splitting in Batch 5**: it's mechanical and low-risk but touches every route import. OK to include, or push to post-v1?

---

## 9. Baseline metrics (2026-09-03)

| Metric | Value |
|---|---|
| TS/TSX lines | ~180k (components 102k, services 35k, lib 24k) |
| Largest files | `ProFormaGenerator.tsx` 5,149 (dead), `supabaseService.ts` 5,074, `DealWorkspace.tsx` 4,715, `ProjectActuals.tsx` 3,467, `EstimateBuilder.tsx` 2,790 |
| Tests | 42 files / 240 tests, all in `src/lib` + 3 services + 1 component; 0 UI tests |
| Migrations / edge fns | 179 / 23 real + 3 empty dirs |
| Main JS chunk | 4.55 MB, no code splitting |
| `as any` / `: any` | 173 / 262 |
| `console.log` | 93 (87 in four files, 34 of them in deletable `src/scripts`) |
| `confirm()` | 29 native |
| Polling | 60 s bell (×2 shells), 120 s field-review bell, 60 s comms panel, 20 s customer card, 20 s public share page |
