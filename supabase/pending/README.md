# Pending migrations (staged — do NOT apply yet)

Migrations here are intentionally kept **out of** `supabase/migrations/` so that
`supabase db push` does not apply them prematurely. Move a file into
`supabase/migrations/` (keeping its timestamp filename) only when its
preconditions below are met, then push.

## `20260730120100_anon_lockdown_drop_policies.sql` — Security batch P0-4 Part B

Drops the anon `USING (true)` / `WITH CHECK (true)` policies on
`crew_invite_tokens`, `quote_requests`, and `submitted_quotes`.

**Preconditions before moving into `migrations/` and pushing:**
1. Migration `20260730120000_anon_lockdown_rpcs.sql` (Part A) is applied.
2. The RPC-based app build is **live** (the commit that rewired
   `crewInviteService.fetchCrewInviteByToken`, `quoteService.fetchQuoteRequestByToken`,
   and `quoteService.submitQuote` to call the new RPCs).
3. Smoke test passed on the live build:
   - Crew signup page loads an invite by token (`/crew-signup?token=…`).
   - Vendor portal opens a quote request by token (`/quote/:token`) and shows it.
   - Vendor can submit a quote and the request flips to `submitted`.

Once those hold, `mv` this file into `supabase/migrations/` and run the push.
