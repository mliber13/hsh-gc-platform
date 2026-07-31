# GC Workspace — Lessons from the Drywall Workspace

_Compiled 2026-07-31 from a code survey of both workspaces. The Drywall workspace received far more iteration than the GC side; this catalogs what transfers, split by whether it's portable onto GC's current model or needs a deeper architectural move. Focus is the **schedule** (where the gap is most visible), with broader-workspace notes at the end._

Legend: 🟢 portable now (UI-only, low risk) · 🟡 medium (refactor) · 🔴 epic / needs a decision

---

## 0. The core finding

The GC schedule is a **capable but older pattern**. It has good bones — predecessors, `cascadeSchedule` with cycle detection, a cascade **preview modal**, and a **sub SMS-confirmation workflow** (which the Drywall side could actually learn from). But it lags Drywall on filtering, mobile, per-person assignment, and audit logging.

**Root cause of most gaps:** the two workspaces use **different storage**.

| | GC schedule | Drywall schedule |
|---|---|---|
| Storage | **JSONB blob** — `schedules.items` array, written via `updateProject_Hybrid` (`ScheduleBuilder.tsx:332-360`) | **Normalized `schedule_items` table** — one row per item (`scheduleService.ts:385-402`) |
| Assignment | single `assignedCompanyId` per item | per-person `assigned_persons[]` + `assigned_company_id` + supplier |
| Predecessors | single predecessor picker | first-class `predecessors` (multi) + lag |
| Change log | none | DB-trigger audit → `ScheduleChangeLogSheet` |
| Tasks / leads | none | `tasks`, `lead_person_ids` |

Almost every Drywall advantage is **enabled by the relational model**. So the lessons split cleanly: UI patterns port onto GC's current JSONB model; the richer data features want the relational move.

**Latent risk to verify:** the cross-project `SchedulePortfolio.tsx` reads the **relational `schedule_items`** table (`scheduleService.ts:394`), while the GC `ScheduleBuilder` writes **JSONB `schedules.items`**. GC per-project edits may not fully reflect in the portfolio timeline. This dual-storage divergence is the strongest argument for eventually unifying GC onto `schedule_items`.

---

## 1. Portable now — UI only, no schema change 🟢

These reuse code we just wrote for the Drywall schedule mobile/filter pass (commits `a91ccfc`, `e13ed46`, `d1599c6`).

- **🟢 Filters + an "Unassigned" filter (highest value/effort).** The GC schedule has **zero filtering** today. GC already carries `assignedCompanyId` and status per item, so a company / status / **unassigned** filter drops right in, mirroring the Drywall portfolio filters. For a GC juggling many subs, "show me everything with nobody assigned" is as useful here as on Drywall. _Ref: Drywall `DrywallSchedulePortfolioPage.tsx` filter sheet + `isUnassigned`._
- **🟢 Mobile responsiveness.** `useIsMobile` appears in only two places app-wide (the Drywall schedule + the sidebar) — the entire GC workspace is desktop-only. The Drywall mobile pass patterns transfer directly: responsive toolbar (stack on mobile), card list instead of a `min-w` table, compact dot-grid calendar with tap-a-day detail, collapsible filter sheet, and the header-title-overlap fix (`AppHeader.tsx`, already global). GC calendar is a fixed `min-w-[600px]` that just horizontally scrolls on mobile (`ScheduleBuilder.tsx:1110`).
- **🟢 Small polish.** The GC cascade recalc prompt uses a native `confirm()` (`ScheduleBuilder.tsx:319`) instead of the app dialog system — swap to the shared dialog for consistency.

## 2. Medium — refactor 🟡

- **🟡 God-file split of `ScheduleBuilder.tsx` (1,370 lines).** It holds state, data-loading, cascade orchestration, SMS publishing, calendar geometry, and two full view renderers in one component. Extract the calendar renderer, the list renderer, and the cascade/SMS commit flow — same shape as the Drywall schedule's separated `portfolio/` components. Independent of the data-model question.

## 3. Epic / needs a decision 🔴

- **🔴 Unify GC onto the normalized `schedule_items` model.** This is the real "level GC up to Drywall" move. It unlocks per-person assignment, the change-log/audit trigger, tasks/leads, and multi-predecessor — and it resolves the dual-storage portfolio-sync risk above. But it's a migration (JSONB blob → relational rows) touching the GC builder's read/write path, the portfolio, and any consumer of `schedules.items`. **Decision to make deliberately** — not a quick win. Sequence it after the portable wins prove the UX direction.
- **🔴 Change-log / audit for GC.** Drywall's log is a `SECURITY DEFINER` trigger on `schedule_items` — it can't attach to the GC JSONB blob. So GC audit is effectively gated on the relational move (or a different, weaker approach).

## 4. Reverse lesson — GC → Drywall

Not everything flows one way. The **GC sub SMS-confirmation workflow** (`ConfirmationDot`, per-row SMS opt-in on cascade commit — `ScheduleBuilder.tsx:561-628`, `scheduleCascadeDiff.ts`) is more developed than the Drywall side's sub messaging. Worth mirroring back into Drywall when that comes up.

---

## Broader GC workspace (beyond schedule)

- **Mobile is an app-wide gap**, not just the schedule. Only the Drywall schedule + sidebar are mobile-aware. Any GC surface a field user might open on a phone (project detail, schedule) is desktop-only.
- **God-file backlog** already flagged in the v1.5 roadmap Epics, GC-heavy: `ProjectActuals.tsx` (3,467), `EstimateBuilder.tsx` (2,790), `ContactDirectory.tsx` (2,293), `ProjectDetailView.tsx` (1,311), plus `ScheduleBuilder.tsx` (1,370).

---

## Recommended sequence (aligned with v1-tightening)

1. **GC schedule filters + Unassigned** — highest value/effort, reuses just-written code. Design first, then build.
2. **GC schedule mobile pass** — port the Drywall mobile patterns.
3. `confirm()` → app dialog polish.
4. **Decision:** scope the JSONB→relational unification (with the portfolio-sync verification) — the gateway to per-person assignment + change log. Deliberate, not rushed.
5. God-file split of `ScheduleBuilder` (can run alongside #4).

**Open decisions for Mark:**
- Do we invest in unifying GC onto `schedule_items` (unlocks the deep features, resolves the dual-storage risk), or keep porting UX patterns onto the existing JSONB model?
- First, verify the dual-storage concern: do GC builder edits actually show correctly in the cross-project `SchedulePortfolio`? (Confirms how urgent the unification is.)
