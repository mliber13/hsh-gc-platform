# Cursor — read-only diagnosis: crew materials + photo uploads

**No code changes. No migrations. Read-only queries and a report.** I have no database access, which is
why the last two weeks produced conclusions drawn from migration files instead of from the data. Please
just run these and paste the results.

Context: a Laborer (Shane Plats) reported he could not see the material list on a job. The
`share_material_list` toggle was on for his schedule item and the material was on the order. Separately,
Jeremy could not upload photos as of ~Sep 13.

---

## 1. Every crew account's resolved specialty — the one that matters most

This mirrors `specialtyFromPositionName` (`src/lib/drywall/crewSpecialty.ts`) exactly: plain substring
match on the HR position name. Anyone landing on `unknown` gets an empty Materials card and blanked pay,
silently. I expect Shane to be one; I want to know who else is.

```sql
with team as (select payload from public.org_team limit 1),
members as (
  select m->>'id' as member_id, m->>'name' as member_name, m->>'positionId' as position_id
  from team, jsonb_array_elements(payload->'employees') m
  union all
  select m->>'id', m->>'name', m->>'positionId'
  from team, jsonb_array_elements(payload->'contractors1099') m
),
positions as (
  select p->>'id' as position_id, p->>'name' as position_name
  from team, jsonb_array_elements(payload->'positions') p
)
select p.email,
       coalesce(nullif(p.linked_employee_id,''), nullif(p.linked_contractor_id,'')) as linked_id,
       mem.member_name,
       pos.position_name,
       case
         when mem.member_id is null then 'ORPHAN LINK'
         when pos.position_name is null then 'unknown (no position set)'
         when lower(pos.position_name) like '%measure%' then 'measurer'
         when lower(pos.position_name) like '%hang%' and lower(pos.position_name) like '%finish%' then 'both'
         when lower(pos.position_name) like '%hang%' then 'hanger'
         when lower(pos.position_name) like '%finish%' then 'finisher'
         else 'unknown'
       end as derived_specialty,
       p.is_active
from public.profiles p
left join members mem
  on mem.member_id = coalesce(nullif(p.linked_employee_id,''), nullif(p.linked_contractor_id,''))
left join positions pos on pos.position_id = mem.position_id
where 'crew' = any(p.roles)
order by derived_specialty, p.email;
```

**`ORPHAN LINK` is the serious row** — a crew profile pointing at a team member that no longer exists.
That is `P1-HR-2` and it blanks materials, pay and assignments at once.

---

## 2. Shane's assignments and the share toggle

Take his `linked_id` from query 1.

```sql
select si.id, pr.name as project, si.name as item, si.type, si.start_date,
       si.share_material_list, si.assigned_persons, si.show_job_info_person_ids
from public.schedule_items si
join public.projects pr on pr.id = si.project_id
where si.assigned_persons && array['<shane_linked_id>']::text[]
order by si.start_date desc
limit 20;
```

I want to see `share_material_list` per item and confirm his id is actually in `assigned_persons` on the
"Delivery and Prep" item, rather than a different id that happens to look similar.

---

## 3. The two material lists on that project

This is the direct test of my diagnosis. The crew Materials card read `fieldTakeoff.accessories`; the
delivery material was on `orders`. If `takeoff_accessory_rows` is 0 while `order_line_count` is not,
that confirms it — and it means the toggle could never have worked, because
`resolveMaterials` returns `[]` on an empty takeoff regardless of the toggle.

```sql
select pr.name,
       jsonb_array_length(coalesce(pr.metadata->'legacy'->'fieldTakeoff'->'accessories','[]'::jsonb))
         as takeoff_accessory_rows,
       jsonb_array_length(coalesce(pr.metadata->'legacy'->'orders','[]'::jsonb)) as order_count,
       (select coalesce(sum(jsonb_array_length(coalesce(o->'items','[]'::jsonb))), 0)
          from jsonb_array_elements(coalesce(pr.metadata->'legacy'->'orders','[]'::jsonb)) o)
         as order_line_count
from public.projects pr
where pr.id = '<project_id_from_query_2>';
```

---

## 4. Jeremy and the photo policies

```sql
-- Should now be THREE terms (bucket, org, path) — the fourth was removed by 20260914120000.
select polname, polcmd, pg_get_expr(polqual, polrelid) as using_expr,
       pg_get_expr(polwithcheck, polrelid) as check_expr
from pg_policy
where polrelid = 'storage.objects'::regclass
  and polname in ('dfp_auth_insert','dfp_auth_delete');

-- Did anything land after the fix? Substitute Jeremy's auth user id if you can resolve it.
select name, created_at, owner
from storage.objects
where bucket_id = 'drywall-field-photos'
order by created_at desc
limit 20;
```

If uploads resumed after `20260914120000` was applied, that closes it. If not, I need the error he sees.

---

## 5. One sanity check on my own work

`20260911120000` made `crew_is_assigned_to_project` load-bearing for reads. Confirm nobody is broken by
an empty-string link:

```sql
select id, email, linked_employee_id, linked_contractor_id
from public.profiles
where linked_employee_id = '' or linked_contractor_id = '';
```

Expected: zero rows (it was zero when 1B was applied). If that changed, say so — those people are seeing
an empty app.

---

## Report back

1. Query 1 in full — especially every `unknown` and every `ORPHAN LINK`.
2. Shane's rows from query 2, with `share_material_list` per item.
3. Query 3's four numbers.
4. The two photo policies as they stand now, and whether uploads resumed.
5. Query 5.
6. Anything that contradicts what this brief assumes. I have been wrong repeatedly about this data by
   reading migration files instead of querying, so treat my framing as a hypothesis, not context.

**Do not change anything.** If something looks broken, report it and stop.
