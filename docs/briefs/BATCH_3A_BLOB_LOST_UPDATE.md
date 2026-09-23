# Brief — Batch 3A: stop the drywall blob silently losing writes

Closes **P0-DATA-1**. Scoped out of Batch 3 on its own because it is the one item in that
batch with a live, reproducible loss path today, and because its smoke test involves a
second actor (the supplier link) that none of the other items need.

Plan: `docs/V1_HARDENING_PLAN_2026-09.md` §1 P0-DATA-1.

---

## 1. The loss

Every drywall stage save is read-modify-write on one JSONB column:

```
loadProjectLegacyForMerge(projectId, orgId)   → prevMeta, prevLegacy
  ...caller merges its own sub-key into prevLegacy...
persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta)
  → UPDATE projects SET metadata = <whole blob>  WHERE id = … AND organization_id = …
```

Nothing between the read and the write checks that the row still looks like what was read.
The client holds the entire `legacy` object and writes all of it back, so a concurrent
change to **any other sub-key** is overwritten, not merged.

**Reproducible today, with no unusual timing:**

1. Operator opens a drywall project's Order page. The page load reads `legacy`.
2. The supplier opens their share link and clicks Confirm. `supplier-order-share` rewrites
   `legacy.orders` with `status: 'confirmed'` and `supplierConfirmedAt`.
3. Operator clicks Save on any stage. Their stale `legacy.orders` goes back up.
4. The confirmation is gone. Both sides saw a success.

Two operator tabs on different stages do the same thing to each other — last save wins for
every sub-key, not just the one being edited.

**Scope note, since the plan predates it:** crew comms are no longer in this blob.
`project_comms` took over in September and `append_drywall_comms_log_entry` was dropped, so
that third loss path in the plan's description is already closed. Twelve projects still
carry a residual `legacy.commsLog`, read by nothing.

## 2. The guard

Optimistic concurrency on `updated_at`. Not a lock — the write simply refuses when the row
has moved underneath it.

**2.1** `loadProjectLegacyForMerge` selects and returns `updated_at` alongside what it
already returns.

**2.2** `persistLegacyMetadata` takes that value and adds it to the WHERE clause:

```ts
.eq('id', projectId)
.eq('organization_id', orgId)
.eq('updated_at', loadedAt)
```

**2.3** On zero rows affected, throw a new typed error — `DrywallProjectStaleError`,
alongside the existing `DrywallProjectPermissionError` — carrying a message the operator can
act on: *"This project changed somewhere else while you were editing. Reload to see the
current version, then reapply your change."*

### Two traps, both of which make the guard a silent no-op

**A. PostgREST does not tell you how many rows an UPDATE touched** unless you ask. A bare
`.update().eq(...)` returns `{ error: null }` whether it matched one row or none — so the
guard would pass every time and the code would look correct. Add `.select('id')` and treat
an empty array as the conflict, or use `{ count: 'exact' }` and test the count. **Verify
this by failing it on purpose** (§5.1) before trusting it.

**B. Do not re-serialize the timestamp.** `updated_at` is `timestamptz`, which Postgres
stores to microseconds; `new Date(x).toISOString()` truncates to milliseconds. Pass the
string exactly as it came back from the select, straight through, untouched. If it is ever
round-tripped through a `Date`, the comparison fails against every row and every save starts
reporting a conflict.

## 3. Where it has to be threaded

Fifteen paired call sites in `drywallProjectsService.ts` follow the shape above — the first
is `L713`/`L731`, the last `L1461`/`L1464`. They are uniform, so this part is mechanical.

Two do **not** use the shared helpers and carry their own copy of the read-modify-write.
They need the same guard written out:

- `updateDrywallProjectInfo` — `L485-539`
- `updateDrywallProjectPoData` — `L2202`

Grep for `.from('projects')` with an `.update(` on `metadata` afterwards to confirm nothing
else writes this column. If a third copy turns up, it needs the guard too — say so rather
than leaving it.

## 4. The supplier edge function

`supabase/functions/supplier-order-share/index.ts:115-153` is both victim and perpetrator: it
reads the whole `metadata`, mutates `legacy.orders`, and writes the whole thing back. An
operator saving at that moment loses the confirmation; the supplier confirming at that moment
loses the operator's edit.

It cannot take the same `updated_at` guard usefully — the supplier has no session to reload
and retry. It should stop read-replacing instead, and write only the path it owns:

```sql
metadata = jsonb_set(metadata, '{legacy,orders}', <new orders array>, true)
```

supabase-js cannot express `jsonb_set` through `.update()`, so this needs a **SECURITY
DEFINER RPC** the function calls — e.g. `supplier_share_set_order_status(p_project_id,
p_order_id, p_supplier_id, p_status, p_stamp_field)` — doing the find-by-id, the ownership
check against `p_supplier_id`, the status transition check, and the `jsonb_set` in one
statement. Keep the existing transition rules exactly: `sent → confirmed` stamping
`supplierConfirmedAt`, `confirmed|partial → complete` stamping `supplierDeliveredAt`, and the
409s when the status does not allow it.

**This function must be redeployed**, and it is the live supplier-facing path. Currently
version 4, deployed 2026-07-24. Deploy after the migration, not before.

## 5. Verification — STOP and report

Cursor-side:

1. `npx tsc --noEmit` clean; `npx vitest run` — **389 passing** before, report after.
2. **Prove the guard actually fires.** Load a project, mutate its `updated_at` directly via
   MCP, then save from the app. It must raise the stale error, not succeed. Do this before
   anything else — it is the test for trap A, and a guard that cannot fail is the most
   likely outcome of this brief.
3. Every one of the 17 sites threads the real loaded value, not `new Date().toISOString()`.
   Grep to show it.
4. Migration applied with `supabase db push`. Edge function redeployed; report the new
   version number.

Operator-side (Mark):

5. **The actual test.** Open a drywall project's Order page. In another browser, open the
   supplier share link and click Confirm. Back on the Order page, click Save. You should get
   the "changed somewhere else" message — **and the supplier's confirmation must still be
   there after you reload.** Before this change, the confirmation vanishes silently.
6. Reload, reapply the edit, save. It succeeds. The guard must not leave you stuck.
7. Ordinary single-operator saving is unaffected across all stages — quote, field
   measurement, order, production. This is the regression risk: the guard sits on the hot
   path of every drywall save, and a false conflict is worse than the bug.
8. The supplier link still confirms and marks delivered, and the order PDF still carries the
   project address and client.

## 6. Out of scope

- P0-DATA-2 through P0-DATA-5 and the P1 items — separate briefs (3B, 3C).
- Moving anything else out of the blob. §7 of the plan owns that.
- Any change to what the stages write. This only guards *when* the write is allowed to land.

## 7. Commit

Exclude, as always: `.claude/settings.local.json`, `supabase/.temp/cli-latest`.
Message drafted by Claude after the verification report.
