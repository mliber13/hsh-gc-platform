# Quote Document — Target Model & Plan

**Status:** **v1 shipped** (2026-05-14) — client quote feature complete on `master` (Steps 1–5; commit SHAs in §13). Original scoping locked 2026-05-13.
**v2 (idea only):** AI-assisted scope-of-work narrative in the Builder — early sketch in **§14.1** (not scoped for build).
**Source:** Owner observed HSH's brother exporting the Estimate Builder's view-print PDF and sending it to a prospect as a quote. That PDF was built as a working/internal export, not a client-facing deliverable — gap surfaced.
**Predecessor:** v0 (2026-05-13). Scoping pass with owner walked the ten open questions; this v1 captures the locked decisions and the structural design that fell out.

---

## 1. The premise

The Estimate Builder is HSH's internal cost-construction tool — trades, sub-items, unit costs, markup, waste, the full breakdown. Its current PDF export is a faithful rendering of that internal view: dense, full of internal cost columns, useful for HSH's own records.

That's not what a client receives. A **quote** is the formal, client-facing deliverable that goes out to win the bid:
- Clean summary of scope and price, trade-category rollup
- HSH Contractor branding
- Prepared-for block addressing a business decision-maker
- Standard exclusions (project-editable)
- Validity window
- Signature block

The two surfaces share underlying data but serve different audiences and need separate rendering paths. Today they collapse into one PDF, which means HSH is sending an internal document to clients — or, worse, hand-redacting before sending.

---

## 2. Audience & client types

The GC quote is **B2B commercial/institutional**, not residential. The reader is a business decision-maker evaluating HSH against competing GCs. Tone and content are designed for that audience.

Four client types share one quote template (variants handled in the addressee data, not separate templates):

1. **In-house build-to-sell** — HSH is both developer and GC, builds for resale or rental. Quote addressee is the financing bank; the quote justifies the build cost for the construction loan.
2. **Commercial tenant** — businesses leasing or owning a commercial space, hiring HSH for buildout.
3. **Municipality** — public entities and government work. The quote may be dropped into a larger formal bid packet by the client; HSH does not build the bid packet, just the quote.
4. **Company** — corporate client (e.g., a regional chain commissioning a new location).

HSH does not quote work for individual homeowners.

**Primary purpose:** competing bid. The quote is a sales/scope artifact, not a contract. A separate construction contract is executed on acceptance and carries the legal/financial weight (payment schedule, change-order procedure, insurance, bonding, indemnity, etc.).

---

## 3. Goals

1. A separate, client-facing PDF generation path distinct from the estimate's internal-view print.
2. Branded layout — HSH Contractor logo, two-color red/blue palette (distinct from HSH Drywall's orange single-color scheme), professional B2B tone.
3. Trade-category rollup pricing. Optional phase rollup and area breakout supported as alternate layouts (future).
4. Prepared-for block addressed to a business (company/municipality/bank) with Attn: contact line.
5. Template-driven inclusions and exclusions with per-quote editable overrides.
6. Lightweight quote-side terms: validity window, workmanship warranty, "this quote is not a contract" disclaimer.
7. Global yearly quote numbering (`Q-YYYY-NNN`) with revision suffixes (`-R2`, `-R3`).
8. Quote lifecycle tracking: draft / sent / accepted / declined / expired / superseded.
9. Snapshot-on-send: the PDF delivered to the client is frozen as the authoritative artifact; data drift on the source estimate never retroactively changes a sent quote.
10. Quote belongs to a project. Project lifecycle gains a `lost` status for projects whose quote(s) did not win.

---

## 4. Non-goals

- ❌ Replacing the Estimate Builder's internal view-print. Internal export stays — it's HSH's working document.
- ❌ Quotes for individual homeowners. HSH does not service that market.
- ❌ Payment schedule, change-order procedure, insurance language, bonding statements on the quote. Those live in the contract.
- ❌ Allowances. HSH prices firm; scope changes flow through contract change orders, not allowance line items on the quote.
- ❌ Real-time edit-in-browser quote layout. Generate from data, render to PDF.
- ❌ Customer-facing portal for clients to view/sign quotes. Future maybe.
- ❌ E-signature integration. Future maybe — start with print-and-sign.
- ❌ Embedded schedule in the quote. Schedule is a separate downstream deliverable.
- ❌ Public-bid packet assembly (certifications, bonding statements, prevailing-wage forms for municipal work). The quote is one document the client may drop into their own bid packet; HSH does not generate the packet.
- ❌ Automatic email delivery in v1. PM emails the PDF themselves; the app records the send event.
- ❌ Quotes attached to deals. Deals are for upstream development work (land, JVs); not every project comes from a deal. Quotes attach to projects.

---

## 5. Document anatomy

The quote PDF, in order:

1. **Header band** — HSH Contractor logo, company contact (address, phone, email), in the brand red/blue palette.
2. **Quote metadata bar** — Quote number (`Q-YYYY-NNN[-Rn]`), issue date, validity expiry date.
3. **Prepared For / Project block** — two-column layout:
   ```
   PREPARED FOR                              PROJECT
   [Company / Municipality / Bank]           [Project name]
   Attn: [Contact Name, Title]               [Project address]
   [Mailing Address]
   [Phone] [Email]
   ```
   Optional flag: project address differs from mailing address.
4. **Scope of work narrative** — 1-3 paragraph summary of what HSH is quoting (project type, key deliverables, gross scope). Editable per quote.
5. **Pricing breakdown — trade-category rollup** — one line per trade category with dollar total. Subtotal, tax (if applicable), grand total.
6. **Options / alternates** (optional section, only shown if any exist) — line-item table of client-choose upsells with prices. Same pattern as the drywall quote's Options section.
7. **Inclusions** — bulleted list of what's covered, seeded from template, editable per quote.
8. **Exclusions** — bulleted list of what's not covered, seeded from template, editable per quote. Standard seed list:
   - Permits & impact fees (by Owner)
   - Builder's risk insurance (by Owner)
   - Site survey, geotechnical, environmental testing
   - Utility tap fees and meter installs
   - Owner-supplied items (appliances, FF&E, AV, security)
   - Hazmat abatement
   - Unsuitable soils / rock removal
   - Off-hours work / overtime acceleration
   - (Editable — PM adjusts per project)
9. **Terms** — minimal:
   - Validity: this quote is valid for 60 days from the issue date (adjustable per quote).
   - Warranty: 1-year workmanship warranty from substantial completion.
   - Disclaimer: "This quote does not constitute a contract. A separate construction contract will be executed upon acceptance."
10. **Signature block** — acceptance signature line for client, dated; HSH counter-signature line.

Page break behavior: header band on every page, page numbers in footer, "Q-YYYY-NNN — Page X of Y" in footer.

---

## 6. Data model (target)

Two new core tables plus enum changes:

**`quotes`** (one row per quote, including revisions)
- `id` (uuid)
- `project_id` (fk → projects)
- `quote_number` — text, `Q-YYYY-NNN` (without revision suffix)
- `revision` — int, default 0 (0 = original, 1 = R2 if displayed, etc.; or shift to `1` = R1; convention TBD in build)
- `status` — enum: `draft | sent | accepted | declined | expired | superseded`
- `prepared_for` — jsonb (company, attn_name, attn_title, mailing_address, phone, email) — denormalized at send time
- `project_address_override` — text or null
- `scope_narrative` — text
- `inclusions` — text[] (frozen at send)
- `exclusions` — text[] (frozen at send)
- `validity_days` — int, default 60
- `issued_at` — timestamp (when marked Sent)
- `expires_at` — timestamp (computed from issued_at + validity_days)
- `accepted_at`, `declined_at` — timestamps
- `sent_total` — numeric (frozen at send)
- `sent_pdf_url` — text (Supabase Storage path, set at send)
- `superseded_by_id` — fk → quotes (set when R+1 is issued)
- `created_at`, `updated_at`, `created_by` — audit

**`quote_line_items`** (display-only rollup, derived from estimate at quote creation, editable per quote)
- `id`, `quote_id`
- `trade_category` — enum (matches existing TradeCategory)
- `display_label` — text (PM-editable label override)
- `amount` — numeric
- `sort_order` — int

**`quote_options`** (optional alternates/upsells)
- `id`, `quote_id`
- `label`, `description`, `amount`, `sort_order`

**Templates** (org-level boilerplate):
- `quote_inclusion_templates` and `quote_exclusion_templates` — bullet-list seeds that new quotes start from. Per-org, with project-type defaults (`commercial-renovation`, `commercial-new-build`, etc.).

**Project enum change:**
- `ProjectStatus` adds `lost` (or `not-pursued`). Triggers: quote declined OR all sent quotes expired without acceptance OR manual mark.
- Existing transitions: `estimating → in-progress` on quote accepted; `estimating → lost` on quote declined; `in-progress → complete` unchanged.

**Quote numbering sequence:**
- Per-org counter scoped by year. New quote in 2026 → `Q-2026-NNN` with `NNN = max(existing 2026 quotes) + 1`.
- Revisions don't consume new numbers; they share the base `quote_number` with an incremented `revision` field.

---

## 7. Status lifecycle

```
Draft ──Mark Sent──> Sent ──Mark Accepted──> Accepted   (project → in-progress)
                         │
                         ├──Mark Declined──> Declined   (project → lost if no other live quotes)
                         │
                         ├──expires_at hits─> Expired    (project → lost if no other live quotes)
                         │
                         └──Create Revision─> Superseded (linked to R+1 quote)
```

Transition rules:
- **Draft → Sent:** PM clicks "Mark Sent." App snapshots PDF to Storage, freezes inclusions/exclusions/totals/prepared_for on the row, sets `issued_at` and `expires_at`. No email send — PM emails the PDF themselves out-of-band.
- **Sent → Accepted:** PM clicks "Mark Accepted." Project status moves to `in-progress`.
- **Sent → Declined:** PM clicks "Mark Declined." If no other live quotes exist on the project, project moves to `lost` (PM-confirmable).
- **Sent → Expired:** Display-state when `expires_at < now()`. No background job required for v1.
- **Sent → Superseded:** When PM creates revision R+1 from this quote, the original is auto-marked `superseded` with `superseded_by_id` pointing at the new revision.
- A revision is just a new quote row sharing the base `quote_number` with `revision = N+1`. Same project, replaces the prior in the active view but stays in history.

---

## 8. UI surfaces

1. **Project → Quotes tab** — list of all quotes on the project (current + historical revisions), status pills, "New Quote" and "Create Revision" actions.
2. **Quote builder** — form view to compose a new quote (or revision):
   - Pull trade-category totals from the estimate (PM can override line labels and amounts before send)
   - Edit prepared-for block (seeded from project client data)
   - Edit scope narrative
   - Edit inclusions/exclusions (seeded from template)
   - Set validity days
   - Live preview pane showing PDF render
3. **Quote detail / actions** — for a sent quote, surface Mark Accepted / Mark Declined / Create Revision / Download PDF.
4. **Estimate ↔ quote affordance** — explicit "Generate Quote from Estimate" button on the estimate view. Conflation between the internal estimate-print and the client quote must visibly disappear from the UI.

---

## 9. PDF generation

Server-side render. Existing PDF infra in the project (per quote-related references in the codebase: `send-quote-email`, `PrintableReport`, etc.) is the starting point; assess whether to extend it or stand up a dedicated edge function. Likely a new template module separate from the estimate-print path.

Render pipeline:
1. Quote builder POSTs to a render endpoint with the quote id.
2. Endpoint reads `quotes`, `quote_line_items`, `quote_options`, plus project + org branding.
3. Renders HTML → PDF (Puppeteer or existing pdf lib in repo — TBD in build).
4. On preview: returns PDF bytes inline (no storage).
5. On "Mark Sent": writes PDF to Supabase Storage at `quotes/{org_id}/{quote_id}-{revision}.pdf`, updates `sent_pdf_url`.

---

## 10. Sequencing & scope

Realistic step breakdown (refine in build briefs):

1. **Step 1 — Schema + templates.** Migration: `quotes`, `quote_line_items`, `quote_options`, `quote_inclusion_templates`, `quote_exclusion_templates`. Add `lost` to ProjectStatus. Seed standard inclusion/exclusion lists for commercial new-build and commercial renovation.
2. **Step 2 — Quote builder UI.** Project → Quotes tab. Create quote, pull line items from estimate, edit prepared-for / scope narrative / inclusions / exclusions. Save as draft.
3. **Step 3 — PDF render.** Template with HSH Contractor branding (red/blue, logo). All sections from §5. Preview from draft. Save & version to Storage on Mark Sent.
4. **Step 4 — Status transitions.** Mark Sent / Accepted / Declined actions. Project status auto-moves. Expired display state.
5. **Step 5 — Revisions.** Create Revision flow. Superseded marking. R-suffix display.
6. **Step 6 — Estimate ↔ quote affordance.** Wire "Generate Quote from Estimate" button. Tighten estimate-print UI so it stops reading as a quote.

Sizing guess: 6 dev sessions, possibly 4 if Step 5 collapses with Step 4 and Step 6 is mostly UX cleanup.

---

## 11. Sequencing relative to other work

- **Blocks on:** nothing structural in current planning. Can land in parallel with schedule v3 / drywall merge.
- **Branding dependency:** the design system already exposes brand colors via CSS vars; verify the red/blue values from the HSH Contractor logo are encoded somewhere (or add them) before PDF render work.
- **Priority:** medium. Bleeding daily — every quote the brother sends out with the internal PDF is a slow-motion data hygiene issue. Not urgent in days; urgent in weeks.

---

## 12. Next action

~~This v1 is the locked scoping output. Next is the build brief for **Step 1 (schema + templates)**~~ — **Done.** Steps 1–5 shipped (§13). For net-new work, open a v2 scoping chat anchored on **§14** (or file a brief against a specific §14 subsection).

---

## 13. v1 ship status (2026-05-14)

All five steps shipped on master:

- Step 1 — schema, RLS, templates, `next_client_quote_number()`, `lost` project status: **8a7cd72** (2026-05-13)
- Step 2 — Quotes list view + draft builder + Estimate-side "Generate Quote" entry (Step 6 folded in): **9affdf8** (2026-05-13)
- Step 3 — client-side jsPDF rendering + Preview button: **e04de77** (2026-05-13)
- Step 4 — Mark Sent / Accepted / Declined transitions, PDF snapshot to Storage, read-only view for non-drafts, `effectiveStatus` expired derivation: **b8b20aa** (2026-05-14)
- Step 5 — Create Revision flow + `superseded` linkage + `lost → estimating` reactivation when new live quote lands on a lost project: **e3b1619** (2026-05-14)

PDF is client-side (jsPDF + jspdf-autotable with deflate compression). No edge function. Quote routes: `/projects/:id/quotes`, `.../new`, `.../new?from=estimate`, `.../:quoteId` (read-only for non-drafts), `.../:quoteId/edit` (drafts).

Considered functionally complete for v1.

---

## 14. v2 ideas (captured 2026-05-14, not scoped)

Caveat: these are early sketches, not locked decisions. v2 scoping pass will refine into goals/non-goals/data model the same way v1 was done.

**Primary idea captured for v2:** in-app **AI-assisted scope-of-work** for the quote Builder (today PMs often round-trip through external chat). Full sketch below.

### 14.1. AI-assisted Scope of Work

**Premise:** PMs currently write the scope-narrative paragraph by hand, and the working pattern observed is to copy quote context out of the app, paste into ChatGPT or similar, rewrite for professional tone, paste the result back. Bringing this in-app removes the round-trip and uses the structured data the app already has (line items, project type, prepared-for company).

**Sketch:**
- Button next to the Scope Narrative field in the Builder: ✨ "Generate" / "Polish."
- Two modes:
  - **Generate** — produces a fresh draft from the rolled-up line items, project type, and prepared-for company. Useful when the field is empty.
  - **Polish** — takes the PM's current draft and tightens to professional B2B tone.
- AI receives, as context: project name + type + address, trade-category rollup with amounts (no internal cost composition), prepared-for company name (audience tone matching), inclusions + exclusions (to avoid contradictions), and a system prompt anchoring on "commercial GC bid, competing-bid context, business decision-maker audience."
- Output: 1-3 paragraph narrative. PM accepts, edits, or regenerates.

**Anchor in existing infra:**
- Anthropic integration already deployed via `supabase/functions/deal-coach-chat/index.ts` (uses `ANTHROPIC_API_KEY` secret, model `claude-sonnet-4-5`).
- New edge function `generate-quote-scope` follows the same pattern. Streaming response so the PM sees text appear progressively.

**Open questions:**
- Model choice — sonnet-4-5 (existing) vs. upgrading repo-wide to sonnet-4-6.
- Prompt caching — system prompt + boilerplate per project type is a natural cache point if/when this gets used at volume.
- Should the AI also be allowed to suggest *additions* to inclusions/exclusions, or strictly stay in the scope-narrative field? (Lean: scope-narrative only for v2.0; expand later if useful.)
- Error / fallback behavior when the API is down — surfaces as a toast; field stays manually editable. No hard dependency.
- Per-org disable toggle for users who don't want AI assistance? Probably overkill for v2.0; skip unless requested.

**Sizing guess:** 1-2 dev sessions. Mostly edge function + a small UI control on the Builder. Templates of existing system prompts get the lift.

### 14.2. (placeholder for other v2 ideas)

The rest of v1 is considered clean and usable as-is. Additional v2 ideas would land here as captured.

---
