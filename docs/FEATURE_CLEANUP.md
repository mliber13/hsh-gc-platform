# Feature Cleanup Inventory

Read-only pass through `src/components` + `src/services` + `App.tsx` to identify duplicate, overlapping, or dead features that should be retired or consolidated. Generated 2026-04-29 after A5 migration completion.

**No code changes recorded here.** This is a punch list for future sessions. Each entry includes effort estimate + risk flag + recommendation.

---

## Tier 1: Dead code (safe deletes, ~1 session total)

These are imported by nothing live and have no DB dependencies. Delete with confidence.

| File | LOC | Why retire | Recommendation |
|---|---:|---|---|
| `src/components/TradeCategoryIcon.tsx` | 106 | Exports a component that **zero files import**. Confirmed via grep across `src/`. Audit item M5. | Delete file. |
| `src/components/PlaybookManager.tsx` | 305 | Defined alongside `DefaultPlaybookManager.tsx` but **zero files import it**. The live playbook UI uses `DefaultPlaybookManager`, which `GameplanBoard.tsx` imports. `PlaybookManager` is an orphaned earlier draft. | Delete file. |
| `src/components/ProjectActuals.tsx.backup` | — | Stale `.backup` file at repo root. Audit item M2. | Delete file. |
| `src/main.ts`, `counter.ts`, `style.css`, `typescript.svg` | — | Vite default boilerplate, never imported. Audit item L6. | Delete all 4. |
| `app/` directory | — | Static schedule templates, not in `tsconfig`, not in Vite build, not imported. Audit item L7. | Delete or migrate to a print-templates folder if useful. |

**Effort:** ~30 min. No DB changes. No runtime risk (literally nothing imports them).

---

## Tier 2: Broken-but-reachable (the MigratePlans / DataMigration tangle)

| File | LOC | Issue | Recommendation |
|---|---:|---|---|
| `src/components/MigratePlans.tsx` | 148 | Imports `'../scripts/migratePlansToSupabase'` which **does not exist**. Crashes on mount. Audit item C6. | Delete file. |
| `src/components/DataMigration.tsx` | 176 | Imports `MigratePlans` (above). Truncated implementation. Used to migrate localStorage data → Supabase, but **everyone is on Supabase now post-A5**. | Audit current usage. If no one is mid-migration: delete file + remove App.tsx reference. |

**Effort:** ~30 min. Verify no user is in localStorage-only state (almost certainly true post-A5), then delete both + remove from App.tsx.

**Risk:** Low. The path is broken anyway — deleting it removes a known-crashing route.

---

## Tier 3: User-flagged consolidations (significant scope)

### 3a. Schedule vs Gameplan — retire Gameplan, keep Schedule

**You said:** "Gameplan was an idea to replace Schedule but I think we just go with schedule now."

| Component | LOC | Status |
|---|---:|---|
| `ScheduleBuilder.tsx` | 927 | Active. Used. Keep. |
| `GameplanBoard.tsx` | 518 | Imported by `ProjectDetailView.tsx:26`. Embedded as a section card on every project. **Retirement candidate.** |
| `DefaultPlaybookManager.tsx` | 296 | Imported only by GameplanBoard. Goes with Gameplan. |

**Database:**
- `gameplan_playbook` (prod: 35 rows, RLS in place from C2-10)
- `gameplan_plays` (prod: 37 rows)
- ~10 functions in `supabaseService.ts` for CRUD on these tables (`createGameplanPlay`, etc.)

**Plus:**
- Type definitions in `src/types/gameplan.ts` (verify exists)
- Migrations 034–036 created the schema

**Retirement steps (estimated 2–3 sessions):**
1. Decide on data fate: do the 35 + 37 prod rows have value? If yes, export to JSON before drop. If no, just drop.
2. Remove `<GameplanBoard />` usage from `ProjectDetailView.tsx`.
3. Delete `GameplanBoard.tsx`, `DefaultPlaybookManager.tsx`, `PlaybookManager.tsx` (already in Tier 1).
4. Remove gameplan-related functions from `supabaseService.ts` (~10 functions).
5. Delete `src/types/gameplan.ts` if it exists.
6. Migration: `DROP TABLE gameplan_playbook, gameplan_plays;` (cascades RLS policies + bridge-trigger artifacts handled by A5-e already).
7. Verify Schedule UI covers any unique value users got from Gameplan (chapter-organized phase tracking).

**Risk:** Medium. The `gameplan_plays` table has 37 rows on prod — actual user data. Confirm it's not load-bearing before dropping.

### 3b. Selection Book vs Selection Schedule — pick one

**You said:** "Selection Book is no Selection Schedule but they both still exist and neither is fully completed."

| Component | LOC | Audit % | Notes |
|---|---:|---:|---|
| `SelectionBook.tsx` | 2454 | 85% | Per-room selections, images, spec sheets. The richer UI. |
| `SelectionSchedules.tsx` | 1183 | 80% | 11 schedule types, editor + client preview, versioning. Has critical bugs (drag-drop non-functional per audit H4). |

**Database (both keep separate tables):**
- SelectionBook: `selection_books` (8 rows), `selection_rooms` (47), `selection_room_images` (63), `selection_room_spec_sheets` (14)
- SelectionSchedules: `selection_schedule_versions` (0 rows on prod)

**Observation:** SelectionBook has real prod data; SelectionSchedules has zero rows. Default retirement candidate is SelectionSchedules.

**Open question for you:** what's the unique value of SelectionSchedules that SelectionBook doesn't cover? If the answer is "nothing," retire SelectionSchedules. If it's "client-facing preview UI" or similar, port that capability into SelectionBook before retiring.

**Retirement steps if you keep SelectionBook (estimated 2 sessions):**
1. Audit any features only SelectionSchedules has that you want to keep — port them into SelectionBook.
2. Remove `<SelectionSchedules />` route from `App.tsx`.
3. Delete `SelectionSchedules.tsx` and `selectionScheduleService.ts`.
4. Drop unused exports from `supabaseService.ts`.
5. Migration: `DROP TABLE selection_schedule_versions;` (and the upload code in `selectionScheduleService.ts:44` that uses `selection-images` bucket).
6. The audit's H4 concern about non-functional drag-drop becomes moot.

**Risk:** Low if zero prod rows. Just confirm no in-progress beta features rely on it.

---

## Tier 4: Other potential overlaps (flagged for your review, not yet decided)

| Pair | Verdict | Why |
|---|---|---|
| `EstimateTemplateEditor` / `EstimateTemplateManagement` / `ImportEstimate` | Likely keep all three | Different roles in same domain (edit one template, list/manage all, import from file). All actively used. |
| `DealDocuments` / `ProjectDocuments` | Keep both | Different domains; deal docs scoped to deal lifecycle, project docs to project. |
| `actualsService` / `actualsHybridService` | Keep both | Service + hybrid wrapper pattern (online/offline). Intentional architecture. |
| `planService` / `planHybridService` | Keep both | Same pattern. |
| `FeedbackForm` / `FeedbackManagement` / `MyFeedback` | Keep all three | Three roles (submit, admin triage, user's history). Audit confirms. |
| `QuoteRequestForm` / `QuoteReviewDashboard` / `VendorQuotePortal` | Keep all three | Different actors in the quote workflow. |
| `TenantPipeline` / `DealWorkspace` | Keep both | Tenant pipeline = early-stage prospects (kanban). Deal workspace = active deal underwriting. Different stages. **Note:** audit C9 says "Push to Deal Workspace" button has no onClick — that's the bridge between them, currently broken. Worth fixing rather than removing. |

---

## Tier 5: Boilerplate / repo hygiene (audit Phase H — low priority but ~1 day cumulative)

- 30+ stale root `*.md` files (CLEAR_SERVICE_WORKER, DIAGNOSE_*, FIX_*, TROUBLESHOOT_*, etc.) → archive to `docs/archive/`.
- `figmasrc.zip`, `HSH_GC_Workflow_Playbook.zip`, `docx_extract/` → delete or move out of repo.
- `clear-projects.html`, `debug_rls.sql`, `fix_rls_policies.sql`, `import_*.sql`, `item_templates_import.csv` → relocate to `scripts/archive/` (some are already there) or delete.
- 5 Cursor scratch files at repo root from this session (`_*.json`, `_*.b64`, `_*.txt`, `mcp_*.json`, `p?.json`) → delete + add gitignore patterns.

---

## Suggested execution order

1. **Tier 1** (~30 min, zero risk) — quick win, removes audit M5 + L6 + L7 + M2. Land it whenever.
2. **Tier 2** (~30 min, low risk) — closes audit C6 (the broken MigratePlans crash route). Land alongside Tier 1.
3. **Tier 3a Schedule/Gameplan** (~2–3 sessions, medium risk) — needs the data-fate decision first. Worth doing before any further Gameplan UI changes accumulate.
4. **Tier 3b Selection Schedule retirement** (~2 sessions, low risk if zero prod rows confirmed) — needs the "what unique value" decision.
5. **Tier 5** (~1 day, opportunistic) — when context-switching to a low-energy task.
6. **Tier 4** items: revisit if any of those feel duplicative in actual use; otherwise leave as separate concerns.

---

## Out of scope for feature cleanup

These are tracked elsewhere and don't belong in this doc:

- `supabaseService.ts` decomposition (4833 LOC) — audit Phase F architecture work.
- Drywall `getOrganizationId()` fallback patch — `A5D_PLAN.md` §10.
- `sowService.ts` Type C validation guards — `A5D_PLAN.md` §10.
- Drywall sibling app's own duplicate features (separate repo, separate audit pass).
