# Crew smoke walk-through

The operator-side test every security batch needs. ~15 minutes. Written down because the setup has two
gotchas that cost more time than the test itself.

---

## Before you start

**Supabase → Authentication → Sign In / Providers → Email → "Confirm email" must be OFF.**

If it is on, `signUp` returns no session, the invite cannot be consumed (there is no `auth.uid()` yet),
and you get *"Check your email to confirm your account..."*. That is
[`CrewSignupPage.tsx:86-95`](../../src/routes/CrewSignupPage.tsx) behaving correctly, but it looks like
the migration broke signup.

## Setup — use a throwaway, not a real crew member

The invite binds to the roster person's email: `CrewAccountsPage.tsx:277` passes
`invitedEmail: person.email`, and `consume_crew_invite_token` refuses unless the signup email matches
exactly.

1. **HR → Team** → add a person, name them something obvious like `ZZ Test Crew`.
2. Email: **`mliber13+crewtest@gmail.com`**. Gmail delivers plus-addresses to the normal inbox; Supabase
   treats it as a separate account.
3. Make them a **1099 contractor** — that covers the contractor clock path in the same run.
4. **Assign them to a schedule item on a real project.** Not optional since 1B: with no assignment they
   now read zero projects at the database, so the app is genuinely empty and it looks like the migration
   broke it. The existing `mliber13+testw2`, `+test1099` and `+testmeasurer` accounts all have zero
   assignments — give one of them a schedule item before testing with it, or make a fresh person.

## The run

5. **HR → Crew accounts** (`/hr/crew`) → find ZZ Test Crew → **Generate invite link** (copies to clipboard).
6. **Private/incognito window**, paste the link. The email field should arrive **pre-filled** — that is the
   page reading the invite. Set a password twice, submit.
7. **Pass:** lands on `/crew`, job list visible. Open the job → Materials and Scope of Work render.
8. **Clock in, then clock out** on that job.
9. Back in the owner window: **HR → Crew accounts** → ZZ Test Crew shows as linked. **Deactivate**, then
   **Reactivate**.
10. If the batch touched read scoping, also sign in as the **field foreman** and confirm they still see the
    **whole org schedule**, not just their own jobs.
11. Owner app sanity: projects list, a project's quote, Financials, Labor, Payroll all load.

## Cleanup

Deactivate the account → delete the auth user in **Supabase → Authentication → Users** → remove ZZ Test
Crew from HR → Team.

**Auth user first.** Deleting the roster person first orphans the crew profile — that is `P1-HR-2`, and
not something to trip on purpose.

## If it fails, the error text says what broke

| Message | Means |
|---|---|
| **`not authorized to change account permissions`** | **The 1A privilege trigger is blocking the invite RPC.** The `current_user` exemption is not working. Stop; do not weaken the trigger to get past it. |
| `this account already has app access...` | P1-SEC-3 firing. Correct if the account already existed; a bug on a genuinely new signup. |
| `signup email does not match invite` | Typed address does not match the roster person's. Not a code problem. |
| `Check your email to confirm...` | Supabase "Confirm email" is ON. See the top of this doc. |
| `invite token is invalid, expired, or already used` | Link reused. Generate a fresh one. |
| Crew signs up fine but the app is **empty** | Read scoping (1B). Check `crew_is_assigned_to_project` — most likely an empty-string `linked_employee_id`, or the person has no schedule assignment (step 4). |
| Foreman sees only their own jobs | 1B Trap 1 — the foreman carve-out is missing from a policy. |

Only the first, sixth and seventh rows implicate a migration. The rest is pre-existing behaviour.

## The one thing the SQL tests cannot cover

Everything above except signup can be proven in SQL as a real `authenticated` caller, and should be —
it is faster and safer. What SQL cannot prove is the **app wiring**: `signUp` → `consumeCrewInviteToken`
→ hard reload → `/crew` bootstrapping with the freshly-linked org. That sequence is why this doc exists.
