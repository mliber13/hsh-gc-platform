# Brief — Batch 3A part 2: guard against the timestamp the page actually loaded

Finishes **P0-DATA-1**. Part 1 (`2fdfbd1`) fixed the supplier direction and built the guard
machinery; it did not close the bug. Read part 1's commit message before starting — it
explains exactly what is already in place.

---

## 1. Why part 1 was not enough

`loadProjectLegacyForMerge` runs **inside** each service function, a few milliseconds before
the write. So the `updated_at` it compares is read *at save time* and already contains any
concurrent change:

```
10:00  Operator's Order page loads; `orders` goes into React state
10:05  Supplier confirms  → legacy.orders changes, updated_at bumps
10:07  Operator clicks Save
         loadProjectLegacyForMerge reads updated_at NOW (post-supplier)
         .eq('updated_at', thatValue) matches
         write lands — confirmation overwritten
```

Current-against-current always matches. The guard catches only a race inside one function
call.

And the loss is not really blob-level. **The client owns the whole array.**
`OrderPage.tsx:150` passes `{ orders, changeOrders }` from React state held since page load,
and `saveOrderStageSnapshot` (`drywallProjectsService.ts:1424`) writes that array wholesale.
The fresh `prevLegacy` read is used to preserve change-order workflow fields — deliberately,
see `workflowFields` — but nothing does that for `orders`.

## 2. The fix

The comparison value must be **the `updated_at` the page held when it loaded the data the
operator is editing**, not one the service re-reads.

**2.1 Carry the raw string to the page.** `mapDrywallProjectRow` (`:326`) does
`updatedAt: new Date(row.updated_at)`. A `Date` truncates the microseconds Postgres stores,
so it cannot be used for the comparison — this is trap B from part 1, and reusing
`project.updatedAt` here is the most likely way to get this wrong. Add a separate raw field
(`updatedAtRaw: string`) carrying `row.updated_at` untouched. Leave the existing `Date` alone;
display code uses it.

**2.2 Pass it in.** Every blob-writing service function that a page calls takes the
page-held value as an explicit argument, and guards on that instead of on its own fresh read.
`loadProjectLegacyForMerge` keeps reading `prevLegacy` — the merge still needs current server
state — it just stops being the source of the guard value.

**2.3 Return the new value.** Each write already asks for rows back; make it
`.select('id, updated_at')` and return the new string.

**2.4 The page advances its held value** on every successful save.

## 3. The trap that will break this: sequential writes in one handler

Several handlers write twice. With a page-held timestamp the **second** call false-conflicts,
because the first one just bumped the row:

| Where | Calls |
|---|---|
| `QuoteStage.tsx:131-132` | `saveDrywallQuote` then `saveDrywallQuoteCalculations` |
| `QuoteStage.tsx:191-192` | the same pair again |
| `FieldMeasurementPage.tsx:159,162` | `saveFieldTakeoff` then `updateDrywallProjectInfo` (address changed) |
| `FieldMeasurementPage.tsx:239,247` | `recordBelowFloorApproval` then `advanceToOrder` |
| `ProjectInfoPage.tsx:148,166` | `updateDrywallProjectInfo` then `saveFieldTakeoffSiteInfo` |
| `updateDrywallProjectPoData` | persist, then its own column-only update at `:2135` |

This is what §2.3 exists for: thread the returned value from the first call into the second.
Do not work around it by re-reading, which puts the hole straight back.

**Every one of these paths must be exercised.** A false conflict on an ordinary save is worse
than the bug this closes — the operator is blocked from saving work that is not in conflict
with anything.

## 4. Judgment call to make and state

`projects` carries a `BEFORE UPDATE` trigger (`update_projects_updated_at`,
`001_initial_schema.sql:631`), so **any** write to the row bumps `updated_at` — including a
status-pill change from the list page and the column-only PO update, neither of which touches
`legacy`.

So the guard will sometimes fire when nothing the operator cares about changed. That is the
right trade — the row did change, the message says reload, and no data is lost — but it is a
deliberate choice, not an accident. Take it, and say in the PR that you did. Do **not** try to
get clever with per-sub-key hashing; that is a much larger change and §7 of the plan has a
better answer (get things out of the blob).

## 5. Verification — STOP and report

Cursor-side:

1. `npx tsc --noEmit` clean; `npx vitest run` — **389 passing** before, report after.
2. **Prove the real scenario now fails.** Load a project through the service the way a page
   does and keep its `updatedAtRaw`. Change the row out of band (MCP, or better: call
   `supplier_share_set_order_status`). Then save using the *held* value. It must raise
   `DrywallProjectStaleError`. Part 1's guard passes this scenario today — that is the
   regression this brief exists to fix, so run it before and after.
3. Grep to show no save path derives its guard value from `new Date(...)` or from a fresh
   read at write time.
4. Walk each row of §3 and state how the second write gets its timestamp.

Operator-side (Mark):

5. **The actual test, which failed before.** Open a drywall project's Order page. In another
   browser, open the supplier share link and Confirm. Back on the Order page, Save →
   "changed somewhere else" message, **and after reload the supplier's confirmation is still
   there.**
6. Reload, reapply, save — succeeds. The guard must not strand you.
7. **Every stage saves normally twice in a row without reloading.** Quote, field measurement,
   project info, order, production. Save, edit, save again. The second save must work. This
   is the §3 regression and the thing most likely to be broken.
8. Two browser tabs on different stages of the same job: the second one to save gets the
   message rather than silently winning.

## 6. Out of scope

- 3B and 3C items.
- Moving anything out of the blob (plan §7).
- The GC project editor (`supabaseService.updateProjectInDB`) — different surface, not part
  of P0-DATA-1.

## 7. Commit

Exclude, as always: `.claude/settings.local.json`, `supabase/.temp/cli-latest`.
Message drafted by Claude after the verification report.
