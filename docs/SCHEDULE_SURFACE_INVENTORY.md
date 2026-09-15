# Schedule — complete surface inventory

**Taken 2026-09-15 at `bb81b19`**, with step 5b (portfolio unification) in flight.
Written because the unification plan was built from the services outward and missed surfaces:
the GC portfolio survived three steps unnoticed. This is the list to check a step against.

"Division-aware" = does this path know about `schedule_items.division`.

---

## A. Operator surfaces (a human looks at a schedule)

| Route | Component | Lines | Status |
|---|---|---|---|
| `/projects/:id/schedule` | `schedule/ScheduleEditor` (`division="gc"`) | 420 | **unified** |
| `/drywall/projects/:id/schedule` | `DrywallScheduleEditor` → same component | 15 wrapper | **unified** |
| `/schedule` | `SchedulePortfolio` | 693 | **NOT unified** — step 5b in flight |
| `/drywall/schedule` | `DrywallSchedulePortfolioPage` | 1,145 | the one that wins in 5b |
| `/schedule/resource` | `ResourceCompare` | 367 | cross-division **by design** (plan §11: "all crews"). Leave. |
| `/schedule` sidebar | `SchedulePortfolioInbox` | 170 | comms inbox; survives 5b |
| portfolio inline edit | `SchedulePortfolioItemModal` | 845 | orphaned by 5b. **Only live consumer of `smsService` + `CascadePreviewModal`.** |
| per-project item edit | `drywall/schedule/ScheduleItemDialog` | ~900 | **unified**, both assignee pickers |
| supporting | `DrywallScheduleCalendar`, `GenerateStandardScheduleDialog`, `ScheduleChangeLogSheet`, `ScheduleItemOrderSheet`, `ScheduleItemRenameWarning`, `TimeOffManagerSheet`, `scheduleItemStatusStyles` | — | shared by both divisions already |

## B. Crew / foreman surfaces (phone)

| Surface | Component | Division-aware? |
|---|---|---|
| `/crew` job list + detail | `CrewProjectDetailPage`, `CrewScheduleCalendar` | **No** — filters by *project* drywall-ness (`crewWorkspaceService.ts:467,577`). Step 7. |
| foreman add / edit item | `CrewForemanScheduleAddSheet`, `CrewForemanScheduleEditSheet` | edit sheet filters siblings to drywall; **add sheet writes via RPC that relies on the column default** |
| schedule-item photos | `CrewScheduleItemPhotos`, `drywallPhotosService` | no (2 direct `schedule_items` reads) |

## C. External surfaces (no login)

| Surface | Path | Division-aware? |
|---|---|---|
| Customer portal | `/customer/:token` → `CustomerSchedulePage` → RPC `customer_share_schedule` | **NO — see gap 1 below** |
| Supplier share | edge fn → `supplier_share_orders` | incidentally safe (`supplier_id IS NOT NULL`) |
| Supplier digest cron | RPC `drywall_supplier_delivery_schedule` | incidentally safe, same reason |

## D. Every code path that touches `schedule_items`

| File | Accesses | Division-aware? |
|---|---|---|
| `services/scheduleService.ts` | 10 | **yes** — the canonical path |
| `services/supabaseService.ts` | 5 | `upsertScheduleForProject` now dead; `fetchScheduleByProjectId` still live |
| `services/crewWorkspaceService.ts` | 5 | no — step 7 |
| `supabase/functions/receive-sms` | 3 | no — inbound confirmations; review at step 6 |
| `services/smsService.ts` | 2 | no — review at step 6 |
| `services/drywallPhotosService.ts` | 2 | no |
| `functions/send-sms`, `functions/send-push` | 1 each | no |
| `services/productionReadyService.ts` | 1 | no — see gap 4 |
| `services/drywallScheduleAggregateService.ts` | 1 | yes (hardcoded drywall; 5b makes it a lens) |
| `components/SchedulePortfolioItemModal.tsx` | 1 | **writes `schedule_items` directly**, bypassing `scheduleService` — no cascade, no division |
| `components/SchedulePortfolio.tsx` | 1 | deleted by 5b |

## E. Database objects

Trigger/constraint: `log_schedule_item_change` (audit, table-wide),
`reset_schedule_item_confirmation_on_date_change`, `is_valid_schedule_predecessors`.

RPCs writing `schedule_items`: `foreman_create_schedule_item`,
`foreman_apply_schedule_changes`, `foreman_delete_schedule_item`,
`crew_update_task_progress`, `crew_append_schedule_item_photo`,
`crew_remove_schedule_item_photo`.

RPCs reading: `customer_share_schedule`, `drywall_supplier_delivery_schedule`,
`crew_is_assigned_to_project`, `crew_can_photo_schedule_item`.

---

## Gaps found by this inventory

**1. `customer_share_schedule` has no division filter — external, no-login.** It
`LEFT JOIN public.schedule_items si ON si.project_id = p.id` and returns everything
(`20260724140000:56`). On a crossover job, whoever holds the customer share link sees the GC
schedule too. Harmless today (2 test rows) — **but it goes live the moment Goodwill Multi is
seeded from Buildertrend.** Fix before step 3, not after.

**2. Two portfolios.** Step 5b, in flight.

**3. `foreman_create_schedule_item` doesn't name `division`** — it relies on the column
default, so every foreman-created item is `'drywall'` forever. Correct today because foremen
are drywall. Silently wrong the day a GC foreman exists. Make it explicit.

**4. `productionReadyService` counts every item on a project**, so GC items would feed
drywall production-readiness. Small, but wrong once GC items exist on shared jobs.

**5. `SchedulePortfolioItemModal` writes `schedule_items` directly**, bypassing
`scheduleService` — meaning no cascade and no division stamp. It dies with 5b; noted so it
isn't resurrected.

## Dead or dying (flag, don't delete without row-count evidence)

`upsertScheduleForProject` · `lagSemantic: 'sequential'` · `estimate_trade_id` column ·
`fetchPortfolioProjects` (after 5b) · `schedules.items` JSONB (superseded since
`20260507000002`)
