# HSH GC Platform — working notes

React + TypeScript + Vite on Supabase (Postgres, RLS, Storage, Edge Functions). One app,
two divisions: **GC** and **Drywall**. Drywall is the one under active development.

## Before you finish

```
npx tsc --noEmit        # must be clean
npx vitest run          # 439 tests; report the count, don't just say "passing"
```

CI runs both plus a build, under `America/New_York` **and** `Europe/Berlin`. The second
zone is not decoration — schedule dates are built as local midnight and only survive
negative UTC offsets, so an Ohio-only run passes while they are broken.

## The shapes that bite

**Drywall data lives in a JSONB blob.** `projects.metadata.legacy` holds `quote`,
`fieldTakeoff`, `orders`, `changeOrders`. Reads and writes go through
`drywallProjectsService`, never straight to the column.

**Blob writes are guarded by `updated_at`**, and the value must come from the page —
`project.updatedAtRaw`, the raw string. Never `project.updatedAt` (a `Date`, which
truncates the microseconds Postgres stores) and never a fresh read inside the service
(which compares current against current and can never fire). Every write returns its new
timestamp; publish it *immediately*, not after a later step, or a failure leaves the page
wedged on "changed somewhere else" until a reload throws the user's work away.

**Money comes from the quote, never from orders.** `DrywallOrderItem` has no cost field.
Orders say what to buy; the quote says what it is worth.

**Crew visibility is per-lane and enforced by RLS.** An operator "view as" preview runs
under the *operator's* session, so anything it renders has to be filtered client-side to
stay honest — see `commsLaneVisibility`.

**`profiles.full_name` may be an email.** Accounts created before 2026-09-21 were born
that way. Display code falls back `full_name || email`, which hides it perfectly.

## Conventions

- Dates: `todayKey()` / `toDateKey()` from `lib/dateFormat`. Never
  `new Date().toISOString().slice(0, 10)` — that is UTC, and after 8pm Eastern it is
  tomorrow.
- Migrations: `supabase db push`. Not the Dashboard, not MCP `apply_migration` — applying
  out of band drifts the history, which has cost a repair once already.
- A guard nobody has watched fail is not a guard. Make it fail on purpose before trusting
  it. Two protections have shipped inert: a SECURITY DEFINER trigger reading
  `current_user`, and an `updated_at` comparison against a fresh read.
- PostgREST returns `{ error: null }` on an UPDATE that matched **zero rows**. Add
  `.select('id')` and check for an empty array.

## Don't

- Delete `supabase/functions/accept-invitation`, `invite-user` or `qb-suggest-allocation`
  because they look empty. `qb-suggest-allocation` is **deployed and live**; the directory
  is empty because its source was never committed. Recovering or removing it is a
  decision, not cleanup.
- Commit `.claude/settings.local.json`.
- Run commits here while Cursor is also committing to master — it flattens history.

## Where things are written down

- `docs/V1_HARDENING_PLAN_2026-09.md` — the audit and batch status. The canonical record.
- `docs/briefs/` — one per batch, with what was found and why each call was made.
- `docs/DRYWALL_DIVISION_OPERATIONS_PLAN.md` — the division's locked decisions.
- `docs/DRYWALL_PROJECT_IA.md` — how the stages inside a drywall project are meant to fit.
