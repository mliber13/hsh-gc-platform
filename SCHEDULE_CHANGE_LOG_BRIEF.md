# Schedule Change Log — implementation brief

## Goal
An operator-reviewable audit trail of **every** schedule change — who changed what item,
from what to what, when — capturing **all** edits regardless of path (operator desktop
edits, field-foreman mobile adjusts, cascades, imports). Two review surfaces: a global
feed (filter by person) and a per-project history. Operators only.

Locked decisions (Mark): (1) both surfaces — global feed + per-project history;
(2) operators only can view; (3) log all mutations — dates, reassignments, status,
create, delete.

## Why a DB trigger (not app-level logging)
All schedule writes hit `schedule_items` — operator `scheduleService`, the foreman
`foreman_apply_schedule_changes` RPC, cascades, imports. A single trigger on that table
captures everything and can't be bypassed or forgotten. App-level logging would have to
instrument every write path and would miss some. Use the trigger.

---

## 1. Migration

### Audit table
`public.schedule_item_changes`:
- `id uuid PK default gen_random_uuid()`
- `schedule_item_id uuid` (keep even after the item is deleted; no FK cascade, or FK with ON DELETE SET NULL)
- `project_id uuid`
- `organization_id uuid NOT NULL`
- `changed_by uuid` (the actor; from `auth.uid()`, nullable for system/import)
- `changed_by_name text` (denormalized display name captured at write time — see trigger)
- `changed_at timestamptz NOT NULL default now()`
- `action text NOT NULL CHECK (action IN ('created','updated','deleted'))`
- `item_name text` (snapshot of the item name, so deleted items still read well)
- `txid bigint NOT NULL default txid_current()` (correlation — groups one transaction's rows, e.g. a cascade batch)
- `changes jsonb NOT NULL` (map of changed field → {old, new}; for created all fields as {old:null,new:val}; for deleted {old:val,new:null})

Indexes: `(organization_id, changed_at DESC)`, `(project_id, changed_at DESC)`,
`(changed_by, changed_at DESC)`, `(txid)`.

### Trigger function `public.log_schedule_item_change()`
- `RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`.
  SECURITY DEFINER so it can INSERT the audit row and read `profiles` for the actor name
  regardless of who's editing (a foreman/crew caller can't write the audit table directly).
- Actor: `v_uid := auth.uid()` (this returns the real JWT user even inside the foreman's
  SECURITY DEFINER RPC — the caller, not the definer). Resolve `v_name` best-effort from
  `profiles` (full_name/display_name if the column exists, else email, else NULL) for
  `changed_by = v_uid`.
- **INSERT (AFTER):** action 'created', changes = new field values, item_name = NEW.name.
- **UPDATE (AFTER):** compare OLD vs NEW for the tracked fields; build `changes` only from
  fields that actually changed (use `IS DISTINCT FROM`, which handles NULLs and arrays).
  **If no tracked field changed (e.g. only `updated_at`), do NOT insert a row** (skip noise).
- **DELETE (AFTER):** action 'deleted', changes = old field values, item_name = OLD.name.
- **Tracked fields = ALL schedule-defining columns:** `name`, `type`, `start_date`,
  `end_date`, `duration`, `status`, `assigned_persons`, and the predecessor fields the table
  actually uses (`predecessor_ids` + `lag_work_days`, and/or `predecessors` jsonb — include
  whatever exists). Also `lead_person_ids`, `supplier_id` if present. (Ignore `updated_at`,
  `percent_complete` churn — but include `status`.)
- Set `txid = txid_current()` (default handles it), `changed_at = now()`.

### Trigger
`CREATE TRIGGER trg_log_schedule_item_change AFTER INSERT OR UPDATE OR DELETE ON
public.schedule_items FOR EACH ROW EXECUTE FUNCTION public.log_schedule_item_change();`

### RLS (operators only, append-only)
- `ALTER TABLE public.schedule_item_changes ENABLE ROW LEVEL SECURITY;`
- SELECT policy: `USING (organization_id = public.get_user_organization_uuid() AND public.user_can_edit())`
  — operators (owner/office) in-org only. Crew/foreman/viewer get nothing (user_can_edit = false).
- **No INSERT/UPDATE/DELETE policies for users** — the SECURITY DEFINER trigger is the only
  writer; nobody edits the log. (Confirm the trigger's definer owner can insert; it bypasses RLS.)
- Pin `search_path` on the trigger function (audit flagged unpinned definer fns before — don't
  repeat that).

---

## 2. Service (`src/services/scheduleChangeLogService.ts`, new)
- `fetchScheduleChanges(opts: { projectId?: string; changedBy?: string; limit?: number; before?: string }): Promise<ScheduleChangeEntry[]>`
  - Reads `schedule_item_changes` (operator RLS enforces access), org-scoped implicitly.
  - Filters: `projectId` (per-project history), `changedBy` (person filter for the global feed),
    ordered `changed_at DESC`, paginated by `limit` (+ `before` cursor).
  - Return typed rows incl. `changedByName`, `action`, `itemName`, `projectId`, `changes`, `txid`, `changedAt`.
- `ScheduleChangeEntry` type + a small formatter that renders a change human-readably, e.g.
  date move → "moved Jul 28 → Jul 30 (2 days later)", assigned_persons → "reassigned: +Doug, −Sam",
  status → "status: not-started → in-progress", created/deleted → plain.
- **Group cascades:** provide a grouped view keyed by `txid` so one transaction (a move + its
  cascaded dependents) reads as one event: "Jeremy moved Hang Jul 28→30 (+3 dependents shifted)".
  Expose both raw entries and a `groupByTxid` helper.

## 3. UI (operator-only; gate on canViewDrywallFinancials-style operator check / user_can_edit)
### A. Global feed
- A "Schedule activity" view in the operator drywall area — simplest home is a tab/section on
  the portfolio schedule page (`src/components/drywall/schedule/portfolio/…`) or a dedicated route.
- Reverse-chron list, grouped by txid. Each event: actor name, action summary, item + project,
  timestamp. **Filter by person** (dropdown of actors present) and optionally by project.
- This is the "show me everything Jeremy did this week" surface.

### B. Per-project history
- A "Schedule history" panel/drawer on the project's schedule view (operator side) — same list,
  scoped to that `projectId`, so a job's schedule timeline is visible in context.

Both are read-only. Do NOT surface the log in `/crew` (foreman/crew don't see it — decision #2).

---

## 4. Verification
- `npx tsc --noEmit` clean; existing schedule/foreman tests green.
- **Trigger coverage:** as an operator, edit a schedule item on desktop → a row appears with
  your name and old→new dates. As Jeremy (foreman) or via the foreman RPC, move an item that
  cascades → the moved item + each cascaded dependent are logged, all sharing one `txid`, actor
  = Jeremy. Create and delete an item → 'created' / 'deleted' rows. A no-op save (touch only
  `updated_at`) → NO row.
- **Access:** operator sees the feed + per-project history; a crew/foreman account gets nothing
  from `schedule_item_changes` (RLS denies). Verify the RPC-driven foreman edit still logs the
  correct `changed_by` (auth.uid() = the foreman, not the RPC definer).
- **Grouping:** a cascade shows as one grouped event with a dependents count, not N loose rows.

## 5. Notes / future
- **Retention:** the table is append-only and grows (cascades multiply rows). Fine at current
  volume; add a prune/retention job later (e.g. keep 12–24 months). Out of scope now — just note it.
- **Actor name:** denormalized at write time; if `profiles` has no display-name column, fall back
  to email. Confirm what `profiles` exposes.
