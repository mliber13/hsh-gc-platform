# A5-e Production Cutover Runbook

**Goal:** retire the dual-column `organization_id` (text) + `organization_id_uuid` (uuid) bridge pattern from production. After this runbook completes, every tenant-scoped table has `organization_id` as a true uuid type with FK to `organizations(id)`, and storage paths are reorganized under `<HSH_UUID>/...` prefixes.

**Status of inputs (validated 2026-04-29 on branch `clqgnnydrwpgxvipyotd`):**
- `supabase/migrations/20260429_a5e_typeconvert.sql` ✅ branch-applied, all post-checks green
- `supabase/migrations/20260429_a5e_storage_paths.sql` ✅ branch-applied (no-op there)
- `scripts/a5e-storage-migration.mjs` ✅ written, idempotent, not yet run

**Estimated total time:** 30–60 minutes including verification + manual app smoke.

---

## Pre-flight (10 min)

### 0.1 Confirm apps are offline
HSH staff must not be using either GC platform or Drywall app during the window. Mid-cutover writes from the app would either fail (during schema flip) or land at the old text path (before storage script runs).

### 0.2 Take a manual Supabase snapshot
1. Open Supabase Dashboard → project `rvtdavpsvrhbktbxquzm` → Database → Backups.
2. Trigger a manual backup. Wait for confirmation.
3. **Do not proceed if backup creation fails.**

The daily auto-backup at ~10:45 may not have fired yet today. The manual snapshot is the only safety net for hard rollback.

### 0.3 Confirm storage state hasn't drifted
Cursor query, prod read-only:

```sql
select bucket_id, split_part(name, '/', 1) as prefix, count(*) as n
from storage.objects
where bucket_id in ('quote-attachments', 'quote-documents', 'project-documents', 'deal-documents', 'selection-images')
group by bucket_id, split_part(name, '/', 1)
order by bucket_id, n desc;
```

Expected (from yesterday's inventory):
- deal-documents: 42 at `default-org/`
- project-documents: 56 at `default-org/`
- selection-images: 78 at `default-org/`
- quote-attachments: 14 at `7507f8ea-…/`, 1 at `abdcfc61-…/`
- quote-documents: 7 at `default-org/`, 9 at `7507f8ea-…/`

Total: 207 objects. If the count has grown significantly (say >215), someone uploaded mid-window and the script will pick those up correctly — no special handling needed, just note for the smoke test.

### 0.4 Verify env for the storage script

Ensure the user has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` available in the shell that will run the script. Quick check:

```bash
echo $SUPABASE_URL
echo ${SUPABASE_SERVICE_ROLE_KEY:0:10}...   # first 10 chars only, don't print whole key
```

Both should be set. If not, source `.env` or export them. **Do NOT commit the service role key to git.**

---

## Execution (15–30 min)

The order matters: storage moves first (object-level), then DB path REPLACE (text columns referencing those objects), then schema migration (column type flip).

### 1. Run the storage migration script (5–10 min)

From the repo root:

```bash
node scripts/a5e-storage-migration.mjs
```

The script outputs progress per phase:
- Phase 1: storage object moves (207 expected)
- Phase 2: re-sign signed URL columns (deal_documents.file_url, selection_room_images.image_url, selection_room_spec_sheets.file_url)
- Phase 3: rewrite quote_requests.attachment_urls array

**On success:** script exits 0 with summary like `=== A5-e storage migration complete in 45.2s ===`.

**On failure:** script exits 1 or 2 with error message. The script is idempotent — if Phase 1 partially succeeded, re-running picks up where it left off (already-moved objects are skipped). Phase 2/3 updates are likewise idempotent (re-running would re-sign URLs against the new paths, which still works).

### 2. Apply storage_paths SQL on prod (1 min)

**Cursor prompt:**

> Apply `supabase/migrations/20260429_a5e_storage_paths.sql` against Supabase project `rvtdavpsvrhbktbxquzm` (prod) only. Confirm COMMIT or paste full error.

This file is bulk text REPLACE on non-array, non-signed columns:
- deal_documents.file_path
- selection_room_spec_sheets.file_path
- project_documents.file_url (public URL)
- trades.quote_file_url, sub_items.quote_file_url, submitted_quotes.quote_document_url (public URLs)

Has its own internal post-check that fails the transaction if any old prefix remains.

### 3. Apply the schema migration on prod (2–5 min)

**Cursor prompt:**

> Apply `supabase/migrations/20260429_a5e_typeconvert.sql` against Supabase project `rvtdavpsvrhbktbxquzm` (prod) only. Confirm COMMIT or paste full error.

Single transaction, atomic rollback on any failure. Internal post-checks at step 11 cover all the V1–V6 verifications below.

### 4. Verify prod state

**Cursor prompt** (same V1–V6 as branch verification):

```sql
-- V1
select table_name, data_type
from information_schema.columns
where table_schema = 'public' and column_name = 'organization_id'
order by table_name;

-- V2
select count(*) as remaining_scratch_columns
from information_schema.columns
where table_schema = 'public' and column_name = 'organization_id_uuid';

-- V3
select proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('bridge_set_org_uuid', 'get_user_organization', 'current_user_organization_id');

-- V4
select count(*) as org_text_map_exists
from information_schema.tables
where table_schema = 'public' and table_name = 'organization_text_map';

-- V5
select count(*) as remaining_bridge_triggers
from information_schema.triggers
where trigger_schema = 'public' and trigger_name like '%bridge%';

-- V6
select count(*) as fk_count
from information_schema.table_constraints tc
join information_schema.constraint_column_usage ccu
  on tc.constraint_name = ccu.constraint_name
 and tc.table_schema = ccu.table_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
  and ccu.table_name = 'organizations'
  and ccu.column_name = 'id';

-- V7 (storage state confirmation post-script)
select bucket_id, split_part(name, '/', 1) as prefix, count(*) as n
from storage.objects
where bucket_id in ('quote-attachments', 'quote-documents', 'project-documents', 'deal-documents', 'selection-images')
group by bucket_id, split_part(name, '/', 1)
order by bucket_id, n desc;
```

Expected:
- V1: 56 rows, every `data_type` is `uuid`
- V2: 0
- V3: empty
- V4: 0
- V5: 0
- V6: 56
- V7: every prefix is `<HSH_UUID>` (no `default-org`, no user.id values)

---

## Manual app smoke (10–20 min)

Both apps must function normally with the new schema.

### 5.1 GC platform
- [ ] Login (HSH staff) → dashboard renders, no console errors
- [ ] Projects list → all 99 projects visible
- [ ] Open a project → detail page loads (estimates, trades, change orders, actuals)
- [ ] Open a project document → renders inline / downloads correctly (this exercises the new file_url path)
- [ ] Add a trade quantity / save estimate → succeeds
- [ ] Open a deal in Deal Workspace → loads with proforma data
- [ ] Open a selection book → images load (this exercises the re-signed image_url)
- [ ] Trade categories list → 21 system + 7 HSH visible
- [ ] Form templates → 4 visible
- [ ] (If you have a clean throwaway) create a new project document upload → succeeds and lands at `<HSH_UUID>/<projectId>/<filename>` path

### 5.2 Drywall app
- [ ] Login → dashboard renders
- [ ] Projects list → matches GC count
- [ ] Time entries view → loads (1 row)
- [ ] Pay periods → 13 visible
- [ ] Labor import batches → 13 visible
- [ ] (Optional) save a time entry → succeeds with HSH_UUID

### 5.3 Critical regression to watch
- Drywall's `getOrganizationId()` helper returns `'default-org'` text on a fallback. The Postgres uuid column will reject that with `invalid input syntax for type uuid: "default-org"`. **For current HSH staff this fallback never fires** (their profiles have HSH_UUID), but if you see this error in console, it's the audit's H21/Drywall-fallback issue and we patch Drywall as a follow-up. Not a runbook abort.

---

## Sign-off and commit

When V1–V7 + manual smoke are green:

### 6.1 Commit the migration files

**Cursor prompt** (issue commit + push):

```
Stage these files only (no -A):
  supabase/migrations/20260429_a5e_typeconvert.sql
  supabase/migrations/20260429_a5e_storage_paths.sql
  scripts/a5e-storage-migration.mjs
  docs/A5E_RUNBOOK.md
  (any updated A5_PLAN.md / A5D_PLAN.md sections recording closure)

Commit message:
  A5-e production cutover: text → uuid type conversion + storage migration

  Schema migration (DROP text + RENAME uuid → organization_id approach,
  bypassing RLS policy attnum dependencies):
    - 54 tables: dropped organization_id (text), renamed organization_id_uuid
      → organization_id (uuid)
    - 2 tables (quote_requests, sow_templates): dropped redundant scratch column
    - Dropped bridge_set_org_uuid function and 106 bridge triggers
    - Dropped text helpers get_user_organization, current_user_organization_id
    - Dropped organization_text_map
    - Dropped DEFAULT 'default-org' on ~30 tables
    - Added NOT NULL on 52 tables (skip profiles, trade_categories nullable)
    - Added FK to organizations(id) on all 56 tenant-scoped tables
    - Updated handle_new_user (no scratch column reference)

  Storage migration (Node script + bulk SQL):
    - Moved 207 objects from default-org/, 7507f8ea-..., abdcfc61-...
      prefixes to <HSH_UUID>/ prefix across 5 buckets
    - Re-signed 3 columns of signed URLs against new paths
    - Updated quote_requests.attachment_urls array
    - Bulk REPLACE on remaining file_path / file_url columns

  Validated end-to-end on branch clqgnnydrwpgxvipyotd before prod apply.
  Closes A5-d.3 + A5-e per A5_PLAN.md.

Push to origin master.
```

### 6.2 Update plan docs

Add closure notes to `docs/A5_PLAN.md` §9 and resolve outstanding A5-d items in `docs/A5D_PLAN.md` §8/§9.

### 6.3 Reopen apps to staff

If the team was instructed offline, signal back that they can return.

---

## Rollback procedures

### If schema migration fails
The migration is wrapped in `BEGIN; … COMMIT;`. Any failure rolls back atomically. Prod returns to the pre-A5-e state. Diagnose the error and adjust the migration before retry.

### If storage_paths SQL fails
Same — wrapped in transaction.

### If storage script fails mid-execution
The script is idempotent. Re-run picks up where it left off (already-moved objects skip via the `already exists` check). If a specific object fails repeatedly, investigate it manually.

### If post-cutover smoke surfaces a regression
Two options:
- **Forward-fix:** patch the issue in app code or a follow-up migration. Most likely scenario for any small bug.
- **Hard rollback:** restore from the manual snapshot taken at 0.2. Last resort. Reverses ALL changes including storage moves; requires re-applying the snapshot via Supabase point-in-time restore.

The forward-fix path is strongly preferred. Hard rollback should only be used if data corruption is observed.

---

## Out of scope for this runbook

Documented but explicitly NOT executed during this window:

- Drywall `getOrganizationId()` fallback to `'default-org'` (audit H21-class) — separate session post-A5-e
- sowService.ts Type C validation guards — easier to clean up post-A5-e once column is uuid
- H24 quote_requests `qual: true` policy — separate security review
- H28 drop `DEFAULT 'default-org'` on profiles — covered automatically by step 3 of A5-e migration
- Feature cleanup (Schedule vs Gameplan, Selection Book vs Selection Schedule) — separate workstream
