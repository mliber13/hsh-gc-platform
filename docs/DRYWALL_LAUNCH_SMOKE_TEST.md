# Drywall Launch Smoke Test

Pre-launch end-to-end exercise covering every drywall surface shipped through D.1, D.2, D.4, D.6. Run before 7/1 to surface UX gaps and regressions under operational load.

**Goal:** Walk one Quote-driven job and one PO-driven job through the entire lifecycle, plus exercise the crew app in parallel. Each step has a verification — if anything doesn't behave as expected, log it as a polish item.

**Approach:** Two test jobs run in parallel (Quote path A + PO path B). One test crew account (Path C) exercises /crew against both. Final scenarios (Path D) catch edge cases and reverts.

---

## Preconditions

Before starting, confirm:

- [ ] All migrations applied through `20260617130000_comms_read_state.sql`
- [ ] Org has `org_drywall_catalogs` seeded with at least one board + one finish scope + labor rates set
- [ ] `margin_floor_target` is 0.30 and `po_estimated_cost_per_sqft` is set (check Catalogs → Targets tab)
- [ ] Supabase Auth email confirmation is OFF (so crew invites can complete signup in one shot)
- [ ] You're logged in as an operator role (owner / office_drywall / office_gc)
- [ ] At least one **test 1099 contractor** record exists in org_team (will be used as test crew)
- [ ] Browser dev tools open in a second tab — handy for inspecting network errors

---

## Path A — Quote-driven job: "Smith Residence — TEST"

**Goal:** Operator builds a real v3 quote, sends it, approves it, and walks through field → order → production → closeout. Hits margin floor gate.

### A.1 Create + Info

- [ ] Drywall list → "New Drywall Project" dropdown → "New from scratch"
- [ ] On /info: Job Name = "Smith Residence — TEST", Client = "Smith TEST", Address = "123 Test St", Notes = ""
- [ ] Click "Save changes" → toast "Project info saved"
- [ ] Header badge reads **Setup** (sky color)
- [ ] Scroll to bottom: Comms Log panel renders, Danger Zone card renders
- [ ] Click "Continue to Quote" → navigates to /quote, status badge updates to **Quote** (violet)

### A.2 Build v3 quote

- [ ] /quote shows v3 quote builder (NOT PoSummaryCard, NOT v2 builder for new project)
- [ ] QuoteOutcomeBar at top reads **Drafted**
- [ ] Sidebar "Margin vs Floor" indicator renders (probably gray/neutral since quote is empty)
- [ ] Add a line item: type=drywall, location="Main", quantity=2000, pick a board + finish scope from catalog
- [ ] Set Overhead = 6%, Profit = 30% (or whatever puts margin near floor)
- [ ] Save quote
- [ ] Sidebar updates: Bid Total, Margin vs Floor (now colored)

### A.3 Mark Sent — at or above floor (happy path)

- [ ] Verify Margin vs Floor is green or yellow (≥25%)
- [ ] Click "Mark Sent" → confirm dialog shows current bid total → confirm
- [ ] QuoteOutcomeBar updates to **Sent on {date}** + "Bid baseline: $X"
- [ ] Quote stage becomes read-only (inputs disabled, save disabled)
- [ ] Banner reads "Quote is locked"

### A.4 Mark Approved

- [ ] Click "Mark Approved" → confirm dialog → confirm
- [ ] QuoteOutcomeBar updates to **Approved on {date}**
- [ ] Header badge **auto-advances** from Quote (violet) to Field (rose)
- [ ] Quote tab still shows the locked quote

### A.5 Field measurement

- [ ] Navigate to /field → field measurement page loads
- [ ] Add at least one measurement area with boards
- [ ] Add field notes: siteContact, contactPhone, meetingLocation, accessNotes
- [ ] Save
- [ ] Click "Continue to Order" → quote project skips the D.4 PO gate (only POs trigger that here) → status advances to **Order** (amber)

### A.6 Order

- [ ] /order shows order stage
- [ ] Create at least one supplier order (any supplier, any items)
- [ ] Verify order saves

### A.7 Production

- [ ] Navigate to /production tab
- [ ] Empty state shows: "Production hasn't started yet" + "Mark Production Started" button
- [ ] Click "Mark Production Started" → toast → page reloads
- [ ] Status badge updates to **Production** (emerald)
- [ ] Three cost tiles render: Running Cost, Margin vs Bid, Current Crew
- [ ] Running Cost = $0 (no labor/material entries yet)
- [ ] Margin vs Bid shows current bid as variance baseline
- [ ] Current Crew shows "—" (no labor entries yet)
- [ ] Refresh button works

### A.8 Add labor + material (optional — exercises D.1.3 + D.1.4)

If you can add a payroll entry tagged to this project:
- [ ] Go to /hr/payroll → new pay period → add an entry for an employee/contractor with project = Smith Residence TEST
- [ ] Back to Production tab → Refresh → Running Cost shows the labor amount
- [ ] Current Crew lists that person's name

If you can add a material entry (Supabase Studio or QB sync):
- [ ] Insert a row in material_entries with project_id = this project's id, amount = some value
- [ ] Refresh Production → Material amount appears in subline

### A.9 Production Complete

- [ ] Click "Mark Production Complete" → status badge updates to **Production Complete**
- [ ] Production page now shows "Production Complete" status pill
- [ ] **New: "Revert to In Progress" button visible** (from earlier polish fix)
- [ ] Navigate to /closeout tab → unlocks
- [ ] Three tiles: Final Total Cost, Final Margin vs Bid, After-Production Cost
- [ ] After-Production Cost = $0 (no costs added after Production Complete yet)

### A.10 Mark Fully Closed

- [ ] /closeout → click "Mark Fully Closed" → status updates to **Closed**
- [ ] Closeout shows "Closed on {date}" + "Reopen to Production Complete" button
- [ ] Header badge reads **Closed** (slate)
- [ ] Drywall projects list shows this project with Closed pill (need to filter by Closed to see it, or set status filter to "All")

### A.11 Reopen (then leave closed)

- [ ] Click "Reopen to Production Complete" → status returns to Production Complete
- [ ] Click "Mark Fully Closed" again → back to Closed

---

## Path B — PO-driven job: "Schumacher TEST PO"

**Goal:** Operator creates from PO, system synthesizes bid snapshot, project lands at field-measurement, hits D.4 PO margin gate intentionally.

### B.1 Create from PO

- [ ] Drywall list → "New Drywall Project" dropdown → **"Create from PO"**
- [ ] PoIntakeDialog opens
- [ ] Fill: Project Name = "Schumacher TEST PO" (auto-suggested from client + PO#), Client = "Schumacher Homes TEST", PO# = "PO-TEST-001", Customer's Sqft = 5000, Agreed Unit Rate $/sqft = **2.00** (intentionally low to trigger margin floor at field-measurement)
- [ ] Live Total Bid displays: 5,000 × $2.00 = $10,000
- [ ] Scope Text defaults to "Drywall hang and finish per PO"
- [ ] Click "Create Project"
- [ ] Lands on /info with all data pre-filled
- [ ] Header badge reads **Field Measurement** (rose) — PO bypasses Quote stage

### B.2 Verify PO Summary on Quote tab

- [ ] Navigate to /quote → shows **PoSummaryCard** (NOT the v3 builder, NOT QuoteOutcomeBar)
- [ ] Card shows: "Approved" status pill, PO #, customer, total bid ($10,000), scope, "Bid baseline: $10,000 locked on …"
- [ ] "Edit PO" button visible
- [ ] "Download PO PDF" disabled with "Coming soon" tooltip

### B.3 Edit PO

- [ ] Click "Edit PO" → dialog opens in edit mode with current values pre-filled
- [ ] Change Agreed Unit Rate to $2.50 → live Total updates to $12,500
- [ ] Note: "Saving will refresh the bid baseline to $12,500"
- [ ] Save → card refreshes, bid baseline updates

### B.4 Field measurement → trigger margin floor gate

- [ ] Navigate to /field
- [ ] Add measurement with totalMeasuredSqft = say 5,000 sqft
- [ ] Add field notes
- [ ] Click "Continue to Order"
- [ ] Margin gate evaluates: po_estimated_cost = 5,000 × $2.50 (default cost/sqft) = $12,500. Bid = $12,500 (from B.3). Margin = ($12,500 - $12,500) / $12,500 = 0%. **Below 30% floor — gate fires.**
- [ ] BelowFloorMarginDialog opens: "Continue below target margin?"
- [ ] Required textarea visible; submit button disabled until reason entered
- [ ] Enter reason "Test below-floor send"
- [ ] Click "Continue to order (below floor)" → approval logged, status advances to Order

### B.5 Verify approval logged

- [ ] In Supabase Studio (or via dev tools): query `projects.metadata.legacy.below_floor_approvals` for this project
- [ ] One entry exists with trigger='field_measurement_to_order', reason='Test below-floor send', floor_target=0.30, etc.

### B.6 Walk through remaining stages

- [ ] /order → create supplier order (optional)
- [ ] /production → Mark Production Started → status updates → tiles render
- [ ] Production widget Margin vs Bid shows red (below 30%)
- [ ] /closeout → Mark Fully Closed → done

---

## Path C — Crew app: parallel exercise of D.6.1 + D.6.2 + D.6.3

**Goal:** Invite a crew member, sign them up, assign to schedule items on A or B, exercise the /crew shell and comms.

### C.1 Generate invite (D.6.1)

- [ ] Navigate to /hr/crew (Crew Accounts)
- [ ] Find your test 1099 contractor (from Preconditions)
- [ ] Click "Generate invite link" → dialog with URL appears
- [ ] Copy URL

### C.2 Sign up as crew (incognito)

- [ ] Open URL in incognito browser
- [ ] CrewSignupPage loads, shows "Create your crew account"
- [ ] Enter test email + password + confirm password
- [ ] Submit → redirects to /crew → CrewProjectListPage loads
- [ ] Empty state: "No assigned jobs. Check with your office about scheduling."
- [ ] Verify in operator browser: profile created, role='crew', linked_contractor_id set on profile

### C.3 Operator-side: assign crew to schedule (D.6.2)

- [ ] In operator browser: Schedule workspace → portfolio view → find a schedule item OR create one for "Smith Residence — TEST" (Path A's project)
- [ ] Click the item to open modal → "Assigned persons" picker → search for test contractor → select
- [ ] Save schedule item

### C.4 Crew sees the job

- [ ] Refresh /crew in incognito → "Smith Residence — TEST" appears in list
- [ ] Card shows project name, client, address, status pill (rose for Field at this point of test A), next scheduled date, "1 task"
- [ ] Tap project → CrewProjectDetailPage opens
- [ ] Header: project name, status pill, back arrow
- [ ] Customer & address section
- [ ] "Your schedule" lists the schedule item you assigned
- [ ] Pay rates card shows hanger / finisher / cleanup rates with rate source ("catalog default" or "project override")
- [ ] Total sqft
- [ ] Scope of work (whatever you set in quote)
- [ ] Field notes — shows phones as tap-to-call links
- [ ] Breakdowns / line items
- [ ] **At the bottom**: Messages section (CrewCommsPanel)

### C.5 Two-way comms (D.6.3)

- [ ] In crew incognito browser: type a message in the Messages textarea → click Send
- [ ] Entry appears at top of the list with **Sub** badge (since crew is linked to a 1099) and "just now" timestamp
- [ ] In operator browser: navigate to Smith Residence /info → Comms Log shows the crew's message with **Sub** badge
- [ ] Operator posts a reply → toast → entry appears with no badge (operator role)
- [ ] Refresh crew incognito → operator's message appears in CrewCommsPanel

### C.6 Notification bell (D.6.3)

- [ ] Have operator post a NEW message to Smith Residence
- [ ] In crew incognito: bell icon in header shows red badge "1"
- [ ] Click bell → dropdown lists "Smith Residence — TEST" with "1" unread
- [ ] Tap → navigates to /crew/projects/:id, opens detail page
- [ ] Refresh — bell count clears (because mounting CrewCommsPanel marks read)

### C.7 Operator preview of crew view

- [ ] In operator browser: navigate directly to `/crew/projects/{smith-project-id}` (URL hack — replace ID)
- [ ] Detail page loads (uses `fetchCrewProjectDetailForPreview`)
- [ ] CrewCommsPanel renders BUT no Send composer (readOnly mode)
- [ ] Existing messages visible

---

## Path D — Edge cases & reverts

### D.1 Quote outcome lifecycle (D.1.2)

- [ ] Create a new test project, build a quote
- [ ] Mark Sent → Mark Lost (with reason) → outcome shows "Lost on {date}", red badge, reason in tooltip
- [ ] Click "Unlock for Revision" → confirmation dialog → confirm → outcome back to Drafted
- [ ] Verify the project's status badge is UNCHANGED (per spec — unlock doesn't revert status)

### D.2 Below-floor send for quote (D.4)

- [ ] Create a quote with margin clearly below 30% (e.g. set Profit to 5%)
- [ ] Sidebar Margin vs Floor shows red
- [ ] Click Mark Sent → BelowFloorMarginDialog opens (NOT the normal confirm)
- [ ] Required reason, submit "Test below-floor quote send" → entry logged + outcome=sent

### D.3 Revert production complete (polish from earlier)

- [ ] On any project at Production Complete → /production tab → click "Revert to In Progress" → status returns to production
- [ ] "Mark Production Complete" button reappears

### D.4 Delete project (polish from earlier)

- [ ] Open one of the TEST projects → /info → scroll to bottom → "Danger Zone" card
- [ ] Click "Delete Project" → confirmation dialog → confirm
- [ ] Toast → redirects to drywall list → project is gone

### D.5 Status filter on list

- [ ] /drywall (list page) → status filter dropdown → pick each status in turn → verify URL updates with `?status=…` + list filters correctly
- [ ] Set status="Closed" → verify any closed-status legacy projects appear (the 'complete' → 'closed' normalizer)

---

## What to do with findings

Keep a running list as you go. Categorize each issue as:

- **🛑 Blocker** — breaks the flow; must fix before 7/1
- **⚠️ Polish** — works but rough; fix if time permits before 7/1, otherwise post-launch
- **💡 Idea** — nice-to-have future enhancement; defer

At the end of testing, share the list and we'll triage.

---

## Estimated time

Full pass: **45-90 minutes** depending on how deep you go into A.8 (real labor/material data) and whether you wait between status transitions to verify timestamps.

Minimum viable pass (skip optional steps): **30 minutes**.
