# Brief — let crew see job plans

**Goal:** Jeremy opens Lisbon Opportunity Homes in `/crew` and can view the plan set Mark
uploaded on 16 September. Today there is no documents UI in the crew app at all.

Two things ship together because they are the same policy: **scoping** the read (a gap the
September sweep missed) and **granting** it to crew for the right documents.

---

## 1. The rule

> A crew account sees a project document when its `type` is `plan` or `specification`, on a
> project they are assigned to **or** where they are the field foreman.

**Why type.** `project_documents.type` already separates them, and on the drywall side it is
already accurate:

| Job | documents |
|---|---|
| Lisbon Opportunity Homes | 1 `plan` — the set this is for |
| Goodwill Multi | 2 `plan`, 3 `specification` |
| 122 Sherman St | 2 `plan`, 1 `other` |
| 27 West Main St | 1 `other` — a Clayton HVAC quote, correctly withheld |

No re-typing is needed for this to work.

**Why the foreman carve-out is load-bearing.** Jeremy is `is_field_foreman = true` and is
**not** assigned to either Lisbon schedule item. Assignment alone would hide the very plans
this brief exists to show him. `20260911120000_crew_read_scoping.sql` already uses
`user_is_field_foreman() OR crew_is_assigned_to_project(id)` for exactly this reason — follow
it rather than inventing a second shape.

**What stays hidden:** `subcontractor-agreement` (16), `scope-of-work-signoff` (10), `other`
(20). `other` is half layouts and half supplier pricing — Baird Brothers proposals, cabinet
orders, door and window quotes — so it must not be swept in on the grounds that some of it is
drawings.

## 2. Table policy — `project_documents`

Today SELECT is plain org membership:

```sql
FOR SELECT USING (organization_id_uuid = public.get_user_organization_uuid())
```

No crew exclusion. September's crew read-scoping tightened `projects` and `schedule_items`
but never touched this table, so a crew account can already read all 60 documents including
every subcontract agreement. Writes were locked to `user_can_edit()` in
`20260913120000`, so this is read-only exposure — but it is the same class as P0-SEC-2.

Replace with: org member **and** (not pure crew **or** the rule in §1).

Preserve both carve-outs from `crew_read_scoping`, and copy its reasoning:

- `user_can_edit()` — a `['crew','office_drywall']` account is an operator who also holds
  crew. "Pure crew" is what is being scoped, not "holds crew".
- `user_is_field_foreman()` — see above.

## 3. Storage policy — `project-documents`

The bucket is **private** and the app mints a signed URL per fetch, so the table policy alone
does not grant the file. `storage.objects` needs a matching policy or crew get rows they
cannot open.

Path shape, confirmed from a live row:

```
{orgId}/{projectId}/{epochMs}-{filename}
b80516ed-…/9308f22e-…/1789566345686-Source-files-from-2026-09-16_Lisbon-…pdf
```

So `split_part(name, '/', 1)` is the org and `split_part(name, '/', 2)` is the project. The
**type is not in the path**, so the policy function has to resolve the `project_documents`
row by `file_path` to read it.

Follow the field-photos precedent exactly —
`20260529120000_drywall_field_photos_bucket.sql` defines
`user_can_access_drywall_photos(org, for_write)` plus a path-shape check and uses them in
`dfp_auth_select` / `_insert` / `_delete`. Write the document equivalent the same way.

**Do not copy one thing from it.** That migration deliberately granted crew read on *all*
drywall photos in the org, with a comment that a tighter scope was desirable but expensive on
a hot path. A plan set is a bigger thing to leak than a site photo and this path is not hot —
scope it properly.

Writes stay `user_can_edit()`. Crew never upload documents.

## 4. Crew UI

A documents card on the crew job page (`CrewProjectDetailPage`), alongside Scope of work,
Field notes, Materials and Photos.

- Name, type, and open — nothing else. No upload, no delete, no rename.
- Opening goes through a signed URL, same as the operator side.
- Hide the card entirely when the project has no visible documents, the way the other cards
  behave — an empty "Documents" card on every job is noise.
- Mobile first. Jeremy opens this on a phone on site, and a plan set is a large PDF: make the
  tap target obvious and let the device's PDF viewer handle it rather than embedding.

## 5. Also fix

`final windows and doors 27 Main Quote# 14664989.pdf` is typed `plan` but is a supplier
quote. It is on a GC job so it is not reachable by crew today, but step 7 of the schedule
plan puts crew on GC jobs, and a mis-typed pricing document is a bad thing to leave armed.
Re-type it to `other`.

Not in scope: the eight GC layouts sitting in `other` that would want re-typing to `plan`
before crew reach GC jobs. Note it, do not do it.

## 6. Out of scope

- Any upload or edit capability for crew.
- Re-typing the GC `other` bucket (§5).
- Deal documents, quote documents, selection images — different tables and buckets.

## 7. Verification — STOP and report

Cursor-side:
1. `npx tsc --noEmit` clean; `npx vitest run` — 386 passing before, report after.
2. Migration applied with `supabase db push` — not MCP `apply_migration`, not the Dashboard.
3. MCP: confirm both policies are live and that the document policy function exists.
4. MCP, as an operator: all 60 documents still readable. This is the regression risk — the
   new policy must not narrow the office.

Operator-side (Mark):
5. **The actual test:** Jeremy opens Lisbon in `/crew` and can open the plan set.
6. Jeremy does **not** see the Clayton HVAC quote on 27 West Main.
7. A crew member who is not a foreman and not assigned to Lisbon sees no documents there.
8. Operator side unchanged — upload, rename and delete all still work on the Photos & Files
   tab, and every existing document still opens.

## 8. Commit

Exclude, as always: `.claude/settings.local.json`, `supabase/.temp/cli-latest`.
Message drafted by Claude after the verification report.
