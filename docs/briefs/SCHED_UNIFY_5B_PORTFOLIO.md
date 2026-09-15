# Brief — Schedule Unification Step 5b: one portfolio surface

Context: `docs/SCHEDULE_UNIFICATION_PLAN.md` (§3 decisions, §4 invariants). Steps 1, 2 and
4+5 are committed. The per-project editor is unified; **the portfolio is not.** Two
components still exist and they look nothing alike, which defeats the point of the whole
plan — nobody should learn two schedule UIs.

**Goal:** `/schedule` and `/drywall/schedule` render the same component, differing only by
which division lens is applied. `SchedulePortfolio.tsx` is deleted.

---

## 1. The two defects being fixed

**a. Two components.** `SchedulePortfolio.tsx` (693 lines) vs
`DrywallSchedulePortfolioPage.tsx` (1,145 lines). **The drywall one wins** — project-color
bars, phase-color borders, list + calendar, inline edit via the shared `ScheduleItemDialog`,
mobile-aware. The GC one is a wall of filter chips over a bare grid.

**b. The GC project list is derived from project metadata, not from items.**
`fetchPortfolioProjects(typeFilter)` (`scheduleService.ts:77`) filters on
`metadata->>app_scope` + `isVisibleInGcApp`, so the GC lens lists ~140 projects — almost all
of them drywall jobs with no GC items at all — each getting a chip and an empty row. The
drywall portfolio never had this problem because it derives its project list from
`fetchCrossProjectScheduleItems()`.

This is decision 4 one level up: **the project list must be derived from the items'
division, never from project classification.** After the fix the GC lens should show exactly
one project (Goodwill Multi, the only project with `division = 'gc'` rows).

## 2. Work

1. Promote `DrywallSchedulePortfolioPage` to `src/components/schedule/SchedulePortfolioPage.tsx`
   taking `{ lens: 'all' | 'gc' | 'drywall', lockLens?: boolean }`.
2. `fetchCrossProjectScheduleItems` (`drywallScheduleAggregateService.ts`) — replace the
   hardcoded `.eq('division', 'drywall')` with the lens; `'all'` adds no clause
   (**invariant 4**). It currently also filters projects through `isDrywallProjectRow`;
   that project-level heuristic must go — the division on the item is now the authority.
   Keep returning `assignedCompanyId` / `supplierId` so GC rows render their sub company.
3. `/drywall/schedule` → `<SchedulePortfolioPage lens="drywall" lockLens />`. **Drywall UX
   must not change at all** — same bars, same filters, same calendar, same inline edit.
4. `/schedule` → `<SchedulePortfolioPage lens="all" />` with the All / GC / Drywall toggle.
5. Keep the comms inbox sidebar (`SchedulePortfolioInbox`) on `/schedule` only. It is live
   functionality that the drywall portfolio never had; do not drop it, and do not add it to
   the drywall route.
6. `fetchPortfolioProjects` and `fetchPortfolioScheduleItems` lose their only portfolio
   caller. `ResourceCompare` (`/schedule/resource`) still uses `fetchPortfolioScheduleItems`
   — leave that path working.

## 3. Deletions

- `src/components/SchedulePortfolio.tsx` and its route import.

**Do NOT delete — verify before touching:**

| Symbol | Status after this step |
|---|---|
| `SchedulePortfolioItemModal` (845 lines) | becomes unreferenced. **It is the only live consumer of `smsService` and `CascadePreviewModal`.** Leave all three in place; step 6 wires sub confirmations into the shared `ScheduleItemDialog` and they get resolved then. Flag with a DELETION SWEEP comment. |
| `fetchPortfolioProjects` | unreferenced after this; flag, don't delete |
| `ResourceCompare`, `SchedulePortfolioInbox` | still live |

`tsc` will not catch newly-unreferenced exports. Grep for each symbol separately and report
what you found.

## 4. Out of scope

- Sub SMS confirmations (step 6, now that A2P cleared).
- Seeding Goodwill Multi from Buildertrend (last, once the surfaces are settled).
- `office_gc` RBAC — `schedule` stays `'none'` in this step; that is a separate decision.
- Any change to drywall portfolio behavior. If it looks different afterwards, that's a bug.

## 5. Verification — STOP and report

Cursor-side:
1. `npx tsc --noEmit` clean.
2. `npx vitest run` — 377 passing before; report after.
3. `grep -rn "SchedulePortfolio\b" src` — only the inbox and the item modal remain.

Operator-side (Mark):
4. `/drywall/schedule` — **identical** to today. Same bars, filters, calendar, inline edit.
5. `/schedule` with the **GC** lens — one project chip (Goodwill Multi), not ~140. Its two
   GC items render with their sub company.
6. `/schedule` with the **Drywall** lens — matches `/drywall/schedule`.
7. `/schedule` with **All** — Goodwill Multi appears once, showing both its GC and drywall
   items on the same project row. This is the first look at a real crossover schedule.
8. Inline-edit a GC item from `/schedule` and confirm it saves and cascades.
9. Comms inbox sidebar still works on `/schedule`.
10. `/schedule/resource` still loads.

## 6. Commit

Exclude: `.claude/settings.local.json`, `supabase/.temp/cli-latest`.
Message drafted by Claude after the verification report.
