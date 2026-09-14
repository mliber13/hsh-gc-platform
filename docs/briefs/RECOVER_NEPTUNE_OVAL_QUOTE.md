# Cursor — restore the 5084 Neptune Oval quote

**Data repair on one live project. No code changes, no migration.**

A "Refresh from v2 snapshot" was run on a **sent** customer quote whose `legacyV2Snapshot` is an empty
husk. The refresh did exactly what it is built to do — rebuilt the quote from that snapshot — and the
snapshot contains nothing, so the quote is now empty. The pre-refresh quote was archived automatically
and needs restoring.

| | |
|---|---|
| Project | **5084 Neptune Oval** |
| Project id | `4faf4eee-aed2-4eea-8536-aad2aac0da06` |
| Quote | `DW-2026-074`, outcome **sent** |
| Expected after restore | **$52,295.95**, one drywall line, `Main Scope`, qty **23327** |
| Why it emptied | Its snapshot has `sqft = ""` and zero breakdowns, so a fresh convert yields 0 lines |

**This is a data fix, not a schema change.** It does not belong in `supabase/migrations` and must not go
through `db push`. The Dashboard SQL editor or an MCP write is correct here — the "never apply outside
`db push`" rule is about DDL and migration history, neither of which is involved.

---

## 1. Confirm the damage before touching anything

```sql
select
  jsonb_array_length(coalesce(metadata->'legacy'->'quote'->'lineItems','[]'::jsonb)) as current_lines,
  metadata->'legacy'->'quote'->>'quoteNumber' as current_quote_number,
  metadata->'legacy'->'quote'->>'outcome' as outcome
from public.projects
where id = '4faf4eee-aed2-4eea-8536-aad2aac0da06';
```

Expect `current_lines = 0`. **If it is not 0, stop and report** — either someone already restored it, or
this is not the damage I think it is, and overwriting would then be the destructive act.

## 2. Find the archives

Refresh may have been clicked more than once. Each click writes its own
`quote_v3_archive_<timestamp>` key, and a second click would archive the *already-empty* quote — so the
newest key is not automatically the right one.

```sql
select k.key,
       p.metadata->'legacy'->k.key->>'quoteNumber' as quote_number,
       p.metadata->'legacy'->k.key->>'outcome'     as outcome,
       jsonb_array_length(coalesce(p.metadata->'legacy'->k.key->'lineItems','[]'::jsonb)) as lines,
       p.metadata->'legacy'->k.key->'lineItems'->0->>'location' as first_location,
       p.metadata->'legacy'->k.key->'lineItems'->0->>'quantity' as first_qty
from public.projects p,
     lateral jsonb_object_keys(p.metadata->'legacy') k(key)
where p.id = '4faf4eee-aed2-4eea-8536-aad2aac0da06'
  and k.key like 'quote_v3_archive_%'
order by k.key desc;
```

**Pick the newest key where `lines > 0`.** It should read `quote_number = DW-2026-074`,
`first_location = Main Scope`, `first_qty = 23327`. Paste the full table into your report before writing.

**If no archive has `lines > 0`, stop and report.** Do not improvise a fix — the quote would then need
rebuilding from the PDF or from Mark's records, which is his call, not a repair.

## 3. Restore

```sql
update public.projects
set metadata = jsonb_set(
      metadata,
      '{legacy,quote}',
      metadata->'legacy'->'<PASTE_THE_KEY_FROM_STEP_2>'
    ),
    updated_at = now()
where id = '4faf4eee-aed2-4eea-8536-aad2aac0da06';
```

`jsonb_set` on that path replaces only `legacy.quote` and leaves every sibling key intact — `fieldTakeoff`,
`orders`, the comms fossil, and all the archive keys. **Do not delete any archive**, including the one you
restore from; they cost nothing and they are the only safety net here.

## 4. Verify

```sql
select
  metadata->'legacy'->'quote'->>'quoteNumber' as quote_number,
  metadata->'legacy'->'quote'->>'outcome'     as outcome,
  jsonb_array_length(coalesce(metadata->'legacy'->'quote'->'lineItems','[]'::jsonb)) as lines,
  metadata->'legacy'->'quote'->'lineItems'->0->>'location' as first_location,
  metadata->'legacy'->'quote'->'lineItems'->0->>'quantity' as first_qty,
  (metadata->'legacy'->'quote'->'legacyV2Snapshot') is not null as snapshot_present
from public.projects
where id = '4faf4eee-aed2-4eea-8536-aad2aac0da06';
```

Expect `DW-2026-074` / `sent` / `1` / `Main Scope` / `23327`, and the snapshot still present.

Then **Mark opens the quote in the app** and confirms it reads **$52,295.95**. That is the real check —
the SQL only proves the JSON is back.

---

## 5. While you are in there — is anything else exposed?

The root cause is that refresh is offered on quotes whose snapshot cannot rebuild them. Tell us how many
others are in that position, so we know whether this is a one-off or a live trap:

```sql
select p.id, p.name,
       p.metadata->'legacy'->'quote'->>'quoteNumber' as quote_number,
       p.metadata->'legacy'->'quote'->>'outcome'     as outcome,
       jsonb_array_length(coalesce(p.metadata->'legacy'->'quote'->'lineItems','[]'::jsonb)) as lines,
       coalesce(p.metadata->'legacy'->'quote'->'legacyV2Snapshot'->>'sqft','') as snapshot_sqft,
       jsonb_array_length(
         coalesce(p.metadata->'legacy'->'quote'->'legacyV2Snapshot'->'breakdowns','[]'::jsonb)
       ) as snapshot_breakdowns
from public.projects p
where p.metadata->'legacy'->'quote'->>'version' = '3'
  and p.metadata->'legacy'->'quote'->'legacyV2Snapshot' is not null
  and coalesce(nullif(p.metadata->'legacy'->'quote'->'legacyV2Snapshot'->>'sqft',''),'0')::numeric <= 0
  and jsonb_array_length(
        coalesce(p.metadata->'legacy'->'quote'->'legacyV2Snapshot'->'breakdowns','[]'::jsonb)
      ) = 0
order by lines desc;
```

Every row is a quote where the Refresh button is visible and would empty it. Report the list; the code
fix to hide the button in that state is separate work.

---

## Report back

1. Step 1 — the current state you found.
2. Step 2 — the full archive table, and which key you chose and why.
3. Step 4 — the verification row.
4. Step 5 — the list of other quotes that would empty if refreshed.
5. Anything that did not match this brief.

**One project, one UPDATE.** If step 1 or step 2 does not look as described, stop and report rather than
adapting — this is a sent customer quote and a wrong write is worse than a delay.
