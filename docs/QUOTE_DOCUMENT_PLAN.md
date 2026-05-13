# Quote Document — Target Model & Plan

**Status:** v0, scoping (2026-05-13)
**Source:** Owner observed HSH's brother exporting the Estimate Builder's view-print PDF and sending it to a prospect as a quote. That PDF was built as a working/internal export, not a client-facing deliverable — gap surfaced.
**Predecessor:** none yet. This is a fresh planning track distinct from `SCHEDULE_TARGET_MODEL.md`.

---

## 1. The premise

The Estimate Builder is HSH's internal cost-construction tool — trades, sub-items, unit costs, markup, waste, the full breakdown. Its current PDF export is a faithful rendering of that internal view: dense, full of internal cost columns, useful for HSH's own records.

That's not what a client receives. A **quote** is the formal, client-facing deliverable that goes out for signature:
- Clean summary of scope and price
- HSH branding
- Terms and conditions
- Validity window
- Signature line
- Optional: payment schedule, exclusions, assumptions

The two surfaces share underlying data but serve different audiences and need separate rendering paths. Today they collapse into one PDF, which means HSH is sending an internal document to clients — or, worse, hand-redacting before sending.

---

## 2. Goals (initial — refine in scoping pass)

1. **A separate, client-facing PDF generation path** distinct from the estimate's internal-view print.
2. **Branded layout** — HSH logo + colors, project info block, prepared-for block, date, quote number.
3. **Summary line items, not trade-by-trade sub-item dumps** — client sees rolled-up scope categories with a price, not HSH's internal cost composition.
4. **Terms + validity** — standard quote terms, exclusions, expiry date.
5. **Quote tracking** — when was each version sent, to whom, current status (draft / sent / accepted / declined / expired).
6. **Round-trippable** — the prepared quote should be regeneratable from data (project + estimate + a quote-meta layer), not stored as a one-time blob.

---

## 3. Non-goals (initial)

- ❌ Replacing the Estimate Builder's internal view-print. Internal export stays — it's HSH's working document.
- ❌ Real-time edit-in-browser quote layout. Generate from data, render to PDF.
- ❌ Customer-facing portal (sign-in by recipient to view). Future maybe.
- ❌ E-signature integration (DocuSign, etc.). Future maybe — start with print-and-sign.
- ❌ Embedded schedule in the quote. The schedule lives in a separate downstream deliverable.

---

## 4. Open questions (need scoping pass)

These are the questions that block "draft the brief." Bring examples + owner input to the dedicated scoping chat:

1. **What does a HSH quote actually look like today?** Word docs, prior PDFs, email templates — collect samples from brother/Erik to anchor the design. Don't design from scratch.
2. **Quote granularity** — top-line lump-sum? By trade category? By phase (foundation / framing / finishes)? Mixed?
3. **What's in the prepared-for block** — client name only, or full address + project address + project name? Single point-of-contact?
4. **Inclusions / exclusions / assumptions** — boilerplate per project type? Per quote? Editable per-quote?
5. **Terms** — payment schedule (deposit + milestones + retention?), validity period (30 days standard?), warranty language, change-order language.
6. **Quote numbering** — Q-YYYY-NNN sequence per project? Per org?
7. **Versioning** — when HSH revises a quote, is it a new quote number or revision (Q-2026-042 rev 2)? What's tracked?
8. **Status lifecycle** — draft → sent → (accepted | declined | expired | revised). What events transition status? Who clicks what?
9. **Storage** — bucket the generated PDF in Supabase Storage and link from a `quote_documents` table? Or always regenerate on demand?
10. **Does a quote convert into a project on accept** — or is the project already created and the quote is for an existing project? (Per the current Deal Workspace flow, projects come from deals, so the quote likely sits between deal and project.)

---

## 5. Approximate scope (to refine after scoping pass)

Rough mental model of the work, to be replaced with a real migration plan:

1. **Data model** — `quote_documents` (or `quotes`) table: id, project_id (or deal_id), version, number, status, prepared_for, sent_at, accepted_at, expires_at, terms_template_id, totals (snapshotted), pdf_url. Plus a `quote_line_items` table for the summary rollup (not the raw estimate trades — these are display rows derived from the estimate at quote time).
2. **Terms templates** — `quote_terms_templates` table for reusable terms blocks. Per-org defaults + project-type overrides.
3. **Quote builder UI** — separate route under the project (or deal): create new quote from estimate, customize prepared-for block, pick terms template, preview, send.
4. **PDF generation** — server-side render (likely a new edge function or extension of existing PDF infra). Read quote + project + line items + terms → produce branded PDF.
5. **Quote management** — list of quotes per project, status pills, resend / mark accepted / revise actions.
6. **Estimate ↔ quote link** — clear UI affordance to "create quote from this estimate" without conflating the surfaces.

Sizing TBD in the scoping pass. Realistic guess: 4–8 dev sessions across the chunks above.

---

## 6. Sequencing relative to other work

- **Blocks on:** nothing structural in current planning — could land in parallel with schedule v3 / drywall merge.
- **Useful precondition:** decide whether quotes attach to deals or projects (currently the deal-pipeline is where pre-project quotes would conceptually live; once accepted, deal converts to project). The deal workspace is mature enough to absorb this.
- **Priority:** medium. Bleeding daily — every quote brother sends out with the internal PDF is a slow-motion data hygiene issue. Not urgent in days; urgent in weeks.

---

## 7. What this doc is for

Placeholder + capture for the gap. Surface raised 2026-05-13. The real work happens in a dedicated planning chat that ingests this doc + HSH's existing quote samples, then drafts a real migration plan with sized steps.

**Next action:** open a fresh planning chat with this doc + 2–3 examples of quotes HSH has actually sent to clients in the past. The scoping pass turns this v0 into a v1 with locked goals, non-goals, data model, and sequenced steps.
