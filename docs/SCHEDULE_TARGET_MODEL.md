# Schedule — Target Model & IA

**Status:** v3, post-walkthrough (2026-05-11)
**Source:** v3 adds the **portfolio view** as a first-class lens and locks in **Schedule as its own workspace** alongside a forthcoming Drywall workspace — surfaced during the Drywall-as-workspace merge planning, 2026-05-11. v2 reorganized around comms loop as differentiator (2026-05-04). v1 was schedule-mechanics-first.
**Predecessor docs:** `docs/DESIGN_LANGUAGE.md`, `docs/UI_PORT_PLAYBOOK.md`. Current implementation: `src/components/ScheduleBuilder.tsx` (post Tier 1).

---

## 1. The premise

Schedules in construction software are largely solved. Dependencies, calendar grids, mark-complete — every shop does it the same way and reinventing it adds nothing. **What remains genuinely hard is the communication loop with the field**, in both directions, kept clean and audit-traceable.

The product differentiator is therefore not the schedule itself but **the comms-and-actuals layer wrapped around it**, the **portfolio view** (one calendar across every job), and the **resource-compare view** for manpower availability.

This doc treats the schedule mechanics as table stakes (build them solid but don't over-invest), and the comms layer as the centerpiece. Schedule is its own top-level workspace; Portfolio is its default landing.

---

## 2. Goals

1. **A durable, filterable communication log** tied to schedule items — every change has a logged "why," every sub message lives next to the work it's about, every phone call is captured even though the channel was voice.
2. **Two-way comms with subs** — push schedule out (SMS + email + app), receive updates back (SMS replies, app, manually-entered phone calls), surface both in one log.
3. **PM-initiated cascades with preview-then-commit** — when a slip happens, PM sees the impact, opts out per-recipient if needed, then commits and the right SMS go out.
4. **Portfolio view across all jobs** — calendar landing for the Schedule workspace. PM walks in Monday morning and sees every project's bars on one grid. Filter chips per project for focus. Single source of truth shared by GC Projects and Drywall workspaces — the Drywall workspace schedule view is this same surface pre-filtered to drywall jobs.
5. **Resource-compare view** — side-by-side per-company columns to spot conflicts and under/over-allocation across projects. Scope spans GC subs **and** in-house drywall crews; manpower overallocation doesn't respect the GC/drywall divide.
6. **Solid dependency math underneath** — multi-predecessor with lag, weekend + holiday-aware cascade, critical-path highlight. Foundational but not differentiating.

**Non-goals (deliberate scope cuts):**
- ❌ Hourly progress detail. Day-grain only — that's how the work actually runs.
- ❌ Field-side schedule editing. Field reports, office acts. Office is the editor.
- ❌ Auto-cascade. PM is always in the loop.
- ❌ Gantt view. Owner doesn't use it.
- ❌ Recurring tasks. Separate future module.
- ❌ Customer-facing schedule. Eventually milestones-only.

---

## 3. Communication architecture (the centerpiece)

### 3.1 The CommunicationLog entity

A first-class entity. Every schedule-related comm leaves a row.

```ts
interface CommunicationLogEntry {
  id: string
  project_id: string
  schedule_item_id?: string         // null = job-level entry, not tied to one item

  direction: 'inbound' | 'outbound' | 'system'
  channel: 'sms' | 'email' | 'in-app' | 'phone' | 'system'

  // Who
  author_user_id?: string           // office user (for manual entries, in-app)
  author_company_id?: string        // sub company (for inbound messages)
  author_label?: string             // 'system', or display name override

  // What
  body: string                      // free text; system-generated entries have a templated string
  attachments: Array<{
    url: string                     // Supabase Storage path
    mime_type: string               // image/jpeg, image/png typically
    file_size: number
    thumbnail_url?: string
  }>

  // Optional structured payload, e.g. for cascades:
  //   { type: 'cascade', moved_item_ids: [...], texted_companies: [...], opted_out: [...] }
  metadata?: Record<string, any>

  created_at: timestamp
}
```

### 3.2 Filter modes

Two views over the same entries:
- **Per-item log** — opened from a schedule item, shows that item's thread only. The "everything that has ever been said about Frame Walls."
- **Whole-job log** — opened from the project, shows all entries across all items in chronological order (or filtered by direction / company). The "what's been happening on this job."

Both views are read-mostly; new entries flow in from the comms triggers below.

### 3.3 Entry types

**Inbound (field → office):**
- Sub texts back: parsed by Twilio webhook, body stored verbatim, channel='sms', direction='inbound', author_company_id resolved by phone number lookup.
- Sub responds via app (sub portal — see §4): channel='in-app', otherwise same shape.
- Photo attachments: Supabase Storage upload, attachment record links to the file.

**Outbound (office → field):**
- Auto-sent SMS (assignment, change notification, weekly digest, reminder): channel='sms', direction='outbound', body=templated message, author_user_id=PM who triggered it (or 'system' for digest).
- Manual SMS sent from the comms log UI: same shape, author_user_id=current office user.
- Email versions: same shape, channel='email'.

**Manual phone-call entry (office → log):**
- Office user picks up phone, hangs up, taps "Log call" in the schedule item or comms log.
- Modal: direction (in/out), company, body ("Confirmed Thursday move"), optional duration.
- Stored channel='phone', author_user_id=office user.
- This keeps the audit trail complete even when the channel was voice.

**System-generated:**
- Cascade triggered: "PM bumped Framing 2 days. 5 items moved. Texted Acme Plumbing, Smith Framing. ABC Electric opted out."
- Confirmation status changed: "Acme confirmed Thursday move via SMS."
- Item created / completed / cancelled.
- No author_user_id; author_label='system'. Uses metadata for structured detail.

### 3.4 Office notification on inbound

When a sub message arrives:
- In-app: badge on the schedule item + project + global comms inbox.
- Push: notification to PM phone (if web push enabled) — channel TBD between PWA push or third-party (OneSignal etc.).
- Email digest fallback: end-of-day summary if office is offline.

**Multi-PM routing rule:** all PMs assigned to the project + all users with the `scheduler` role get the inbound notification. Implies a new `scheduler` role distinct from `project_manager` — adjacent permissions decision, worth noting but doesn't block schedule build.

### 3.5 Cascade preview-then-commit

When PM moves an item with downstream dependencies:

1. PM drags / edits the date. **Nothing else happens yet.**
2. System computes cascade: which items move, by how much, who's the assignee on each.
3. Modal opens:
   ```
   Bumping Framing from Tue → Thu (+2 days)
   
   This will move 5 downstream items:
     ✓ Plumbing rough-in     Wed → Fri      Acme Plumbing      [will text]
     ✓ Drywall hang          Mon → Wed      Smith Drywall      [will text]
     ✓ Paint                 May 28 → 30    HSH In-house       [no text]
     ✓ Trim install          Jun 4 → 6      ABC Trim           [no text — outside 2wk horizon]
     ☐ Final inspection      Jun 12 → 14    City inspector     [opted out]
   
   3 SMS will be sent. Items beyond 2-week horizon get in-app log only.
   
   [Cancel]   [Send All & Commit]
   ```
4. PM can uncheck rows to exclude them from the SMS round (item still moves, no text sent — silent).
5. Commit triggers:
   - Item dates persisted.
   - Outbound SMS sent for checked rows within 2-week horizon.
   - System-entry added to comms log per moved item ("PM bumped, texted [or not] [recipient]").
   - Affected items move to confirmation: 'pending' (was 'confirmed').

### 3.6 SMS horizon rule

- Items whose new start date is **within 2 weeks of today** → SMS sent (subject to per-recipient opt-out in preview).
- Items beyond 2 weeks → in-app log entry only; included in next weekly digest if material.

Rationale: avoid SMS spam for items that are weeks away and have plenty of time to absorb the slip.

### 3.7 Outbound triggers (full list)

| Trigger | Channel | Recipient | Notes |
|---|---|---|---|
| Item assigned | SMS + email | Assigned company | When PM first publishes / assigns |
| Item changed (within horizon) | SMS | Assigned company | Via cascade preview, opt-out per-recipient |
| Item changed (beyond horizon) | (none) | — | In-app log only |
| Reminder day-of | SMS | Assigned company | Morning of scheduled start |
| Weekly digest | SMS or email (per company pref) | All assigned companies | Sunday night, summary of upcoming week |
| Reconfirm request | SMS | Assigned company | After unconfirmed-state transition |

### 3.8 Inbound parsing

- "Y" / "yes" / "yep" / "👍" / "ok" / "k" / "confirmed" → record `confirmation.status = 'confirmed'`, log entry direction=inbound channel=sms body=verbatim.
- "no" / "can't" / "nope" → record `confirmation.status = 'declined'`, log entry, push office notification.
- Anything else → log entry stored verbatim, push office notification, no auto-action.

Office user can always re-classify a misparsed message in the log UI.

---

## 4. User surfaces

PM has two primary surfaces (Portfolio + Per-project), plus the field crew and outside-sub surfaces below. Schedule is its own workspace; the workspace switcher (`WorkspaceSwitcher.tsx`) routes PMs to the Portfolio landing.

### 4.1 Office / PM — Portfolio (workspace landing, NEW)

Lands here when the user clicks "Schedule" in the workspace switcher (`/schedule`). Calendar grid across all in-flight projects, project rows top-to-bottom, days left-to-right. Default window: this week + next week (14 days). See §6.1 for full UI.

Reached from:
- Workspace switcher → "Schedule"
- Drywall workspace → "Schedule" (same surface, pre-filtered to `type='drywall'`)
- Comms inbox sidebar (always-on in this surface)

### 4.2 Office / PM — Per-project (existing `ScheduleBuilder.tsx`)

Deep-edit surface for one project at `/projects/:projectId/schedule`. Two view modes (List / Calendar — see §6.2). Adds:
- **Comms log panel** — toggleable side panel showing the per-item or whole-job comms feed.
- **Cascade preview modal** for any move with dependencies.
- **"Log call" button** on each schedule item header.
- **Confirmation status indicator** on items: subtle dot color (green confirmed / amber pending / rose declined).

Reached from: Portfolio drill-in (click a bar / chip-solo) or directly from a project's overview page.

### 4.2a Edit conflicts (cross-workspace)

A schedule item can surface in both the GC PM's per-project view AND the Drywall workspace's portfolio (one row, two views — see §5.2). Either side may edit it.

**Resolution: last-write-wins.** The comms log captures both edits as system entries with author and timestamp. No formal handshake. Matches the in-house dynamic — "PM says ready to hang the 12th, drywall scheduler bumps to the 13th because crews aren't free" — where the back-and-forth is audited but not formalized. A `Confirmation` reset to `'pending'` accompanies any date change so the other side sees the move and can respond in the log.

### 4.3 Field crew (in-house)

Mobile-first scoped view at `/schedule/me`. Card list of "items where assigned_company_id = HSH internal."
- **Today** — items today.
- **This week** — next 7 days.
- **Upcoming** — beyond.
- Per card: project + address + scope + start day + confirm/decline buttons + comms thread for the item.
- Replies post to comms log, channel='in-app'.

### 4.4 Outside subs (sub portal)

Separate route `/schedule/sub/:companyId`, RLS-gated to that company.
Same shape as field crew but scoped to one company. Most subs won't log in — for them, the SMS push channel IS their experience. The portal is for subs who want to see ahead more than the next text.

**Future:** customer view (milestones only). Not in this scope.

---

## 5. Data model

### 5.1 Current state (`src/types/project.ts:622`)

```ts
type ScheduleItemType = 'field' | 'office'

interface ScheduleItem {
  id, scheduleId, type, name, description?, trade?, estimateTradeId?,
  startDate, endDate, duration,
  predecessorIds: string[],
  status: 'not-started' | 'in-progress' | 'complete' | 'delayed',
  percentComplete: number,
  actualStartDate?: Date,
}
```

Stored as JSON on `projects.schedule`. No separate table. No assignee, no comms log, no holidays.

### 5.2 Target deltas

**Promote storage** — extract to `schedule_items` table. Required for cross-project queries (portfolio view, resource compare, sub portal "all my work for HSH"), proper FKs, indexable created_at, RLS scoping for sub portal.

**Cross-workspace one-row-two-views** — a single `schedule_items` row may surface in multiple workspace views. Example: HSH Drywall hangs drywall on a GC project. The row is the **drywall trade row** in the GC project's per-project schedule AND a **job entry** in the Drywall workspace portfolio. Both views read/write the same row. Drywall workspace projects drywall-internal attributes onto the row (crew assignment, internal status); GC view projects trade-row attributes (sub_id, dates, dependencies). Edit-conflict semantics: §4.2a.

Drywall-only jobs (no GC parent) live in the Drywall workspace portfolio only; they are filtered out of the GC portfolio default view via `metadata.app_scope = 'DRYWALL_ONLY'`.

**Add `assigned_company_id`** — FK to subcontractors table. HSH internal entities are rows in `subcontractors` with `is_internal: true`. "Internal" here means **1099 contractors who work exclusively for HSH** (the in-house crew model) — not W-2 employees per se. Operationally they're treated as ours-by-default for scheduling, dispatch priority, and notification rules. External subs (1099, work for many GCs) have `is_internal: false`. The flag drives:
- Resource compare default sort (internals first)
- "My team" filter on the schedule
- Notification rules (internals get app push by default; externals SMS by default)

**Reshape dependencies — multi with lag (in work days):**
```ts
predecessors: Array<{
  predecessor_id: string
  lag_days: number          // work-day count, not calendar
  // Default relation type FS (finish-to-start). SS / FF deferred.
}>
```
Lag is **work days**, not calendar days, per construction-software convention.

**Type split:**
```ts
type: 'task' | 'milestone' | 'event'
//   task     = work over time (most items, today's "field"/"office")
//   milestone = a date checkpoint, no duration ("Permit approved")
//   event    = a single-day inspection / meeting / walkthrough
```
Today's `field`/`office` distinction → separate `category` field if useful, or rolled into `trade`.

**Loosen estimate link:**
```ts
estimate_trade_ids: string[]   // was estimateTradeId?: string (one)
```

**Confirmation state (per item):**
```ts
confirmation: {
  status: 'unsent' | 'pending' | 'confirmed' | 'declined' | 'no-reply'
  last_sent_at?: timestamp
  last_responded_at?: timestamp
  notes?: string
}
```

**Actuals:**
```ts
actual_start_date?: Date          // exists today
actual_end_date?: Date            // new
status: 'not-started' | 'in-progress' | 'complete' | 'delayed'   // exists, kept
percent_complete?: number         // exists, kept (optional, day-grain real-talk)
```

**Office is the editor:** `status` is moved by office users based on what they hear from the field. No automatic transitions (no "scheduled date passed → assume started"). Field reports come in via comms log; office adjusts.

### 5.3 New supporting tables

**`communication_log_entries`** — see §3.1. The biggest new table.

**`org_holidays`** — `{ date, label, organization_id }`. HSH-wide non-work days.

**`subcontractor_unavailability`** — `{ subcontractor_id, start_date, end_date, reason? }`. Per-company closed ranges.

**`subcontractor_contacts`** — one-to-many. A sub may have multiple contacts (office line, foreman cell, after-hours, multiple foremen on different jobs). Inbound SMS from any of these phones resolves to the same `subcontractor_id`.
```ts
interface SubcontractorContact {
  id: string
  subcontractor_id: string
  name?: string                      // "Mike (foreman)", "Office", etc.
  phone?: string                     // E.164 format for SMS matching
  email?: string
  is_primary: boolean                // default outbound recipient
  receives_schedule: boolean         // some contacts only get billing, not schedule comms
  channel_preference: 'sms' | 'email' | 'both'
}
```

**`schedule_baselines`** *(deferred)* — snapshot of schedule at a moment, for variance tracking. Worth adding once core lands; not Tier 1.

---

## 6. IA — workspace surfaces and view modes

Four surfaces within the Schedule workspace:

```
[ Portfolio ]   [ Per-project ]   [ Resource ]   [ Inbox ]
     ↑ default landing
```

Each surface has its own view modes where useful. **Gantt remains out** (per §2 non-goals) on all surfaces.

### 6.1 Portfolio (workspace landing, NEW)

Default view of `/schedule`. Calendar grid spanning all in-flight GC projects.

- **Visual:** rows = projects (one bar row per project, color-coded), columns = days. Default window: this week + next week (14 days), pageable in 2-week increments.
- **Filter chips** at top: one per project. Click toggles inclusion. Each chip has a "solo" icon for one-click focus — functionally identical to drilling into Per-project for that project.
- **Type filter chips** top right: All / GC / Drywall (default: All). Drywall workspace lands on this same surface with "Drywall" pre-selected.
- **Drywall-only projects** (`metadata.app_scope = 'DRYWALL_ONLY'`) are excluded from the GC portfolio default view; they appear in the Drywall workspace only.
- **Comms inbox sidebar** on the right (collapsible) — see §6.4. Always-on in Portfolio by default. PM walks in, sees what came in overnight across all jobs without switching context.
- **Click a bar** → schedule item detail with comms thread visible. Drill-in to Per-project for full edit.
- **List toggle** at top right — secondary view mode that flattens to a project-grouped list using the same filter chips.

Density: calendar gets crowded past ~8 active project rows; use the chip filter or the list toggle when that happens. Resource compare (§6.3) is the better surface when "who's overallocated" is the actual question.

PM-only. Field/sub surfaces remain scoped (§4.3, §4.4).

### 6.2 Per-project view modes

Within the per-project surface (`/projects/:projectId/schedule`):

**List view** (existing). Dense edit, one row per item. Best for "I need to change something." Adds: comms thread popover per item, confirmation status dot, critical-path highlight.

**Calendar view** (existing). Month grid with bars. Click bar → edit dialog (already shipped Tier 1). Adds: critical-path highlight, confirmation dot on bars, drag-to-reschedule (triggers cascade preview).

### 6.3 Resource compare (NEW)

Side-by-side columns per company. Scope: **all crews including in-house HSH Drywall crews and external subs** — manpower overallocation doesn't respect the GC/drywall divide.

```
                Acme Plumbing    HSH In-house     Smith Framing    ABC Trim
   Mon May 5    ─────────────    Frame walls      Frame walls      ─────────
   Tue May 6    Rough-in         Frame walls      Frame walls      ─────────
   Wed May 7    Rough-in         Drywall prep     ─────────────    ─────────
   Thu May 8    ─────────────    Drywall hang     Mobilize next    ─────────
   Fri May 9    ─────────────    Drywall hang     Mobilize next    Trim ord
```
- **Cross-project by default** (Acme's full HSH workload, not just this project's).
- **Filter to one project** as a toggle.
- **Conflict highlight** when same company is double-booked across projects.
- **Unavailability shading** when company is on time-off.
- **Critical-path bold** for items on the chain.
- **Vertical scroll** when a company has many active items — column height grows, header sticky. Horizontal width stays fixed regardless of company workload.

This is the "compare schedules like products" view. Owner-stated novel feature. PM-only.

### 6.4 Comms inbox (NEW)

Cross-project comms feed. Always-on as a sidebar inside Portfolio (§6.1); reachable standalone at `/schedule/inbox`.

- **Default filter:** last 24h, inbound + system, unread or "needs response."
- **Secondary filters:** by project, by assigned company, by direction.
- **Click an entry** → drill into the originating schedule item (opens Per-project at that item with comms thread expanded).

PM-only. Not a sub-facing surface.

---

## 7. Lifecycle workflows

### 7.1 Project kickoff (PM)
1. Create project. Schedule empty.
2. Optionally seed from estimate (starter wizard, not primary flow).
3. Manually add tasks, milestones, events. Wire dependencies. Assign companies.
4. Publish: outbound SMS/email assignment to all assigned companies. Confirmation states go to 'pending'.
5. Subs reply (or don't). Confirmations track in real time.

### 7.2 Daily ops (PM)
- Open Schedule workspace → lands on **Portfolio** (calendar, all projects, this week + next).
- Comms inbox sidebar (right) — new entries since last visit (badge count + unread highlight).
- Glance at confirmation dots on bars — anything pending too long?
- Sub texts "running late, will be 10am" → notification → click into the inbox entry → drill to the item → judges impact → optionally bumps the schedule (triggers cascade preview).
- For deeper edit on one project, "solo" a project chip or drill into Per-project.
- For "who's overallocated this week," switch to Resource view.

### 7.3 Field/sub day-of
- Sub gets morning SMS reminder.
- Or opens app, sees today's card.
- Confirms / declines / sends update.
- All channels feed the same comms log.

### 7.4 Closeout
- All items complete or skipped. Final comms log archived with the project.
- Variance vs. baseline (if baseline was set) — future feature.

---

## 8. Workday-aware cascade math

Same as before:
- **Default workdays:** M–F. Configurable per project (rush jobs may include Sat).
- **Skip dates:** `org_holidays` + assignee's `subcontractor_unavailability`.
- **Lag in work days**, not calendar days.
- **Cascade:** when PM commits a move, downstream items recompute starts using the rules.
- **Critical path:** forward + backward pass to identify zero-float chain. Recompute on item change. Cache.

Concrete utility module: `src/lib/scheduleDateMath.ts` (workday math) + `src/lib/criticalPath.ts` (CPM). Replaces the current naive `addDays` cascade.

---

## 9. Integration points

**Estimate** — demoted from primary flow to "Seed schedule from estimate" wizard. Persistent estimate-to-task link is many-to-many, optional.

**Change orders** — future "Add to schedule" button in CO approval flow. Out of scope today.

**Forms / inspections** — future: passing form submission marks a milestone complete automatically.

**Time clock** *(future module)* — clock-in references active schedule items. Closes loop on actual hours per task. TimeClock lives in the HR workspace today; may promote to its own workspace once geofencing / photo-verification land.

**Recent Activity** (existing card on Project Detail) — schedule item creation, completion, and major changes feed it. Cheap add once table promotion lands.

**Drywall workspace** — shares the `schedule_items` table. The Drywall workspace's schedule view is the Portfolio surface (§6.1) pre-filtered to `type='drywall'`. Drywall scheduler edits the same rows the GC PM edits; edit-conflict semantics in §4.2a. Drywall-only jobs are visible only in the Drywall workspace, GC PMs don't see them by default. Drywall trade work on a GC project surfaces in both workspaces as a single row, two views (§5.2).

**Workspace switcher** (`src/components/WorkspaceSwitcher.tsx`) — Schedule appears as a top-level workspace alongside Projects, Deals, Tenants, Meetings, HR, Drywall. Seven workspaces total post-merge.

---

## 10. Migration path

Re-prioritized from v1 to put comms layer earlier. Steps:

1. **Promote storage** — `schedule_items` table. One-shot data migration.
2. **Add `assigned_company_id`** + backfill all existing items to "HSH internal" sentinel.
3. **Reshape dependencies** — multi + lag.
4. **Workday-aware cascade** — `scheduleDateMath.ts`. Replaces current naive cascade.
5. **Add `communication_log_entries` table** — the central new entity.
6. **Manual comms log UI in PM view** — manual entries first (no SMS yet). Office can log calls, type messages.
7. **Confirmation state on items** — visible as colored dots. Manual confirm/decline initially.
8. **Schedule workspace + Portfolio view + Comms inbox sidebar** *(NEW)* — promote Schedule to a top-level workspace via `WorkspaceSwitcher.tsx`. Build the Portfolio calendar surface at `/schedule` (§6.1) and the always-on Comms inbox sidebar (§6.4). Per-project schedule still reachable at `/projects/:projectId/schedule`. Depends on #1 (cross-project queries) and #6 (comms log to display). SMS layer slots into the surface in #9–#11.
9. **SMS outbound (Twilio)** — assignment, weekly digest, reminders. No inbound yet.
10. **Cascade preview modal** — uses #4 + #9.
11. **SMS inbound (Twilio webhook)** — parse confirmations, route messages to log + office notifications.
12. **Field/sub portal routes** — mobile views, RLS by `assigned_company_id`.
13. **Resource compare view** — all crews (GC subs + in-house drywall). Needs cross-project queries (#1 enables this).
14. **Critical-path compute + display** — `criticalPath.ts` + UI highlights.
15. **Holidays + unavailability tables** — config UI for org admins.
16. **Baseline + variance** *(deferred Tier)*.

Sizing:
- 1–4 ≈ 2 sessions (foundational data + math)
- 5–7 ≈ 2 sessions (comms log central UI)
- 8 ≈ 1–2 sessions (workspace + Portfolio + inbox sidebar)
- 9–11 ≈ 2–3 sessions (Twilio integration both ways)
- 12 ≈ 2 sessions (field/sub portal + RLS)
- 13 ≈ 1 session
- 14 ≈ 1 session
- 15 ≈ 1 session
- 16 ≈ deferred

Roughly 12–15 dev sessions to reach the target state.

---

## 11. Resolved questions (was §11 in v1)

Items asked in v1 that the walkthrough resolved:

| Question | Resolution |
|---|---|
| Storage promotion now or later? | **Now, in step 1**, because cross-project queries (resource compare, sub portal) depend on it. |
| Type granularity | **task / milestone / event split** retained. Worth the modeling clarity. |
| Lag/lead — calendar or work days? | **Work days.** Construction convention. |
| Assignment — company or person? | **Company on HSH side.** Subs handle individual assignment internally. |
| In-house vs external subs — same table? | **Same `subcontractors` table** with `is_internal: boolean` flag. |
| Critical path surface to subs? | **PM-only.** |
| Cross-project resource conflicts? | **Yes** — cross-project is the default; per-project a toggle. |
| Baseline | **Deferred** — useful eventually, not Tier 1. Owner didn't push for it. |
| Recurring items | **Out of scope.** Separate future "daily tasks" module. |
| Reply parsing messiness | Auto-handle `Y/yes/ok/👍`, escalate ambiguous to PM. |
| Portfolio view as a first-class lens? *(v3)* | **Yes** — calendar landing at `/schedule`, spans all in-flight projects. Filter chips per project with "solo" focus. Drywall workspace shares this surface pre-filtered. |
| Schedule a top-level workspace? *(v3)* | **Yes.** Sibling of Projects/Deals/Tenants/Meetings/HR/Drywall. Not nested under Projects or HR. |
| Workspace landing page? *(v3)* | **Portfolio calendar** — this week + next week, all GC projects, comms inbox sidebar open. |
| Resource-compare scope — GC subs only, or include in-house drywall crews? *(v3)* | **All crews.** Manpower overallocation doesn't respect the GC/drywall divide. |
| Two-views-one-row edit conflicts (GC PM vs drywall scheduler editing the same row)? *(v3)* | **Last-write-wins.** Comms log captures both edits as system entries. Confirmation resets to `'pending'` on date change so the other side sees the move. No formal handshake. |
| Drywall-only projects in GC portfolio? *(v3)* | **Hidden by default.** `metadata.app_scope = 'DRYWALL_ONLY'` filters them out of GC views; visible only in Drywall workspace. |

---

## 12. Still-open questions

One left, all others resolved:

1. **Office notification channel for inbound messages** — PWA push vs. third-party (OneSignal) vs. email-only-when-offline. Owner: not certain yet. Operational, not blocking the build — start with in-app badges + email digest fallback, layer push later when the channel preference is decided.

Resolutions added since v2:
- Multi-PM routing → all PMs on project + all `scheduler`-role users (implies new role).
- Resource compare density → vertical scroll, sticky header, fixed column widths.
- In-house sub distinction → `is_internal: boolean` on `subcontractors`. Means "1099 working exclusively for HSH" (not a W-2 distinction). Drives sort, filter, and default notification channel.
- Phone → company resolution → handled by the new `subcontractor_contacts` one-to-many table. Multiple phones per company supported; unmatched inbound numbers route to a "needs triage" inbox for the office.

Resolutions added in v3 (Drywall-as-workspace merge planning):
- Schedule is its own workspace; Portfolio is its default landing.
- Portfolio is calendar-primary, project-row layout, 14-day default window, filter chips with "solo" focus, type filter (All / GC / Drywall).
- Comms inbox is a fourth surface (§6.4), always-on as a sidebar in Portfolio.
- Cross-workspace edit conflicts on shared rows use last-write-wins with comms-log audit (§4.2a).
- Drywall workspace's schedule view is the Portfolio surface pre-filtered to drywall jobs.
- Resource-compare spans all crews including in-house drywall.

---

## 13. What this doc is for

This is the planning artifact we work from. Build sessions reference it. Sequence in §10 governs ordering. When something doesn't match reality, we update the doc — it's living, not a contract.

Tomorrow's question is: of the 16 migration steps in §10, which 1–2 do we tackle first? Note the new §8 (Schedule workspace + Portfolio + Comms inbox) is the visible turning point — once that lands, the rest of the work plugs into a surface PMs are already using.
