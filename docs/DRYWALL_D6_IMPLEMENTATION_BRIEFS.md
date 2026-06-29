# D.6 Implementation Briefs — Crew/Sub In-App Messaging + Field-Facing Project View

Sub-phase briefs for D.6 from [DRYWALL_DIVISION_OPERATIONS_PLAN.md](DRYWALL_DIVISION_OPERATIONS_PLAN.md). Each brief is a self-contained Cursor instruction set.

## Working assumptions (apply to all D.6.x)

- Existing RBAC roles: `owner | office_gc | office_drywall | viewer` (plus `admin` legacy). Capability checks via [usePermissions](../src/hooks/usePermissions.ts).
- Crew assignment is **schedule-based** (decision 06-16): a crew member sees projects where their identifier appears in `schedule_items.assigned_to[]` OR they're tied to the `assigned_company_id` subcontractor.
- Crew can only READ assigned drywall projects. They cannot edit anything except messages in D.6.3.
- Mobile-first crew UX lives at `/crew/*`. Operator pages stay as-is.
- Twilio customer SMS and voicemail are DEFERRED (decisions #22, #23, #25 superseded 2026-06-15).

---

## D.6.1 — Crew accounts + invite flow

**Goal:** Provision login accounts for crew (W2) and 1099 subs. Operator generates one-time invite link per person; crew member clicks link, creates account, profile is auto-linked to their employee/contractor record with the new `crew` role.

### Schema

**Migration: `supabase/migrations/20260616130000_crew_role_and_invites.sql`**

```sql
BEGIN;

-- 1. Extend profiles to link to employee or contractor record
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS linked_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_contractor_id uuid REFERENCES public.contractors_1099(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_linked_employee_id ON public.profiles(linked_employee_id);
CREATE INDEX IF NOT EXISTS idx_profiles_linked_contractor_id ON public.profiles(linked_contractor_id);

-- Exactly one (or neither) — both set is invalid
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_linked_one_or_none
  CHECK (linked_employee_id IS NULL OR linked_contractor_id IS NULL);

-- 2. Crew invite tokens
CREATE TABLE IF NOT EXISTS public.crew_invite_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  token text NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  linked_employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  linked_contractor_id uuid REFERENCES public.contractors_1099(id) ON DELETE CASCADE,
  invited_email text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CHECK (linked_employee_id IS NOT NULL OR linked_contractor_id IS NOT NULL),
  CHECK (linked_employee_id IS NULL OR linked_contractor_id IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_crew_invite_tokens_token ON public.crew_invite_tokens(token) WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crew_invite_tokens_org ON public.crew_invite_tokens(organization_id);

ALTER TABLE public.crew_invite_tokens ENABLE ROW LEVEL SECURITY;

-- Operators can manage invites for their org
CREATE POLICY "Editors manage crew invites" ON public.crew_invite_tokens
  FOR ALL
  USING (organization_id = public.get_user_organization_uuid() AND public.user_can_edit())
  WITH CHECK (organization_id = public.get_user_organization_uuid() AND public.user_can_edit());

-- Anyone with a valid token can read it (for signup page) — token is the secret
CREATE POLICY "Read by token (signup)" ON public.crew_invite_tokens
  FOR SELECT
  USING (true);  -- token in WHERE clause is the auth; rows w/o matching token return empty

COMMIT;
```

### RBAC extension

Add `'crew'` to the `RbacRole` union in [`src/types/rbac.ts`](../src/types/rbac.ts) (or wherever `RbacRole` is defined).

Update [`usePermissions.ts`](../src/hooks/usePermissions.ts):
- `isCrew = effectiveRole === 'crew'`
- Crew capability gates: NO edit anywhere except crew comms posts (D.6.3)
- `rbacCanAccessWorkspace(effectiveRole, 'drywall')` returns true for crew, but crew only sees assigned drywall projects (RLS filter)
- New helper `rbacCanAccessCrewWorkspace(effectiveRole)` returns true for `crew` only (or other roles for operator preview)

### Types

`src/types/crew.ts` (NEW):

```ts
export interface CrewInviteToken {
  id: string
  token: string
  linkedEmployeeId: string | null
  linkedContractorId: string | null
  invitedEmail: string | null
  createdAt: string
  expiresAt: string
  consumedAt: string | null
}

export type CrewLinkedPersonType = 'employee' | 'contractor'

export interface CrewProfileLink {
  userId: string
  personType: CrewLinkedPersonType
  personId: string
  personName: string
}
```

### Service — `src/services/crewInviteService.ts` (NEW)

```ts
export async function generateCrewInviteToken(args: {
  linkedEmployeeId?: string
  linkedContractorId?: string
  invitedEmail?: string
  ttlHours?: number  // default 168 (1 week)
}): Promise<CrewInviteToken>
// Validates: exactly one of linkedEmployeeId/linkedContractorId.
// Generates a cryptographic random token (32+ chars).
// Inserts row, returns the full token.

export async function fetchCrewInvitesForOrg(): Promise<CrewInviteToken[]>
// Returns all non-consumed, non-expired tokens for current org.
// Used for the operator-side Crew Members admin surface to track outstanding invites.

export async function revokeCrewInviteToken(tokenId: string): Promise<void>
// Soft-deletes (sets consumed_at without consumed_by) to invalidate without rewriting the schema.

export async function fetchCrewInviteByToken(token: string): Promise<CrewInviteToken | null>
// Public-readable endpoint for the /crew-signup page. Returns null if missing, expired, or consumed.

export async function consumeCrewInviteToken(
  token: string,
  signupResult: { userId: string },
): Promise<void>
// Marks the token consumed, sets consumed_by, links the new auth user's profile to
// the employee/contractor referenced by the token, and sets profile.role = 'crew'.
// Must be called RIGHT AFTER successful supabase.auth.signUp.
```

### Service — extend `userService.ts`

Add `linkedEmployeeId`, `linkedContractorId` to the `UserProfile` type.

Add helper `fetchCrewProfileLinks()` that returns all crew-role profiles with their linked person details (for the Crew Members admin surface).

### Routing

**New route: `/crew-signup?token=<token>` (public, unauthenticated)**

`src/routes/CrewSignupPage.tsx` (NEW):
- Reads `token` from query string
- On mount: calls `fetchCrewInviteByToken(token)` to validate
- If invalid/expired/consumed: shows "This invite link is no longer valid" + Contact admin message
- If valid: shows signup form with email + password + confirm password
- On submit: calls `supabase.auth.signUp({ email, password })`, then `consumeCrewInviteToken(token, { userId: newUser.id })`
- On success: redirect to `/crew` (the new crew workspace home — D.6.2)

Register route in `src/routes/index.tsx` as a public route (no auth wrapper).

### UI — operator-side Crew Members admin surface

**New route: `/hr/crew` (NEW page) OR add a "Crew Accounts" tab to existing HR page**

`src/components/hr/crew/CrewAccountsPage.tsx` (NEW):
- Two sections:
  - **Employees** (W2 from `team.employees`): table showing name, role, account status
  - **1099 Contractors** (from `team.contractors1099`): same table

For each person, account status is one of:
- **No account** — show "Generate invite link" button
- **Invite pending** — show "Copy invite link" + "Revoke" buttons
- **Linked** — show "Account active" with email + last-active info

Clicking "Generate invite link":
1. Calls `generateCrewInviteToken({ linkedEmployeeId | linkedContractorId, invitedEmail: person.email })`
2. Builds URL: `${window.location.origin}/crew-signup?token=${token.token}`
3. Opens a small dialog with the URL + Copy-to-clipboard button
4. Operator copies and sends via text/email manually (V1 — no auto-email)

### Acceptance criteria

1. Type-check passes.
2. Migration applies cleanly; `profiles.linked_employee_id`/`linked_contractor_id` columns exist; `crew_invite_tokens` table exists with RLS.
3. `generateCrewInviteToken` validates input and returns a token row with a unique random token string.
4. `fetchCrewInviteByToken` works WITHOUT authenticated session (public read).
5. `consumeCrewInviteToken` correctly: marks consumed, links profile to person, sets `profile.role = 'crew'`.
6. `/crew-signup?token=…` page:
   - Invalid token → friendly error
   - Valid token → signup form
   - On successful signup → user is logged in, profile is linked, redirected to `/crew`
7. Crew Members admin page shows Employees + Contractors tables with correct status for each.
8. Generate invite link → URL appears in a copy-able dialog.
9. Revoking an invite invalidates the token; `/crew-signup` with revoked token shows the error state.
10. New `crew` role appears in RBAC; existing operator capability gates are unaffected.

### Out of scope (defer to later D.6.x)

- `/crew` workspace itself — D.6.2
- Email sending for invites — V1 is copy-and-text manually
- Crew-side messaging / comms — D.6.3
- Phone-based signup / SMS invite delivery
- Re-link / change-linkage flows (V1 assumes linkage is set once on signup)

### Estimated effort

2 sessions. Most risk is the public RLS policy on `crew_invite_tokens` (token-only auth) and ensuring `consumeCrewInviteToken` writes profile linkage correctly in the same transaction as the auth signup.

---

## D.6.2 — Per-person schedule assignment + crew shell + project list + project detail

**Scope expanded 2026-06-17.** Originally just "crew shell + project list + detail" with assumed-existing schedule data. Investigation revealed `schedule_items.assigned_to text[]` exists in schema but no UI sets it; per-person assignment is the missing layer for BOTH drywall and GC. D.6.2 now includes adding that layer to existing `schedule_items` (no schema fork — same table benefits both consumers).

**Goal:** Person-precise crew visibility. Operator assigns specific employees/1099s to schedule items. Crew opens `/crew` and sees only drywall projects they're scheduled on. Detail page is mobile read-only with what crew actually needs in the field.

**Anchors:**
- Decision #24 (in-app messaging for crew/sub, project-tagged)
- Decision #27 (field-facing project view)
- Decision #29 (3-4 dedicated customers; small-N person base)
- Recent clarification (06-17): per-person assignment goes in EXISTING `schedule_items`, not a forked drywall schedule table

---

### Part A — Per-person schedule assignment (schema + operator UI)

#### Schema migration

**New file: `supabase/migrations/20260617120000_schedule_items_assigned_persons.sql`**

```sql
BEGIN;

-- assigned_persons holds org_team payload member ids (text) — matches profiles.linked_employee_id / linked_contractor_id format
ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS assigned_persons text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_schedule_items_assigned_persons
  ON public.schedule_items USING GIN (assigned_persons);

COMMENT ON COLUMN public.schedule_items.assigned_persons IS
  'D.6.2: Org_team payload member ids of specific persons assigned to this schedule item. Used by crew app for per-person project visibility. Complementary to assigned_company_id (company) — both can be set.';

COMMIT;
```

#### Types

Extend `ScheduleItem` interface in `src/types/project.ts` (find the existing `assignedTo` definition):

```ts
export interface ScheduleItem {
  // ... existing fields
  assignedPersons: string[]  // org_team member ids
}
```

Update `src/services/supabaseService.ts` mappers (lines ~120, ~200, ~236) to read/write `assigned_persons ↔ assignedPersons`.

#### Operator UI — person picker on schedule items

Modify `src/components/SchedulePortfolioItemModal.tsx`:

Add a new "Assigned persons" section near the existing "Assigned company" picker. Multi-select chip-style input populated from `org_team` payload (employees + 1099 contractors). On change, calls `updateScheduleItemQuickEdit` with `{ assigned_persons: string[] }`.

Use existing `fetchTeam()` from `hrTeamService` to get the source list. Display each person's name + role badge (W2 / 1099). Stored value is the org_team member id.

The picker can be backed by a custom multi-select component using shadcn `Command` + `Popover` (search + chips pattern). If a simpler implementation exists in the codebase already (look for existing multi-select patterns), use that.

In `src/components/ScheduleBuilder.tsx`: same picker integration if the builder edits schedule items inline. If not, skip for V1 — operator can use the modal.

---

### Part B — Crew workspace data layer

#### New service: `src/services/crewWorkspaceService.ts`

```ts
export interface CrewProjectListItem {
  projectId: string
  projectName: string
  client: string
  address: string
  status: string                     // normalized drywall status
  nextScheduledDate: string | null   // earliest upcoming schedule entry for this person
  scheduleEntryCount: number          // count of items they're on
}

export interface CrewProjectScheduleEntry {
  id: string
  name: string                       // task name
  type: 'field' | 'office'
  startDate: string
  endDate: string
  status: string
  notes: string | null
}

export interface CrewProjectDetail {
  projectId: string
  projectName: string
  client: string
  address: string
  status: string
  scopeOfWork: string
  totalSqft: number | null
  laborRates: {
    hangerRate: number | null
    finisherRate: number | null
    prepCleanRate: number | null
    rateSource: 'v3_override' | 'v2_legacy' | 'catalog_default'
  }
  fieldNotes: {
    siteContact: string | null
    contactPhone: string | null
    meetingLocation: string | null
    accessNotes: string | null
    hazards: string | null
  } | null
  scheduleEntries: CrewProjectScheduleEntry[]
  breakdowns: Array<{
    id: string
    description: string
    location: string | null
    sqft: number | null
    finishScope: string | null
  }>
  intakeSource: 'quote' | 'po'        // for context label
}

export async function fetchCrewProjectList(): Promise<CrewProjectListItem[]>
// 1. Get current user's profile (linked_employee_id OR linked_contractor_id) — this is their person id
// 2. Throw friendly error if no person id (profile not linked)
// 3. Query schedule_items: WHERE current_user_person_id = ANY(assigned_persons)
// 4. Get distinct project_ids from those schedule items
// 5. Filter project_ids to drywall projects only (type='drywall' OR app_scope='DRYWALL_ONLY')
// 6. For each project, derive: client name, address, normalized status, count of schedule entries for this person, earliest upcoming entry date
// 7. Hide closed/lost projects by default
// 8. Order by nextScheduledDate asc (upcoming first); null dates last

export async function fetchCrewProjectDetail(projectId: string): Promise<CrewProjectDetail>
// 1. Verify current user has at least one schedule_items row on this project with their person_id in assigned_persons
//    Throw permission error if not
// 2. Fetch project via fetchDrywallProjectById (reuse existing service)
// 3. Extract scope of work: prefer v3 quote.scope_of_work → v2 quote.scopeOfWork → po.scopeText
// 4. Extract total sqft: prefer field measurement totalMeasuredSqft → quote sum → po.customerSqft
// 5. Extract labor rates with fallback logic (v3 custom_* → v2 legacy → catalog default)
// 6. Extract field notes from FieldTakeoff (siteContact, contactPhone, meetingLocation, accessNotes, hazards)
// 7. Extract this person's schedule entries (their assigned items, not all items on the project)
// 8. Extract breakdowns: v3 lineItems OR v2 breakdowns array, simplified shape
// 9. Return full payload
```

---

### Part C — Crew workspace UI (mobile-first)

#### New shell: `src/components/crew/CrewShell.tsx`

Mobile-first layout. Wraps all `/crew/*` routes:
- Top bar: HSH logo + project name (when on detail) + "Sign out" menu
- Body: full-width on mobile, max-width container on tablet+
- Background: subtle (use `bg-background`)
- Replace the existing CrewHomePage placeholder route with one that renders this shell + outlet

Update `src/routes/index.tsx`:
```tsx
<Route path="/crew" element={<CrewShell />}>
  <Route index element={<CrewProjectListPage />} />
  <Route path="projects/:projectId" element={<CrewProjectDetailPage />} />
</Route>
```

#### `src/components/crew/CrewProjectListPage.tsx` (NEW)

- Calls `fetchCrewProjectList()`
- Renders list of project cards (mobile-tap-friendly, large hit targets):
  - Project name (h3, prominent)
  - Customer name (sub-text)
  - Address (one line, truncated)
  - Status pill (rose for field, amber for order, emerald for production, etc. — reuse colors from card)
  - Next scheduled date with day-of-week ("Wed Jun 18")
  - "+ N more tasks" if scheduleEntryCount > 1
- Tap → navigates to `/crew/projects/:id`
- Empty state: "No assigned jobs. Check with your office about scheduling."
- Loading spinner during fetch
- Error state with retry

#### `src/components/crew/CrewProjectDetailPage.tsx` (NEW)

Mobile-first read-only sections (each a Card or simple section divider):

1. **Header**: Project name (h2) + status pill + back arrow
2. **Customer & address**: Customer name, address, contact phone if available (tap-to-call link `tel:`)
3. **Your schedule**: List of this person's scheduled items on this project
   - Each item: task name, dates ("Wed Jun 18 - Fri Jun 20"), type pill (field/office), status
4. **Pay rates**: Card showing project's labor rates
   - "Hanger: $X.XX / sqft"
   - "Finisher: $X.XX / sqft"
   - "Cleanup: $X.XX / sqft"
   - Small note: "Rates from {source: project override / catalog default}"
5. **Total sqft**: Single big number with label "Total job sqft"
6. **Scope of work**: Card with full text (whitespace-preserved)
7. **Field notes** (only if non-empty): Site contact, phone (tap-to-call), meeting location, access notes, hazards
8. **Line items / breakdowns**: List of breakdowns with sqft + finish + location for each room/scope

All sections collapse gracefully if data missing — no broken layout when scope text is empty etc.

---

### Acceptance criteria

1. Type-check passes.
2. Migration applies cleanly. `assigned_persons` column exists with empty-array default, GIN index, comment.
3. ScheduleItem type and supabaseService mappers round-trip `assignedPersons` correctly.
4. SchedulePortfolioItemModal shows a multi-select person picker; selecting persons writes the org_team member ids to `assigned_persons`.
5. Person picker is searchable, shows W2 / 1099 badge for context.
6. `fetchCrewProjectList()`:
   - Returns only drywall projects the current user is in `assigned_persons` of any schedule_item
   - Excludes closed/lost projects
   - Sorted by nextScheduledDate ascending (null last)
7. `fetchCrewProjectDetail(projectId)`:
   - Throws permission error if current user isn't in `assigned_persons` of any schedule_item on this project
   - Returns complete payload with scope, sqft, labor rates, field notes, schedule entries, breakdowns
   - Rate source correctly identifies v3 override / v2 legacy / catalog default
8. `/crew` (after login as crew member): shows project list of assigned drywall projects. Empty state if none.
9. `/crew/projects/:id`: shows mobile-friendly detail. Sections render gracefully when data missing.
10. Phone numbers in detail are tap-to-call (`tel:` links).
11. Status pill colors match drywall card colors (sky / violet / rose / amber / emerald / slate).
12. Operator (logged in as office_drywall) can also access `/crew` to preview the experience (RBAC check: `canAccessCrewWorkspace`).

---

### Out of scope (defer to later)

- Push notifications when schedule changes (V1: crew checks app)
- Crew editing schedule entries (read-only)
- Crew creating change orders or anything write-side
- Photos / file attachments on detail page
- Lockbox codes as structured field (current V1: lives in field notes if needed)
- Cross-project bulk views ("show me my whole week")
- Operator-side bulk person assignment (V1: one schedule item at a time)

---

### Estimated effort

**1.5-2 Cursor sessions.**

- Part A (schema + types + operator picker UI): ~45-60 min
- Part B (crew workspace data layer): ~30-45 min
- Part C (crew UI: shell + list + detail): ~45-60 min

Risk: person picker UI in SchedulePortfolioItemModal — if no existing multi-select pattern, Cursor builds one (~20 extra min).

---

## D.6.3 — Multi-author Comms Log + unread badge

**Goal:** Turn the existing operator-only Comms Log (from D.1.1) into a real two-way message thread per project. Crew can post from their `/crew` project page. Operators see role badges on each entry. A bell icon in both shells shows total unread count and drops to a list of projects with unread.

**Anchors:**
- Decision #24 (in-app messaging for crew/sub, project-tagged)
- Decision #13 (Comms Log shape — append-only, timestamped, on project)
- Builds on D.1.1's CommsLogPanel + D.6.1's crew role + D.6.2's `/crew` project detail

---

### Part A — Schema, types, service

#### Migration: `supabase/migrations/20260617130000_comms_read_state.sql`

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.comms_read_state (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_comms_read_state_org
  ON public.comms_read_state(organization_id, user_id);

ALTER TABLE public.comms_read_state ENABLE ROW LEVEL SECURITY;

-- Users manage their own read state only
CREATE POLICY "Users manage own read state" ON public.comms_read_state
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND organization_id = public.get_user_organization_uuid());

COMMENT ON TABLE public.comms_read_state IS
  'D.6.3: Per-user, per-project last-read timestamp for the project comms log. Unread count = commsLog[] entries with at > last_read_at.';

COMMIT;
```

#### Type updates

`src/types/drywall.ts` — extend existing `DrywallCommsLogEntry`:

```ts
export type CommsLogAuthorRole = 'operator' | 'crew' | 'sub'

export interface DrywallCommsLogEntry {
  id: string
  at: string
  author: string
  authorUserId?: string
  authorRole?: CommsLogAuthorRole  // NEW; default 'operator' on read for backward compat
  body: string
}
```

#### Service: extend `drywallProjectsService.ts`

**Modify `addCommsLogEntry`:**

```ts
// Add authorRole param (optional — defaults are computed if not provided)
export async function addCommsLogEntry(
  projectId: string,
  body: string,
  author: string,
  authorUserId?: string,
  authorRole?: CommsLogAuthorRole,
): Promise<DrywallCommsLogEntry>
// Existing logic, plus: if authorRole not provided, infer from caller's profile:
//   - profile.roles includes 'crew' → 'crew' (or 'sub' if linked_contractor_id is set)
//   - else → 'operator'
// Stores authorRole on the entry.
```

**Read normalizer in `fetchDrywallCommsLog`:** ensure every returned entry has `authorRole`, defaulting to `'operator'` when missing (backward compat with D.1.1 entries).

#### Service: new `src/services/commsReadStateService.ts`

```ts
export interface CommsUnreadEntry {
  projectId: string
  projectName: string
  unreadCount: number
  lastEntryAt: string | null
}

export interface CommsUnreadSummary {
  byProject: CommsUnreadEntry[]
  totalUnread: number
}

export async function markProjectCommsRead(projectId: string): Promise<void>
// Upsert (user_id, project_id, organization_id, last_read_at=now())

export async function fetchCommsUnreadSummary(options?: {
  scope?: 'operator' | 'crew'
}): Promise<CommsUnreadSummary>
// 1. Detect user's effective scope (or use hint):
//    - operator (any role except 'crew') → all drywall projects in org
//    - crew → only projects from fetchCrewProjectList()
// 2. Pull commsLog from each project's metadata.legacy.commsLog
// 3. Pull comms_read_state rows for current user × these projects
// 4. For each project: unreadCount = count of entries where at > (last_read_at OR epoch)
// 5. lastEntryAt = max(commsLog[].at)
// 6. byProject ordered by lastEntryAt desc, only projects with unread > 0
// 7. totalUnread = sum of unreadCount
```

Performance note: V1 iterates in-memory across the small project set (decision #29 — 3-4 customers, low N). Optimize later via SQL aggregation if needed.

---

### Part B — Operator-side: role badges on existing CommsLogPanel

Modify [`src/components/drywall/comms/CommsLogPanel.tsx`](../src/components/drywall/comms/CommsLogPanel.tsx):

For each entry, render a role badge next to author name:
- `operator` → no badge (most messages)
- `crew` → small blue pill "Crew"
- `sub` → small orange pill "Sub"

On mount, call `markProjectCommsRead(projectId)` to clear unread.

Operator post flow unchanged — service auto-infers `authorRole='operator'`.

---

### Part C — Crew-side: comms section on project detail

Add a Messages section at the bottom of [`src/components/crew/CrewProjectDetailPage.tsx`](../src/components/crew/CrewProjectDetailPage.tsx):

```tsx
<section>
  <h3>Messages</h3>
  <CrewCommsPanel projectId={projectId} readOnly={isPreview} />
</section>
```

**New: `src/components/crew/CrewCommsPanel.tsx`** (mobile-first):
- Textarea (rows=3) + "Send" button
- Existing entries listed below, latest first, each with author + role badge + relative time + body
- On mount: `markProjectCommsRead(projectId)`
- Post calls `addCommsLogEntry(projectId, body, authorName)` — service infers authorRole
- `readOnly` prop hides the post composer (used in operator preview)

Permission gate already enforced by parent (D.6.2's `fetchCrewProjectDetail`).

---

### Part D — Bell icon + unread dropdown

#### New shared component: `src/components/comms/CommsNotificationBell.tsx`

Props: `scope?: 'operator' | 'crew'`

- Fetches `fetchCommsUnreadSummary({ scope })` on mount + every 60s polling
- Renders Bell icon (lucide `Bell`)
- If `totalUnread > 0`: red badge with count overlay
- Click → Popover with:
  - "Unread messages" header
  - List of `byProject` rows: project name + unread count badge
  - Tap navigates to project's comms surface:
    - Operator scope → `/drywall/projects/:id/info` (where CommsLogPanel lives)
    - Crew scope → `/crew/projects/:id`
  - Empty state: "No unread messages"

#### Mount points

- **Operator AppLayout** — add `<CommsNotificationBell scope="operator" />` to existing header, near user menu/avatar
- **CrewShell** — add `<CommsNotificationBell scope="crew" />` to crew header next to sign-out menu

Only render if `isOnlineMode()` and session exists.

---

### Acceptance criteria

1. Type-check passes.
2. Migration applies cleanly; `comms_read_state` table exists with RLS gating to `user_id = auth.uid()`.
3. `addCommsLogEntry` auto-infers `authorRole` from caller's profile: crew → `'crew'` (or `'sub'` if linked to 1099 contractor), else `'operator'`. Optional `authorRole` param overrides inference.
4. `fetchDrywallCommsLog` returns existing D.1.1 entries (no `authorRole`) with `authorRole='operator'` defaulted on read.
5. CommsLogPanel (operator) renders role badge for non-operator entries; no badge for operator entries.
6. CommsLogPanel calls `markProjectCommsRead(projectId)` on mount.
7. `CrewProjectDetailPage` renders a Messages section using `CrewCommsPanel` at the bottom.
8. `CrewCommsPanel` allows posting; entries appear after refetch, persist via `addCommsLogEntry`.
9. `CrewCommsPanel` calls `markProjectCommsRead(projectId)` on mount.
10. `fetchCommsUnreadSummary`:
    - `scope='operator'` → counts unread across all drywall projects in org
    - `scope='crew'` → counts unread across crew's assigned projects only
    - `byProject` ordered by `lastEntryAt` desc, only projects with `unread > 0`
    - `totalUnread` sums correctly
11. `CommsNotificationBell` shows total count overlay when > 0; click opens dropdown.
12. Tap a project in dropdown navigates correctly (operator → drywall project info, crew → crew project detail).
13. Bell mounted on both operator AppLayout header AND CrewShell header.
14. Polling: bell refreshes every 60 seconds while mounted.
15. Operator preview at `/crew/projects/:id` shows CrewCommsPanel as `readOnly=true` (no composer) — operator uses the main project page's CommsLogPanel to post.

---

### Out of scope (post-launch)

- Push notifications / SMS / email when new comms arrive
- Realtime updates via Supabase realtime channels (polling for V1)
- Comms search / filter
- Attachments (photos, files)
- @-mentions / direct messages
- Mark-all-as-read button
- Per-message read receipts
- Threaded replies
- Operator posting under crew identity

---

### Estimated effort

1 Cursor session. Mostly composing on existing patterns:
- Migration + type extension (~10 min)
- Service additions (~20 min)
- CommsLogPanel role badge + read-mark (~15 min)
- CrewCommsPanel (~15 min)
- CommsNotificationBell + AppLayout/CrewShell mount points (~25-30 min)

Risk: finding the right operator AppLayout / header to mount the bell. If no dedicated header component, may need a small layout refactor (~10 extra min).

---

## After D.6.3

D.6.1-3 fully shipped. Surfaced in smoke testing 2026-06-18: **drywall projects had no way to create schedule items** (only GC projects have a schedule editor route). Without schedule items, /crew is dormant. D.6.4 added to unblock.

---

## D.6.4 — Drywall schedule editor + Schedule tab

**Goal:** Per-project schedule editor for drywall projects. New "Schedule" tab on DrywallProjectShell. CRUD on `schedule_items` table + **predecessor/cascade math** (Mark's drywall workflow is dependent-task chain: Measure → Stock → Scaffold/Prep → Hang → Finish → Cleanout) + a **"Generate standard schedule" quick-start template**. Items support per-person assignment via the D.6.2 `AssignedPersonsPicker`. Unblocks /crew app + 7/1 schedule migration.

**Anchors:**
- Decision #20 (operator labor allocation grid — schedule is the upstream signal)
- Decision #24 (in-app crew messaging, project-tagged via schedule assignment)
- D.6.2 added `assigned_persons text[]` + picker; this brief is the missing operator-side CRUD on drywall projects

**Scope clarification:** Mark explicitly de-scoped (a) PO intake route from primary use, (b) GC ScheduleBuilder integration for drywall, (c) any auto-generation from quote items. Drywall scheduling is **manual entry by operator + predecessor cascade**. Cascade reuses existing helpers (`cascadeSchedule` / `addWorkdays` from [scheduleDateMath.ts](../src/lib/scheduleDateMath.ts)) — no new math.

---

### Schema

No migration. Reuses existing `schedule_items` table (which already has `project_id`, `name`, `type`, `start_date`, `end_date`, `status`, `notes`, `assigned_persons`, `assigned_company_id` columns).

**One thing to verify in code:** the existing `schedules` parent table — each schedule_item has `schedule_id` FK. For drywall projects, we need a default schedule row to exist OR a "create-or-get" pattern. Cursor should investigate:
- If drywall projects already have rows in `schedules`, no work needed
- If not, add a small helper that creates a default schedule for the drywall project on first item creation (similar to `loadProjectLegacyForMerge` pattern)

---

### Routing

Add new route to `src/routes/index.tsx`:

```tsx
<Route path="schedule" element={<DrywallScheduleEditor />} />
```

…nested under the existing `/drywall/projects/:projectId/` route group (alongside info/quote/field/order/production/closeout).

---

### Stepper update

Modify `DrywallProjectShell.tsx`:

Add a new entry to `STAGE_ROUTES`:

```tsx
{ key: 'schedule', path: 'schedule', label: 'Schedule' },
```

Insert it **between `field` and `order`** (or wherever feels right operationally — Mark uses scheduling around the field/order timing). Update `DrywallStageRouteKey` type to include `'schedule'`.

---

### New component: `DrywallScheduleEditor.tsx`

`src/components/drywall/schedule/DrywallScheduleEditor.tsx` (NEW)

Layout:
- Header: "Schedule for {project name}" + "Add schedule item" button
- List of items (table or stacked cards, mobile-considerate but desktop-primary):
  - Columns: Name, Type (field/office badge), Dates (start → end), Status, Assigned persons (chips), Notes preview, Edit/Delete actions
  - Sorted by start_date ascending
  - Empty state: "No schedule items yet. Add one to get started."
- Read-only when viewer role

Data flow:
- On mount: `fetchScheduleItemsForProject(projectId)` (new service helper or reuse existing)
- On Add click: open `ScheduleItemDialog` in create mode
- On Edit row: open `ScheduleItemDialog` in edit mode with row prefilled
- On Delete: confirmation dialog → `deleteScheduleItem(itemId)` → refresh list

---

### New component: `ScheduleItemDialog.tsx`

`src/components/drywall/schedule/ScheduleItemDialog.tsx` (NEW)

Modal form (shadcn `Dialog`). Fields:

| Field | Type | Required |
|---|---|---|
| Name | text | ✓ (e.g. "Hang Main Floor", "Field Measurement", "Pointup #1") |
| Type | select (field / office) | ✓ default "field" |
| Predecessors | multi-select of other items on this project | optional |
| Lag (work days after predecessor end) | number | default 1; 0 means same day; persisted per-item, applies to all predecessors |
| Start date | date | ✓ — auto-computed when predecessors set, editable to override |
| End date | date | ✓ defaults to start_date if blank |
| Status | select (not-started / in-progress / complete / delayed) | ✓ default "not-started" |
| Assigned persons | `AssignedPersonsPicker` (from D.6.2) | optional |
| Notes | textarea | optional |

Predecessor picker source: all OTHER items on this project (exclude self). Show as searchable multi-select with name + dates.

Save calls `createScheduleItem(...)` or `updateScheduleItem(...)`. **After save, runs cascade** (see below). Closes dialog on success. Toast confirms.

---

### Cascade math

When any item is created/updated, run cascade across all items on the project:

```ts
import { cascadeSchedule, addWorkdays } from '@/lib/scheduleDateMath'

// For each item: if it has predecessors, start_date = max(predecessor.end_date + lag work days)
// duration is preserved (end_date adjusts to maintain item.duration)
// cascadeSchedule already implements this — reuse it.
```

Cascade fires on every item save. Operator can override an auto-computed start_date by editing it manually, which then propagates through the rest.

If cascadeSchedule returns conflicts or cycles, surface a toast warning ("Schedule has a circular dependency — review predecessors") and skip the offending item.

---

### Standard schedule template — "Generate standard drywall schedule" quick-start

On the empty state of `DrywallScheduleEditor`, add a primary button: **"Generate standard schedule"** (alongside or above "Add schedule item").

Click → opens a small dialog with one input: **"Measure date"** (date picker). Confirm → creates these 6 items with predecessor chain + default lags:

| # | Name | Type | Predecessor | Lag (work days) |
|---|---|---|---|---|
| 1 | Measure | field | (none — operator-set date) | — |
| 2 | Stock | field | Measure | 5 |
| 3 | Scaffold / Prep | field | Stock | 0 |
| 4 | Hang | field | Scaffold / Prep | 1 |
| 5 | Finish | field | Hang | 1 |
| 6 | Cleanout | field | Finish | 1 |

After creation, operator can edit any lag, add Paper Floors as a separate item, delete unused steps, or adjust dates manually. Cascade applies normally on subsequent edits.

Lag defaults are starting points — operator adjusts per job.

Button hides once items exist (only shows on empty state).

---

### Service additions

Existing `src/services/scheduleService.ts` has `fetchPortfolioScheduleItems` (cross-project). Add:

```ts
export async function fetchScheduleItemsForDrywallProject(
  projectId: string,
): Promise<PortfolioItem[]>
// Single project query, ordered by start_date asc.

export async function createScheduleItemForDrywallProject(
  projectId: string,
  item: NewScheduleItemInput,
): Promise<PortfolioItem>
// 1. Resolve or create the parent `schedules` row for this project (helper: getOrCreateScheduleForProject).
// 2. Insert into schedule_items with schedule_id, project_id, organization_id, all required NOT NULL fields with sensible defaults (assigned_persons=[], predecessor_ids=[], duration=date diff).
// 3. Return the inserted row mapped to PortfolioItem.

export async function updateScheduleItemForDrywallProject(
  itemId: string,
  patch: Partial<NewScheduleItemInput>,
): Promise<void>
// Direct update on schedule_items by id, gated to current org.

export async function deleteScheduleItemForDrywallProject(itemId: string): Promise<void>
// Direct delete by id, gated to current org.

// Helper (internal):
async function getOrCreateScheduleForProject(projectId: string): Promise<string>
// SELECT id FROM schedules WHERE project_id = X; if missing, INSERT default row, return id.
```

Where `NewScheduleItemInput` is:
```ts
interface NewScheduleItemInput {
  name: string
  type: 'field' | 'office'
  startDate: string  // YYYY-MM-DD
  endDate: string
  status?: 'not-started' | 'in-progress' | 'complete' | 'delayed'
  notes?: string
  assignedPersons?: string[]
  assignedCompanyId?: string | null
  predecessorIds?: string[]
  lagWorkDays?: number  // default 1
}
```

Add helper:
```ts
export async function generateStandardDrywallSchedule(
  projectId: string,
  measureDate: string,  // YYYY-MM-DD
): Promise<PortfolioItem[]>
// Creates 6 items per the template table (Measure, Stock, Scaffold/Prep, Hang, Finish, Cleanout)
// with predecessor links and default lags. Measure starts on measureDate.
// Then runs cascadeSchedule to populate downstream dates.
// Returns the created items.
```

---

### Acceptance criteria

1. Type-check passes.
2. New Schedule tab visible on DrywallProjectShell stepper between Field and Order.
3. `/drywall/projects/:id/schedule` loads `DrywallScheduleEditor`.
4. Empty project shows "No schedule items yet" state with **two** buttons: "Add schedule item" + "Generate standard schedule".
5. Click "Add schedule item" → modal opens → fill fields → Save → item appears in list.
6. Click an existing item's Edit → modal opens with prefilled values → save → updates persist.
7. Click Delete on a row → confirmation → row removed.
8. `assigned_persons` set via the picker round-trips correctly.
9. Item appears in `/crew` for the assigned person.
10. Item appears in `/schedule` portfolio aggregate view alongside GC items (no regression).
11. Viewer role sees the list as read-only (no Add/Edit/Delete/Generate buttons).
12. Parent `schedules` row gets created automatically on first item add if it didn't exist.
13. **Predecessor picker** in dialog lists all OTHER items on this project (not self), searchable.
14. **Lag field** accepts integer >= 0; default 1.
15. **Cascade on save**: setting an item's start_date moves downstream items by `cascadeSchedule`. Example: change Measure date by 3 work days → Stock, Hang, Finish, Cleanout all shift by 3 work days (relative spacing preserved).
16. **Generate standard schedule** button on empty state opens "Measure date" picker → creates 6 items per the template table → cascade fills downstream dates → list shows all 6 items with chained dates.
17. After Generate, the button disappears (only shows when list is empty).
18. Circular predecessor dependency surfaces a toast warning and doesn't crash the UI.

---

### Out of scope (post-launch / never)

- Auto-generation from quote items (drywall has line items, but operator manually picks what tasks to schedule)
- SMS notifications on schedule changes
- Drag-to-reorder, drag-to-resize
- Calendar/gantt view (list is sufficient for V1; portfolio /schedule has its own gantt)
- Recurring items
- Multiple template variants (Paper Floors is manual-add)
- Bulk operations
- Predecessor lag per-relationship (V1 is one lag value per item, applied to all its predecessors — sufficient for the typical chain)

---

### Estimated effort

**2-3 sessions.**

- Base CRUD + Schedule tab + service: 1-2 sessions
- Predecessor multi-select UI + cascade application on save: +30-60 min (cascade math reuses existing `cascadeSchedule`)
- Standard template generator + Measure-date dialog: +20-30 min

Main risk is the schedules parent row pattern — if drywall projects don't have one and creation is non-trivial, that's 30 extra min. Cursor verifies first thing.

---

## D.6.5 — Per-project schedule calendar view

**Goal:** Toggle on `DrywallScheduleEditor` between **List** (current) and **Calendar** views. Calendar = month grid with schedule items rendered as multi-day event bars (Google-Calendar-style). Click a bar → opens the existing `ScheduleItemDialog`. Reuses all D.6.4 data + dialog. No new schema, no new service.

**Anchor:** Surface in smoke test 2026-06-18 — operator wants visual layout of the dependent chain, not just a table.

### Files to create

**`src/components/drywall/schedule/DrywallScheduleCalendar.tsx`** (NEW) — month calendar with multi-day event bars.

Props:
```ts
interface Props {
  items: DrywallProjectScheduleItem[]
  personNames: Map<string, string>
  readOnly: boolean
  onEdit: (item: DrywallProjectScheduleItem) => void
}
```

Layout:
- Header: month name + prev/next month buttons + "Today" button
- 7-column grid (Sun-Sat or Mon-Sun — pick whatever the rest of the app uses; check Schedule Portfolio for consistency)
- 6 rows of day cells (standard 5-6 week month grid)
- Default month = month containing the earliest schedule item; falls back to current month if no items
- Day cells show date number (faded for prev/next month overflow days)
- Schedule items render as horizontal bars positioned by start_date, spanning across days through end_date
- Bar color by status (reuse the STATUS_CLASS map from DrywallScheduleEditor)
- Bar text: item name (truncate if needed)
- Click bar → `onEdit(item)`
- Hover bar → subtle outline + tooltip with full name + dates + assigned persons
- Weekends visually distinct (subtle gray background)

Item bar positioning:
- If an item spans Mon-Fri, render as one bar across those 5 cells in that row
- If item crosses a week boundary, render as two segments (one per week row) with a small visual indicator that they continue
- Multiple items on the same days stack vertically within the cell (max 3 visible, "+N more" indicator if overflow)

date-fns helpers to use:
- `startOfMonth`, `endOfMonth`, `startOfWeek`, `endOfWeek`, `eachDayOfInterval`, `isSameMonth`, `isWeekend`, `parseISO`, `format`

### Files to modify

**`src/components/drywall/schedule/DrywallScheduleEditor.tsx`**:
- Add `viewMode: 'list' | 'calendar'` state, default `'list'`
- View toggle in header (segmented control or two buttons)
- When viewMode === 'calendar', render `<DrywallScheduleCalendar items={items} personNames={personNames} readOnly={readOnly} onEdit={openEdit} />` instead of the table
- All other state (dialog, generate dialog, delete) shared between views — no behavior change

### Acceptance criteria

1. Type-check passes.
2. Schedule tab header has a List/Calendar toggle. Default = List.
3. Click Calendar toggle → table replaced by month grid for current month (or month of earliest item if not in current month).
4. Schedule items render as horizontal bars across their date range.
5. Bar colors match the status color used in list view.
6. Click a bar → opens `ScheduleItemDialog` in edit mode for that item (same flow as list "Edit" button).
7. Prev/Next month buttons navigate; "Today" jumps to current month.
8. Items that span a week boundary render as two visual segments (one per row).
9. Multi-item days stack reasonably; overflow shows "+N more".
10. Weekends visually distinct (subtle background tint).
11. Empty months render an empty calendar (no errors).
12. Toggling back to List preserves everything.
13. Viewer role: bars are not clickable (no edit), or click does nothing (same as list — no Add/Edit buttons).

### Out of scope

- Week / day view (only month for V1)
- Drag-to-move dates (V1 is click-to-edit only)
- Resize bars
- Multi-month timeline (gantt-across-months)
- Print layout / export

### Estimated effort

**1 session** — ~250-350 LOC for the calendar component, ~30 LOC modifications to the editor. Mostly date math + grid layout. No new schema, no new service.

---

## After D.6.5

Cross-project drywall schedule view becomes D.6.7. GC schedule workspace gets its own revisit later (post-launch).

7/1 launch must-haves: ✅ D.1, ✅ D.2, ✅ D.4, ✅ D.6.1-6.5 (crew accounts, /crew, comms, schedule editor + calendar view).

## D.6.6a — Crew project detail polish (today, ship-blocking for 7/1)

Surfaced during 2026-06-24 smoke test (testw2 crew login). Decisions confirmed 2026-06-25 morning:
- Specialty detection: substring match on `JobPosition.name` (no schema change; mirrors schedule phase-color pattern).
- Pay calc unit: **total project sqft** × user's rate (one big "expected total pay" number, not per-line).
- SOW scope today: crew-side only (operator v3 quote-builder redesign deferred to D.6.6b post-launch).

### Scope (5 items)

#### 1. Catalogs RLS migration

Crew currently can't SELECT `org_drywall_catalogs` — `user_can_read_drywall_catalogs` is gated to `owner | office_gc | office_drywall | viewer`. Add `crew` to the read role list.

**NEW migration**: `supabase/migrations/20260625120000_crew_can_read_drywall_catalogs.sql`

```sql
BEGIN;

CREATE OR REPLACE FUNCTION public.user_can_read_drywall_catalogs(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_rbac_role(
    ARRAY['owner', 'office_gc', 'office_drywall', 'viewer', 'crew']::text[],
    uid
  );
$$;

COMMIT;
```

(Write helper stays unchanged — crew remains read-only.)

After this lands, `seedDrywallCatalogs` `try/catch` defensive code in `drywallCatalogsService.ts:225-231` can stay — it's still useful for any other RLS edge case.

#### 2. Crew specialty helper

**NEW file**: `src/lib/drywall/crewSpecialty.ts`

```ts
export type CrewSpecialty = 'hanger' | 'finisher' | 'both' | 'unknown'

export function specialtyFromPositionName(name: string | null | undefined): CrewSpecialty {
  if (!name) return 'unknown'
  const n = name.toLowerCase()
  const isHanger = n.includes('hang')
  const isFinisher = n.includes('finish')
  if (isHanger && isFinisher) return 'both'
  if (isHanger) return 'hanger'
  if (isFinisher) return 'finisher'
  return 'unknown'
}
```

#### 3. Specialty detection + rate filtering in crewWorkspaceService

In `crewWorkspaceService.ts` `fetchCrewProjectDetail` flow:
- Look up the linked team member (`CrewProfileLink.personType` + `personId`) from the org_team JSONB payload
- Resolve their `positionId` → `JobPosition.name`
- Call `specialtyFromPositionName(positionName)` to get the user's `CrewSpecialty`
- Pass it through to the returned `CrewProjectDetail`

#### 4. Update `CrewProjectDetail` type + computed pay

Modify `src/types/crew.ts`:

```ts
export interface CrewProjectDetail {
  // ... existing fields ...
  specialty: CrewSpecialty
  laborRates: {
    hangerRate: number | null
    finisherRate: number | null
    prepCleanRate: number | null
    rateSource: CrewLaborRateSource
  }
  estimatedTotalPay: {
    hanger: number | null    // null if specialty doesn't include hanger
    finisher: number | null  // null if specialty doesn't include finisher
  }
  // ...
}
```

`estimatedTotalPay.hanger` = `totalSqft × hangerRate` when specialty is `hanger` or `both` (else null). Same logic for finisher. Compute in `crewWorkspaceService.ts` and include in the returned detail.

#### 5. CrewProjectDetailPage UI updates

In `src/components/crew/CrewProjectDetailPage.tsx`:

**Pay rates card** (lines 179-203): only show the rows relevant to user's specialty:
- specialty=`hanger` → show only Hanger row + total pay
- specialty=`finisher` → show only Finisher row + total pay
- specialty=`both` → show both rows + each total
- specialty=`unknown` → show no rates (or all three, dimmed, with a "Contact office to set your role" hint)

Add a prominent "Your estimated total pay" line per applicable specialty:
```
Hanger pay (1,234 sqft × $0.40) = $493.60
```

Keep the prepCleanRate row visible to all specialties (it's a shared role for everyone).

**Line items card** (lines 275-293): rename to "Scope of work — by area" and restyle as a table. Currently each line is a card with description + meta row. Keep that structure but tighten:
- Bold description
- One meta line: `{location} · {sqft.toLocaleString()} sqft · {finishScope}` (dot-separated)
- Existing array order preserved

(No backend changes for this — just tighter visuals.)

### Files to create / modify

| File | Action |
|---|---|
| `supabase/migrations/20260625120000_crew_can_read_drywall_catalogs.sql` | NEW |
| `src/lib/drywall/crewSpecialty.ts` | NEW |
| `src/services/crewWorkspaceService.ts` | MODIFY — specialty lookup, total-pay calc |
| `src/types/crew.ts` | MODIFY — add `specialty`, `estimatedTotalPay` |
| `src/components/crew/CrewProjectDetailPage.tsx` | MODIFY — Pay rates card filtering + total pay display + Line items restyle |

### Acceptance criteria

1. Type-check passes (`npx tsc --noEmit`).
2. Migration file runs cleanly (idempotent helper replacement).
3. Crew user with position name containing "hanger" sees only Hanger rate + Hanger total pay (no Finisher row).
4. Crew user with position name containing "finisher" sees only Finisher rate + Finisher total pay.
5. Crew user with position "Hanger/Finisher" sees both rates + both totals.
6. Crew user with unknown position sees a "Contact office to set your role" hint (no rates).
7. Operator viewing `/crew/projects/:id` (preview mode) still sees all three rates (no specialty filter applied in preview).
8. Total pay calc = `totalSqft × rate` rounded to 2 decimals.
9. Line items section restyled as compact dot-separated meta rows.
10. After the RLS migration, crew users actually read the real org catalog (verify by checking labor rates match the operator's saved catalog, not seeded defaults).

### Out of scope (D.6.6a only — D.6.6b is its own brief below)

- Per-line pay breakdowns (we ship total-only per Mark's call)
- Adding explicit `drywallSpecialty` enum field on TeamMemberBase (substring match is sufficient for V1)
- Pay rates for prep/clean specialty (assumed shared role for now)

### Estimated effort

~1 session. Mostly mechanical: migration + service plumbing + type updates + small UI tweak.

---

## D.6.6b — V3 quote builder structured-scope redesign

**Goal:** Restore v2's three structured scope-of-work cards (Hang specs · Finish specs · Duration inputs) on top of v3's line-item model. Operators get back the structured authoring flow they had in v2 — line items still drive pricing, but scope-of-work is structured and consistent across customers.

**Decisions confirmed 2026-06-25 morning:**
- Full v2 parity — port all three structured cards.
- Backfill via `legacyV2Snapshot` when present on converted quotes; empty defaults otherwise.
- Placement above line items (operator defines scope → itemizes pricing, mirrors v2 flow).

### New fields on `DrywallQuoteV3`

Snake_case per v3 convention:

```ts
// Hang specifications
ceiling_thickness?: string
wall_thickness?: string
hang_exceptions?: string

// Finish specifications
ceiling_finish?: string
ceiling_finish_other?: string
ceiling_exceptions?: string
wall_finish?: string
wall_finish_other?: string
wall_exceptions?: string

// Duration estimator inputs
build_type?: string                  // 'new_build' | 'renovation'
complexity?: string                  // 'normal' | 'complex'
paper_floors_required?: boolean
bead_sticks?: string | number

// Custom override (when use_custom_scope_of_work is true, custom_scope_of_work replaces structured scope)
use_custom_scope_of_work?: boolean
custom_scope_of_work?: string
```

All fields optional — undefined = "not yet set". `scope_of_work` (existing field) becomes "Additional scope notes" — appears at the bottom of the structured section as supplementary text.

### Files to create / modify

#### NEW: `src/components/drywall/quote/v3/QuoteStructuredScopeSection.tsx`

Port of `src/components/drywall/quote/QuoteScopeSection.tsx`, adapted for `DrywallQuoteV3` field names (snake_case) and props.

Three Card sections:
1. **Hang specifications** — ceiling_thickness Select, wall_thickness Select, hang_exceptions Textarea with template chips
2. **Finish specifications** — ceiling_finish Select (+ ceiling_finish_other Input if 'Other'), ceiling_exceptions Textarea with template chips. Same for wall_*. Plus the use_custom_scope_of_work checkbox + conditional custom_scope_of_work / scope_of_work Textarea
3. **Duration inputs** — build_type Select, complexity Select, paper_floors_required checkbox, bead_sticks Input

Reuse existing template constants from `src/components/drywall/quote/quoteUiConstants.ts` (HANG_EXCEPTION_TEMPLATES, CEILING_EXCEPTION_TEMPLATES, WALL_EXCEPTION_TEMPLATES, etc.) — same chips as v2.

Reuse the `TemplateChips` and `appendScopeTemplate` helpers — extract them to a shared module so both v2 and v3 use them. Suggested path: `src/lib/drywall/scopeTemplateHelpers.ts`.

Props:
```ts
type Props = {
  quote: DrywallQuoteV3
  readOnly: boolean
  onChange: (patch: Partial<DrywallQuoteV3>) => void
}
```

#### MODIFY: `src/types/drywall.ts`

Add the new fields listed above to the `DrywallQuoteV3` interface (around line 545).

#### MODIFY: `src/lib/drywall/createEmptyDrywallQuoteV3.ts`

1. `createEmptyDrywallQuoteV3()`: no changes needed (all new fields are optional and default to undefined — that's fine).
2. `hydrateDrywallQuoteV3(raw)`: read the new fields from `raw`. For each field, if missing on raw AND `legacyV2Snapshot` is present, pull from the snapshot via `v2QuoteFromV3Snapshot()`. Snapshot field names are camelCase v2 (`ceilingThickness`, `hangExceptions`, etc.) — map them to v3's snake_case.

   Sketch:
   ```ts
   const v2Snap = q.legacyV2Snapshot
     ? v2QuoteFromV3Snapshot(q.legacyV2Snapshot)
     : null

   ceiling_thickness:
     typeof q.ceiling_thickness === 'string' && q.ceiling_thickness
       ? q.ceiling_thickness
       : (v2Snap?.ceilingThickness as string | undefined) ?? undefined,
   // ... same pattern for each new field
   ```

3. `prepareDrywallQuoteV3ForSave(quote)`: no changes needed — spread already includes new fields.

#### MODIFY: `src/lib/drywall/convertQuoteV2ToV3.ts`

Ensure `buildV3FromV2(v2)` copies the v2 scope fields to v3's new fields. Look for the existing function and add the field mappings.

#### MODIFY: `src/components/drywall/quote/v3/QuoteStageV3.tsx`

1. Replace the existing `<QuoteScopeOfWorkPanel />` render with `<QuoteStructuredScopeSection />`, placed **above** the line items table.
2. Delete the import of `QuoteScopeOfWorkPanel` if no longer used.
3. Decide on `QuoteScopeOfWorkPanel.tsx`: keep the file (no harm) or delete if Cursor confirms no other consumers. Recommend keep for now — the auto-generate-from-line-items button is useful as a one-shot helper. Optionally re-expose it as a button inside the new structured section's "Additional scope notes" area.

#### MODIFY: `src/lib/drywallQuotePdfV3.ts`

Render the structured scope on the PDF — mirror how v2 PDF rendered hang specs / finish specs / exceptions sections. Currently v3 likely just dumps `scope_of_work` text. Replace with structured rendering when `use_custom_scope_of_work` is false; use custom text when true. Reuse v2's PDF section render logic if it exists in `src/lib/drywallQuotePdf.ts` — extract to a shared helper if needed.

### Acceptance criteria

1. Type-check passes (`npx tsc --noEmit`).
2. V3 quote stage page renders three new cards above the line items table: Hang specifications, Finish specifications, Duration inputs.
3. All fields editable when operator has write access; disabled in viewer mode.
4. Template chips populate the exception textareas (same chips as v2).
5. When `use_custom_scope_of_work` is checked, the custom textarea replaces the structured scope on PDF.
6. New quotes (created post-D.6.6b) start with all fields undefined; operator fills as needed.
7. Existing v3 quotes converted from v2 backfill the new fields from `legacyV2Snapshot` on first load — operator sees the v2 values pre-populated.
8. PDF download renders structured scope (when not custom) — confirm visually that hang specs, finish levels, exceptions appear in the PDF as they did in v2.
9. Save works — new fields persist to the JSONB payload and round-trip on reload.
10. Auto-generate-from-line-items button (existing) still works — either keep as a separate panel below or fold into the structured section.
11. Crew SOW view (D.6.6a) continues to work — no regression. (Structured scope display on crew side can come later — for V1 of D.6.6b, crew still sees the existing breakdown table.)
12. v2 quote stage (legacy `QuoteStage.tsx`) unaffected.

### Out of scope (defer)

- Surfacing the structured scope to crew SOW page (D.6.6a's table can be enhanced later)
- Per-area structured scope on line items (line items already have location/finish_scope/sqft — that's per-area enough for V1)
- Auto-population of structured fields from line items (operator authors them separately)
- Migration to backfill structured fields onto v3 quotes that DON'T have a legacyV2Snapshot (those operators fill manually)
- PDF redesign beyond structured scope rendering (totals, layout, etc.)

### Estimated effort

~2 sessions. Real work: type changes touch hydrate/prepare/convert, PDF rendering needs structured layout, new section component is substantial. Each can be done independently.

### Risks / notes

- **PDF rendering**: v2 PDF likely has a multi-section scope renderer. Worth grepping `src/lib/drywallQuotePdf.ts` for hang/finish/exception output to crib from. If the v2 PDF logic is hairy, extract it to a helper both PDFs can call.
- **Backfill correctness**: verify with a real v2-converted quote that all fields hydrate from the snapshot. Edge case: snapshot fields may be missing or empty string — treat both as "not set" so structured cards stay empty for operator to fill.
- **Existing `scope_of_work` field**: keep it. The structured section renders it as "Additional scope notes" so existing text isn't lost. Quote PDF includes it after the structured scope (when `use_custom_scope_of_work` is false).

---

## D.6.7 — Cross-project drywall schedule view (today)

**Goal:** A single calendar showing every active drywall project's schedule items together. Operator's "what's happening across all jobs this week" surface. Lives at `/drywall/schedule` under the Drywall sidebar section.

**Decisions confirmed 2026-06-25 morning:**
- Sidebar slot: NEW entry under Drywall section (existing `/schedule` GC portfolio untouched).
- Color: project color dominates as bar fill; phase color shown as a thin left border accent. Operator sees both at a glance.
- Layout: month calendar grid — same shape as D.6.5 per-project calendar (reuse lane packing + week structure helpers).
- Default filter: active projects only (closed hidden). Toggle to "All" exposes closed.

### Files to create

**1. `src/lib/drywall/projectColor.ts`** (NEW) — deterministic project color from project id.

```ts
const PROJECT_PALETTE = [
  'indigo', 'rose', 'amber', 'teal', 'fuchsia',
  'cyan', 'lime', 'orange', 'violet', 'emerald',
  'pink', 'sky',
]

export function projectColorClass(projectId: string): {
  bg: string
  border: string
  text: string
} {
  let hash = 0
  for (let i = 0; i < projectId.length; i++) {
    hash = (hash * 31 + projectId.charCodeAt(i)) >>> 0
  }
  const color = PROJECT_PALETTE[hash % PROJECT_PALETTE.length]
  return {
    bg: `bg-${color}-500`,
    border: `border-${color}-600`,
    text: color === 'amber' || color === 'lime' ? `text-${color}-950` : 'text-white',
  }
}
```

(Verify the bg/border/text classes get picked up by Tailwind's purge — may need to add them to `safelist` in `tailwind.config.ts`. The dynamic class generation may not survive purging otherwise.)

**2. `src/services/drywallScheduleAggregateService.ts`** (NEW) — fetch all drywall schedule items + project context for the cross-project view.

Returns:
```ts
export interface CrossProjectScheduleItem {
  id: string
  projectId: string
  projectName: string
  projectStatus: string  // raw status; consumer decides if it's "active"
  name: string
  type: 'field' | 'office'
  startDate: string
  endDate: string
  status: 'not-started' | 'in-progress' | 'complete' | 'delayed'
  assignedPersons: string[]
}

export async function fetchCrossProjectScheduleItems(): Promise<CrossProjectScheduleItem[]>
```

Implementation: query `schedule_items` for items where project_id IN (drywall project ids for this org). Two-step:
1. Fetch active+closed drywall project ids/names/status from `projects` table (filter by `belongsInDrywallWorkspace` predicate — reuse existing helper).
2. Fetch schedule_items for those project ids.
3. Stitch in memory.

Don't fetch person names here — the calendar uses ids only for hover/tooltip (defer name resolution to operator-only flow that already has `fetchTeam`).

**3. `src/components/drywall/schedule/portfolio/DrywallSchedulePortfolioPage.tsx`** (NEW)

Page-level wrapper:
- Page title "Drywall — Schedule"
- Header: filter toggle (Active / All), month label + Prev/Today/Next nav
- Body: renders `DrywallPortfolioCalendar` with the filtered items + a legend below showing each visible project's color swatch + name

State:
- `month: Date` (default = month of earliest item, fallback to today)
- `scope: 'active' | 'all'` (default 'active')

Click bar → navigate to `/drywall/projects/:projectId/schedule`.

**4. `src/components/drywall/schedule/portfolio/DrywallPortfolioCalendar.tsx`** (NEW)

Multi-project month calendar — same lane-packing / week-row structure as `DrywallScheduleCalendar` but bars are colored by project, not by phase.

Reuse:
- `packLanes` helper (consider extracting from `DrywallScheduleCalendar` to a shared module — call it `src/lib/drywall/scheduleLanes.ts` and re-export from both)
- `getItemColsForWeek` + `toLocalDate` from `scheduleCalendarUtils` (already shared)
- Fixed lane height pattern (MAX_VISIBLE_LANES rows always reserved)
- `SCHEDULE_PHASE_BAR_CLASS` lookup for the LEFT BORDER accent only (not the fill)

Bar rendering:
- Fill = project color (from `projectColorClass`)
- Left border = phase color (~3-4px thick — `border-l-4`)
- Text = project name + " · " + item name (compact, truncated)
- Click → navigates to that project's schedule tab

MAX_VISIBLE_LANES = 5 for portfolio view (more space needed for multi-project), still with "+N more this week" overflow.

### Files to modify

**5. `src/components/AppSidebar.tsx`** — add "Schedule" entry to `drywallNav` between Projects and Catalogs:

```tsx
function drywallNav(role: RbacRole): NavGroup[] {
  const items: NavItem[] = [
    { label: 'Projects', to: '/drywall', icon: Hammer, matchPath: '/drywall' },
    { label: 'Schedule', to: '/drywall/schedule', icon: CalendarRange, matchPath: '/drywall/schedule' },
  ]
  if (canEditDrywallCatalogs(role)) { /* ...existing... */ }
  return [{ label: 'Drywall', items }]
}
```

**6. `src/routes/index.tsx`** — register `/drywall/schedule`:

```tsx
<Route
  path="/drywall/schedule"
  element={
    <RequireWorkspaceAccess workspace="drywall">
      <DrywallSchedulePortfolioPage />
    </RequireWorkspaceAccess>
  }
/>
```

Plus the import at the top.

### Acceptance criteria

1. Type-check passes (`npx tsc --noEmit`).
2. Sidebar shows new "Schedule" entry under Drywall, between Projects and Catalogs.
3. `/drywall/schedule` renders a month grid with all schedule items across active drywall projects.
4. Each project is rendered in a distinct color (deterministic from project id — same project always = same color across reloads).
5. Each bar has a thin LEFT BORDER colored by phase (Measure=emerald, Hang=blue, etc.) — so phase is still visible at a glance.
6. Bars labeled with `{projectName} · {itemName}` (truncated as needed).
7. Click a bar → navigates to `/drywall/projects/:projectId/schedule`.
8. Filter toggle (Active / All) — Active hides closed projects, All shows everything.
9. Month nav (Prev / Today / Next) works.
10. Legend below the calendar shows a small color swatch + project name for every project currently visible in the calendar (helps disambiguate when bars are short).
11. Empty state: if no schedule items in the filtered scope, show "No drywall schedule items for {month}." (similar to per-project view).
12. Lane packing preserves D.6.5 behavior (non-overlapping items share lanes).
13. Fixed-height weeks (always MAX_VISIBLE_LANES = 5 rows reserved).
14. Operator preview only — crew users hit `/drywall/schedule` get redirected (RequireWorkspaceAccess handles this; verify the workspace=drywall guard properly excludes crew).

### Out of scope (defer)

- Week-view / Gantt toggle
- Drag-to-reschedule items from the portfolio view
- Filtering by assigned crew member
- Print layout
- GC schedule workspace redesign

### Estimated effort

~1 session. Bulk of the work is extracting the calendar primitives + the new aggregate service. UI shares patterns with D.6.5 so it should move quickly.

### Risks / notes

- **Tailwind purge of dynamic classes**: `bg-${color}-500` patterns get purged unless added to `tailwind.config.ts` safelist or referenced statically. Verify in dev before declaring done. If purge causes issues, switch to a literal palette map (e.g. `{indigo: 'bg-indigo-500', ...}`).
- **packLanes extraction**: Move from `DrywallScheduleCalendar.tsx` to `src/lib/drywall/scheduleLanes.ts` so both calendars share it. Update D.6.5 import in same PR.
- **Performance**: For a workshop with 20+ active projects each with 6+ schedule items, expect ~120-200 items per month. Lane packing is O(n²) worst case but n is small.

---

## D.6.8 — Field measurer crew workflow

**Goal:** Dedicated field measurer (e.g. Dave when assigned to measure rather than finish) opens an assigned project in `/crew`, captures the full field takeoff on mobile (per-area sqft, board log, accessories, photos, notes, checklist), and submits for office review. Office's existing review/approve flow on `FieldMeasurementPage` handles the rest.

**Decisions confirmed 2026-06-26 evening:**
- **Role detection**: position name substring `"measure"` → measurer specialty. No new role tag, no capability flag. Same pattern as hanger/finisher.
- **Inputs**: full operator parity — sqft, board log, accessories, photos, notes, contact updates, checklist, sign-off.
- **Assignment**: existing schedule item flow — operator creates a "Measure" schedule item, assigns the measurer, they see it in `/crew` and tap to open the measure page.
- **Sign-off**: submit for office review (matches existing `submitForReview` on operator side). Measurer can keep editing until approved.
- **Page**: new mobile-first crew variant at `/crew/projects/:projectId/measure`. Operator page stays untouched. Shared subcomponents where the reuse is clean.
- **Visibility**: no pricing — measurer sees scope/areas/finish levels but never rates/totals.
- **Device**: mobile primary, tablet OK (responsive).

### Phase plan

Five phases. Each is independently shippable.

#### Phase 1 — Specialty + role detection (small, ~30 min)

Files to modify:
- `src/lib/drywall/crewSpecialty.ts` — add `'measurer'` to `CrewSpecialty` union. Substring match: `"measure"` → `'measurer'`. Order matters: check measurer BEFORE hanger/finisher (since "measure" doesn't conflict with hang/finish substrings, order is forgiving but explicit is safer).
- `src/services/crewWorkspaceService.ts`:
  - `resolveMaterials` — measurer sees no materials (they're not handling them). Return `[]`.
  - `computeEstimatedTotalPay` — measurer sees no pay. Return `{ hanger: null, finisher: null }`.
  - `resolveStructuredScope` — measurer DOES see scope (need it to measure correctly). Already works since v3 fields are populated.
- `src/components/crew/CrewProjectDetailPage.tsx`:
  - Pay rate card — for measurer specialty, show a small "Field measurer — pay tracked separately" hint instead of any rate row. Cleanup row hidden.
  - When the project has an assigned Measure schedule item AND user is measurer, surface a prominent "Start measure" action (e.g. button or banner) linking to `/crew/projects/:id/measure`.

#### Phase 2 — Crew measure page scaffold (~1 hr)

Files to create:
- `src/components/crew/CrewMeasurePage.tsx` — new page component
- Route registration in `src/routes/index.tsx`: `<Route path="projects/:projectId/measure" element={<CrewMeasurePage />} />` nested under the existing `/crew` route (so it gets `CrewShell` for free)

Behavior:
- Page title: "Measure — {projectName}"
- Header: back to project detail, refresh button, status pill (Not started / In progress / Pending review / Approved / Rejected)
- Empty/loading states
- Pull-to-refresh (reuse `usePullToRefresh`)
- Permission guard: only crew with measurer specialty (or `'both'` if a hanger/finisher also measures) can open. Others get redirected to project detail.

#### Phase 3 — Field measurement inputs (the big chunk, ~3-4 hr)

This is the meat. Mobile-first variants of every operator-side input section.

**Extract shared subcomponents** from `src/components/drywall/field/FieldMeasurementPage.tsx` into reusable inputs that both pages consume. New location: `src/components/drywall/field/inputs/` (or similar).

Sections, in display order:

1. **Field notes inputs** — Site contact, phone, meeting location, access notes, hazards, notes. Already shown read-only on crew detail; now editable. Each field a simple `<Input>` or `<Textarea>`.
2. **Per-area measurements** — `FieldMeasurementArea[]`: location name + sqft per row. Add/remove rows. Running total displayed.
3. **Board log** — `FieldMeasurementBoard[]`: cascading dropdowns (type → thickness → width → length) + count per area. This is detail-heavy. Make rows collapsible by default; expand to edit.
4. **Photos** — `FieldPhotosSection` (already exists for operator). Mobile flow: tap camera → native capture → upload. Tap photo → enlarge. Tap delete → remove (with confirm). Reuses existing Supabase Storage bucket. Note: needs RLS migration (see Phase 5).
5. **Accessories** — `FieldAccessoryEntry[]`. Defer the auto-calc to office for V1 — measurer enters manually (or operator fills in during review). Reuses `FIELD_MATERIAL_OPTIONS` for categories + subtypes. Same cascading dropdowns as operator.
6. **Checklist** — `FieldChecklistItem[]` — tap to toggle complete. Mark uses these to confirm "did I take measurements of every wall in this room" type questions.

State management:
- Use the same state shape (`FieldTakeoff`) as operator page.
- Local state mirrors server; explicit "Save" button to push (no auto-save during typing — too risky on flaky mobile signal).
- Dirty indicator + "unsaved changes" guard on back-nav.

Write persistence:
- Crew has no UPDATE permission on `projects` table (correct — they're not operators).
- New SECURITY DEFINER RPC: `save_field_takeoff_as_measurer(p_project_id uuid, p_takeoff jsonb)` — validates the caller is a crew measurer assigned to this project's measure schedule item, then merges `p_takeoff` into `metadata.legacy.fieldTakeoff` on the project row.
- Same pattern as `append_drywall_comms_log_entry` from D.6.3.
- Migration file: `supabase/migrations/2026XXXXXXXXXX_save_field_takeoff_as_measurer.sql`.

#### Phase 4 — Sign-off + review submission (~1 hr)

Footer bar at the bottom of the measure page (sticky on mobile):
- **Save** button — pushes current state via the RPC.
- **Submit for review** button — sets `fieldTakeoff.reviewStatus = 'pending_review'`, `submittedForReviewAt = now()`. Disabled until at least one area is measured. Confirmation modal: "Submit measurements for office review? You'll get notified when it's approved or sent back."
- Once submitted, the form goes read-only with an amber "Pending office review" banner. Measurer can NOT re-edit until office rejects (which restores edit mode).
- Once approved, form is permanently read-only with a green "Approved" banner.

Status awareness in `/crew` project list page:
- Each list card shows the measurer's status for that project (Not started / In progress / Pending review / Approved / Rejected) — small status pill next to the existing schedule date.

#### Phase 5 — Storage RLS for measurer photo writes

Currently `user_can_access_drywall_photos(_, true)` (write) is gated to `owner | office_gc | office_drywall`. Add `crew` to that list — same pattern as the read migration we just shipped for D.6.6a.

Migration file: `supabase/migrations/2026XXXXXXXXXX_crew_can_write_drywall_photos.sql`.

Same security note as the read migration: this grants crew write on **all drywall photos in their org**. Tighter scoping (only photos for projects they have a measure schedule item on) is possible but adds expense to a hot storage path. For V1, org-wide write is acceptable.

### Files to create

| Path | What |
|---|---|
| `src/components/crew/CrewMeasurePage.tsx` | New crew measure page |
| `src/components/drywall/field/inputs/` (directory) | Shared input subcomponents extracted from operator page |
| `supabase/migrations/...save_field_takeoff_as_measurer.sql` | SECURITY DEFINER RPC for crew takeoff writes |
| `supabase/migrations/...crew_can_write_drywall_photos.sql` | Storage write permission for crew |

### Files to modify

| Path | What |
|---|---|
| `src/lib/drywall/crewSpecialty.ts` | Add `'measurer'` to enum + substring match |
| `src/services/crewWorkspaceService.ts` | Measurer-specific resolveMaterials / pay / structuredScope behavior |
| `src/components/crew/CrewProjectDetailPage.tsx` | Pay rate card variant for measurer; "Start measure" action |
| `src/components/crew/CrewProjectListPage.tsx` | Status pill on each card for measurer projects |
| `src/routes/index.tsx` | Register `/crew/projects/:id/measure` route |
| `src/components/drywall/field/FieldMeasurementPage.tsx` | Refactor to consume shared subcomponents (no behavior change) |

### Acceptance criteria

1. Type-check passes.
2. Crew with position "Field Measurer" or similar resolves to `specialty: 'measurer'`.
3. Pay rate card shows no rates + "Field measurer" hint when specialty is measurer.
4. Materials card hidden for measurer.
5. Crew detail page shows a prominent "Start measure" action when a Measure schedule item is assigned.
6. `/crew/projects/:id/measure` route renders the new page; gated to measurer specialty (or both).
7. All operator-side field inputs editable on mobile: per-area sqft, board log, accessories, photos, field notes, checklist.
8. Photo upload from mobile camera works (writes to Supabase Storage via SECURITY DEFINER permission).
9. Save persists via RPC; reload shows persisted state.
10. Submit for review flips status to `pending_review`; form goes read-only.
11. Operator side: existing `FieldMeasurementPage` shows the submitted takeoff for review; approve/reject flow already works.
12. Reject restores edit mode for measurer.
13. Approve locks the form for measurer permanently (status: 'approved').
14. List page status pill reflects current review status on each card.
15. Crew of non-measurer specialty (hanger/finisher) cannot open the measure page (404 or redirect).
16. Operator role still has full access to operator-side FieldMeasurementPage; behavior unchanged.

### Out of scope (defer)

- Auto-calc accessories on the crew side (office handles during review)
- Floor-plan tap-to-measure UI (V1 = text entries)
- Offline mode (V1 = requires connectivity)
- Real-time push notification to operator when submitted (V1 = polling-based; operator sees status flip on their FieldMeasurementPage load)
- Multi-measurer collaboration (only one measurer per project per V1)

### Estimated effort

**5-7 sessions total.** Phase 1 = 30 min, Phase 2 = 1 hr, Phase 3 = 3-4 hr (biggest), Phase 4 = 1 hr, Phase 5 = 15 min (migration only). Bulk of work is Phase 3 — extracting + mobile-styling the field input subcomponents.

### Risks / notes

- **Field inputs are rich.** Per-area + per-board cascading dropdowns + accessories + photos is a lot of mobile UI surface. Plan to ship Phase 3 across multiple sessions or stage it (sqft first, then photos, then boards, then accessories).
- **Save semantics on flaky signal.** Mobile crews often have spotty connectivity. Explicit Save button (not auto-save) prevents partial writes. Local state retained until save succeeds; show error toast on failure.
- **RPC validation surface.** `save_field_takeoff_as_measurer` needs to verify the caller is (a) crew with measurer specialty AND (b) assigned to a measure schedule item on this project. Get this right or you leak takeoff write access broadly.
- **Operator-side variance calc** depends on quote context. Crew measure page doesn't load that. Operator sees variance when reviewing — that's already implemented on `FieldMeasurementPage`.
- **Photo storage growth.** Each measure generates 5-20 photos average. Bucket size will grow. Defer storage cleanup policy to post-launch.
