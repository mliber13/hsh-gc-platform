# Schedule — Target Model & IA

**Status:** v2, post-walkthrough (2026-05-04)
**Source:** Owner walkthrough 2026-05-04. v1 reorganized after owner clarified "the comms loop is the differentiator, schedule mechanics themselves are mundane."
**Predecessor docs:** `docs/DESIGN_LANGUAGE.md`, `docs/UI_PORT_PLAYBOOK.md`. Current implementation: `src/components/ScheduleBuilder.tsx` (post Tier 1).

---

## 1. The premise

Schedules in construction software are largely solved. Dependencies, calendar grids, mark-complete — every shop does it the same way and reinventing it adds nothing. **What remains genuinely hard is the communication loop with the field**, in both directions, kept clean and audit-traceable.

The product differentiator is therefore not the schedule itself but **the comms-and-actuals layer wrapped around it**, plus the **resource-compare view** for manpower availability.

This doc treats the schedule mechanics as table stakes (build them solid but don't over-invest), and the comms layer as the centerpiece.

---

## 2. Goals

1. **A durable, filterable communication log** tied to schedule items — every change has a logged "why," every sub message lives next to the work it's about, every phone call is captured even though the channel was voice.
2. **Two-way comms with subs** — push schedule out (SMS + email + app), receive updates back (SMS replies, app, manually-entered phone calls), surface both in one log.
3. **PM-initiated cascades with preview-then-commit** — when a slip happens, PM sees the impact, opts out per-recipient if needed, then commits and the right SMS go out.
4. **Resource-compare view** — side-by-side per-company columns to spot conflicts and under/over-allocation across projects.
5. **Solid dependency math underneath** — multi-predecessor with lag, weekend + holiday-aware cascade, critical-path highlight. Foundational but not differentiating.

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

## 4. Three user surfaces

### 4.1 Office / PM (full edit)

Existing `ScheduleBuilder.tsx`-shaped surface. Three view modes (List / Calendar / Resource — see §6). Adds:
- **Comms log panel** — toggleable side panel showing the per-item or whole-job comms feed.
- **Cascade preview modal** for any move with dependencies.
- **"Log call" button** on each schedule item header.
- **Confirmation status indicator** on items: subtle dot color (green confirmed / amber pending / rose declined).

### 4.2 Field crew (in-house)

Mobile-first scoped view at `/schedule/me`. Card list of "items where assigned_company_id = HSH internal."
- **Today** — items today.
- **This week** — next 7 days.
- **Upcoming** — beyond.
- Per card: project + address + scope + start day + confirm/decline buttons + comms thread for the item.
- Replies post to comms log, channel='in-app'.

### 4.3 Outside subs (sub portal)

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

**Promote storage** — extract to `schedule_items` table. Required for cross-project queries (resource compare, sub portal "all my work for HSH"), proper FKs, indexable created_at, RLS scoping for sub portal.

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

## 6. IA — three view modes

```
[ List ]  [ Calendar ]  [ Resource ]
```

**List view** (existing). Dense edit, one row per item. Best for "I need to change something." Adds: comms thread popover per item, confirmation status dot, critical-path highlight.

**Calendar view** (existing). Month grid with bars. Click bar → edit dialog (already shipped Tier 1). Adds: critical-path highlight, confirmation dot on bars, drag-to-reschedule (triggers cascade preview).

**Resource view (NEW)** — side-by-side columns per company.
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

---

## 7. Lifecycle workflows

### 7.1 Project kickoff (PM)
1. Create project. Schedule empty.
2. Optionally seed from estimate (starter wizard, not primary flow).
3. Manually add tasks, milestones, events. Wire dependencies. Assign companies.
4. Publish: outbound SMS/email assignment to all assigned companies. Confirmation states go to 'pending'.
5. Subs reply (or don't). Confirmations track in real time.

### 7.2 Daily ops (PM)
- Open Schedule. Default to Calendar or Resource view.
- Glance at confirmation dots — anything pending too long?
- Inbox: new comms entries since last visit (badge count).
- Sub texts "running late, will be 10am" → office sees notification → opens item → reads message in comms log → judges impact → optionally bumps the schedule (triggers cascade preview).

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

**Time clock** *(future module)* — clock-in references active schedule items. Closes loop on actual hours per task.

**Recent Activity** (existing card on Project Detail) — schedule item creation, completion, and major changes feed it. Cheap add once table promotion lands.

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
8. **SMS outbound (Twilio)** — assignment, weekly digest, reminders. No inbound yet.
9. **Cascade preview modal** — uses #4 + #8.
10. **SMS inbound (Twilio webhook)** — parse confirmations, route messages to log + office notifications.
11. **Field/sub portal routes** — mobile views, RLS by `assigned_company_id`.
12. **Resource compare view** — needs cross-project queries (#1 enables this).
13. **Critical-path compute + display** — `criticalPath.ts` + UI highlights.
14. **Holidays + unavailability tables** — config UI for org admins.
15. **Baseline + variance** *(deferred Tier)*.

Sizing:
- 1–4 ≈ 2 sessions (foundational data + math)
- 5–7 ≈ 2 sessions (comms log central UI)
- 8–10 ≈ 2–3 sessions (Twilio integration both ways)
- 11 ≈ 2 sessions (field/sub portal + RLS)
- 12 ≈ 1 session
- 13 ≈ 1 session
- 14 ≈ 1 session
- 15 ≈ deferred

Roughly 11–14 dev sessions to reach the target state.

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

---

## 12. Still-open questions

One left, all others resolved:

1. **Office notification channel for inbound messages** — PWA push vs. third-party (OneSignal) vs. email-only-when-offline. Owner: not certain yet. Operational, not blocking the build — start with in-app badges + email digest fallback, layer push later when the channel preference is decided.

Resolutions added since v2:
- Multi-PM routing → all PMs on project + all `scheduler`-role users (implies new role).
- Resource compare density → vertical scroll, sticky header, fixed column widths.
- In-house sub distinction → `is_internal: boolean` on `subcontractors`. Means "1099 working exclusively for HSH" (not a W-2 distinction). Drives sort, filter, and default notification channel.
- Phone → company resolution → handled by the new `subcontractor_contacts` one-to-many table. Multiple phones per company supported; unmatched inbound numbers route to a "needs triage" inbox for the office.

---

## 13. What this doc is for

This is the planning artifact we work from. Build sessions reference it. Sequence in §10 governs ordering. When something doesn't match reality, we update the doc — it's living, not a contract.

Tomorrow's question is: of the 15 migration steps in §10, which 1–2 do we tackle first?
