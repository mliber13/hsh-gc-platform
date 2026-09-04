# Review C — Security + Access Control (RLS / RPC / Edge / Client RBAC / Crew / Share links / PWA)

**Date:** 2026-09-03 · **Method:** static read of `supabase/migrations/**` (179 files, 17,282 lines), `supabase/functions/**` (27 + `_shared`), `supabase/config.toml`, client RBAC + crew surfaces under `src/`, and a secrets sweep. No live-DB access; nothing was executed against Supabase. Prior audit `docs/SUPABASE_HEALTH_AUDIT.md` (2026-07-16) was read first — items it already covers are only re-listed where status changed or where this review adds new evidence.

**Legend:** CONFIRMED = the code that proves it was read and is cited. SUSPECTED = consistent with the code but the live DB (dashboard-applied objects, drift) must be checked.

**Status of the "still open" items from the prior audit (verified against the repo):**

| Prior item | Status now |
|---|---|
| Anon `USING (true)` on `crew_invite_tokens` / `quote_requests` / `submitted_quotes` | **FIXED in repo** — dropped in `20260730120100_anon_lockdown_drop_policies.sql:3-6`, replaced by token-keyed definer RPCs in `20260730120000_anon_lockdown_rpcs.sql`. (Residual gaps in those RPCs below: F-11, F-12.) |
| `v_meetings_summary` without `security_invoker` | **FIXED in repo** — recreated `WITH (security_invoker = on)` at `20260730120000_anon_lockdown_rpcs.sql:137-138`. |
| `organizations` anon-readable | **STILL OPEN / SUSPECTED** — the `organizations` table is *not created by any migration* (dashboard-created; see inventory below), so its RLS/policies cannot be verified from the repo. Only the live DB / `scripts/supabase-audit-recon.mjs` can confirm. |
| `search_path` unpinned on core definer helpers | **STILL OPEN / CONFIRMED** — `is_user_active()`, `get_user_role()`, `user_can_edit()`, `user_is_admin()` last defined at `20000201000000_multi_user_shared_access.sql:250-270` with `SECURITY DEFINER` and no `SET search_path`; `handle_new_user()` last defined at `20260429000002_a5e_typeconvert.sql:271-286` also without it; `007_project_forms_system.sql:175,198` (`get_form_completion_percentage`, `is_form_fully_signed_off`). `get_user_organization()` (text) was DROPPED in `20260429000002_a5e_typeconvert.sql:112`, so it is no longer an issue. |
| `036_gameplan_default_playbook.sql:26 USING (true)` | **MOOT / CONFIRMED** — all three gameplan tables dropped with CASCADE in `20260429000003_gameplan_retire.sql:42-44`. |
| `unsynced_qb_entries` view (`20000301000000_quickbooks_integration.sql:42`) | **NEW / SUSPECTED** — plain `CREATE VIEW` without `security_invoker`, never touched since. Not referenced by any `src/` or edge code (`grep unsynced_qb_entries` → 0 hits). It did not appear in the prior audit's 83-object inventory, so it may never have been applied; verify and drop. |

---

## A. RLS / RPC reference table

Ordering note: the Supabase CLI applies files by version prefix, so the effective order is `001…066` → `20000201000000…20002501000000` → `20260424…`. The A5-c.2 series (`20260425` → `20260427000009`) rewrote nearly every policy onto `organization_id (uuid)` via `get_user_organization_uuid()`; the table below reflects the **final** state after all 179 files.

Helper semantics that every row below depends on (all `SECURITY DEFINER`, all read `public.profiles`):

| Helper | Defined | Returns | Notes |
|---|---|---|---|
| `get_user_organization_uuid()` / `current_user_organization_uuid()` | `20260429000002_a5e_typeconvert.sql:303-321` | `profiles.organization_id` for `auth.uid()` | pinned `search_path` ✔ |
| `current_user_organization_id()` | `20260511000002:7-15` | same (uuid) | pinned ✔ (used by tenant_pipeline, org_holidays, subcontractor_unavailability) |
| `is_user_active()` | `20000201000000:250` | `COALESCE(is_active,true)` | **no profile row ⇒ true**; **no search_path** |
| `user_can_edit()` | `20000201000000:262` | legacy `profiles.role IN ('admin','editor')` | does **not** check `is_active`; **no search_path** |
| `user_is_admin()` | `20000201000000:268` | legacy `profiles.role = 'admin'` | no search_path |
| `user_is_rbac_owner()` / `user_has_rbac_role(text[])` / `user_effective_rbac_roles()` | `20260527000001:43-89` | based on `profiles.roles[]` | pinned ✔ |
| `user_can_run_payroll()` | `20260527000001:91` | owner OR `profiles.can_run_payroll` | pinned ✔ |
| `user_has_crew_role()` / `crew_person_id_for_user()` | `20260617130000:26-50` | `'crew' = ANY(roles)` / linked id | pinned ✔ |
| `user_is_field_foreman()` | `20260728121344:12` | `profiles.is_field_foreman` | pinned ✔ |
| `crew_is_assigned_to_project(p_project_id)` | `20260730140000:6` | crew + linked id ∈ `schedule_items.assigned_persons` for that project | pinned ✔ |
| `crew_can_post_comms(p_project_id)` | `20260728121344:41` (final) | crew AND (foreman OR assigned) | pinned ✔ |

**Two parallel role systems exist**: legacy `profiles.role` (admin/editor/viewer → `user_can_edit`/`user_is_admin`) still gates ~40 tables' writes; the newer `profiles.roles[]` (owner/office_gc/office_drywall/field_*/viewer/crew) gates HR/drywall/crew surfaces. Crew accounts get `role='viewer', roles=['crew']` (`20260616130000:131-133`).

### A.1 Tables

Abbreviations: `ORG` = `organization_id = get_user_organization_uuid()`; `ACT` = `AND is_user_active()`; `EDIT` = `AND user_can_edit()`; `ADMIN` = `AND user_is_admin()`; `RBAC(x)` = `user_has_rbac_role(x)`. "UPDATE w/o WITH CHECK" is **not** flagged as a bug: Postgres re-uses USING as the WITH CHECK when omitted. "Crew?" = can a `roles=['crew'], role='viewer'` account SELECT rows directly via PostgREST.

| Table | RLS | Policies (final) | Crew SELECT? | Definer RPCs touching it |
|---|---|---|---|---|
| `profiles` | ✔ | SELECT own (`auth.uid()=id`) `20260425:68`; SELECT org (`ORG ACT`) `:73`; **UPDATE own `USING (auth.uid()=id AND is_user_active())` — no column restriction** `:82`; UPDATE any-in-org `ADMIN` `:87`; INSERT `ADMIN` `:96`. No BEFORE-UPDATE trigger, no column-level REVOKE anywhere in migrations. | **Yes — every profile in org incl. `qb_access_token`, `qb_refresh_token`, `hr_person_id`, `roles`** | `handle_new_user` (trigger), `consume_crew_invite_token` (updates roles/links), every helper above reads it |
| `projects` | ✔ | SELECT `ORG ACT` `20260425:105`; INSERT/UPDATE `ORG EDIT`; DELETE `ORG ADMIN` | **Yes — full `metadata` JSONB (quotes, pricing, margins, comms log, field takeoff, orders) for every project** | `append_drywall_comms_log_entry`, `crew_append_field_photo`, `save_field_takeoff_as_measurer`, `drywall_list_stage_scalars` (INVOKER), `drywall_supplier_orders` (INVOKER), `supplier_share_*`, `customer_share_schedule`, `recent_comms_for_user`, `comms_unread_for_projects`, `next_drywall_quote_number`, `drywall_pending_field_reviews` (INVOKER), `drywall_supplier_delivery_schedule` |
| `schedules` | ✔ | SELECT `ORG ACT`; ALL `ORG EDIT` `20260427000009` | Yes | `foreman_create_schedule_item` (inserts a schedule if missing) |
| `schedule_items` | ✔ | SELECT `ORG ACT` `20260507000002:38`; ALL `ORG EDIT` (USING+WITH CHECK) `:44` | **Yes — all items, all projects, `assigned_persons`, `notes`, `tasks`, `photos`, `show_job_info_person_ids`** (crew filtering by `.contains('assigned_persons')` is client-side only) | `foreman_apply_schedule_changes` (3 versions), `foreman_create_schedule_item`, `foreman_delete_schedule_item`, `crew_append/remove_schedule_item_photo`, `crew_update_task_progress`, `log_schedule_item_change` (trigger) |
| `schedule_item_changes` | ✔ | SELECT `ORG EDIT` `20260728160305:205`; INSERT/UPDATE/DELETE **REVOKED** from authenticated `:219` — append-only via trigger | No | `log_schedule_item_change` |
| `task_progress` | ✔ | SELECT `TO authenticated USING (ORG)` `20260716190000:15` — no insert/update policy (RPC only) | Yes (org-wide) | `crew_update_task_progress` (start-date gate version `20260716200000`) |
| `estimates`, `estimate_templates`, `trades`, `item_templates` | ✔ | SELECT `ORG ACT`; writes `ORG EDIT`; delete `ORG ADMIN` (estimates) / `EDIT` `20260427000003` | Yes (bid pricing) | — |
| `sub_items` | ✔ | all four ops `ORG` only — **no role gate** `20260427000003` | Yes, and can INSERT/UPDATE/DELETE | — |
| `project_actuals` | ✔ | SELECT `ORG ACT`; writes `ORG EDIT`; delete `ADMIN` `20260427000004` | Yes | — |
| `labor_entries`, `material_entries`, `subcontractor_entries` | ✔ | SELECT `ORG ACT`; writes `ORG EDIT` `20260427000006` | **Yes (labor cost/wage rows)** | — |
| `time_entries` | ✔ | SELECT/INSERT/UPDATE: `ORG ACT AND (office-timeclock RBAC OR row matches linked person)`; DELETE office only `20260527000001:333-397` | Own rows only ✔ | `crew_clock_in`, `crew_clock_out` |
| `pay_periods` | ✔ | SELECT `ORG ACT AND (user_can_run_payroll() OR pay_period_includes_linked_person(payload))` `20260528000001:40`; INSERT/UPDATE/DELETE `can_run_payroll` | **Linked person gets the FULL row/payload (all employees' pay), not just their own entry** | `get_my_paystub_entries`, `list_my_paystubs` (filter server-side — but the direct SELECT path is still open) |
| `employee_classes`, `labor_burden_rates`, `labor_burden_recalibrations`, `qbo_wage_allocation_config` | ✔ | SELECT `ORG ACT`; ALL `ORG EDIT` | Yes (burden rates) | — |
| `labor_import_batches` / `labor_import_errors` | ✔ | SELECT `ORG ACT`; INSERT `ORG EDIT` (errors via batch join) | Yes | — |
| `org_team` | ✔ | SELECT `ORG ACT AND RBAC(owner,office_gc,office_drywall,viewer)`; writes `RBAC(owner,office_gc,office_drywall)` `20260527000001:260-300` | **No** (crew excluded → this is why roster RPCs exist) | `get_my_linked_position_name`, `list_org_team_roster_for_foreman`, `display_name_for_user`, `crew_clock_in` |
| `org_drywall_catalogs` | ✔ | SELECT `ORG ACT AND user_can_read_drywall_catalogs()` (crew added `20260625120000`); writes `RBAC(owner,office_drywall)` | **Yes — component rates, `margin_floor_target`, `po_estimated_cost_per_sqft`, `dashboard_targets`** | — |
| `drywall_qb_invoices`, `drywall_qb_materials` | ✔ | SELECT `RBAC(owner,office_gc,office_drywall,viewer)`; writes `RBAC(owner,office_drywall) OR can_admin_qb` | No | — |
| `change_orders`, `plans`, `work_packages`, `project_events`, `form_templates`, `form_responses` | ✔ | SELECT `ORG ACT`; ALL `ORG EDIT` | Yes | — |
| `project_forms` | ✔ | SELECT `ORG ACT`; INSERT/UPDATE `ORG EDIT`; DELETE `ADMIN` | Yes | `get_form_completion_percentage`, `is_form_fully_signed_off` (definer, no search_path, no auth check — read-only) |
| `project_documents`, `project_milestones`, `selection_books`, `selection_rooms`, `selection_room_images`, `selection_room_spec_sheets`, `selection_schedule_versions`, `project_proforma_versions`, `deals`, `deal_activity_events`, `deal_documents`, `deal_notes`, `deal_proforma_versions`, `deal_workspace_context` | ✔ | all four ops `ORG` only — **no role gate, no is_active** `20260427000002/4/8/9` | **Yes, and can write/delete** | — |
| `proforma_inputs` | ✔ | SELECT `ORG ACT` + project join; INSERT `auth.uid()=user_id AND ORG EDIT` + project join; **no UPDATE/DELETE policy** `20260427000005` | Yes | — |
| `po_headers`, `po_lines` | ✔ | via project join: SELECT `ACT`; writes `EDIT` | Yes | — |
| `contacts`, `subcontractors`, `suppliers`, `developers`, `municipalities`, `lenders` | ✔ | SELECT `ORG ACT`; writes `ORG EDIT` (UPDATE has WITH CHECK) `20260427000008` | **Yes (full contact directory / customer PII)** | `supplier_share_orders` reads `suppliers` |
| `contact_categories` | ✔ | SELECT `ORG ACT`; writes `ORG EDIT` | Yes | — |
| `tenant_pipeline_prospects` | ✔ | all ops `current_user_organization_id() ACT` — no role gate `20260512` | Yes + write | — |
| `org_holidays`, `subcontractor_unavailability` | ✔ | all ops `current_user_organization_id() ACT` — **no role gate** `20260515000003` | Yes + write/delete | — |
| `person_unavailability` | ✔ | SELECT `ORG ACT`; writes `ORG EDIT` `20260805160000` | Yes | — |
| `communication_log_entries` | ✔ | all ops `organization_id = (SELECT organization_id FROM profiles WHERE id=auth.uid())` — no role gate `20260511000001:343-359` | **Yes + write (inbound SMS/customer comms log)** | `comms_unread_for_projects` |
| `customer_project_contacts`, `customer_messages` | ✔ | ALL `ORG EDIT` `20260723120000` | No | `customer_share_schedule`, `comms_unread_for_projects` |
| `customer_share_links`, `supplier_share_links` | ✔ | ALL `ORG EDIT` | No | `customer_share_schedule`, `supplier_share_orders`, `supplier_share_upcoming` (all `GRANT … TO service_role` only ✔) |
| `crew_invite_tokens` | ✔ | ALL `ORG EDIT` `20260616130000:78`; anon SELECT **dropped** `20260730120100:3` | No | `get_crew_invite_by_token` (anon), `consume_crew_invite_token` |
| `comms_read_state` | ✔ | ALL own (`user_id=auth.uid()`, WITH CHECK adds ORG) `20260617130000:13`; SELECT operators `RBAC(owner,office_*)` `20260628` | Own only | `comms_unread_for_projects` |
| `push_subscriptions` | ✔ | SELECT/INSERT/DELETE own; **no UPDATE policy**; `organization_id` client-supplied, unchecked `20260729115556` | Own only | `send-push` edge (service role) |
| `feedback` | ✔ | SELECT/INSERT `ORG`; UPDATE/DELETE `ORG ADMIN` | Yes | — |
| `user_invitations` | ✔ | all ops `ORG ADMIN` `20260427000009` | No | — |
| `quote_requests` | ✔ | SELECT/INSERT/UPDATE/DELETE `auth.uid() = user_id` (per-user, not org) `016:6-21`; anon `USING(true)` **dropped** | Own rows only | `get_quote_request_by_token` (anon, also UPDATEs viewed_at/status), `submit_vendor_quote` (anon) |
| `submitted_quotes` | ✔ | SELECT/UPDATE via `quote_requests.user_id = auth.uid()` `003:116-133`; anon INSERT/SELECT **dropped** | Own requests only | `submit_vendor_quote` (anon INSERT) |
| `sow_templates` | ✔ | SELECT own / org (`organization_id = get_user_organization_uuid()`) / system (`user_id IS NULL AND auth.uid() IS NOT NULL`) `010:43`, `20260427000001:8`, `012:15`; INSERT/UPDATE own; DELETE own-or-org-or-system `20260427000001:15` (**any org user can delete system templates**) | Yes | — |
| `trade_categories` | ✔ | SELECT `TO authenticated` shared(NULL org) or ORG; writes ORG only `20260425:150-187` | Yes + write | — |
| `client_quotes`, `client_quote_line_items`, `client_quote_options` | ✔ | SELECT `ORG ACT`; INSERT/UPDATE `ORG EDIT`; DELETE `ADMIN` `20260514:115-186` | Yes (customer-facing pricing) | `next_client_quote_number(p_org)` — **trusts client `p_org`** (no membership check) |
| `client_quote_inclusion/exclusion_templates` | ✔ | SELECT `ORG ACT`; writes `ADMIN` | Yes | — |
| `meetings`, `meeting_leads`, `meeting_prompts`, `meeting_submissions`, `meeting_action_items`, `meeting_digest_sends`, `meeting_parking_lot_items` | ✔ | SELECT `is_active_meeting_lead(auth.uid())`; writes operator/lead-owner; **not org-scoped at all** (single-org assumption) `20260505000004:508-630`, `20260602000001` | No (unless a lead) | `ensure_meeting`, `list_assignable_meeting_lead_users`, `convert_parking_lot_to_action_item` (all check operator/lead ✔) |
| `supplier_schedule_digest_sends` | ✔ | **no policies; `REVOKE ALL FROM PUBLIC`** — service role only ✔ | No | `send-supplier-schedule-digest` edge |
| `organizations` | **?** | **Not created by any migration** — dashboard object. Prior audit found it anon-readable. | ? | FK target for 56 tables |
| `_pp_backup`, `user_profiles` | — | `_pp_backup` not in migrations (prior audit: dead, drop). `user_profiles` is referenced by `006_create_quote_documents_bucket.sql:28,46` policies but never exists — those 4 policies could never have been created (dead SQL). | — | — |
| `gameplan_*`, `organization_text_map` | — | dropped (`20260429000003`, `20260429000002:264`) | — | — |

### A.2 Views

| View | Definition | security_invoker | Status |
|---|---|---|---|
| `v_meetings_summary` | `20260730120000:137` | **on** ✔ | grant `authenticated` only |
| `unsynced_qb_entries` | `20000301000000:42` | **not set** | SUSPECTED live; bypasses RLS on `labor/material/subcontractor_entries` if present; unused by app → drop |

### A.3 Storage (`storage.objects`)

| Bucket | Public? | Policies (final, `20260429000002_a5e_typeconvert.sql:373-545`, `20260529120000:83-105`) | Notes |
|---|---|---|---|
| `deal-documents` | private | SELECT/INSERT/UPDATE/DELETE `TO authenticated`, folder[1] = caller's org id | org-scoped; **any org role incl. crew** |
| `project-documents` | private (dashboard) | same pattern (`pd_*`) | same |
| `selection-images` | private (dashboard) | same pattern (`si_*`) | same |
| `quote-attachments` | **public** (`017` says vendors need unauthenticated read; bucket dashboard-created) | INSERT/UPDATE/DELETE org-scoped; **no SELECT policy — public URL read** | by design for vendor portal; note bid drawings are world-readable by URL |
| `quote-documents` | **public** (`017` `ON CONFLICT … SET public = true`) | INSERT/UPDATE/DELETE org-scoped; no SELECT policy | vendor-uploaded quote PDFs world-readable by URL |
| `drywall-field-photos` | private | SELECT `user_can_access_drywall_photos(org, false)` — roles incl. **crew** (org-wide, not project-scoped) `20260626120000`; INSERT/DELETE roles incl. crew `20260627130000`; path must be `<org>/<project>/...` | crew can read/delete **any** project's photos in org (not limited to assignment) |

### A.4 SECURITY DEFINER RPC inventory (final versions; grant = who can EXECUTE)

| RPC | File (final) | Grant | Internal auth check | Notes |
|---|---|---|---|---|
| `get_crew_invite_by_token(text)` | `20260730120000:23` | anon, authenticated | token match + unconsumed + unexpired | returns `invited_email`, linked ids (fine) |
| `get_quote_request_by_token(text)` | `:55` | anon, authenticated | token match only | **no `expires_at` check; also performs an UPDATE (viewed_at/status) — anon write side-effect**; returns whole `quote_requests` row |
| `submit_vendor_quote(…)` | `:85` | anon, authenticated | token match only | **no expiry / status check → unlimited resubmits per token; unbounded `p_line_items`** |
| `consume_crew_invite_token(text, uuid)` | `20260616130000:87` | authenticated | `auth.uid() = p_user_id`; email match only if `invited_email` set | overwrites an existing full-app user's `roles`→`['crew']` if they consume a link |
| `append_drywall_comms_log_entry(uuid,text,text,uuid,text)` | `20260617130000:74` | authenticated | `user_can_edit() OR crew_can_post_comms()` | **`p_author`, `p_author_user_id`, `p_author_role` are client-supplied → author spoofing** (display later prefers `display_name_for_user(authorUserId)`, which the caller also supplies) |
| `crew_append_field_photo(uuid,jsonb)` | `20260730140000:32` | authenticated | `crew_is_assigned_to_project` | unbounded jsonb |
| `save_field_takeoff_as_measurer(uuid,jsonb)` | `20260627120000:41` | authenticated | measurer + assignment + review lock | good |
| `crew_update_task_progress(uuid,text,numeric)` | `20260716200000:8` | authenticated | crew + assigned + task exists + start_date ≤ today | good |
| `crew_clock_in(uuid)` / `crew_clock_out(uuid)` | `20260716210000:11,90` | authenticated | crew + linked + assigned to project | no `is_user_active` check |
| `crew_append_schedule_item_photo` / `crew_remove_schedule_item_photo` | `20260805140000:37,83` | authenticated | `crew_can_photo_schedule_item` (edit OR foreman OR assigned) | ok |
| `foreman_apply_schedule_changes(uuid,jsonb)` | `20260805120000:8` | authenticated | crew + foreman | can rewrite **any** item in any org project incl. `assigned_persons`, `tasks`, `notes` (by design); no is_active |
| `foreman_create_schedule_item` / `foreman_delete_schedule_item` | `20260804120000:9`, `20260807150000:9` | authenticated | crew + foreman | delete is any item in org |
| `list_org_team_roster_for_foreman()` | `20260728121506:7` | authenticated | edit OR foreman | ok |
| `person_is_field_foreman(text)` | `20260728131602:5` | authenticated | operator only | ok |
| `get_my_linked_position_name()` | `20260625130000:8` | authenticated | own profile | ok |
| `recent_comms_for_user(int)` | `20260806140000:49` | authenticated | operator → all; crew → assigned projects | ok |
| `display_name_for_user(uuid)` / `display_names_for_users(uuid[])` | `20260806140000:6`, `20260806160000:4` | authenticated | **none** — any authenticated user (any org) resolves any uid → name | low (names only) |
| `comms_unread_for_projects(uuid[])` | `20260807140000:7` | authenticated | org filter | ok |
| `get_my_paystub_entries(text)` / `list_my_paystubs()` | `20260529000001:30,65` | authenticated | own linked person | ok (but see pay_periods RLS) |
| `next_drywall_quote_number(uuid)` / `next_client_quote_number(uuid)` | `20260603130000:4`, `20260514:146` | authenticated | **none — trusts `p_org`** | leaks quote-count sequence for any org; single-org today |
| `supplier_share_orders`, `supplier_share_upcoming`, `customer_share_schedule`, `drywall_supplier_delivery_schedule` | `20260723170000`, `20260724170000:54`, `20260724140000`, `20260818130000` | **service_role only** ✔ | token → org/supplier/phone | share RPCs return `to_jsonb(p.client)` + `p.address` to suppliers, and `assigned_persons` ids to customers |
| `ensure_meeting`, `list_assignable_meeting_lead_users`, `convert_parking_lot_to_action_item` | `20260505000003/4`, `20260602000001` | authenticated | lead/operator check ✔ | `list_assignable…` sets `search_path = public, auth` |
| `user_can_access_drywall_photos`, `drywall_field_photo_path_ok`, all `user_*`/`crew_*` boolean helpers | various | authenticated (some PUBLIC by default — no explicit REVOKE) | n/a | read-only booleans |
| `handle_new_user()` (trigger) | `20260429000002:271` | trigger | — | **no search_path**; inserts `role='viewer'`, org NULL |
| `log_schedule_item_change()` (trigger) | `20260728162535:7` | REVOKED from PUBLIC ✔ | — | pinned ✔ |
| `is_user_active`, `get_user_role`, `user_can_edit`, `user_is_admin` | `20000201000000:250-270` | default PUBLIC | — | **no search_path** |
| `get_form_completion_percentage`, `is_form_fully_signed_off` | `007:175,198` | default PUBLIC | none | definer, no search_path, read `project_forms` by id for anyone |

**SECURITY INVOKER RPCs (rely on caller RLS):** `drywall_list_stage_scalars`, `drywall_supplier_orders`, `drywall_supplier_upcoming`, `drywall_pending_field_reviews` — all fine as long as `projects` SELECT is correct (which today means crew can call them too).

### A.5 Cron

`20260506_meeting_digest_cron.sql` and `20260818120001_supplier_schedule_digest_cron.sql` call edge functions via `pg_net`, pulling `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from **`vault.decrypted_secrets`** — no plaintext secrets in migrations ✔.



---

_Sections B–E below were completed by the orchestrator after the reviewer agent was terminated by repeated API overloads; every row is grounded in the section-A table above and was spot-verified by direct grep (profiles policy, change-order wiring, edge-function auth, secrets sweep)._

## B. Findings (ranked)

| ID | Sev | Status | Where | Scenario | Fix |
|---|---|---|---|---|---|
| C-1 | **Critical** | CONFIRMED | `20260425_a5c2_pilot.sql:82-83` (profiles self-UPDATE, no column restriction; no BEFORE UPDATE trigger; no column REVOKE anywhere) | Any authenticated user — a crew invite is enough — runs `update profiles set roles='{owner}', can_run_payroll=true, is_field_foreman=true, linked_employee_id='<other id>' where id=auth.uid()` via PostgREST. `roles` is only CHECK-constrained to allowed values. Full operator access + another person's pay. | BEFORE UPDATE trigger raising unless `user_is_rbac_owner()`/`user_is_admin()` when any privileged column changes (`role, roles, can_run_payroll, is_field_foreman, organization_id(_uuid), linked_*, hr_person_*, is_active`). Verify live. |
| C-2 | **High** | CONFIRMED | `pay_periods` SELECT `20260528000001:40` (`OR pay_period_includes_linked_person(payload)`) | A linked crew member selects the row and receives the **entire payload** — every employee's hours, rates, gross. | Drop the OR clause; crew reads only via `get_my_paystub_entries`/`list_my_paystubs`. |
| C-3 | **High** | CONFIRMED | `projects`, `schedule_items`, `estimates`, `*_entries`, `contacts`+partner tables, `org_drywall_catalogs` SELECT = `ORG ACT` only | `roles=['crew']` passes every org-scoped policy: full `projects.metadata` (quotes, margins, comms, takeoffs) for every project, all schedule items (assignment filter is client-side), all labor cost rows, the whole contact directory, margin floor + rates. | Assignment-scope `projects`/`schedule_items` for pure-crew (`crew_is_assigned_to_project(id)`); exclude pure-crew from `contacts`, `*_entries`, `estimates`; crew catalog read via a rates-only RPC or keep `user_can_read_drywall_catalogs()` but strip `dashboard_targets`/`margin_floor_target`. |
| C-4 | **High** | CONFIRMED | `supabase/functions/send-quote-email/index.ts` (no `auth.getUser`, no Authorization check); `deal-coach-chat/index.ts` (no user check; calls Anthropic with the org key) | Anyone holding the public anon key can send email from the company's Resend account / burn Anthropic credits. | Require a user JWT (`requireUser(req)`), or delete `send-quote-email` with the dead RFQ chain. |
| C-5 | Med | CONFIRMED | `get_quote_request_by_token` (no expiry, anon UPDATE side effect), `submit_vendor_quote` (no expiry/status → unlimited resubmits, unbounded `p_line_items`) `20260730120000:55,85` | Token holder resubmits forever / grows rows without bound. Chain is dead by construction (no UI creates requests since 2026-02-26). | Remove the chain; else add expiry + status guards. |
| C-6 | Med | CONFIRMED | `append_drywall_comms_log_entry` `20260617130000:74` | `p_author`, `p_author_user_id`, `p_author_role` are client-supplied → any crew user posts as "Mark (owner)". | Derive author from `auth.uid()`; ignore params. |
| C-7 | Med | CONFIRMED | `consume_crew_invite_token` `20260616130000:87` | An existing full-app user who opens a crew link has `roles` overwritten to `['crew']`. | Refuse when caller already has non-crew roles. |
| C-8 | Med | CONFIRMED | search_path unpinned: `is_user_active`, `get_user_role`, `user_can_edit`, `user_is_admin` (`20000201000000:250-270`), `handle_new_user` (`20260429000002:271`), `007:175,198`; `user_can_edit()` ignores `is_active` | Schema-injection hardening; a deactivated editor keeps write access. | Re-create with `SET search_path = public`; add `is_active` to `user_can_edit`. |
| C-9 | Med | SUSPECTED | `organizations` not created by any migration; prior audit found it anon-readable. `unsynced_qb_entries` view (`20000301000000:42`) without `security_invoker`, unused. | Anon enumeration of org names/ids; view bypasses RLS on entries if present. | Live check via `supabase-audit-recon.mjs`; add RLS; drop view. |
| C-10 | Med | CONFIRMED | `drywall-field-photos` storage policies `20260626120000`, `20260627130000` | Crew SELECT/DELETE is org-wide — any crew member can delete any project's photos. | Path-scope to assigned projects. |
| C-11 | Med | CONFIRMED | `next_drywall_quote_number(p_org)`, `next_client_quote_number(p_org)`; `display_name(s)_for_user`; `push_subscriptions.organization_id` client-supplied; `sow_templates` DELETE allows system templates | Cross-org sequence bump / name resolution; mis-filed push subs; any user deletes shared templates. Single-org today so impact is latent. | `p_org = get_user_organization_uuid()` checks; derive org server-side; admin-only system-template delete. |
| C-12 | Med | CONFIRMED | `crew_clock_in/out`, `foreman_*` RPCs skip `is_user_active`; `COALESCE(linked_employee_id, linked_contractor_id)` lets an empty string shadow the contractor id | Deactivated crew still punch/edit; contractor crew can't clock in. | Add `is_user_active()`; `NULLIF(…, '')`. |
| C-13 | Med | CONFIRMED | `vercel.json` — no security headers | Public share pages clickjackable; no `X-Content-Type-Options`/`Referrer-Policy`. | Add headers; `frame-ancestors 'none'`. |
| C-14 | Low | CONFIRMED | `quote-attachments`, `quote-documents` buckets public (`017`) | Vendor drawings / quote PDFs world-readable by URL — by design for the dead vendor chain. | Make private when the chain is removed. |
| C-15 | Low | CONFIRMED | `scripts/a5c2-c1-smoke.mjs:13`, `a5c2-c2-smoke.mjs:16` embed the anon JWT literally | Anon key is public by design; still, archived scripts should read env. No service-role or third-party secrets found in `src/`, `scripts/`, or functions. | Move to env; archive scripts. |
| C-16 | Low | CONFIRMED | Two role systems (`profiles.role` legacy vs `roles[]`), client `roles[0]` vs SQL `&&`/`ANY` | `['crew','office_drywall']` is crew in the UI, operator in SQL. | Highest-privilege pick in `deriveEffectiveRole`; RBAC Phase 3 later. |
| C-17 | Low | CONFIRMED | `sub_items`, `project_documents`, `selection_*`, `deals*`, `tenant_pipeline_prospects`, `org_holidays`, `subcontractor_unavailability`, `communication_log_entries`, `trade_categories` — writes gated on org only (no `user_can_edit`) | A `viewer`/crew account can insert/update/delete rows in these tables. | Add `EDIT` to write policies in one migration. |

## C. Done well (don't re-fix)

- Token-keyed share endpoints (`customer_share_schedule`, `supplier_share_*`) are service-role-only RPCs, tokens are 32-hex `crypto.randomUUID`-derived, and the edge functions validate before any read.
- `receive-sms` verifies the Twilio `X-Twilio-Signature` HMAC with a timing-safe compare; `send-sms`/`send-customer-sms`/`send-supplier-order`/`send-push` require a user JWT.
- Cron jobs pull secrets from `vault.decrypted_secrets`; no plaintext secrets in migrations.
- Crew writes consistently go through SECURITY DEFINER RPCs with assignment checks (`crew_is_assigned_to_project`, `crew_can_photo_schedule_item`, measurer review lock, task-progress start-date gate); `schedule_item_changes` is append-only via trigger with INSERT/UPDATE/DELETE revoked.
- The 2026-07-30 anon lockdown (crew_invite_tokens / quote_requests / submitted_quotes) and `v_meetings_summary` security_invoker are present in the migrations.

## D. Consolidation

| What | Evidence | Shape |
|---|---|---|
| Three generations of the same helper redefined | `foreman_apply_schedule_changes` ×3, `crew_can_post_comms` ×2, `comms_unread_for_projects` ×3, `user_hr_person_id` ×2 | Normal for migrations; but a `docs/ops/RPC_CATALOG.md` listing the *final* definition file per RPC (section A.4) prevents the next edit landing on a stale copy |
| Edge-function boilerplate | 10 own CORS, 14 auth extractions, 19 `createClient`, 7 Resend, dozens of error literals | `_shared/{http,auth,supabase,email,twilio}.ts`; `requireUser(req)` closes C-4 by construction |
| Policy patterns | `ORG ACT` / `ORG EDIT` / `ORG ADMIN` written out longhand in 70+ files | Two helper predicates (`org_member_active()`, `org_editor()`) and one migration that rewrites the write policies in C-17 to use them |

## E. Top 10 actions

| # | Action | Size | Live DB? |
|---|---|---|---|
| 1 | Profiles privileged-column guard trigger (C-1) | S | apply + smoke |
| 2 | `pay_periods` linked-person clause removal (C-2) | S | apply |
| 3 | Assignment-scope `projects`/`schedule_items` for pure-crew; exclude crew from contacts/entries/estimates (C-3) | M | apply + crew smoke |
| 4 | `requireUser` in `send-quote-email`/`deal-coach-chat`, or delete with the RFQ chain (C-4, C-5, C-14) | S | redeploy |
| 5 | Server-derived comms author; invite-consume refusal for non-crew (C-6, C-7) | S | apply |
| 6 | search_path pins + `is_active` in `user_can_edit` (C-8) | S | apply |
| 7 | Live recon: `organizations` RLS, drop `unsynced_qb_entries`, confirm no dashboard-only policies drifted (C-9) | S | **yes** |
| 8 | Photo bucket assignment scoping; `p_org` checks; push org; sow delete (C-10, C-11) | S | apply |
| 9 | `is_user_active` + `NULLIF` in crew/foreman RPCs (C-12) | S | apply |
| 10 | `vercel.json` headers; `EDIT` on org-only write policies (C-13, C-17) | S | apply |
