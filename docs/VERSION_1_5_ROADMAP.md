# HSH Platform — Path to v1.5 Roadmap

_Compiled 2026-07-27. Grounded in a code + docs investigation, not just memory. File:line references are current as of this date. Migration **application** status against the live DB is unverified (no DB access locally) — items that say "verify applied" need a `supabase migration list` check._

Legend for source of each item:
- 🗣️ **You suggested** (Mark, via conversation/docs)
- 💡 **Claude suggests** (surfaced by investigation)
- 🧹 **Must-clear** (correctness / data-integrity / security defect — should not ship v1.5 with it open)

---

## 0. How to read this + recommended "1.5 cut line"

The single theme of v1.5 should be: **make the drywall v3 quote path trustworthy end-to-end, close the security holes, and finish the crew workflow — then draw the line.** Everything past P1 is real but can wait.

**Corrections from investigation (memory was stale):**
- ✅ **Crew signup orphan-viewer hardening is DONE** (commit `c9c43c0`: sign-out-on-failure + `PendingAccount` gate). Close it. (Optional defense-in-depth RLS audit only.)
- ✅ **Crew time clock is DONE** (migration `20260716210000_crew_time_clock.sql` + Clock in/out UI on `/crew`). Remaining is polish (global indicator, geofence/lunch), not "build it."
- ⚠️ **The Roberto job-info bug is real but NOT `show_job_info` id-mismatch** — root cause is the **specialty/linkage** gate (see P0-6). The uncommitted stopgap only treats the symptom.

---

## P0 — Must-clear before calling it v1.5

| # | Item | Why it's P0 | Where |
|---|------|-------------|-------|
| P0-1 | 🧹🗣️ **v2→v3 converter drops material** for insulation, acoustic, metal_stud, suspended_grid | Silent **under-pricing** on every converted multi-trade quote — exactly what bit Lisbon | `convertQuoteV2ToV3.ts:161-232` |
| P0-2 | 🧹💡 **Converted component lines are un-editable & rate-wiping** | Migrated lines get `catalog_id:''` → material/labor cells disabled; picking a catalog entry to enable them **nulls the migrated rate** | `quoteV3CatalogResolve.ts:252-258`, `LineItemsTable.tsx:435-440`, `LineRateCells.tsx:151-167` |
| P0-3 | 🧹🗣️ **Component catalogs are empty** (`door_install`, metal_stud, suspended_grid, acoustic, insulation, rc_channel, frp) | New component lines (incl. **Door Install**) are un-pickable and silently price to $0 | `catalogSeeds.ts:189-195` |
| P0-4 | 🧹💡 **Anon data leaks** — 3 tables world-readable | `crew_invite_tokens` (token+PII → account takeover), `quote_requests`, `submitted_quotes` (vendor pricing/PII) all `USING (true)` | migrations `20260616130000:81`, `016:23`, `016:61` |
| P0-5 | 🧹💡 **`v_meetings_summary` view bypasses RLS** | View defaults to definer rights (comment claiming otherwise is wrong) → cross-org meeting data readable by any authenticated user | `20260505_meetings_summary_view.sql:11` |
| P0-6 | 🧹⚠️ **Crew materials/pay invisible (Roberto)** | Root cause = `get_my_linked_position_name` returns null (stale `linked_*` id after roster re-import) → `specialty='unknown'` → materials `[]`, board counts hidden, pay blanked. Masked in operator preview | `crewWorkspaceService.ts:598-601, 660-668, 868-878`; RPC `20260625130000` |
| P0-7 | 🧹💡 **Fake numbers in reports** | `VarianceReport` hardcodes per-trade actual = `0`; `excelParser` hardcodes sub cost = `0` | `VarianceReport.tsx:344`, `excelParser.ts:185` |
| P0-8 | 🧹💡 **Apply pending migrations** | Supplier/customer-share batch (`20260723xxxxxx`–`20260724xxxxxx`) and `025_add_file_path...` look unapplied; code has workarounds (`project_documents` omits `file_path`) | `supabaseService.ts:4428,4546`; verify `migration list` |

**Notes on P0-1/P0-2/P0-3** — these three are one problem: the v3 quote is only trustworthy once (a) the converter carries all trade material, (b) migrated lines are editable without losing their rate, and (c) the org catalogs are populated. Fix them together. The cleanest converter fix also makes your existing **"Refresh from v2 snapshot"** button re-pull material correctly on already-converted projects.

**Suggested P0-2 fix:** relax `isMaterialRateEnabled`/`isComponentLaborRateEnabled` to also enable when a `custom_*_rate` is present, and change the catalog `<select>` to **merge** (keep customs) instead of nulling them.

**P0-4/P0-5 fix pattern:** replace each `USING (true)` SELECT with a `SECURITY DEFINER` lookup RPC keyed by token (return one row); recreate the view `WITH (security_invoker = on)`. Your newest share-link migrations already follow the good pattern — reuse it.

---

## P1 — Should-have for v1.5

### Estimating & quote quality
- 🗣️💡 **Height-aware accessory estimating** — tape/mud/screws are 100% board-area based today (`quoteV3Accessories.ts:135-173`); a 20 ft and 8 ft wall of equal sqft get identical mud/tape. Add `wall_height`/`ceiling_height` at the field-measurement area and quote-space level and thread into the formulas (seam LF from height+area). _This is the accuracy win you flagged._
- 🗣️ **Seed real Door Install catalog + Metal Stud + Suspended Grid** (Settings → Catalogs). Prereq for using the trade we just shipped and for clean converts. (Overlaps P0-3.)
- 💡 **Surface "migrated line needs review" count** in the v3 quote UI — every converted line carries a review flag; make it visible so nothing ships un-reviewed.
- 💡 **v3-vs-v2 PDF parity sign-off test** before retiring the v2 PDF (no automated visual parity today).
- 💡 Document/decide: converted drywall lines set `accessories_in_material_rate:true`, so they **bypass** the itemized accessory engine (tape/mud stays the flat v2 rate). Intended, but should be explicit.

### Crew
- 💡 **Fix P0-6 properly** + **surface `specialty==='unknown'` loudly** in `/crew` instead of silently returning empty materials/pay. Add an operator "re-link crew account" action for id drift.
- 💡 **Normalize empty-string linkage** — `resolvePersonId` uses `??` so `''` leaks through as a person id and mismatches everything (`crewWorkspaceService.ts:137-142`).
- 💡 **Global "clocked in" indicator** in `CrewShell`/home list (clock in/out currently only on the per-job page).
- 🗣️💡 **Crew "mark job step complete"** — GAP. Needs a `crew_mark_schedule_item_complete` SECURITY DEFINER RPC (validate crew role + `person = ANY(assigned_persons)`) + a button. Recommend a `crew_reported_complete` flag the office confirms, to keep office control.
- 💡 Commit-or-revert the `CrewProjectDetailPage.tsx` stopgap deliberately — land it **with** the specialty fix, not alone.

### KPIs / division ops
- 🗣️ **D.5 KPI dashboard Phase 2** — the deferred tiles: #3 bid-margin discipline, #5 change-order capture, #6 estimate turnaround, #8 job-costing completeness.
- 🗣️ **D.3 Quote request queue** — `drywall_quote_requests` table + `received→in_progress→quoted→won/lost` + convert-to-project. It's the KPI-#1 denominator, so D.5's bid-rate tile depends on it.

### Security & perf (finish what P0 starts)
- 💡 **Pin `search_path` on core RLS helper functions** — `user_can_edit()`, `user_is_admin()`, `get_user_role()`, `is_user_active()` (`008`), `handle_new_user()`, form helpers (`007`). Schema-injection hardening; these run inside many policies.
- 💡 **Lock down `organizations`** anon read (SUPABASE_HEALTH_AUDIT S5) and review `036_gameplan_default_playbook.sql:26` `USING (true)`.
- 💡 **Egress trims** (metadata over-fetch): E1 `drywallLaborAuditService.ts:219` (`select id,name,metadata` → uses only `id`; change to `select id` — trivial, pure waste); E2 `crewWorkspaceService.ts:361`; E3 `supabaseService.ts:576`; E4 `drywallProjectsService.ts:86` `DRYWALL_DETAIL_SELECT` + narrow callers of `fetchDrywallProjectById`.
- 💡 **CommsNotificationBell** — replace the 5-min-poll egress stopgap with a scalar unread RPC, then restore a short interval (`CommsNotificationBell.tsx:12-16`).

### Correctness cleanups
- 💡 **Backup restore** — `backupService.ts:415` throws "coming soon". Either build restore or hide the feature (shipping a no-op DR button is a trap).
- 💡 **Historical rate lookup** — `estimateService.ts:340` always returns null; any "suggested rate" UI is dead. Fix or hide.
- 💡 **Retire 5 live `@deprecated` callers** and delete 2 dead deprecated symbols (`LaborRateCell` alias, `shouldDropStaleClosedJob`). See tech-debt register below.

---

## P2 — Your feature ideas (post-1.5 candidates, not blockers)

- 🗣️💡 **Field Foreman role** _(brief ready — `FIELD_FOREMAN_ROLE_BRIEF.md`; targeted next week)_. Jeremy moves from measurer to field foreman managing production across all drywall projects. **Phase 1 (crew-expansion):** keep him `crew` + a new `is_field_foreman` capability flag that expands his `/crew` workspace — all projects (not just assigned), full scope/materials/order-status, comms on any project, and mobile schedule *management* (single-item adjust with the shared `cascadeSchedule` engine + Detach/Shift conflict prompt, behaviorally identical to the desktop editor, via a new foreman-guarded crew-write RPC). Measuring + Mark's approval unchanged; `/crew` is cost-free so no financial-gating needed; sub SMS silent (no texting yet). **Phase 2 (later):** per-project `foreman_id` ownership + routing field/customer questions to the assigned foreman; multiple foremen.
- 🗣️💡 **Phased / multi-round field measurements** _(demand-driven — large commercial jobs will have many takeoffs)_. Today a project holds exactly **one** field takeoff (`metadata.legacy.fieldTakeoff`, a single object — `drywall.ts:694`) with **one** `reviewStatus`, hard-locked once approved (`save_field_takeoff_as_measurer` rejects saves when status is `approved`/`pending_review`). So a job measured in rounds — e.g. topout now, full board a month later — can't live in one project: a second round shallow-overwrites the first, sums into one `totalMeasuredSqft`, and can't be recorded at all once the first is approved.
  - **Interim workaround (works today):** one project per measurement scope (e.g. "Goodwill – Topout" / "Goodwill – Full Board"), each with its own measure → review → quote → order → hang cycle. Cost: financials fragment across project records; roll-up is manual.
  - **Build scope (schema-level):** takeoffs become an array/keyed-by-round with a scope/phase tag + **per-round** `reviewStatus`, threaded through: the office review queue (`20260724180000_pending_field_reviews.sql`), quote/order consumers (`OrderPage.tsx`, `buildOrderFinancialComparison`, `suggestOrderItemsFromFieldTakeoff` — sum/select per round), the measurer RPC + `crew_has_measure_assignment` so a specific measure schedule item targets a specific round, the crew measure UI (pick which round), and a project-level roll-up. Schedule already supports multiple "measure" items — only takeoff storage is singular.
  - **Size:** Epic (schema + downstream threading + crew + review). Not v1.5. Scope it when the N-project workaround starts hurting on real commercial volume. See Epics.
- 🗣️ **AI-assisted scope-of-work** — two flavors: narrow `generate-quote-scope` "Generate/Polish" button in the quote builder (~1-2 sessions, `QUOTE_DOCUMENT_PLAN §14.1`) and the broader **Estimate Assist** drawing-digest workflow (`estimate-assist-v2-planning.md`, Phases 0-5, needs scoping sign-off). Decide: one, both, or merge.
- 🗣️ **Customer SMS (CC.2)** — inbound routing + office inbox. Blocked on A2P 10DLC approval; outbound (CC.1) already shipped.
- 🗣️ **Customer quote portal + e-signature** (`QUOTE_DOCUMENT_PLAN §4`, "future maybe").
- 🗣️ **Public quote request form** on hshcontractor.com (D.8) → feeds D.3 queue.
- 🗣️ **Pricing feedback loop (D.7)** — reconciled actuals suggest catalog rate updates. Natural follow-on to height-aware estimating.
- 🗣️ **AI in-app help/user manual** (`AI_USER_MANUAL_PLAN.md`, v0 sketch).
- 🗣️ **QR site check-in / punch-lists** (`QR_CODE_SYSTEM_PLAN.md`, planned, zero code).
- 💡 Schedule change notifications (email/SMS); crew geofence/lunch (time clock Phase 5-6).

---

## Epics — deliberately beyond v1.5

- 🗣️💡 **Phased / multi-round field measurements** (schema change) — see P2 for full scope. Single-takeoff-per-project model must become multi-round; commercial jobs will need many takeoffs per project. Interim: one project per scope.
- 💡 **Retire the v2 quote dual-path.** Large structural debt: `DrywallQuoteV2V3` union + `version===2` branches threaded through services, plus the whole v2 panel/calc suite (`QuoteStage.tsx`, 6 optional-addon panels, `buildDrywallQuoteCalculations.ts`, `quoteCalculations.ts`, v2 PDF). **Can't delete yet** — field/order/bid/change-order paths still call the v2 engine (`drywallProjectsService.ts:875`, `bidSnapshot.ts`, `orderFinancialComparison.ts`, `FieldAccessoriesSection.tsx:19`), and `legacyV2Snapshot` is the rollback net. Sequence: migrate those consumers → drop v2 panels → keep a minimal v2 read path for rollback → remove the branch. Add telemetry first to confirm no live v2 quotes remain.
- 💡 **God-file splits** (ongoing, not a gate): `ProFormaGenerator.tsx` (5149), `supabaseService.ts` (5092 — highest leverage, carries pending-migration workarounds), `DealWorkspace.tsx` (4715), `ProjectActuals.tsx` (3467), `EstimateBuilder.tsx` (2790).
- 🗣️ **RBAC Phase 3 (RLS reconciliation) + Phase 4 (drywall field roles / assigned-projects model)**.
- 🗣️ **HR port** (implementation not started; `hr` not yet in Workspace union) + **phase-2 real-time labor** (timeclock→`labor_entries`, design-only today).
- 🗣️ **Buildertrend full cancellation** (end of summer per plan; progressive, not a code task).

---

## Tech-debt / bug register (quick reference)

| Sev | Item | Location |
|-----|------|----------|
| High | Converter material drop (4 trades) | `convertQuoteV2ToV3.ts:161-232` |
| High | Migrated line rate-wipe on catalog pick | `LineItemsTable.tsx:435-440` |
| High | Anon-readable `crew_invite_tokens`/`quote_requests`/`submitted_quotes` | migrations `20260616130000`,`016` |
| High | `v_meetings_summary` RLS bypass | `20260505_meetings_summary_view.sql` |
| High | Crew specialty/linkage blanks materials+pay | `crewWorkspaceService.ts:598-601` |
| Med | VarianceReport per-trade actual = 0 | `VarianceReport.tsx:344` |
| Med | excelParser sub cost = 0 | `excelParser.ts:185` |
| Med | Backup restore stub | `backupService.ts:415` |
| Med | Historical rate stub | `estimateService.ts:340` |
| Med | search_path unpinned on core RLS helpers | migrations `008`,`007` |
| Med | Metadata over-fetch (E1-E4) | see P1 |
| Low | 5 live `@deprecated` callers + 2 dead symbols | see below |
| Low | CommsNotificationBell 5-min poll stopgap | `CommsNotificationBell.tsx:12` |

**Deprecated symbols still referenced (rework):** `markDrywallProjectComplete` (`drywallProjectsService.ts:1425` ← `OrderPage.tsx`), `revertDrywallProjectComplete` (`:1443` ← `ReopenProjectConfirmDialog.tsx`), `includeDrywallSubBreakdown` (`drywall.ts:352` ← `quotePdfSettings.ts`). **Dead (delete):** `LaborRateCell` alias (`LineRateCells.tsx:602`), `shouldDropStaleClosedJob` (`drywallDivisionAggregateService.ts:257`).

---

## Open decisions for Mark

1. **Converted-line catalog story:** auto-match/seed a catalog entry per migrated line, or make custom-rate lines editable without a catalog pick? (Drives the P0-2 fix shape.)
2. **Crew mark-complete:** hard `status='complete'`, or `crew_reported_complete` flag the office confirms? (Recommend the flag.)
3. **AI scope-of-work:** narrow "polish" button, full Estimate Assist, or both?
4. **v1.5 cut line:** confirm P0 + the crew/estimating P1 items are in; everything else waits. My recommendation: **P0 (all) + P1 estimating + P1 crew + security/egress finish.** D.3/D.5 are the stretch if time allows.

---

## Suggested execution order

1. **Quote-trust batch:** P0-1 + P0-2 + P0-3 (converter + editable migrated lines + catalog seed). One focused push; unblocks Door Install and fixes convert under-pricing.
2. **Security batch:** P0-4 + P0-5 + P1 search_path/organizations. RPC-behind-token pattern reused from share links.
3. **Crew batch:** P0-6 specialty fix + surface unknown-state + commit stopgap; then global clock indicator + mark-complete.
4. **Data-integrity batch:** P0-7 (VarianceReport/excelParser), P0-8 (apply migrations), backup/historical stubs decision.
5. **Egress batch:** E1 (trivial) → E2-E4 → CommsNotificationBell RPC.
6. **Then** estimating accuracy (height), D.5/D.3 as the stretch.
