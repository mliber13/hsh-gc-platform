# Gameplan Retirement Plan

**Status:** ready to execute. Data exported, scope mapped. Estimated execution time: 60–90 min in a single focused session.

**Why retire:** the user (system owner) reports never having used the feature in production. The 109 prod rows are likely test/seed data from initial exploration. Schedule (`ScheduleBuilder.tsx`) covers the user's actual workflow needs.

---

## 1. Data preservation (✅ done 2026-04-29)

All three tables exported to JSON for forever-safety:
- `scripts/archive/gameplan_plays_export_2026-04-29.json` — 37 rows
- `scripts/archive/gameplan_playbook_export_2026-04-29.json` — 35 rows
- `scripts/archive/gameplan_default_playbook_export_2026-04-29.json` — 37 rows

Files committed to git in this branch (or will be on the retirement commit). If anyone ever needs to reconstruct gameplan data, the JSON has every column.

## 2. Scope (full inventory)

### Database tables (drop in dependency order)
| Table | Rows | Dependencies |
|---|---:|---|
| `gameplan_plays` | 37 | FK to `organizations(id)` (added in A5-e); RLS policies from C2-10; bridge trigger removed in A5-e |
| `gameplan_playbook` | 35 | Same |
| `gameplan_default_playbook` | 37 | Likely same; verify in pre-flight |

All three tables have RLS policies created during A5-c.2 (chunk C2-10) — those drop automatically with the tables.

### TypeScript files

| File | Action | Notes |
|---|---|---|
| `src/components/GameplanBoard.tsx` (518 LOC) | **delete** | Imported by `ProjectDetailView.tsx:26` only |
| `src/components/DefaultPlaybookManager.tsx` (296 LOC) | **delete** | Imported by `GameplanBoard.tsx:29` only |
| `src/types/gameplan.ts` | **delete** | Defines GameplanPlay, PlaybookPlay, DefaultPlaybookPlay + Create/Update input types |
| `src/services/supabaseService.ts` | **edit** — remove 15 gameplan functions (lines ~742–1079) and the type imports referencing `gameplan` |
| `src/services/hybridService.ts` | **edit** — remove 16 hybrid wrapper functions (lines ~229–354) and the type imports |
| `src/components/ProjectDetailView.tsx` | **edit** — remove `import { GameplanBoard }` line + the `<GameplanBoard />` usage in the section card layout |

### Migration files (history, do not edit)

Migrations 034–036 created the gameplan schema. They stay in git history; the new retirement migration drops the tables.

## 3. Execution sequence

### Step A: Pre-flight verification (5 min)

Cursor query, prod read-only, confirm row counts match yesterday's export so nothing changed:

```sql
select 'gameplan_plays' as t, count(*) from public.gameplan_plays
union all select 'gameplan_playbook', count(*) from public.gameplan_playbook
union all select 'gameplan_default_playbook', count(*) from public.gameplan_default_playbook;
```

Expected: 37 / 35 / 37. If counts changed, investigate before proceeding (someone might have actually been using the feature).

### Step B: Code edits (15 min)

In order:

1. **`src/components/ProjectDetailView.tsx`** — remove the GameplanBoard import line (~26) and the `<GameplanBoard />` render in the section card layout. (Find the GameplanBoard render via grep; remove the surrounding card wrapper if it's gameplan-specific.)
2. **Delete files** (filesystem):
   - `src/components/GameplanBoard.tsx`
   - `src/components/DefaultPlaybookManager.tsx`
   - `src/types/gameplan.ts`
3. **`src/services/hybridService.ts`** — delete lines ~229–354 (the 16 `*_Hybrid` wrappers) and the type imports on lines ~42–50.
4. **`src/services/supabaseService.ts`** — delete the 15 gameplan functions (lines ~742–1079). Watch for type imports at top of file that reference gameplan types — remove those too.
5. **`npx tsc --noEmit`** — must come back clean. If errors, fix before continuing.

### Step C: Database migration (10 min)

Create `supabase/migrations/<date>_gameplan_retire.sql`:

```sql
BEGIN;

-- Pre-flight: confirm exports are saved
DO $check$
BEGIN
  -- Just sanity-check tables exist before drop
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='gameplan_plays') THEN
    RAISE EXCEPTION 'gameplan_retire: gameplan_plays already gone — was this already run?';
  END IF;
END
$check$;

-- Drop the 3 tables. CASCADE handles RLS policies + FK constraints.
DROP TABLE IF EXISTS public.gameplan_plays CASCADE;
DROP TABLE IF EXISTS public.gameplan_playbook CASCADE;
DROP TABLE IF EXISTS public.gameplan_default_playbook CASCADE;

-- Post-check
DO $postcheck$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public'
               AND table_name IN ('gameplan_plays','gameplan_playbook','gameplan_default_playbook')) THEN
    RAISE EXCEPTION 'gameplan_retire: at least one gameplan table still exists';
  END IF;
END
$postcheck$;

COMMIT;
```

Apply on **branch first** (sanity), then prod.

### Step D: App smoke (10 min)

- [ ] Refresh GC platform → projects load without 404 / RLS errors in Network tab
- [ ] Open a project's detail view → loads cleanly without the gameplan section
- [ ] Verify no console errors mentioning "gameplan", "GameplanBoard", "DefaultPlaybookManager"
- [ ] Drywall app loads (just confirm general dashboard works — Drywall doesn't use gameplan)

### Step E: Commit (5 min)

Stage everything in this retirement scope:

```
docs/GAMEPLAN_RETIREMENT.md
scripts/archive/gameplan_plays_export_2026-04-29.json
scripts/archive/gameplan_playbook_export_2026-04-29.json
scripts/archive/gameplan_default_playbook_export_2026-04-29.json
src/components/GameplanBoard.tsx (deleted)
src/components/DefaultPlaybookManager.tsx (deleted)
src/types/gameplan.ts (deleted)
src/services/supabaseService.ts (modified)
src/services/hybridService.ts (modified)
src/components/ProjectDetailView.tsx (modified)
supabase/migrations/<date>_gameplan_retire.sql (new)
```

Commit message draft:

```
Gameplan feature retirement

Owner reports never having used Gameplan in production. The 109 prod rows
across gameplan_plays (37), gameplan_playbook (35), and gameplan_default_playbook
(37) are test/seed data from initial exploration. Schedule (ScheduleBuilder)
covers the actual scheduling workflow.

Data preserved as JSON exports in scripts/archive/ before drop.

Removed:
  - 3 tables: gameplan_plays, gameplan_playbook, gameplan_default_playbook
    (CASCADE drops RLS policies from A5-c.2 chunk C2-10)
  - 2 components: GameplanBoard.tsx (518 LOC), DefaultPlaybookManager.tsx (296 LOC)
  - 1 types file: src/types/gameplan.ts
  - 15 functions in supabaseService.ts (~340 LOC)
  - 16 hybrid wrappers in hybridService.ts (~125 LOC)
  - Import + render in ProjectDetailView.tsx

Net reduction: ~1300 LOC + 3 DB tables + 109 rows of unused data.

TypeScript clean. App smoke green on both GC platform and Drywall app.
```

## 4. Risks and rollback

**Risk: low.** Data is exported. Code is replaceable from git history. Tables can be recreated from the JSON exports + migrations 034–036 if ever needed.

**Rollback if app smoke fails:**
1. `git revert <retirement-commit>` — code restored
2. Recreate tables from migrations 034–036 (or replay the original A5-c.2 RLS policies)
3. Re-import data from `scripts/archive/*.json`

The migration is wrapped in `BEGIN; … COMMIT;` so the DB drop is atomic. If the migration fails for any reason, prod stays in pre-retirement state.

## 5. What this does NOT cover

- **The Drywall app** — does not reference gameplan anywhere (confirmed via separate audit). No changes needed there.
- **Audit-tracked items** — Drywall fallback to `'default-org'` (`A5D_PLAN.md` §10), sowService Type C guards (`A5D_PLAN.md` §10), supabaseService.ts decomposition (audit Phase F). Separate workstreams.
- **Selection cleanup** — different feature, deferred pending product decision (Programa integration vs. in-house).

---

**This document is the runbook.** Ready to execute in a focused session. Recommended: do it after a break, with fresh attention.
