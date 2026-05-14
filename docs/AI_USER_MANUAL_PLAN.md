# AI User Manual & In-App Help Assistant — v0 idea

**Status:** v0 sketch (2026-05-14). Not scoped for build.
**Source:** Owner noted that writing user-facing documentation isn't a natural fit for how they think — operator-style "just do things" rather than explain them. An AI assistant that answers in-app questions, backed by a generated feature manual, removes the doc-authoring burden and gives users a native way to learn the app.

---

## 1. Premise

HSH GC Platform is a wide and growing application — estimates, quotes, schedules, actuals, change orders, selections, forms, projects, deals, contacts, QBO integration, and more. Onboarding new users (HSH staff, brother, subs, future hires) means walking them through each surface. Writing per-feature documentation upfront is high-friction; keeping it up to date as the app evolves is higher-friction still.

The premise: **let AI handle both authoring and answering.** Generate a structured feature manual from the codebase (plus human-curated additions), then expose an in-app chat assistant that answers user questions by referencing the manual.

The owner observed the leverage here: since Claude has full code access, generating the initial manual is largely mechanical. The maintenance loop becomes "regenerate sections that changed" rather than "write paragraphs from scratch."

---

## 2. Sketch

Two-part feature:

### 2.1. The Feature Manual

A markdown corpus describing each feature of the app:

- One file per feature module (estimates, quotes, schedules, actuals, change orders, selections, forms, deals, contacts, etc.)
- Each file contains: what the feature is, primary flows (step-by-step), screen labels and navigation paths, known caveats, related features
- Lives in `docs/manual/` (or similar dedicated subtree, not mixed with planning docs)
- **Initial generation:** a Claude pass reads the codebase and produces draft manual files; owner reviews and edits the drafts
- **Ongoing maintenance:** as features change, regenerate the affected section's draft and human-curate before publishing

### 2.2. The In-App Help Assistant

A chat surface that:

- Accepts natural-language questions ("how do I create a quote?", "what does the Lost project status mean?", "where do I find purchase orders?")
- Reads from the manual as context (system prompt + retrieval)
- Answers with concrete steps, screen labels, and navigation paths

Surface placement options (decide in scoping):
- Floating help button (bottom-right global)
- `/help` route with a fuller conversation view
- Per-page "?" affordance that pre-seeds the question with current page context

**Anchor in existing infra:** Anthropic integration deployed via `supabase/functions/deal-coach-chat/index.ts` (`ANTHROPIC_API_KEY` secret, `claude-sonnet-4-5`). New edge function `help-assistant` follows the same shape.

---

## 3. Why this fits HSH

- Owner's operating style favors doing over documenting. AI as the documentation engine inverts the natural friction.
- The app's breadth means users will routinely hit "how do I…" moments. Self-service answers reduce interruptions to the owner.
- The manual itself becomes valuable beyond the assistant — onboarding doc, sales material, support reference, internal training corpus.

---

## 4. Open questions (capture, refine in scoping)

- **Manual scope at v1** — every feature at launch, or start with the high-traffic ones (projects, estimates, quotes, schedules) and grow?
- **Generation workflow** — one-time Claude pass, continuous regeneration on a schedule, or pull-request-style "doc this PR's changes" workflow.
- **Manual storage** — in the repo next to code (great for versioning + diff review) or in Supabase Storage for the assistant to fetch dynamically?
- **Context delivery** — full manual in the system prompt (size-permitting with prompt caching) vs. RAG with embeddings over chunked manual sections.
- **Surface placement** — global floating help button, in-context per-page hint, dedicated `/help` route, or some combination.
- **Permissions / audience** — staff-only initially, or accessible to external users (subs, vendors, customers) eventually?
- **Multi-org awareness** — generic manual across orgs, or per-org with HSH-specific examples and screenshots?
- **Feedback loop** — let users flag wrong answers / missing topics; pipe back into manual updates.
- **Model choice** — sonnet for general questions; haiku for cheaper short answers when the manual is well-structured.
- **Prompt caching** — system prompt + manual is a strong cache target if the manual stays stable; meaningful cost reduction.
- **Conversation history** — ephemeral per-session, or persistent so the user can refer back to past answers?
- **Hallucination guardrails** — instruct the assistant to refuse / defer when the manual doesn't cover something, rather than guess.

---

## 5. Sizing guess

Larger than the quote scope-of-work v2 idea.

- Initial manual generation tooling + human curation pass: 2-3 sessions
- Edge function (`help-assistant`) + UI chat surface: 2-3 sessions
- Feedback / iteration loop: 1-2 sessions

Total: ~5-8 sessions when properly scoped.

Significantly accelerated if the initial manual generation produces clean output on first pass (depends on code-comment density and how naturally each module's flows translate to step-by-step prose).

---

## 6. Sequencing relative to other work

- **Not blocking anything.** Could land in parallel with the quote scope-of-work v2 (both share the Anthropic-edge-function pattern, so the second build is cheaper).
- **Priority:** medium. Real onboarding friction exists today — brother, future hires, subs being asked to use forms — but workarounds (owner walks people through) currently absorb the cost. The friction grows as the app grows.

---

## 7. Next action

When ready, open a dedicated scoping chat anchored on this doc. Walk the open questions in §4 the same way the quote document's v1 scoping pass did. The likely first build step would be the manual generation pass (no UI work needed yet); the assistant UI lands after enough manual content exists to make the assistant useful.
