# Cursor Brief — Batch 1C: remove the vendor RFQ chain

Part of `docs/V1_HARDENING_PLAN_2026-09.md` Batch 1. **1A and 1B shipped** (`95a28c8`, `eb06f06`,
`c778185`, `ac25616`). This is 1C. 1D (systemic anon revoke, headers, org-only write policies) follows.

Mark decided 2026-09-10 to remove the chain rather than guard it. Nothing has been able to *create* a
quote request since 2026-02-26 — there is no route or button anywhere that reaches `QuoteRequestForm`.
What remains is a public vendor portal backed by two token RPCs with **no expiry and no resubmit limit**
(P0-SEC-3), plus ~3,000 lines of unreachable code.

This is a deletion batch. It fails differently from 1A and 1B: the risk is not a broken policy, it is
removing something still wired to a live surface. I traced every edge before writing this, and **two of
them contradict the plan** — read the traps first.

---

## Read this first — two traps

### Trap 1 — `quote-documents` must stay PUBLIC. The plan is wrong about this.

`docs/V1_HARDENING_PLAN_2026-09.md` P1-SEC-6 says the `quote-attachments` and `quote-documents` buckets are
"public (by design for the dead vendor chain — moot if P2-DEL-3)". That is true of `quote-attachments`.
It is **not** true of `quote-documents`, which serves two live surfaces:

- **Client quotes** — `clientQuoteService.ts:490-493` uploads to it, `ClientQuoteReadOnlyView.tsx:132-134`
  reads with `.download()`. Routed and live at `/projects/:id/quotes/:quoteId`. This one is fine either
  way: `.download()` goes through the authenticated client and respects the org-scoped storage RLS.
- **GC EstimateBuilder** — `EstimateBuilder.tsx:2232` calls `uploadQuotePDF`
  (`supabaseService.ts:3229`), which returns **`getPublicUrl`**. Flip the bucket to private and every URL
  it has ever returned stops resolving.

GC estimating is ACTIVE-CORE this cycle. **Do not touch `quote-documents` in this brief** — not its
`public` flag, not its policies. Making it private means converting `uploadQuotePDF` and its
EstimateBuilder caller to signed URLs, which is Batch 4 work, not deletion work.

`quote-attachments` is genuinely RFQ-only (`quoteService.ts:133,143,161,169` and nothing else) and goes
with the chain.

### Trap 2 — `/quote/:token` is the vendor portal, not a customer link

`src/routes/index.tsx:170-171` maps **both** `/vendor-quote/:token` and `/quote/:token` to the same
`VendorQuotePortal` component. `/quote/` is an alias, not a customer-facing quote share — customers get a
downloaded PDF, not a link. Both routes go.

**Do not confuse these with the two live share pages next to them:** `/supplier/:token`
(`SupplierOrderSharePage`) and `/customer/:token` (`CustomerSchedulePage`) at lines 172-173 are in use and
stay.

---

## Pre-flight — report before deleting

**Check 1 — is there anything in the tables worth keeping?**

```sql
select 'quote_requests' t, count(*) n, max(created_at) newest from public.quote_requests
union all
select 'submitted_quotes', count(*), max(created_at) from public.submitted_quotes;
```

**Check 2 — how many objects are in the buckets?**

```sql
select bucket_id, count(*), pg_size_pretty(sum((metadata->>'size')::bigint)) as bytes
from storage.objects
where bucket_id in ('quote-attachments','quote-documents')
group by bucket_id;
```

`quote-documents` will have client-quote and EstimateBuilder objects in it. That is expected and is why
Trap 1 exists. Report the split so we can see it.

**Check 3 — confirm the RPCs and their grants before dropping.**

```sql
select proname, prosecdef, pg_get_function_identity_arguments(oid) as args
from pg_proc where proname in ('get_quote_request_by_token','submit_vendor_quote');

select polname, pg_get_expr(polqual, polrelid) as using_expr, pg_get_expr(polwithcheck, polrelid) as check_expr
from pg_policy where polrelid in ('public.quote_requests'::regclass, 'public.submitted_quotes'::regclass);
```

---

## What to delete — one commit per numbered group

The plan asks for one commit per deletion so a revert stays surgical. Follow that, in this order: client
code first (so `tsc` proves nothing else referenced it), then the edge function, then the database.

### 1. The three components

- `src/components/VendorQuotePortal.tsx`
- `src/components/QuoteReviewDashboard.tsx` (1,146 lines, zero importers)
- `src/components/QuoteRequestForm.tsx` (686 lines, zero importers)

Verified: `VendorQuotePortal` is imported only by `src/routes/index.tsx:92`. The other two are imported by
nothing at all.

### 2. Routes and rewrites

- `src/routes/index.tsx` — drop the import at line 92 and both routes at lines 170-171.
- `vercel.json` — drop the `/vendor-quote/:token*` and `/quote/:token*` rewrite entries. The catch-all
  `/(.*)` → `/index.html` already covers anything left.

**Leave the `/privacy` and `/terms` rewrites alone** — those are the A2P 10DLC compliance pages and the
campaign review depends on them being crawler-reachable.

### 3. The services

- **Delete `src/services/quoteService.ts` entirely.** All nine exports are RFQ
  (`createQuoteRequestLS`, `createQuoteRequestInDB`, `fetchQuoteRequestByToken`,
  `fetchQuoteRequestsForProject`, `deleteQuoteRequest`, `resendQuoteRequestEmail`, `submitQuote`,
  `fetchSubmittedQuotesForRequest`, `updateQuoteStatus`), and the only tables it touches are
  `quote_requests` and `submitted_quotes`.
- **`src/services/hybridService.ts`** — remove the `import * as quoteService` at line 27 and the eight
  `*_Hybrid` wrappers (lines ~330-390). Leave the rest of the file.
- **`src/services/emailService.ts` — edit, do not delete.** Remove only `SendQuoteRequestEmailInput`,
  `sendQuoteRequestEmail` and `generateMailtoLink`. **Keep `sendFeedbackNotification` (used by
  `feedbackService.ts:11`) and `sendDealDocumentShare` (used by `DealDocuments.tsx:17`).** Both are on
  other deletion lists but neither is in this batch.
- **Delete `src/types/quote.ts`.** Every export is RFQ-only and the only importers are the files above.
  **Do not delete `formatSOWForQuoteRequest` in `sowService.ts:334`** — it is a SOW text formatter that
  merely has "QuoteRequest" in its name, imports nothing from `types/quote`, and is used by
  `SOWManagement.tsx:23`.

### 4. The edge function

Delete `supabase/functions/send-quote-email/` and undeploy it:
`supabase functions delete send-quote-email`.

Its only caller was `emailService.sendQuoteRequestEmail`, removed in group 3. (1A added an auth check to
this function precisely so the hole was closed before this batch landed — that work is now superseded, as
intended.)

### 5. The database — migration `20260912120000_remove_vendor_rfq_chain.sql`

**Drop the two RPCs.** This is what closes P0-SEC-3:

```sql
DROP FUNCTION IF EXISTS public.get_quote_request_by_token(text);
DROP FUNCTION IF EXISTS public.submit_vendor_quote(text, jsonb);
```

Use the exact signatures Check 3 returns, not these — they are from
`20260730120000_anon_lockdown_rpcs.sql:55,85` and may differ.

**Drop any remaining anon-facing policies** on `quote_requests` / `submitted_quotes` that Check 3 turns up.

**Keep the two tables.** My recommendation, and Mark should get the chance to disagree once he sees
Check 1: dropping them is irreversible, they cost nothing once no policy and no app code reaches them,
and if there is historical vendor-quote data he may want it. Inert tables are a `P2-DEL` question, not a
security one. **Report the counts and say you left them; do not drop them in this brief.**

**Remove the `quote-attachments` bucket** — only if Check 2 shows it empty or its contents are confirmed
RFQ-only. If it has objects, report and leave it; deleting stored files is not reversible and is not
worth guessing about.

---

## What NOT to touch

- **`quote-documents` bucket** — Trap 1. Not its `public` flag, not its policies.
- `uploadQuotePDF`, `deleteQuotePDF`, `getQuotePDFSignedUrl` in `supabaseService.ts`. `uploadQuotePDF` is
  live via EstimateBuilder; the other two have zero callers but belong to P2-DEL-5, not here.
- Everything under `src/components/quotes/` — that is **client quotes**, a live routed GC feature, and a
  different thing from vendor RFQ despite the overlapping vocabulary.
- `/supplier/:token` and `/customer/:token` and their pages.
- `emailService.ts` as a file; `feedbackService`; `DealDocuments`.
- The `/privacy` and `/terms` rewrites in `vercel.json`.
- Anything in 1D or Batches 2-6.

---

## Verification

1. `npx tsc --noEmit` clean. **This is the main proof for a deletion batch** — if anything still
   referenced a deleted symbol, it fails here. Do the client deletions first so this check is meaningful.
2. `npx vitest run` — 52 files / 334 tests green (baseline at `e45a49a`).
3. `npm run build` succeeds, and report the main chunk size before and after out of curiosity.
4. `supabase db push`; `supabase migration list` in sync, no remote-only versions.
5. `select proname from pg_proc where proname in ('get_quote_request_by_token','submit_vendor_quote');`
   returns zero rows.
6. Navigate to `/quote/anything` and `/vendor-quote/anything` in the built app — both should now fall
   through to the SPA catch-all, not render a portal.

### Operator-side — Mark runs these

Short list; this batch removes an unreachable surface, so the risk is collateral damage to GC estimating.

1. **GC → a project → EstimateBuilder → upload a quote PDF, then open it.** This is Trap 1. If the link
   404s, `quote-documents` was touched.
2. **GC → a project → Quotes** (client quotes): open an existing quote, download its PDF, create a new one.
3. Drywall quote stage: generate a v3 PDF (unaffected, but it is the busiest surface in the app).
4. Supplier share link and customer schedule link both still open.

---

## Commit

Five commits, in the order above.

```
refactor(gc): delete the vendor RFQ components

QuoteReviewDashboard and QuoteRequestForm have had zero importers since the
create path was removed in February. VendorQuotePortal was reachable only
through the two public token routes, which go in the next commit.
```

```
refactor(gc): drop the vendor quote portal routes

/vendor-quote/:token and /quote/:token both rendered VendorQuotePortal --
/quote/ was an alias, not a customer-facing link. The vercel rewrites go with
them; the catch-all already covers anything left. /privacy and /terms stay:
the A2P campaign review needs those crawler-reachable.
```

```
refactor(gc): delete the vendor quote services and types

quoteService in full -- all nine exports were RFQ, and the only tables it
touched were quote_requests and submitted_quotes. The eight _Hybrid wrappers
with it. emailService keeps sendFeedbackNotification and sendDealDocumentShare
and loses only the quote-request pair; formatSOWForQuoteRequest in sowService
stays, since it is a SOW text formatter that only shares the name.
```

```
refactor(gc): remove the send-quote-email edge function

Its only caller went with quoteService. 1A had added an auth check to it, which
this supersedes -- that was deliberate, so the hole was closed in the meantime
rather than waiting on this batch.
```

```
fix(security): drop the unguarded vendor quote token RPCs

get_quote_request_by_token had no expires_at check and performed an anon UPDATE
side effect; submit_vendor_quote had no expiry or status guard, so a token
allowed unlimited resubmits with an unbounded payload. That is P0-SEC-3. With
the chain gone there is nothing to guard, so they are dropped rather than
fixed.

quote_requests and submitted_quotes are kept. No policy and no app code reaches
them now; dropping them is irreversible and is a cleanup question rather than a
security one.
```

**Exclude from every commit:** `.claude/settings.local.json` and `supabase/.temp/cli-latest`.

---

## STOP — report before going further

1. Check 1 counts — how much vendor-quote history exists, if any.
2. Check 2 bucket contents, with the `quote-documents` split.
3. The exact RPC signatures you dropped, and any anon policy you found alongside them.
4. Whether `quote-attachments` was empty, and what you did about it.
5. `tsc` / `vitest` / `build` (with the chunk-size delta) / `supabase migration list`.
6. Total lines removed.
7. Anything that turned out to still be referenced — especially anything reaching `quote-documents` that
   I did not list in Trap 1.
