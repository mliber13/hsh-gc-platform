# Field Foreman — Phase 1 implementation brief (crew-expansion approach)

## Approach decision
Do **NOT** make Jeremy an operator. Keep him **`roles = ['crew']`** and add an **`is_field_foreman`
capability flag** that expands his existing mobile `/crew` workspace. Rationale:
- His **measuring works unchanged** — no dual-role, no CrewShell surgery, no risk to what he does daily.
- `/crew` is **cost-free by construction** — the entire "hide material costs / margins / pricing"
  problem never arises (no cost-gating work at all).
- Mobile-first, which is where a field foreman lives.

This replaces the earlier operator-role plan. Timeline: needed **next week**.

## Locked scope (from Mark)
- **Order/delivery status: YES. Costs/pricing/margins/pay: NO** — and with this approach, none exist in
  `/crew` to hide.
- **Schedule: manage/adjust only** (nudge dates, reassign a person, mark status) on **all** projects.
  NOT build-from-scratch, NOT cascade/predecessor construction (that stays Mark's, on desktop).
- **Still measures**, and **Mark still approves** every measurement — unchanged.
- No GC-side access. (GC seeing drywall costs is fine and unaffected — this is all `/crew`.)

---

## 1. The capability flag
Follow the existing capability-flag pattern (`is_meeting_operator`, `can_run_payroll`, `can_admin_qb`).
- **Migration:** `profiles.is_field_foreman boolean NOT NULL DEFAULT false`.
- **rbac wiring:** add an `isFieldForeman(profile)` helper (`src/lib/rbac.ts`) reading the flag; expose it
  through `usePermissions()` / the crew profile so client + services can branch on it.
- **Jeremy:** `roles = ['crew']`, `is_field_foreman = true`. (Set directly for launch; an operator toggle
  on `CrewAccountsPage.tsx` is nice-to-have polish, not required next week.)
- Regular crew: flag false → **zero behavior change** (guard every new branch on the flag).

---

## 2. Broaden the crew data scope (foreman sees ALL drywall projects)
Today crew see only their assigned items (`fetchAssignedScheduleRows` filters
`.contains('assigned_persons', [personId])`, `crewWorkspaceService.ts:191`; list built
`:341-409`). When `is_field_foreman`:
- Return schedule items across **all** drywall projects in the org (drop the assignment filter; keep the
  same drywall-project scoping used elsewhere). Keep the existing date-window behavior so the list stays
  current/upcoming, not the entire history.
- Header copy: for foreman, "My jobs" → **"All jobs"** (or "Projects").
- **Measuring stays assignment-gated** — `crew_has_measure_assignment` is untouched, so he measures only
  where assigned to measure, but *manages* everywhere. Correct.

---

## 3. Crew job detail for a foreman (cost-free)
On the crew job detail (`CrewProjectDetailPage.tsx` + `mapProjectDetail`, `crewWorkspaceService.ts:1053+`),
when `is_field_foreman`, show full job info on **any** project regardless of the specialty / `show_job_info`
gates that limit normal crew:
- **Show:** scope of work, **full materials list** (what/how many — bypass the per-specialty material
  filtering at `crewWorkspaceService.ts:598-668`), field measurement data, field photos, comms, current
  schedule.
- **Hide:** the "Job size / pay" block (that's a $ figure). Keep it suppressed for foreman — no costs.
- **Add:** an **order/delivery status** card (see §5).

Note: this sidesteps the open Roberto specialty bug for foreman specifically (he bypasses the specialty
gate), but that bug still needs its own fix for regular crew — track separately.

---

## 4. Mobile schedule management (the one real build — with cascade)
Crew currently can only mark task progress (`crew_update_task_progress`), not edit schedule items. Add
**single-item adjust** for foreman — one item at a time, no drag, no predecessor *construction* — but it
**must cascade dependents** (moving a task shifts everything downstream, same as the desktop editor;
skipping this silently corrupts the schedule).

**Behavioral parity is required (Mark: "operate the same as I see").** A foreman item-edit must behave
**identically to the desktop editor** — same cascade AND the same predecessor-conflict **"Detach / Shift"**
prompt Mark gets (the portfolio inline-edit dialog, D.6.7). Reuse that conflict-resolution logic; do NOT
ship a simplified variant that silently resolves conflicts differently.

- **Reuse the existing cascade engine — do NOT reinvent.** `cascadeSchedule(items, options)`
  (`src/lib/scheduleDateMath.ts:174`) is the same pure function `DrywallScheduleEditor` uses. On a foreman
  edit: load that project's schedule items, apply his change (start/end/status/assignee), run
  `cascadeSchedule` with the **drywall** semantics (`lagSemantic: 'parallel-zero'`), and persist the whole
  recomputed batch. Dependent dates shift correctly, workday/holiday-aware, lag-0-same-day included.
- **New crew-write RPC** (SECURITY DEFINER, mirrors `crew_clock_in` / `save_field_takeoff_as_measurer`
  validation): `foreman_apply_schedule_changes(p_project_id, p_items jsonb)` — accepts the cascaded batch
  of `{id, start_date, end_date, status, assigned_persons, duration}` and writes them to `schedule_items`.
  Guard: caller has crew role **and** `is_field_foreman = true` **and** `organization_id` matches. (Compute
  cascade client-side with the shared function; the RPC just authorizes + writes the batch.)
- **Watch the dangling-predecessor gotcha:** `cascadeSchedule` skips predecessor refs whose target isn't in
  the item set (`scheduleDateMath.ts:157,194,221`), so ties to deleted items silently no-op — same as
  desktop; don't introduce new handling, just be aware chains can look "detached."
- **Sub notifications: SILENT (locked).** Texting isn't set up yet, so foreman edits persist date shifts
  but never invoke `scheduleCascadeDiff`'s SMS path. Wire nothing to Twilio here. Revisit when customer/sub
  texting is live.
- **Mobile UI:** a per-item edit sheet on the crew job detail's "Your schedule" card — date pickers, a
  status selector, and an assigned-persons multi-select (reuse the team list behind
  `AssignedPersonsPicker`). Show the cascaded result (which downstream items moved) before/after save so
  Jeremy sees the ripple. One item edited at a time.
- Keep the existing crew **task-progress** "mark done" as-is; this adds *item-level* date/assignee/status
  management (with cascade) on top.

---

## 5. Order/delivery status in /crew (cost-free — reuse supplier data)
Add an order-status view for foreman. The supplier data is already cost-free (status, delivery date, item
count, quoted sqft — **no dollars**): `supplierOrdersService.ts` (`SupplierOrderRow`/`SupplierUpcomingRow`),
as rendered by `DrywallSupplierOrdersPage.tsx`. Surface a mobile per-project order-status card on the crew
job detail (order label, `OrderStatusBadge`, delivery date, item count). Do **not** plumb any cost fields.

---

## 6. Comms on all projects
Normal crew post/read comms only on assigned projects. When `is_field_foreman`:
- Let him post/read comms on **any** drywall project (broaden the crew comms path — verify
  `append_drywall_comms_log_entry` allows it or add a foreman-guarded path).
- Broaden his comms **unread** scope from assigned-only to all drywall projects
  (`commsReadStateService.ts` — foreman uses the all-projects scope, like operators, but stays in `/crew`).

---

## 7. Unchanged (verify no regressions)
- **Measuring:** measurer specialty, `save_field_takeoff_as_measurer`, submit → Mark approves via
  `FieldTakeoffReviewBanner` — all untouched.
- **Regular crew** (flag false): assigned-only list, specialty-filtered materials, no schedule editing —
  identical to today.
- **Owner / office_drywall:** unaffected.

---

## 8. Verification
1. `npx tsc --noEmit` clean; crew + rbac tests green.
2. **As Jeremy (`crew` + `is_field_foreman`, phone viewport):**
   - `/crew` lists **all** drywall projects, not just assigned.
   - Open any project → scope + full materials list + order/delivery status + comms visible; **no dollar
     amounts / pay anywhere**.
   - Open a schedule item → push its date → **dependents cascade** (downstream items shift, matching the
     desktop editor); reassign a person and set status also persist via the RPC. No sub SMS fires.
   - Post a comms note on a project he's not assigned to → succeeds.
   - Measure an assigned measure item → submit → (as Mark) approve via the banner. He can't self-approve.
3. **As a regular crew user:** everything identical to today (assigned-only, specialty materials, no
   schedule edit).
4. **As owner/office:** unchanged.

---

## 9. Open decisions / defaults
- **Flag setter:** launch by setting `is_field_foreman` directly on Jeremy's profile; operator toggle UI is
  polish.
- **Cascade:** included via the shared `cascadeSchedule` engine (dependents shift on date change). MVP edits
  one item at a time.
- **Sub SMS on foreman edits:** LOCKED silent — texting isn't set up yet; wire nothing to Twilio. Revisit
  post-texting.
- **Schedule-edit parity:** foreman item-edit must reuse the desktop editor's cascade + Detach/Shift
  conflict prompt (behaviorally identical), not a simplified mobile variant.
- **"All jobs" list volume:** if the all-projects list gets long, add a simple project filter/search
  (polish, not blocking).

## 10. Phase 2 (later, not now)
Per-project `foreman_id` ownership + routing field questions / inbound customer texts to the assigned
foreman; multiple foremen. Only worth it past a single foreman.

## Suggested build order (if the week gets tight)
1. `is_field_foreman` flag (migration + rbac + set on Jeremy).
2. Broaden crew list + job detail to all projects, cost-free (visibility — his core new value).
3. Schedule-item adjust RPC + mobile edit sheet.
4. Order-status card + all-projects comms.
