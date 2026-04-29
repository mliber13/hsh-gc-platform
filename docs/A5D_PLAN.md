# A5-d Plan: App Code Cleanup + Storage Path Migration

**Prerequisite:** A5-c.2 complete (all RLS policies filter on `organization_id_uuid`). ✅ Done 2026-04-27.

**Goal:** eliminate `'default-org'` text writes from app code; migrate storage object paths from `default-org/...` prefix to `<HSH_UUID>/...`. Prepares for A5-e (in-place type conversion of `organization_id` text → uuid + drop scratch column + add NOT NULL/FK).

## 1. Inventory of `'default-org'` literals in `src/`

Captured 2026-04-27 via grep. **20 occurrences across 9 files.**

### 1.1 Three usage patterns

| Type | Pattern | Behavior | Action |
|---|---|---|---|
| **A — Fallback writes** | `profile.organization_id \|\| 'default-org'` | Falls back when no profile org | Replace with hard-fail OR resolve via authenticated user context |
| **B — Hardcoded writes** | `organization_id: 'default-org'` (with TODO) | Explicit placeholder | Wire up real user context |
| **C — Validation guards** | `id === 'default-org' ? null : id` | Excludes 'default-org' from being written as valid value | Keep (pre-existing guard pattern) — simplify to remove the literal once column is uuid |

### 1.2 File-level breakdown

| File | Type | Lines | Notes |
|---|---|---|---|
| `src/services/supabaseService.ts` | A (fallback) | 381, 482, 624, 767, 3160, 3932 | 6 fallback sites; centralized service. Replace with `requireUserOrgId()` helper that throws if missing. |
| `src/services/sowService.ts` | C (guard) | 147, 149, 152, 264, 279 | Guards convert 'default-org' → null. Keep semantics; can simplify after A5-e. |
| `src/services/tradeCategoryService.ts` | A (fallback) | 38, 53 | 2 fallback sites |
| `src/services/laborImportService.ts` | A (fallback) | 38, 40 | 2 fallback sites |
| `src/services/selectionScheduleService.ts` | A (fallback) | 143, 283 | 2 fallback sites |
| `src/services/planHybridService.ts` | A (fallback) | 158 | 1 fallback site |
| `src/services/formService.ts` | B (hardcoded) | 203 | 1 hardcoded write with `// This would come from user context` comment |
| `src/components/ProjectForms.tsx` | B (hardcoded) | 103 | 1 hardcoded write with `TODO: Get from user context` |
| `src/services/backupService.ts` | comment | 98 | Just documentation, no actual `'default-org'` write |
| `src/hooks/usePermissions.ts` | special | 32 | Uses `'offline'` literal (not `'default-org'`) for offline-mode profile shape — out of A5-d scope |

### 1.3 Other observations

- **Zero references to `organization_id_uuid`** across the entire `src/` tree. App code writes text only; the bridge trigger fills the uuid column on every insert/update.
- 20 files reference `organization_id` in some form (in queries / type definitions / writes). After A5-d, the only legitimate writers of `organization_id` should be code paths that resolve from authenticated user context.

## 2. Storage path migration

Pre-flight grep on `src/` found **no `default-org/` literals in code paths.** This means the prefix is constructed dynamically — likely via a pattern like `${profile.organization_id}/${path}`. Need a deeper read in the storage upload code paths to confirm.

Affected services (from `storage.from(...)` call pattern grep):
- `src/services/selectionBookService.ts` (selection-images bucket — 6 remove calls)
- `src/services/selectionScheduleService.ts` (selection-images bucket — 2 remove calls)
- `src/services/supabaseService.ts` (multiple buckets — 5 remove calls)

**Storage migration considerations:**
- Existing objects under `default-org/` need to be moved to `<HSH_UUID>/` path before app code switches to writing UUID-prefixed paths. Otherwise old objects become invisible under UUID-scoped storage policies.
- Mystery folder `7507f8ea-f694-453b-960e-3f0ea6337864/` (H27) needs investigation before move — provenance unclear.
- Buckets affected (per A5_PLAN.md §7.4): `quote-documents`, `quote-attachments`, `project-documents`, `selection-images`, `deal-documents` (as applicable).

## 3. Proposed chunking

### A5-d.0 — Helper utility

Create a single `requireUserOrgId()` (or similar) helper that:
- Resolves the current user's `organization_id` from the authenticated session / cached profile.
- Throws if missing (no fallback).

This becomes the One Right Way to write `organization_id` in app code. Reduces duplication and makes A5-e's text → uuid conversion mechanical (one helper to update).

### A5-d.1 — Fix hardcoded writes (Type B, easiest)

- `src/services/formService.ts:203`
- `src/components/ProjectForms.tsx:103`

These have explicit TODO comments asking to be wired up. Smallest possible chunk.

### A5-d.2 — Replace fallback writes (Type A)

One sub-chunk per service file. Starting with the smallest:
- A5-d.2a: `tradeCategoryService.ts`, `laborImportService.ts`, `selectionScheduleService.ts`, `planHybridService.ts` (1–2 sites each)
- A5-d.2b: `supabaseService.ts` (6 sites in one large file — keep separate)

For each: replace `profile.organization_id || 'default-org'` with `requireUserOrgId()`.

### A5-d.3 — Storage path migration

Two-step:
1. Read storage upload code paths in `selectionBookService.ts` / `supabaseService.ts` and confirm path prefix is dynamic (assumed) or hardcoded somewhere.
2. Coordinate move-then-cutover: server-side script to move all objects under `default-org/` → `<HSH_UUID>/`, then app code update to write UUID-prefixed paths going forward. Includes H27 investigation (mystery `7507f8ea-…/` folder) before any move.

### A5-d.4 — sowService.ts guard simplification (optional)

The 5 sites in `sowService.ts` are validation guards (Type C), not writes. They convert `'default-org'` → `null` defensively. After A5-e converts the column to uuid, these guards become effectively no-ops (since `'default-org'` would no longer be a valid value to even pass through). Can simplify or leave as belt-and-suspenders.

## 4. Validation strategy

Per A5_PLAN.md §5.6:
- After each A5-d chunk: `rg "'default-org'"` in `src/` should show fewer matches over time, ending at zero (or only Type C guards remaining).
- Runtime check: confirm no app code path writes `'default-org'` to `organization_id` after A5-d.0–2 land.
- After A5-d.3: confirm no app code constructs storage paths with `'default-org'` prefix; existing objects moved to `<HSH_UUID>/`.

## 5. Risk and gating

- **Bridge trigger covers us during A5-d.** While app code still writes `'default-org'` text, the bridge trigger maps it to HSH_UUID and fills `organization_id_uuid`. Existing RLS policies (post-A5-c.2) filter on uuid, so HSH users continue to see their data normally. There is no in-flight breakage during the A5-d migration window.
- **A5-e is the sharp edge.** Once we drop the text column / add NOT NULL on uuid, any remaining text-writing code path will fail. A5-d must be 100% complete before A5-e.
- **Storage migration is the biggest unknown.** Need to read the upload code paths and understand current prefix construction before scoping the migration script.

## 6. Out of scope for A5-d

- H24 (`quote_requests` `qual: true` public read) — separate security review.
- H27 (mystery `7507f8ea-…` storage folder) — gates A5-d.3 but is its own investigation.
- H28 (drop `DEFAULT 'default-org'` on profiles) — A5-e cleanup.

## 7. Suggested first-session start

When you pick this up next session:
1. Read `src/services/formService.ts:203` and `src/components/ProjectForms.tsx:103` (the two Type B sites).
2. Decide on the `requireUserOrgId()` helper API and where it lives.
3. Land A5-d.0 (helper) + A5-d.1 (the two TODO sites) as the first concrete deliverable. Smallest possible win to validate the pattern before scaling to the 14 fallback sites.

## 8. Session log

### 2026-04-28 — A5-d.0 + A5-d.1 + partial A5-d.2

**Landed:**

- **A5-d.0** — `requireUserOrgId()` helper in `src/services/userService.ts`. Throws if no authenticated user / no profile / no `organization_id`. Returns whatever `profiles.organization_id` currently holds (text today, uuid post-A5-e). Documented behavior + pointer to `getCurrentUserProfile` for read paths.
- **A5-d.1 — Type B hardcoded sites:** `src/services/formService.ts:203` and `src/components/ProjectForms.tsx:103`. Both now resolve via `await requireUserOrgId()`.
- **Partial A5-d.2 — Type A user-context fallbacks:** 4 more sites converted across 3 files:
  - `tradeCategoryService.ts:53` (`createTradeCategory`) — reordered so `isOnlineMode()` short-circuits before `requireUserOrgId()`, preserving offline = no-op semantics.
  - `laborImportService.ts` — internal `getCurrentOrgId()` rewritten as a thin wrapper around `requireUserOrgId()`. All 3 callers (`saveQboWageConfig`, `createLaborBurdenGlobalRate`, `setLaborBurdenGlobalRate`) already gate on `isOnlineMode()` first, so behavior preserved offline.
  - `planHybridService.ts:158` — inline null-check on `userProfile.organization_id` since `userProfile` was already fetched and used for `user_id`. Avoids a redundant Supabase round-trip.

**Verification:** `npx tsc --noEmit` clean after each batch. App not runtime-tested (smoke deferred).

**Defer-list (decided mid-session, NOT done):**

- `src/services/supabaseService.ts` (6 sites) — pattern is `projectRow?.organization_id || profileOrgId || 'default-org'`. **Different bug shape** than user-context fallback: these sites read from project row data, not from user. Some lines have an early null-guard on projectRow (e.g., line 372–375), some don't (e.g., line 482). Per-site analysis required; mechanical replacement is unsafe.
- `selectionScheduleService.ts` (2 sites at 143, 283) — same `projectData` fallback pattern as supabaseService. Same per-site analysis required.
- `sowService.ts` (5 sites) — Type C validation guards. Keep semantics; simplify post-A5-e.
- `backupService.ts:98` — comment only, no real `'default-org'` write.
- `tradeCategoryService.ts:38` — read path inside `getTradeCategories`. Harmless under RLS. Low priority.

**Status:** 6 of 20 literal `'default-org'` occurrences replaced (`grep -rn "'default-org'" src/` now reports 16 remaining; the discrepancy from "20 minus 6 = 14" reflects that some original sites had multiple occurrences inside one function). 8–9 of the remaining are real code paths still to convert; ~5 are validation guards or comments.

**Next-session start point:**

1. Walk `supabaseService.ts:372–381` — read context, decide null-handling strategy for `projectRow` (early-guard pattern vs. explicit throw).
2. Apply the same decision to the other 5 supabaseService sites + 2 selectionScheduleService sites (all share the project-data fallback pattern).
3. Verify with `npx tsc --noEmit`.
4. Decide whether read-path fallbacks (tradeCategoryService.ts:38) are worth converting, or leave them under RLS protection.

### 2026-04-28 (continued) — A5-d.2 (project-data fallbacks) + A5-d.3 storage investigation

**Landed:**

- **8 more `'default-org'` fallback sites converted:**
  - `supabaseService.ts` 6 sites (project activation L381, `createWorkPackage` L482, `upsertMilestone` L624, `createGameplanPlay` L767, proforma save L3160, project proforma version save L3932). Pattern: existing null-guard preserved or added; fallback chain `projectRow.organization_id || profileOrgId || 'default-org'` collapsed to `projectRow.organization_id`. Functions that lacked a projectRow null-guard now fail-fast (return null/false) when projectRow is missing — this is strictly better than writing 'default-org' to mask the bug.
  - `selectionScheduleService.ts` 2 sites (`saveSelectionScheduleDraft` L143, `saveSelectionScheduleVersion` L283). Same pattern.
- **TypeScript clean** after each batch (one initial `return null` vs. `return false` mismatch caught and fixed).
- **Dead-code marker:** sites 2/3/4 (createWorkPackage, upsertMilestone, createGameplanPlay) still fetch `profile` and derive `profileOrgId` even though it's no longer used. Marked with comment for cleanup pass; TS doesn't error because `noUnusedLocals` is off.

**Deferred (decisions made mid-session, NOT done):**

- **`sowService.ts` (5 sites) — Type C validation guards.** Looked deeper: these aren't simple guards — they're working around the fact that `sow_templates.organization_id` is uuid-typed but `profile.organization_id` is text-typed. Current code writes NULL when profile holds 'default-org' (since text isn't a valid uuid), explaining why many sow_templates rows have NULL org_id. The proper fix is to query `profile.organization_id_uuid` (which IS uuid) instead of `profile.organization_id`, then drop the validation guards entirely. This is a refactor, not a mechanical replacement, and is best done post-A5-e when the column type forces the issue. **Sister helper `requireUserOrgUuid()`** would be the natural complement to `requireUserOrgId()` for uuid-typed tables.
- **`tradeCategoryService.ts:38`** — read-path fallback. Harmless under RLS (NULL `organization_id_uuid` → no rows visible to invite-first users; the fallback is functionally a no-op). Leave for cleanup pass.
- **`backupService.ts:98`** — comment only, no real `'default-org'` write. Cosmetic.
- **`usePermissions.ts:32`** — uses `'offline'` literal (offline-mode permissions shape), not `'default-org'`. Out of A5 scope entirely.

**A5-d.3 storage path investigation:**

Read all upload sites to understand current path construction:

| File | Line | Bucket | Path pattern |
|---|---|---|---|
| `quoteService.ts` | 130, 158 | `quote-attachments` | `${organizationId \|\| user.id}/${projectId}/${fileName}` (UUID-format-validated org; falls back to user.id if not valid UUID) |
| `quoteService.ts` | 485 | `quote-documents` | `${orgId}/${quoteRequestData.project_id}/${fileName}` |
| `selectionBookService.ts` | 531 | `selection-images` | `${orgId}/${book.project_id}/${roomId}/${fileName}` |
| `selectionBookService.ts` | 781 | `selection-images` | `${orgId}/${book.project_id}/${roomId}/specs/${fileName}` |
| `selectionScheduleService.ts` | 44 | `selection-images` | `${orgId}/${projectId}/selection-schedules/${fileName}` |
| `supabaseService.ts` | 2975 | `quote-documents` | `${profile.organization_id}/${projectId}/${fileName}` |
| `supabaseService.ts` | 4033 | `project-documents` | `${profile.organization_id}/${projectId}/${fileName}` |
| `supabaseService.ts` | 4495 | `deal-documents` | `${profile.organization_id}/${dealId}/${fileName}` |

**Implications:**

1. **Path prefix is `profile.organization_id` everywhere.** Currently text `'default-org'` on prod → existing objects live at `default-org/<...>` paths.
2. **H27 mystery folder solved (likely):** `quoteService.ts:129` has `orgPath = organizationId || user.id` where `organizationId` is filtered through a UUID-format regex. If `profile.organization_id` is `'default-org'`, regex fails → `organizationId` becomes null → fallback to `user.id` (auth UUID). The folder `7507f8ea-f694-453b-960e-3f0ea6337864/` is almost certainly an auth user_id from this fallback, not an unrelated/orphan UUID. **Confirm by cross-checking that UUID against `auth.users.id` for known HSH users.**
3. **Post-A5-d cutover:** when `profile.organization_id` becomes a UUID (A5-e in-place conversion, OR app code switch to `requireUserOrgUuid()`), new uploads go to `<HSH_UUID>/<...>` paths. Existing objects at `default-org/<...>` and `<user.id>/<...>` become invisible under uuid-prefixed storage RLS policies.

**Storage migration plan (A5-d.3 actual execution — separate session):**

1. Inventory: enumerate all objects in each affected bucket (`quote-attachments`, `quote-documents`, `project-documents`, `deal-documents`, `selection-images`).
2. Cross-check `7507f8ea-…` UUID against `auth.users.id` to confirm H27 origin.
3. For each `default-org/<...>` object: server-side move to `<HSH_UUID>/<...>`. Use Supabase Storage API or SQL.
4. For each `<user.id>/<...>` object (where user.id ≠ HSH_UUID): server-side move to `<HSH_UUID>/<...>`.
5. Update any DB columns storing `file_path` (e.g., `project_documents.file_path`, `deal_documents.url`, `quote_requests.attachments`) so paths reflect the new prefix.
6. App code already constructs the new path automatically once `profile.organization_id` holds the UUID — no code change needed here.

This is a server-side data migration with care needed around (a) atomic move + DB update, (b) avoiding broken file references during the window. **Best done in a maintenance window.**

**Status (end of 2026-04-28):**

- 14 of 20 `'default-org'` literals replaced. Remaining 6 are: 5 sowService Type C guards (deferred to post-A5-e) + 1 backupService comment + 1 tradeCategoryService read-path + 1 usePermissions 'offline' (different literal, out of scope).
- Net effect: every write path that takes a project context (most app writes) now resolves org id from data (project row) or from authenticated user, with explicit failure on missing — no more `'default-org'` band-aid masking real auth/data bugs.
- A5-d.3 storage migration: planned but not executed. Code is already correct; data migration awaits a maintenance window.

**A5-d completion estimate update:**

- Code-side: ~95% complete (sowService cleanup is the only remaining real refactor; deferring is fine).
- Storage-side: 0% executed but fully planned. ~1 maintenance-window session.
- **Practical "A5-d done" target: 1 more focused session** for storage migration + tradeCategoryService read-path tidy + sowService refactor (or defer to A5-e).

---

## 9. A5-d.3 storage migration — full spec (2026-04-28)

Investigation complete. This section is the canonical reference for the maintenance-window session that executes the migration.

### 9.1 Object inventory (prod, run 2026-04-28)

| Bucket | Total | `default-org/…` | `7507f8ea-…/…` (Mark's user.id) | `abdcfc61-…/…` (Jennifer) |
|---|---:|---:|---:|---:|
| deal-documents | 42 | 42 | — | — |
| project-documents | 56 | 56 | — | — |
| selection-images | 78 | 78 | — | — |
| quote-attachments | 15 | — | 14 | 1 |
| quote-documents | 16 | 7 | 9 | — |
| **Total** | **207** | **183** | **23** | **1** |

### 9.2 User identification

- **`7507f8ea-f694-453b-960e-3f0ea6337864`** = `mark@hshdrywall.com` (Mark Liber, system owner, active). Created 2025-10-15. The 23 objects are legit HSH business data uploaded by Mark via the `orgPath = organizationId || user.id` fallback in `quoteService.ts:129`. **Move to `<HSH_UUID>/…`**.
- **`abdcfc61-fd26-417e-8cf2-7d1ff5e52b17`** = `jenniferarnetthomes@gmail.com` (Jennifer Arnett). Created 2025-10-24, last sign-in 2026-02-06. Email is gmail (not @hshdrywall.com). **Status: TBD — confirm with Mark whether HSH staffer, partner, or deprecated test before deciding.** If HSH-scoped: move her 1 object alongside others. If not: leave or audit separately.

### 9.3 DB columns storing storage references (11 columns, 8 tables)

Each must be updated when an object's path changes:

| Table | Columns | Format |
|---|---|---|
| `deal_documents` | `file_path`, `file_url` | text — typically full Supabase URL or relative path |
| `project_documents` | `file_url` | text — Supabase URL |
| `quote_requests` | `attachment_urls` (ARRAY), `attachment_names` (ARRAY) | text array |
| `selection_room_images` | `image_url` | text |
| `selection_room_spec_sheets` | `file_path`, `file_url` | text |
| `sub_items` | `quote_file_url` | text — links to vendor quote docs |
| `submitted_quotes` | `quote_document_url` | text |
| `trades` | `quote_file_url` | text |

**Sample first** before bulk update — read 1 row from each column to confirm the path format (full URL vs. just the bucket path) so the find-and-replace is correct.

### 9.4 Sequencing — two viable execution paths

The catch: changing `profile.organization_id` from `'default-org'` text to UUID-as-text would break the bridge trigger on the next app write, because `organization_text_map` only has rows for `'default-org' → HSH_UUID` and `'system' → NULL`. A UUID-as-text value would resolve to neither.

**Path A: bundle with A5-e (recommended).** The type conversion in A5-e drops the bridge trigger and the text column entirely, replacing both with native uuid. Storage migration runs as part of the same maintenance window, after the column conversion. One window, one risk-bounded operation.

**Path B: standalone A5-d.3 (more sessions, less coupling).** Requires:
1. Pre-migration: insert HSH_UUID-as-text → HSH_UUID into `organization_text_map` so the bridge trigger handles UUID-as-text values gracefully.
2. Update all HSH user `profiles.organization_id` from `'default-org'` to HSH_UUID-as-text.
3. Move objects + update DB columns.
4. Continues to A5-e later as planned.

**Recommendation: Path A.** Less complexity, fewer maintenance windows, and A5-e is the natural home for this work since both deal with the same underlying state transition (text → uuid for the org column).

### 9.5 Path A execution outline (bundled with A5-e)

In rough order, all in one maintenance window:

1. **Take app offline** (or schedule low-traffic window). HSH usage volume is low enough that ~30–60 minutes downtime is tolerable.
2. **Verify pre-state**: confirm bucket counts match §9.1 (small counts may have grown if active uploads occurred).
3. **A5-e migrations:**
   - In-place type conversion: `ALTER TABLE … ALTER COLUMN organization_id TYPE uuid USING organization_id_uuid::uuid` for ~50 tables.
   - Drop scratch column `organization_id_uuid` everywhere.
   - Drop bridge trigger function and triggers.
   - Drop `organization_text_map` table.
   - Drop text helpers `get_user_organization()` / `current_user_organization_id()`.
   - Add NOT NULL + FK to `organizations(id)` on tenant-scoped tables.
4. **Storage object moves** (server-side script via service-role key + `@supabase/supabase-js` storage API):
   - For each bucket, list objects with each old prefix.
   - For each object: `storage.from(bucket).move(oldPath, newPath)`.
   - Old prefixes to map: `default-org/…` → `<HSH_UUID>/…`; `7507f8ea-…/…` (Mark) → `<HSH_UUID>/…`; `abdcfc61-…/…` (Jennifer) → decision pending §9.2.
5. **DB column updates** (single SQL transaction):
   - Identify the public-URL prefix that Supabase generates for each bucket. Pattern looks like `https://rvtdavpsvrhbktbxquzm.supabase.co/storage/v1/object/public/<bucket>/<path>`.
   - For each of the 11 columns in §9.3, run a single `UPDATE … SET col = REPLACE(col, oldPrefix, newPrefix)` where the substring match catches both URL forms (full + bucket-relative).
   - Run on each of: `deal_documents.file_path`, `deal_documents.file_url`, `project_documents.file_url`, `quote_requests.attachment_urls` (array — needs unnest+rebuild), `selection_room_images.image_url`, `selection_room_spec_sheets.file_path`, `selection_room_spec_sheets.file_url`, `sub_items.quote_file_url`, `submitted_quotes.quote_document_url`, `trades.quote_file_url`.
6. **App switch over.** Once `profiles.organization_id` is uuid and contains real UUIDs, app code automatically uses the new prefix on the next upload (no code change needed — the storage path construction reads `profile.organization_id` directly).
7. **Verification** (post-migration):
   - `select bucket_id, split_part(name, '/', 1) as prefix, count(*) from storage.objects where bucket_id in (...) group by 1, 2` — every prefix should be `<HSH_UUID>` (no `default-org`, no user.id values).
   - For each of the 11 DB columns, sample a few rows and confirm URLs resolve.
   - Click through one upload + one download per bucket in the app.
8. **Bring app back online.**

### 9.6 Rollback posture

- A5-e migrations are wrapped in `BEGIN; … COMMIT;` per chunk; failure rolls back atomically.
- Storage moves are NOT atomic with DB updates. If a storage move succeeds but the DB column update fails, the file_path in DB still points to the old path → broken link. Mitigation: do all storage moves first (idempotent — `move` errors gracefully if dest already exists), then do DB updates as one transaction. If DB transaction rolls back, storage objects are at new path but DB still references old — rerun the DB update.
- Hard rollback: re-run storage moves in reverse + restore the text column from a pre-migration backup. Backup before A5-e is mandatory.

### 9.7 Pre-migration prep checklist

Before the maintenance-window session:

1. Resolve §9.2 question: who is Jennifer Arnett? HSH-scoped or not?
2. Confirm Supabase backup is recent (or take fresh snapshot).
3. Read the 11 DB columns to determine exact URL/path format (full https URL vs. bucket-relative).
4. Write the storage-move script + the DB-update SQL ahead of time. Dry-run the SQL against a snapshot if possible.
5. Schedule the window. ~30–60 min realistic.

This document is the runbook for that session.

---

## 10. A5-d closure (2026-04-29)

**A5-d is complete** as of the prod cutover today. See `A5_PLAN.md` §12 for the full closure log.

- A5-d.0 + A5-d.1 + A5-d.2: app code cleanup committed in `c28a888` (2026-04-28).
- A5-d.3 storage migration: executed today (2026-04-29) via `scripts/a5e-storage-migration.mjs`. 207 objects moved, 11 DB columns updated, 95 signed URLs re-signed, quote_requests array rewritten. Bundled with A5-e in a single maintenance window per the recommended Path A.
- Jennifer Arnett (per §9.2 open question) confirmed as HSH staff; her 1 quote-attachment object moved alongside the rest.
- Two ghost metadata entries (`smoke-test-pd.pdf`, `smoke-test-qd.pdf`) remain in `storage.objects` index without backing files. Cosmetic; safe to leave or clean up later.

**Remaining housekeeping items not yet executed (deferred to later sessions, not blocking A5):**

- `sowService.ts` 5 Type C validation guards (audit-tracked deferred). Now that `sow_templates.organization_id` is uuid-typed, the guards work as intended; can be simplified to a single `requireUserOrgId()` call in a follow-up cleanup pass.
- `tradeCategoryService.ts:38` read-path fallback. Harmless under RLS.
- `backupService.ts:98` comment-only reference.
- `usePermissions.ts:32` 'offline' literal — separate offline-mode concern, out of A5 scope.
- 2 ghost storage entries (cosmetic).
- Drywall `getOrganizationId()` fallback to `'default-org'`. Safe today (all HSH staff profiles have HSH_UUID; fallback is dormant). Should be replaced with throw-if-missing pattern in a follow-up to harden against future invite-first users.