# Schedule items pipeline trace: DB → render

## 1. Flow summary

| Stage | Location | What happens |
|-------|-----------|--------------|
| **DB/schema** | `supabase/migrations/001_initial_schema.sql` (schedules table), `052_schedules_start_end_dates.sql` | One row per project in `schedules`. Column `items` is **JSONB** — array of objects. Each object has `id`, `startDate`, `endDate`, `name`, etc. **One logical item = one element in the array** (one date range). |
| **API fetch** | `src/services/supabaseService.ts`: `fetchScheduleByProjectId`, `parseScheduleItems` | Reads `data.items` (array), maps each element and parses dates to `Date`. Returns `ProjectSchedule` with `items: ScheduleItem[]`. **No expansion** — one item in array → one `ScheduleItem`. |
| **Client types** | `src/types/project.ts`: `ScheduleItem` | Has `id`, `startDate`, `endDate`, `duration`. **One type instance per item** (one range). |
| **Calendar transform** | None | `scheduleItems` is used as-is; no transform that duplicates or expands to per-day. |
| **Render (expansion)** | `src/components/ScheduleBuilder.tsx` (Calendar view) | For **each day cell** we call `getItemsForDay(day)` (filter items overlapping that day) and render **one chip per item** in that cell. So one multi-day item is rendered **once per day** it spans → N DOM elements for N days. |

## 2. Answer: (B)

- **Storage**: One record per item with `startDate` / `endDate` (in `schedules.items` JSONB array). **Not** one row per day.
- **Expansion**: We expand at **render** only. The loop is “for each day → for each item overlapping that day → render a chip”. So the same logical item (same `id`) is drawn in multiple day cells.

## 3. Fix (no schema change)

- **Do not** change the DB or API.
- **Change render**: Stop “per day → per item” chips. For each schedule item, render **one** bar that spans its date range:
  - In the 7-column (week) grid, each item is drawn as **week segments**: one row per week (same 5 weeks as the calendar), 7 cells per row; fill only the cells (columns) where the item spans that week.
  - One item → one stable `id` → one set of segment cells; label (name) only in the first segment (start day).
- **List view**: Unchanged; still one row per item.

## 4. Where the daily expansion happens (exact spots)

- **Function**: `getItemsForDay(day)` in `ScheduleBuilder.tsx` — returns items that overlap `day` (used only for the calendar).
- **Render**: Same file, Calendar view, ~lines 567–606:
  - `weekRows.map(row => row.map(day => { const items = getItemsForDay(day); return ( ... items.slice(0,4).map(item => <div key={item.id}>...) ) }))`
  - So each day cell renders `items.map(item => chip)`. That’s the “one element per day” expansion.

## 5. Date handling

- **Inclusive**: Item spans `[startDate, endDate]` (inclusive). We use `toLocalDate` / `toLocalEndOfDay` so calendar days are local and consistent.

## 6. Fix applied (render only)

- **Removed**: Per-day loop that called `getItemsForDay(day)` and rendered one chip per item in each cell → N DOM elements per N-day item.
- **Added**: One bar per schedule item. For each item we render 5 rows (one per week), 7 cells each; we fill only the cells where the item spans that week (`getItemColsForWeek`). The item name is shown only in the first segment (start day). Stable `key={item.id}` so one logical item = one React key.
- **Util**: `src/lib/scheduleCalendarUtils.ts` exports `toLocalDate`, `toLocalEndOfDay`, `getItemColsForWeek`, `getItemSpanDays` for reuse and testing.
- **Test**: `src/lib/scheduleCalendarUtils.test.ts` — “Architectural Plans” start=2026-03-09 end=2026-03-14 appears once, spans 6 days; run `npm run test`.
