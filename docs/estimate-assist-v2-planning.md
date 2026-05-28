# Estimate Assist — v2 Planning

**Status:** Planning only (2026-05-19). **Not scoped for build.** No UI, migrations, edge functions, or implementation code should land until a dedicated scoping pass locks goals, non-goals, and MVP boundaries.

**Feature name:** **Estimate Assist** (use this label consistently in product copy, docs, and code when built).

**Relationship to shipped work:** Estimate Assist is broader than the quote Builder’s v2 “AI-assisted scope of work” sketch in `docs/QUOTE_DOCUMENT_PLAN.md` §14.1. That idea covers narrative polish for **client quotes** after an estimate exists. Estimate Assist targets the **upstream** estimating workflow: digesting drawings, structuring scope, and populating the **Estimate Book** before quote generation.

**Anchor references in repo today:**
- Estimate Book UI: `src/components/EstimateBuilder.tsx`
- Data model reference: `docs/ESTIMATE_AND_ACTUALS_STRUCTURE.md`
- Estimate templates (seeded starters): `estimate_templates` + `supabase/migrations/20260519_restaurant_structural_renovation_estimate_template.sql`
- Item library rates: `item_templates`, `trade_categories`
- Client quotes (downstream): `client_quotes`, `docs/QUOTE_DOCUMENT_PLAN.md`
- Existing AI edge pattern: `supabase/functions/deal-coach-chat/index.ts` (Anthropic + secrets)

---

## 1. Feature overview

**Estimate Assist** is a future AI-assisted estimating workflow inside the HSH GC Platform. The estimator uploads plan sets or permit drawings; the system helps digest the project, propose scope and line items mapped to HSH’s existing estimate categories, flag risks and ambiguities, and support a conversational refinement pass. The output is a structured draft that lands in the app’s **Estimate Book** (`trades` / optional `sub_items`). The estimator remains accountable for numbers, scope, and what goes to the client. The app’s existing paths then produce **client quotes** and PDFs.

This is **not** full automation of estimating. It is an **assistant estimator / project engineer / scope reviewer** that works alongside a human—similar to a junior PE reviewing drawings and building a first-pass takeoff outline for a senior estimator to validate.

---

## 2. Why this matters

| Pain today | What Estimate Assist improves |
|------------|-------------------------------|
| First-pass scope and line-item setup is slow and repetitive on similar project types (e.g. restaurant structural renovation). | Accelerates **structure** and **coverage checks**, not final judgment. |
| Drawings live outside the app; scope reasoning often happens in email, redlines, or external chat. | Keeps **drawing context**, **suggested scope**, and **estimate structure** in one project-scoped place. |
| Missed scope, double-counted trades, and vague allowances show up late (RFIs, change orders, margin erosion). | Surfaces **gaps, overlaps, and vagueness early** with explicit flags the estimator can accept or dismiss. |
| Scope narrative and exclusions for quotes are written after the estimate, sometimes via copy-paste to external AI. | Connects **estimate reasoning** to **quote language** (narrative, exclusions, clarifications) with shared project context. |
| Institutional knowledge lives in people’s heads and scattered templates. | Builds on **estimate templates**, **item_templates**, and historical project types already in Supabase. |

HSH’s differentiation remains the **closed loop** (estimate → execution → actuals → smarter next estimate). Estimate Assist strengthens the **front of that loop** without replacing estimator expertise.

---

## 3. Current workflow (example)

Typical flow today for a commercial renovation bid:

1. **Receive drawings** — PDF plan set, permit drawings, sometimes partial or outdated sheets.
2. **Manual review** — Estimator / PM walks sheets, notes structural, MEP, demo, finishes, kitchen, allowances.
3. **Open project in app** — Create project (type, client, address).
4. **Build Estimate Book** — Add trades by category (`planning`, `site-prep`, `rough-framing`, …); enter quantities, labor/material rates; optional sub-items; apply **estimate template** (e.g. Restaurant Structural Renovation) or item library picks.
5. **Iterate** — Adjust rates, subs vs self-perform, markup, contingency; internal review.
6. **Client quote** — Roll up categories into `client_quotes` (scope narrative, inclusions, exclusions); send PDF (`Q-YYYY-NNN`).
7. **Execution** — Actuals, change orders, variance (existing platform strength).

Estimate Assist inserts **between steps 1–2 and 4–6**, not after the quote is sent.

---

## 4. Future workflow vision

End-state vision (long-term; not MVP):

```
Upload drawings
    → AI digest (sheets, notes, legends, key dimensions where readable)
    → Suggested scope + category mapping
    → Suggested line items (units, starter rates from templates/library)
    → Flags (vague / missing / overlap / hidden-condition risk)
    → Chat refinement with estimator
    → Scope narrative + exclusions + clarifications (quote-ready drafts)
    → Commit structured draft → Estimate Book (trades/sub_items)
    → Estimator finalizes quantities & rates
    → Existing quote/PDF path unchanged
```

The assistant **proposes**; the estimator **commits** or **edits**. Nothing client-facing ships without human approval.

---

## 5. MVP version

**Goal:** Prove value on **one project archetype** with **manual upload + structured suggestions + chat**, then **one-click (or confirmed) insert** into Estimate Book.

Suggested MVP boundaries:

| In scope (MVP) | Out of scope (MVP) |
|----------------|-------------------|
| Upload PDF plan set (multi-file) per project | Full CAD/BIM ingest, automatic sheet naming from title blocks |
| AI summary: project type, gross scope, major trades | Guaranteed quantity takeoff from drawings |
| Map suggestions to **existing** `trade_categories` keys | New category keys without human approval |
| Suggest line items from **estimate_templates** + **item_templates** where match exists | Auto-finalize bid total or markup |
| Starter labor/material rates from templates (qty = 0 or PM-entered) | Replace subcontractor quotes |
| Flag list: vague scope, possible overlap, missing typical scopes | Automated code compliance review |
| Chat thread scoped to project + drawing digest | Cross-project learning without explicit opt-in |
| Export draft → insert as `trades` on estimate (pending review) | Auto-send quote or auto-apply template without confirm |
| Optional: draft scope narrative / exclusions text for later quote paste | Full quote Builder integration |

**MVP project archetype candidate:** Restaurant structural renovation / building repair (template already seeded: `restaurant-structural-renovation-building-repair`).

---

## 6. Long-term version

- **Multi-discipline** plan sets (arch, structural, MEP, food service) with sheet-level citations (“see S-3 detail 4”).
- **Comparative templates** by `project.type` and historical actuals (“similar jobs averaged X on rough framing”).
- **Revision tracking** when owner uploads addendum sets; delta scope suggestions.
- **Collaboration** — comments, assign flags to subs, RFI draft export.
- **Quote Assist handoff** — accepted narrative/exclusions flow into `client_quotes` with consistency checks against estimate totals.
- **Feedback loop** — post-project “what we missed” captured to improve prompts/templates (with org governance).
- **Optional integrations** — storage OCR pipeline, email-forward drawings, mobile photo redlines.

---

## 7. Data needed

### 7.1 Inputs (user-provided)

- Plan/permit PDFs (and optionally images)
- Project metadata already in app: name, type, address, client, specs (sqft, stories, etc.)
- Optional free-text: “Owner wants to keep kitchen operating partial hours”
- Selected estimate template (or “none”)
- Org’s `item_templates` and rate notes (`rate_source_*`)

### 7.2 System context (already in Supabase / app)

- `trade_categories` (system + org custom)
- `estimate_templates.trades` JSONB (line shapes, rates)
- `item_templates` (default units, labor/material rates)
- `CATEGORY_TO_GROUP` / rollup groups (`admin`, `exterior`, `structure`, `mep`, `interior`, `other`)
- Prior project documents in `project_documents` (if reused)

### 7.3 New data (likely — design in scoping, not built here)

Conceptual tables (names TBD):

| Concept | Purpose |
|---------|---------|
| `estimate_assist_sessions` | One assist run per project (or per upload batch); status, model version, estimator owner |
| `estimate_assist_uploads` | Files linked to session; storage path, page count, processing status |
| `estimate_assist_artifacts` | Digest JSON, suggested scope, flags, chat transcript snapshot |
| `estimate_assist_suggestions` | Normalized rows: category, line name, unit, rates, confidence, source sheet ref |
| `estimate_assist_flags` | Type, severity, message, resolution (open/accepted/dismissed) |

Store **large blobs** (full digest, raw model output) in Storage; store **queryable summaries** in Postgres.

### 7.4 Outputs (downstream)

- Draft `trades` rows (and optional `sub_items`) on `estimates`
- Optional text blobs for quote: `scope_narrative`, `inclusions[]`, `exclusions[]`, clarifications
- Audit trail: what the AI suggested vs what the estimator committed

---

## 8. Possible UI flow

High-level screens (planning wireframe only):

1. **Project → Estimate Assist** (new tab or entry beside Estimate Book)
   - Empty state: “Upload plan set to start”
   - List prior assist sessions for this project

2. **Upload step**
   - Drag/drop PDFs → `project_documents` or dedicated bucket prefix
   - Show processing state (queued / digesting / ready)

3. **Digest panel** (read-only first)
   - Project summary, sheet index, inferred scope bullets
   - “Assumptions the AI made” collapsible

4. **Suggestions workspace** (split view)
   - Left: categories (existing labels from `TRADE_CATEGORIES`)
   - Center: suggested line items with unit, labor rate, material rate, confidence
   - Right: flags (vague / overlap / missing / risk)

5. **Chat panel** (persistent sidebar or bottom drawer)
   - “Add line for temporary shoring allowance”
   - “Why did you flag MEP overlap?”
   - Model replies with references to digest + suggestions

6. **Review & commit**
   - Checkbox per line / per category / select all
   - **Insert into Estimate Book** → creates `trades` with `pending_review: true` (matches existing apply-template behavior)
   - Optional: copy scope narrative draft to clipboard or save to quote draft

7. **Return to Estimate Book**
   - Estimator edits quantities, rates, subs; existing totals/markup apply

Navigation should feel like **assist → commit → estimate**, not a separate app.

---

## 9. Estimate book integration

**Principles:**

- Reuse existing **Trade** shape and `addTrade_Hybrid` / template-apply patterns (`applyTemplateToEstimate`, `pendingReview`).
- Do **not** bypass estimate totals logic or write directly to `client_quotes` in MVP without explicit user action.
- Prefer **additive insert** (like Apply Template) with clear confirm if estimate already has trades.

**Mapping:**

| Assist suggestion | Estimate Book |
|-------------------|---------------|
| Category | `trades.category` (`TradeCategory` key) |
| Line name | `trades.name` |
| Unit | `trades.unit` (`UnitType`) |
| Labor / material rate | `trades.laborRate`, `trades.materialRate`; costs from qty × rate |
| Group rollup | `trades.group` from `CATEGORY_TO_GROUP` |
| Sub-breakdown | Optional `sub_items` in later phase |
| Template lineage | Metadata: `assist_session_id` or note in `trades.notes` (field exists today) |

**Templates:**

- Load `estimate_templates` by slug or name when user picks archetype.
- AI may **extend** template lines (not in template) but should **prefer** template + item library names for consistency.

---

## 10. Supabase / data model considerations

- **RLS:** New tables must follow org-scoped pattern (`organization_id` + `get_user_organization_uuid()`), same family as `estimates`, `estimate_templates`, `client_quotes` (see `docs/A5C2_C3_ESTIMATES_TRADES.md`).
- **Storage:** Drawing uploads likely reuse or mirror `project_documents` bucket patterns (`docs/STORAGE_SETUP.md`). Consider virus scan / size limits / page caps for cost control.
- **Secrets:** Model calls via Edge Function (pattern: `deal-coach-chat`), never expose API keys client-side for production digest.
- **Idempotency:** Re-run digest on same file version should not duplicate committed trades; session versioning or “commit once per session” guard.
- **No overwrite:** Committing Assist output must not delete user-created trades without explicit “replace estimate” action (non-goal).
- **Migrations:** Phased; MVP may use minimal tables + JSONB artifact before normalizing suggestions.
- **Types:** Extend `src/types/` when implementing; keep parity with `PlanEstimateTemplate` / `Trade` interfaces.

---

## 11. AI responsibilities

The model / pipeline may:

- OCR and summarize drawing sets (with uncertainty when text is illegible)
- Infer likely scopes of work and discipline breakdown
- Propose mapping to HSH **existing** category keys
- Suggest line items, units, and **starter** rates from templates/item library
- Flag vague notes, missing typical scopes for project type, overlapping scope between trades
- Highlight hidden-condition / allowance prompts (not dollar amounts without estimator input)
- Draft scope narrative, exclusions, and clarifications in HSH B2B tone (commercial GC)
- Answer estimator questions in chat grounded in digest + suggestions + project metadata
- Cite sheet references when possible (“Sheet S-2 general notes”)

The model must **not** (by policy and prompt):

- Present output as engineering stamp, code approval, or guaranteed quantities
- Auto-commit trades or send quotes without human confirmation
- Invent subcontractor prices presented as firm quotes
- Replace licensed design professional judgment on structural adequacy

---

## 12. Human estimator responsibilities

The estimator / PM always:

- Validates all quantities and unit costs
- Decides self-perform vs sub, markup, contingency, and bid strategy
- Resolves or dismisses AI flags with documented rationale
- Confirms scope matches contract and drawings (including addenda)
- Owns what is inserted into Estimate Book and what appears on client quotes
- Updates templates and item library rates after subcontractor feedback
- Complies with licensing, insurance, and internal review before send

**Estimate Assist is a draft accelerator, not a bid authorization.**

---

## 13. Risks and limitations

| Risk | Mitigation (planning direction) |
|------|----------------------------------|
| Hallucinated scope or quantities | qty defaults to 0; require explicit entry; show confidence; cite sheets when possible |
| OCR failures on scanned permits | User can paste notes; flag low-confidence pages |
| Cost / token burn on large plan sets | Page limits, async processing, org quotas |
| Liability perception (“AI bid”) | Clear disclaimers in UI; no auto-send; audit trail |
| Stale templates / rates | Show rate source date; never silent overwrite of user edits |
| Double-count with Apply Template + Assist | Single commit path; warn if estimate non-empty |
| Data residency / client confidentiality | Org-scoped storage; retention policy; optional disable per org |
| Model drift | Version prompts; log model id on session |

---

## 14. Open questions

Capture for v2 scoping pass (not locked):

1. **Entry point** — Project tab vs inside Estimate Book vs both?
2. **Drawing types** — PDF only MVP, or images/DWG later?
3. **Single vs multi-session** — One active assist session per project or unlimited reruns?
4. **Commit semantics** — Merge, replace category, or replace entire estimate?
5. **Template binding** — Auto-pick template from `project.type` or user-selected only?
6. **Rate authority** — Template rates vs item library vs historical actuals priority?
7. **Quote handoff** — MVP copy-paste narrative vs direct write to draft `client_quotes`?
8. **Model choice** — Sonnet vs vision-capable model for sheet reading; cost envelope per org.
9. **Human-in-the-loop logging** — Store full chat for training/compliance or ephemeral?
10. **Drywall app** — Shared Supabase spine or GC-only feature first?
11. **Offline / online** — Assist requires online (assumed yes).
12. **Permissions** — Editors only, or viewers can read digest?

---

## 15. Suggested phased roadmap

### Phase 0 — Planning & scoping (current)

- This document
- Lock MVP archetype, non-goals, and success metrics
- Security / legal review for drawing upload + third-party model

### Phase 1 — Foundation (MVP backend shell)

- Storage + `estimate_assist_sessions` minimal schema
- Edge function: accept upload metadata, queue digest job (even if digest is stubbed)
- No Estimate Book write yet

### Phase 2 — Digest + suggest (read-only UI)

- PDF upload UI on one project type
- Model returns digest + category-mapped suggestions + flags (JSON artifact)
- Review UI without chat

### Phase 3 — Chat + commit

- Project-scoped chat with session context
- Selective commit → `trades` with `pending_review`
- Reuse existing Estimate Book review UX

### Phase 4 — Quote language assist

- Draft scope narrative / inclusions / exclusions linked to session
- Handoff to Client Quote Builder (align with `QUOTE_DOCUMENT_PLAN.md` §14.1 or merge)

### Phase 5 — Hardening & expand

- Additional project archetypes + template seeds
- Sheet citations, addendum diff, analytics on flag resolution
- Optional actuals-informed rate hints (read-only suggestions)

---

## 16. Success metrics (when built)

- Time from project create → first complete Estimate Book draft (median)
- % of suggested lines accepted vs edited vs rejected
- Flag resolution rate before quote send
- Estimator satisfaction (qualitative)
- No increase in post-award change orders attributable to scope gaps (long-term)

---

## 17. Next action

When ready to build, open a **dedicated scoping chat** anchored on this doc. Walk open questions in §14 the same way `docs/QUOTE_DOCUMENT_PLAN.md` v1 scoping did. First implementation slice should be **Phase 1–2** only (upload + read-only digest/suggestions), with **no** automatic Estimate Book writes until commit UX is designed.

**Do not implement** until scoping sign-off.
