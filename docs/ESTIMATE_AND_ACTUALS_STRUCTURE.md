# Estimate Breakdown & Project Actuals — Structure

Single reference for how the estimate book and project actuals are modeled in the database and how totals are computed.

---

## 1. Hierarchy

### Estimate breakdown (budget / bid)

```
Project (1) ──► Estimate (1)
                    │
                    └──► Trades (many)
                             │
                             └──► Sub-items (many per trade)
```

- **Project** has one **Estimate** (1:1).
- **Estimate** contains **Trades** (line items by category, e.g. Electrical, Rough Framing).
- Each **Trade** can have **Sub-items** (e.g. Electrical: rough, finish, lighting allowance, fixtures).

### Project actuals (cost tracking)

```
Project (1) ──► Project Actuals (1)
                    │
                    ├──► Labor entries (many)
                    ├──► Material entries (many)
                    └──► Subcontractor entries (many)
```

- **Project** has one **Project Actuals** row (1:1; created when actuals are first used).
- All **entries** belong to that project and to `project_actuals` via `actuals_id`.
- Entries can optionally link to **Trade** and **Sub-item** for job costing and variance.

---

## 2. Tables and roles

| Table | Role |
|-------|------|
| **projects** | Job; holds address, client, dates. One estimate and one project_actuals per project. |
| **estimates** | Estimate container; stores summary totals in `totals` JSONB. |
| **trades** | Estimate line items by trade/category. Quantity, unit, labor/material/sub costs, `total_cost`. Sub-items roll up into trade. |
| **sub_items** | Finer breakdown under a trade (e.g. rough vs allowance). Same cost shape as trade; rolls up to parent trade. |
| **project_actuals** | One row per project; holds rolled-up actual totals (labor_cost, material_cost, subcontractor_cost, total_actual). |
| **labor_entries** | Time/cost entries; optional `trade_id`, `sub_item_id` for line-item costing. |
| **material_entries** | Material/invoice entries; optional `trade_id`, `sub_item_id`; can support split allocations. |
| **subcontractor_entries** | Subcontractor payments; optional `trade_id`, `sub_item_id`. |

---

## 3. Key columns and links

### Estimate side

- **estimates:** `project_id` → projects.id
- **trades:** `estimate_id` → estimates.id; `category` (trade category); `group` (category group for rollup); `total_cost`, `budget_total_cost`; `estimate_status`, `quote_vendor`, `quote_date`, `quote_reference`, `quote_file_url`
- **sub_items:** `trade_id` → trades.id, `estimate_id` → estimates.id; same cost columns as trades; `sort_order`; `estimate_status`, quote fields

### Actuals side

- **project_actuals:** `project_id` → projects.id; `labor_cost`, `material_cost`, `subcontractor_cost`, `total_actual`
- **labor_entries:** `project_id`, `actuals_id` → project_actuals.id; `trade_id`, `sub_item_id` (optional); `category`, `date`, `hours`, `hourly_rate`, `amount`
- **material_entries:** `project_id`, `actuals_id`; `trade_id`, `sub_item_id` (optional); `category`, `date`, quantity/unit_cost/`amount`, `vendor`, `invoice_number`; `qb_transaction_id`, `qb_transaction_type`; split fields (`is_split_entry`, `split_parent_id`, `split_allocation`)
- **subcontractor_entries:** `project_id`, `actuals_id`; `trade_id`, `sub_item_id` (optional); `category`, `date`, `amount`, `subcontractor_name`, `invoice_number`; `qb_transaction_id`, `qb_transaction_type`

### Cross-cutting

- **category** on trades and entries: trade category (e.g. electrical, rough-framing).
- **group** on trades and entries: high-level group (admin, exterior, structure, mep, interior, other) for rollup and reporting.

---

## 4. Where totals are computed

**Estimate totals**

- **Trade total:** From that trade’s own cost columns plus the sum of its sub_items’ `total_cost`. Stored on the trade as `total_cost` (and `budget_total_cost` when quote overwrites).
- **Estimate total:** Sum of all trades’ `total_cost` (and overhead/contingency/margin as configured). Summary values can be stored in `estimates.totals` JSONB; the source of truth for line-item amounts is trades and sub_items.

**Project actuals totals**

- **Entry amounts:** Each labor entry has `amount` (e.g. hours × rate); each material and subcontractor entry has `amount`. These are the source of truth for actual cost.
- **Project actuals row:** `labor_cost`, `material_cost`, `subcontractor_cost`, and `total_actual` are derived from the sum of the corresponding entry types for that project (computed in the app or in services when loading/saving actuals). The entry tables are the source of truth; project_actuals holds the rolled-up totals for display and comparison to estimate.

**Variance / job costing**

- Estimate vs actual by trade/sub-item is done by joining entries to trades and sub_items via `trade_id` and `sub_item_id` and comparing entry totals to estimate line `total_cost` (or `budget_total_cost` where relevant).

---

## 5. Schema sources (migrations)

- **001_initial_schema.sql** — projects, estimates, trades, project_actuals, labor_entries, material_entries, subcontractor_entries (base columns).
- **004_add_category_groups.sql** — `group` on trades and actuals entries.
- **005_add_estimate_status_tracking.sql** — `estimate_status`, quote_* on trades.
- **021_create_sub_items.sql** — sub_items table; `sub_item_id` and material split fields on actuals entries.
- **039_trades_budget_total_cost.sql** — `budget_total_cost` on trades.
- **040_qb_import_tracking.sql** — `qb_project_id`/`qb_project_name` on projects; `qb_transaction_id`/`qb_transaction_type` on material_entries and subcontractor_entries.

App types and constants: **src/types/project.ts** (Estimate, Trade, SubItem, etc.); **src/types/constants.ts** (TradeCategory, CategoryGroup).
