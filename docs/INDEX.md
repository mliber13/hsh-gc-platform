# Docs index

Fifty-odd documents accumulated over a year of building. Most describe work that has
already shipped and are kept as the record of *why* a decision was made — the code says
what, not why. This index says which are live.

## Start here

| | |
|---|---|
| [V1_HARDENING_PLAN_2026-09.md](V1_HARDENING_PLAN_2026-09.md) | **The canonical status.** Full audit, seven batches, what shipped and what each batch found. Read the batch-status lines before starting anything. |
| [DRYWALL_DIVISION_OPERATIONS_PLAN.md](DRYWALL_DIVISION_OPERATIONS_PLAN.md) | The division's 29 locked decisions, and the D.1–D.6 build history. |
| [DRYWALL_PROJECT_IA.md](DRYWALL_PROJECT_IA.md) | How the stages inside a drywall project are meant to fit together. Live thinking, not settled. |
| [../CLAUDE.md](../CLAUDE.md) | The shapes that bite, and the conventions. |

## Active

- [SCHEDULE_UNIFICATION_PLAN.md](SCHEDULE_UNIFICATION_PLAN.md) — GC and drywall on one editor. Steps 6 (sub SMS confirmations) and 7 (crew visibility) still open.
- [CREW_TIME_CLOCK_PLAN.md](CREW_TIME_CLOCK_PLAN.md) — piece pay from task progress. Flow C (crew see their own pay) added 2026-09-21, part A buildable now.
- [SCHEDULE_TARGET_MODEL.md](SCHEDULE_TARGET_MODEL.md) · [SCHEDULE_SURFACE_INVENTORY.md](SCHEDULE_SURFACE_INVENTORY.md) — the schedule model, and every surface that touches it.
- [SUPABASE_HEALTH_AUDIT.md](SUPABASE_HEALTH_AUDIT.md) — the 2026-07 audit. Batch A done; `organizations` anon read and definer-fn `search_path` still open.
- [AUDIT.md](AUDIT.md) — read its CHANGELOG; the body is stale.
- [VERSION_1_5_ROADMAP.md](VERSION_1_5_ROADMAP.md) — what comes after v1.

## Ideas, not scoped

[AI_USER_MANUAL_PLAN.md](AI_USER_MANUAL_PLAN.md) · [estimate-assist-v2-planning.md](estimate-assist-v2-planning.md) · [phase-2-real-time-labor.md](phase-2-real-time-labor.md) · [FEATURE_CLEANUP.md](FEATURE_CLEANUP.md)

## Reference

- **Standards** — [DESIGN_LANGUAGE.md](DESIGN_LANGUAGE.md) · [UI_PORT_PLAYBOOK.md](UI_PORT_PLAYBOOK.md) · [RBAC_PLAN.md](RBAC_PLAN.md) · [RBAC_PHASE2_MAPPING.md](RBAC_PHASE2_MAPPING.md)
- **QuickBooks** — [QUICKBOOKS_API_SETUP.md](QUICKBOOKS_API_SETUP.md) · [QBO_CONNECT_PRODUCTION.md](QBO_CONNECT_PRODUCTION.md) · [QBO_INTUIT_COMPLIANCE_CHECKLIST.md](QBO_INTUIT_COMPLIANCE_CHECKLIST.md) · [QBO_DEPLOY_EDGE_FUNCTION_VIA_DASHBOARD.md](QBO_DEPLOY_EDGE_FUNCTION_VIA_DASHBOARD.md) · [LABOR_QBO_BURDEN_PHASE1.md](LABOR_QBO_BURDEN_PHASE1.md)
- **Runbooks** — [STORAGE_SETUP.md](STORAGE_SETUP.md) · [A5E_RUNBOOK.md](A5E_RUNBOOK.md) · [RESTORE_PROJECT_VISIBLE_IN_GC.md](RESTORE_PROJECT_VISIBLE_IN_GC.md) · [DRYWALL_LAUNCH_SMOKE_TEST.md](DRYWALL_LAUNCH_SMOKE_TEST.md)
- **Structure** — [ESTIMATE_AND_ACTUALS_STRUCTURE.md](ESTIMATE_AND_ACTUALS_STRUCTURE.md) · [schedule-items-trace.md](schedule-items-trace.md) · [GC_WORKSPACE_LESSONS.md](GC_WORKSPACE_LESSONS.md)

## Shipped — kept for the reasoning

- **Drywall build** — [DRYWALL_PORT_PLAN.md](DRYWALL_PORT_PLAN.md) · [DRYWALL_D1_IMPLEMENTATION_BRIEFS.md](DRYWALL_D1_IMPLEMENTATION_BRIEFS.md) · [DRYWALL_D2_IMPLEMENTATION_BRIEF.md](DRYWALL_D2_IMPLEMENTATION_BRIEF.md) · [DRYWALL_D4_IMPLEMENTATION_BRIEF.md](DRYWALL_D4_IMPLEMENTATION_BRIEF.md) · [DRYWALL_D6_IMPLEMENTATION_BRIEFS.md](DRYWALL_D6_IMPLEMENTATION_BRIEFS.md) · [DRYWALL_V3_POLISH_BUNDLE.md](DRYWALL_V3_POLISH_BUNDLE.md)
- **Quote** — [QUOTE_STAGE_REDESIGN_PLAN.md](QUOTE_STAGE_REDESIGN_PLAN.md) · [QUOTE_DOCUMENT_PLAN.md](QUOTE_DOCUMENT_PLAN.md) · [QUOTE_V3_PARITY_REPORT.md](QUOTE_V3_PARITY_REPORT.md)
- **HR** — [HR_PORT_PLAN.md](HR_PORT_PLAN.md)
- **The A5 migration** (Supabase move, 2026-04) — [A5_PLAN.md](A5_PLAN.md) · [A5D_PLAN.md](A5D_PLAN.md) · [A5C_BRANCH_VERIFICATION.md](A5C_BRANCH_VERIFICATION.md) · `A5C2_C1`…`C6` · [GAMEPLAN_RETIREMENT.md](GAMEPLAN_RETIREMENT.md)

## briefs/

One per batch or feature, written before the work and updated with what it found. The
hardening ones carry the reasoning behind each call, which is usually the part worth
re-reading: `BATCH_1A`–`1D` (security), `2A` (money), `3A`/`3A_PART2`, `3B`, `3C` (data
safety), plus the `SCHED_UNIFY_*` series, `CREW_JOB_DOCUMENTS`, `LABOR_RATES_MOVE` and
the `DIAG_*` investigations.
