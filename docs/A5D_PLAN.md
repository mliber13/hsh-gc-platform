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