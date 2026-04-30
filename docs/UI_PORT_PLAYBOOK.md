# UI Port Playbook

**Purpose:** durable recipe for porting a legacy page to the v0/DESIGN_LANGUAGE design.
**Audience:** Cursor (or any agent) working a page port autonomously.
**Reference:** see `docs/DESIGN_LANGUAGE.md` for full design spec; this playbook is the mechanical "how."

Three pages have already been ported and serve as reference patterns:

| Page | File | What it demonstrates |
|---|---|---|
| Dashboard | `src/components/ProjectsDashboard.tsx` + `src/components/dashboard/ProjectCard.tsx` | List page with search/filter, summary cards, status pills on rows |
| Project Detail | `src/components/ProjectDetailView.tsx` | Detail page with hero info card, financial cards, action grid, dropdown menu, edit modal |
| Estimate Builder | `src/components/EstimateBuilder.tsx` | Dense data table page with section headers + multi-card stat strip |

When in doubt, study these three files for patterns before inventing your own.

---

## Pre-flight

Before touching a page:

1. **Read the existing file end-to-end.** Note: useEffect data loaders, callback prop interface, modal/dialog inline definitions, mobile-vs-desktop branches, status color helpers.
2. **Identify what NOT to touch:** all data fetching, callbacks, sort/filter logic, calculation helpers, embedded sub-components (`WorkPackagesSection`, etc.). View layer only.
3. **Check the route layer:** `src/routes/index.tsx` has the wrapper — confirm the route already passes the right props.
4. **Note any hardcoded hex colors and shadow-lg/shadow-md patterns** — those are the sweep targets.

---

## The Recipe (in order)

### 1. Add page title

At the top of the component body (after state declarations):

```tsx
import { usePageTitle } from '@/contexts/PageTitleContext'

// inside component
usePageTitle('Page Name')
```

The title appears centered in the AppHeader. Use static names ("Forms", "Documents", "Plan Library") or dynamic for entity-scoped pages (`usePageTitle(project.name)`).

### 2. Drop the hero header

Look for and **delete entirely**:

- `<header className="bg-white shadow-md border-b border-gray-200">...</header>`
- HSH logo `<img src={hshLogo}.../>` blocks
- Any centered "Page Title + back button + 3-colored-buttons" row at the top
- The `import hshLogo from '/HSH Contractor Logo - Color.png'` line (will be unused)

Reason: AppHeader handles branding (sidebar) + title (centered) + workspace switcher. The page never needs its own visual top.

### 3. Drop the mobile bottom action bar

Look for and **delete entirely**:

- `<div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t...">...</div>`
- `showMobileActions` state and `setShowMobileActions` setter

Reason: the sidebar handles mobile nav via off-canvas sheet. Bottom bar is redundant.

### 4. Replace the outer wrapper

```tsx
// Before:
<div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pb-20 sm:pb-0">
  <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
    ...
  </main>
</div>

// After:
<div className="flex flex-col gap-6 p-6">
  ...
</div>
```

The shell already provides `bg-background` and the SidebarInset handles widths. No `min-h-screen`, no `max-w-7xl mx-auto`, no `pb-20`.

### 5. Optional top action strip

If the page needs a back link or action menu, add ONLY at the top of the new content area:

```tsx
<div className="flex items-center justify-between">
  <button
    onClick={onBack}
    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
  >
    <ArrowLeft className="size-4" />
    Back to {context}
  </button>
  {/* Optional: Actions dropdown on the right (Edit / Duplicate / Delete) */}
</div>
```

For Edit/Delete/Duplicate menus, see `ProjectDetailView.tsx` (uses `<DropdownMenu>` with `MoreHorizontal` trigger).

### 6. Sweep hardcoded colors → tokens (apply globally)

This is the bulk of the work. Use find-and-replace where safe.

**Hex color mapping:**

| Old hex | What it was | New token / utility |
|---|---|---|
| `#0E79C9` | Brand blue | `bg-primary` (button) or `text-sky-600 dark:text-sky-400` (currency) |
| `#0A5A96` | Hover blue | drop, default Button hover handles it |
| `#D95C00` | Brand orange | `bg-amber-500` (rail) or drop on buttons |
| `#C04F00` | Hover orange | drop |
| `#34AB8A` | Brand green | `bg-emerald-500` (rail) or `text-emerald-600 dark:text-emerald-400` (currency) |
| `#213069` | Brand navy | `bg-muted` or `text-foreground` |
| `#E65133`, `#C0392B` | Red-orange gradient | drop, default Button |
| `#6D28D9`, `#5B21B6` | Purple | drop, use violet token only for dark sidebar primary |
| `#7C3AED` | Violet | `bg-violet-500/15 text-violet-500` for pills |
| `#15803D`, `#22C55E` | Green | `bg-emerald-500` |

**Tailwind utility mapping (sweep file-wide):**

| Old | New |
|---|---|
| `bg-white shadow-lg` / `bg-white shadow-md` | `bg-card border-border/60` |
| `bg-white` (card surface) | `bg-card` |
| `bg-gray-50` | `bg-muted/30` |
| `bg-gray-100` | `bg-muted/40` |
| `border-gray-200` / `border-gray-300` | `border-border/60` |
| `text-gray-900` | `text-foreground` |
| `text-gray-700` | `text-foreground` |
| `text-gray-600` / `text-gray-500` | `text-muted-foreground` |
| `text-gray-400` | `text-muted-foreground` (or `/60` for fainter) |
| `bg-emerald-50` / `bg-blue-50` / `bg-amber-50` (row tints) | `bg-muted/20` (or drop entirely) |
| `bg-blue-50/40` (sub-row tint) | `bg-muted/10` |
| `border-l-blue-200` etc. | `border-l-border` |
| `bg-gradient-to-r from-X to-Y` (buttons) | drop, use default `<Button>` |
| `bg-gradient-to-br from-gray-50 to-gray-100` (page bg) | drop, shell handles it |

### 7. Status pills — the v0 recipe

Use these exact mappings for project/deal/tenant/trade statuses:

| Status | bg | text | border | dot |
|---|---|---|---|---|
| `estimating` | `bg-violet-500/15` | `text-violet-500` | `border-violet-500/30` | `bg-violet-500` |
| `bidding` | `bg-amber-500/15` | `text-amber-500` | `border-amber-500/30` | `bg-amber-500` |
| `awarded` / `complete` | `bg-sky-500/15` | `text-sky-500` | `border-sky-500/30` | `bg-sky-500` |
| `in-progress` | `bg-emerald-500/15` | `text-emerald-500` | `border-emerald-500/30` | `bg-emerald-500` |
| `on-hold` (if exists) | `bg-amber-500/15` | `text-amber-500` | `border-amber-500/30` | `bg-amber-500` |
| (default) | `bg-muted` | `text-muted-foreground` | `border-border` | `bg-muted-foreground` |

Render shape:

```tsx
<span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium {bg} {text} {border}">
  <span className="size-1.5 rounded-full {dot}" />
  {Label}
</span>
```

Reference: `src/components/dashboard/ProjectCard.tsx` `statusVisual()` function.

### 8. Currency colors (consistent across the app)

| Type | Class |
|---|---|
| Base / planned cost | `text-sky-600 dark:text-sky-400` |
| Estimated total | `text-foreground` (neutral) or `text-violet-600 dark:text-violet-400` (when emphasizing) |
| Actual / spent (when > 0) | `text-emerald-600 dark:text-emerald-400` |
| Actual (when 0) | `text-muted-foreground` |
| Total / final / highlighted | `text-rose-600 dark:text-rose-400` |
| Material | `text-sky-600/80 dark:text-sky-400/80` |
| Labor | `text-amber-600/80 dark:text-amber-400/80` |
| Subcontractor | `text-teal-600/80 dark:text-teal-400/80` |
| Gross profit | `text-emerald-600 dark:text-emerald-400` |

Pair with `tabular-nums` on the `<p>` for aligned digits.

### 9. Buttons — drop the custom color overrides

```tsx
// Before:
<Button
  variant="outline"
  size="sm"
  className="border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white"
>...</Button>

// After:
<Button variant="outline" size="sm">...</Button>
```

Default Button styling already handles hover. Drop the `border-X / text-X / hover:bg-X / hover:text-white` overrides entirely.

For destructive actions, use `variant="outline"` with `className="text-destructive hover:text-destructive"` OR `variant="destructive"` for filled red.

### 10. Inline custom dropdowns → DropdownMenu primitive

If the page has a hand-rolled `<div className="absolute right-0 top-full mt-2 bg-white border border-gray-300 rounded-lg shadow-lg">...` dropdown, replace with:

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline" size="sm">Action</Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onClick={...}>Item 1</DropdownMenuItem>
    <DropdownMenuItem onClick={...}>Item 2</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem onClick={...} className="text-destructive">Destructive</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### 11. Section headers (for section-card-card-card patterns)

```tsx
// Before (Card-wrapped section title):
<Card>
  <CardHeader>
    <CardTitle>Section Name</CardTitle>
  </CardHeader>
  <CardContent>...</CardContent>
</Card>

// After (section header + content as siblings):
<section className="space-y-4">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <h2 className="text-lg font-semibold">Section Name</h2>
    <div className="flex flex-wrap items-center gap-2">
      {/* action buttons */}
    </div>
  </div>
  <div>{/* content */}</div>
</section>
```

### 12. Stat / summary cards (v0 5-card pattern with rail accents)

```tsx
<div className="grid grid-cols-2 gap-4 md:grid-cols-N">
  {stats.map((stat) => (
    <Card key={stat.label} className="relative overflow-hidden border-border/60 bg-card/50">
      <div className={cn('absolute inset-y-0 left-0 w-1', stat.rail)} aria-hidden />
      <CardContent className="p-4 pl-5">
        <p className="mb-1 text-xs text-muted-foreground">{stat.label}</p>
        <p className="text-xl font-semibold tabular-nums">{stat.value}</p>
      </CardContent>
    </Card>
  ))}
</div>
```

Rails: `bg-sky-500`, `bg-amber-500`, `bg-emerald-500`, `bg-violet-500`, `bg-rose-500`. Highlighted "total" card adds `bg-card border-border` (instead of `bg-card/50`) and tints the value with the rail's matching text class.

### 13. Modal / dialog chrome

```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
  <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border-border bg-card">
    <CardHeader>
      <CardTitle>Title</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      ...form fields...
      <div className="flex gap-2 pt-4">
        <Button onClick={handleSave} className="flex-1">Save</Button>
        <Button onClick={onCancel} variant="outline" className="flex-1">Cancel</Button>
      </div>
    </CardContent>
  </Card>
</div>
```

Drop any `bg-gradient-to-r` from the Save button. Default Button handles primary styling.

### 14. Empty states + loading states

```tsx
// Empty:
<Card className="border-border/60 bg-card/50">
  <CardContent className="py-12 text-center">
    <Icon className="mx-auto mb-3 size-12 text-muted-foreground/50" />
    <p className="font-medium">No {entity} yet</p>
    <p className="mt-1 text-sm text-muted-foreground">Helpful nudge text</p>
    {canCreate && (
      <Button onClick={onCreate} size="sm" className="mt-4">
        <PlusCircle className="size-4" />
        Create {entity}
      </Button>
    )}
  </CardContent>
</Card>

// Loading:
<Card className="border-border/60 bg-card/50">
  <CardContent className="py-12 text-center">
    <div className="mx-auto inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
    <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
  </CardContent>
</Card>
```

### 15. Tables (when present)

```tsx
<div className="rounded-lg border border-border/60 bg-card/50">
  <div className="overflow-x-auto">
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border/60 bg-muted/30 text-xs font-medium text-muted-foreground">
          <th className="p-2 text-left border-r border-border/60">Column</th>
          ...
        </tr>
      </thead>
      <tbody>
        <tr className="bg-card transition-colors hover:bg-muted/20">
          <td className="p-2 border-b border-r border-border/60">...</td>
          ...
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

For collapsible category/group rows, use a rotating `<ChevronRight className={cn('size-4 transition-transform', isOpen && 'rotate-90')} />` instead of swapping ChevronDown/ChevronUp.

For colored-group column headers (Material/Labor/Subcontractor pattern), use a colored dot indicator instead of a heavy colored background:

```tsx
<th className="..." colSpan={2}>
  <span className="inline-flex items-center gap-1.5">
    <span className="size-2 rounded-full bg-sky-500" />
    Material
  </span>
</th>
```

### 15.5 Table cell coloring — colored TEXT, not colored BACKGROUND

**Critical pattern learned from Project Actuals alignment.** When a column needs to be visually associated with a category color (Material→sky, Labor→amber, Subcontractor→teal), color the **text**, never the cell background.

```tsx
// ❌ Wrong — cell background tint, neutral text:
<td className="p-2 text-center border-b border-r border-border/60 bg-sky-500/10">
  {formatCurrency(value)}
</td>

// ✅ Right — colored text, transparent cell:
<td className="p-2 text-center border-b border-r border-border/60 tabular-nums text-sky-600 dark:text-sky-400">
  {formatCurrency(value)}
</td>
```

The bg-tinted approach makes cells look heavy and "containerized." The colored-text approach reads cleaner and lets the eye scan column → column quickly. Always pair with `tabular-nums` so digits align across rows.

**Sub-item / nested rows** use lighter opacity to indicate depth:

```tsx
<td className="p-2 text-center border-b border-r border-border/60 text-sm tabular-nums text-sky-600/80 dark:text-sky-400/80">
  {formatCurrency(value)}
</td>
```

**Exception — semantic background tints stay.** A whole-row tint that signals "this row is special" (e.g., uncategorized "Other / General" amber-tinted row, conditional variance highlighting like rose for over-budget) is legitimate. Don't sweep those.

### 15.6 Table cell font-weight conventions

| Row type | Class | Weight |
|---|---|---|
| Category aggregate rows | `font-medium` | 500 |
| Trade rows | (default) | 400 |
| Sub-item rows | `text-sm` (no weight) | 400 |
| Highlighted "grand total" cell | `font-semibold` | 600 |

**Never use `font-semibold` (600) on category aggregate cells** — it makes them too bold compared to Estimate Book's pattern. Use `font-medium` (500) instead. The visual cue for "this is an aggregate row" comes from `bg-muted/30` row background, not bold text.

### 15.7 Inline count badge instead of stacked button

When a cell needs a "view N entries" affordance (clickable detail), don't stack a button below the value — that pushes cell height to ~45px when entries exist. Use an inline count badge instead — keeps cells single-line at ~37px.

```tsx
// ❌ Stacks button below, makes cell tall:
<td className="...">
  <div className="flex flex-col items-center gap-0.5">
    <span>{formatCurrency(value)}</span>
    {entries.length > 0 && (
      <Button size="sm" variant="ghost" className="h-6 px-1 text-xs" onClick={...}>
        <List className="w-3 h-3 mr-0.5 inline" /> View ({entries.length})
      </Button>
    )}
  </div>
</td>

// ✅ Inline badge, single-line:
<td className="...">
  {formatCurrency(value)}
  {entries.length > 0 && (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); openDialog(...) }}
      className="ml-1.5 text-xs font-normal text-muted-foreground hover:text-foreground transition-colors"
      title={`View ${entries.length} entries`}
    >
      · {entries.length}
    </button>
  )}
</td>
```

Renders as: `$1,739.82 · 5` where the count is a click-target.

### 16. Form inputs

The `<Input>`, `<Select>`, `<Label>`, `<Textarea>` primitives already render with tokens. Don't override their styling. Just use them.

For form sections that previously used `<Label className="text-[#E65133]">`, drop the className — Label is already correctly styled.

---

## Common Pitfalls (caught during reference ports)

1. **Duplicate icon imports.** When you add a new icon, check the existing lucide-react import block first — most icons are already imported.
2. **Unused imports after sweep.** After dropping the hero header, `hshLogo` and sometimes other icons are no longer referenced. Either delete the import or accept the warning (TypeScript with default config doesn't error on unused imports).
3. **Mismatched div counts.** If you remove wrapper divs, count opening + closing carefully. Run tsc; React + JSX-aware errors will catch unbalanced tags.
4. **`showMobileActions` leftover.** When you delete the mobile bottom bar, also delete the `showMobileActions` state declaration.
5. **`onSave={undefined}` / unused props.** Routes still pass `onViewForms`, `onViewPOs`, etc. even if the page no longer uses them. Don't remove the props from the interface; just don't reference them in the body. TypeScript is fine with this.
6. **Tailwind config plugin changes need dev restart.** Pure component changes are HMR-friendly.
7. **`Mode B` ambiguity:** if you encounter a complex layout decision (e.g., what color rail belongs to a custom status), STOP and ask the human rather than guess. The status color recipe in §7 covers all known statuses; if a new one appears, escalate.
8. **`replace_all` trailing-space gotcha.** When swapping a class with surrounding context — e.g., `<td className="p-3 ` → `<td className="p-2` — *include the trailing space in the new string* (`<td className="p-2 `). Otherwise the next class on the line gets jammed: `p-3 text-center` becomes `p-2text-center` which is one invalid class instead of two valid ones, and Tailwind silently drops it. After any `replace_all` sweep, grep the file for `p-2[a-z]` / `p-3[a-z]` / `bg-[a-z]+-[0-9]+/[0-9]+/[0-9]+` (chained slashes) style mashups.
9. **Parallel-edit race condition.** If `npx tsc --noEmit` fails on a file you didn't touch, run `git status` first. Another agent or the human may be mid-edit — the errors are likely intermediate states, not real bugs. Report the errors + the dirty file list and stop. Don't try to "fix" unrelated files.
10. **Don't blindly sweep semantic background tints.** Some `bg-X-500/10` cells are intentional row markers (uncategorized "Other / General" amber row, partial-CO yellow indicator, over-budget rose conditional). Distinguish: column-coloring tints (sweep to text colors per §15.5), row-marker tints (keep). Pattern: column tints appear in cells across many rows uniformly; row-marker tints span a whole row or vary conditionally on data.
11. **Section header tag matters.** Use `<h2 className="text-lg font-semibold">` (~18px) for section headers — never `<CardTitle>` (which renders ~24px and is reserved for actual Card titles). The page should have one heading hierarchy: AppHeader's centered title (page name) → `<h2>` for sections inside the page. Card titles inside dialogs/modals are fine since those are scoped.
12. **Drop the Card wrapper around tables.** Even if the original code had `<Card><CardHeader><CardTitle>...</CardTitle></CardHeader><CardContent><table.../></CardContent></Card>`, the v0 pattern is a flat `<section>` with a sibling `<h2>` + bordered `<div className="rounded-lg border border-border/60 bg-card/50">` around just the table. See §11 + §15.
13. **Cell content containing inline buttons inflates row height.** Patterns like `<div className="flex flex-col items-center gap-0.5"><span>$X</span><Button>View</Button></div>` push cells to ~45px when the button shows. Use the inline count badge per §15.7 instead — keeps cells single-line.
14. **Dual rendering branches (full-page vs embedded).** Some pages render two layouts depending on whether `onBack` is provided (standalone full-page shell vs embedded inside another page). When porting, normalize to the shell layout *first* — drop the `onBack ? <FullPage> : <Embedded>` ternary and just render the embedded variant. The AppLayout shell now handles "standalone full page" concerns (sidebar, header, navigation), so the ported page never needs its own full-page chrome. This avoids duplicating visual logic across both branches.
15. **Dense CRUD admin page sequencing.** For pages with many UI surfaces (lists + tabs + chips + cards + multiple dialogs — `ContactDirectory.tsx` is the reference), follow this order to minimize churn:
    1. Top-strip + outer-wrapper layout conversion (drop hero, add `usePageTitle`, swap wrapper)
    2. Tab/chip token sweep (status filters, type pills, segmented controls)
    3. Row/card token sweep (list item visuals, hover states, selected state)
    4. Dialog/modal chrome sweep (last because dialogs are leaf nodes)
    5. Run `npx tsc --noEmit` once at the end, not after each step (tsc is forgiving of mid-port states; running it earlier creates noise)
16. **Upload-heavy pages (galleries, room organizers, document managers) — chrome-first.** When porting a page with significant image/file upload + display logic (`SelectionBook` is the reference), do a *top-down chrome-only sweep first* (header → action strip → error banners → top-level cards), then *selectively tokenize* the nested gallery/form cards. Don't touch data-heavy upload handlers, category-order state, signed-URL fetching, or organization logic — those are orthogonal to the visual port and risky to disturb. This preserves complex async flows while still making the page coherent with the design language.
17. **Form-heavy editors with mixed native + shadcn controls — input parity first.** When porting an editor page with many `<Input>`, `<Label>`, `<Select>`, `<Textarea>` instances mixed with action buttons (`PlanEditor`, `EditProjectModal` are references), prioritize a *form-control parity pass* before sweeping buttons. Apply the same border/surface/muted helper recipe across all input controls (e.g., `bg-input border-border text-foreground`) so the form reads as one visually coherent block. Action buttons can be swept separately with less coordination required.

Before committing a page port:

- [ ] `npx tsc --noEmit` exits clean
- [ ] No `import * from '/HSH Contractor Logo'` lines remain (if hero header was removed)
- [ ] No `bg-gradient-to-` strings remain in the file (run `grep -n bg-gradient src/components/THE_FILE.tsx`)
- [ ] No `#[0-9A-F]{6}` hex colors remain (run `grep -nE '#[0-9A-F]{6}' src/components/THE_FILE.tsx`)
- [ ] No `text-gray-`, `bg-gray-`, `border-gray-` utilities remain (run `grep -nE '(text|bg|border)-gray-' src/components/THE_FILE.tsx`)
- [ ] Page renders without console errors
- [ ] Page heading appears centered in AppHeader
- [ ] Theme toggle (light/dark) — page works in both
- [ ] All onClick / form submit / data-fetching behaviors still work (no regressions vs. pre-port)

---

## Commit Message Template

```
<Page Name> port: v0 layout, token-driven visuals

Visual sweep of <page name>. Data layer preserved 1:1 (<list the
loaders/handlers you preserved>). View layer rebuilt to match the v0
design language per docs/UI_PORT_PLAYBOOK.md.

Removed:
- <hero header / mobile bottom bar / hardcoded hex colors / etc.>

Added:
- usePageTitle('<Page Name>') for the centered header title
- <new patterns added — section headers / stat cards / etc.>

Deferred (still uses old chrome — follow-up):
- <any modals / sub-components not yet swept>

tsc --noEmit clean.
```

---

## Page-by-Page Notes

(Fill in as ports happen so the next ports learn from the previous.)

| Page | Status | File | Notes |
|---|---|---|---|
| Dashboard | ✅ Ported | `src/components/ProjectsDashboard.tsx` | Reference for list pages |
| Project Detail | ✅ Ported | `src/components/ProjectDetailView.tsx` | Reference for detail pages |
| Estimate Builder | ✅ Ported | `src/components/EstimateBuilder.tsx` | Reference for dense data table pages |
| Project Actuals | ✅ Ported | `src/components/ProjectActuals.tsx` | Aligned with EstimateBuilder; reference for table cell coloring (§15.5–15.7), inline count badges |
| Change Orders | ✅ Ported | `src/components/ChangeOrders.tsx` | Cursor port |
| Project Forms | ✅ Ported | `src/components/ProjectForms.tsx` | Cursor port |
| My Feedback | ✅ Ported | `src/components/MyFeedback.tsx` | Filter-heavy list page; status chips use semantic pill recipe |
| Project Documents | ✅ Ported | `src/components/ProjectDocuments.tsx` | Mode A — file list + upload/edit; removed dual page wrappers in favor of shell |
| Purchase Orders | ✅ Ported | `src/components/PurchaseOrdersView.tsx` | Mode A — list/detail flow with tokenized issue panel + table |
| Contact Directory | ✅ Ported | `src/components/ContactDirectory.tsx` | Mode A — CRUD list; tokenized tabs, rows, and dialogs |
| Selection Book | ✅ Ported | `src/components/SelectionBook.tsx` | Mode A — preserved room/image/spec-sheet flows; swept hero/mobile action chrome and card/form token palette |
| Selection Schedules | ⏸ Hold | `src/components/SelectionSchedules.tsx` | Pending owner-driven redesign — v0 has updated selections design that will eventually replace SelectionBook→SelectionLibrary; revisit when that lands |
| Schedule Builder | ✅ Ported | `src/components/ScheduleBuilder.tsx` | Originally flagged Mode B; turned out to be Mode A after all. Calendar UI is custom but stylistically mechanical. References: rail-accent summary cards, list/calendar view toggle pattern with `cn(...)` conditional classes, "today" indicator uses `bg-rose-500 text-white`, item-type chips use muted/amber tokens |
| Plan Library | ✅ Ported | `src/components/PlanLibrary.tsx` | Mode A — summary cards + searchable list normalized to rail-accent token recipe |
| Plan Editor | ✅ Ported | `src/components/PlanEditor.tsx` | Mode A — form-heavy editor tokenized; preserved option/document upload flows and inline upload modal behavior |
| Item Library | ✅ Ported | `src/components/ItemLibrary.tsx` | Mode A — dual-branch tabs retained; removed hero/mobile shell and tokenized category accordion + modal forms |
| SOW Management | ✅ Ported | `src/components/SOWManagement.tsx` | Mode A — removed legacy hero + gradient shell, normalized CRUD cards/dialogs to token surfaces |
| Deal Workspace | ✅ Ported (partial) | `src/components/DealWorkspace.tsx` | 4848-line page. Outer wrapper converted from `fixed inset-0 bg-slate-900` fullscreen overlay to shell-friendly `flex h-[calc(100vh-3rem)]`. Custom h-20 header row + hshLogo dropped. Top action strip with Back link + Clear/Versions/Actions selects added. Full slate-X palette swept to tokens. STAGE_COLOR + STAGE_DEAL_ACCENT updated to v0 pill recipe (amber/sky/emerald). **Deferred:** Deal Selector in AppHeader (still uses inline left-aside list); deeper match to v0's two-column layout; per-modal chrome polish for ProForma config dialogs. |
| Tenant Pipeline | ✅ Ported | `src/components/TenantPipeline.tsx` | Kanban board with drag-drop preserved. 7 stages → 5 token colors using semantic repetition (sky/amber/emerald/violet/amber/emerald/rose). 8 categories use distinct hues per §7 (orange kept for Fitness). Layout: horizontal-scroll flex, `w-64 shrink-0` per column, `min-h-[420px]` drop zone. Mobile uses stage-picker chip strip + single-stage list view. |
| Create Project Form | ✅ Ported | `src/components/CreateProjectForm.tsx` | Mode A — multi-section form tokenized; plan-option checkbox panel migrated to muted token card |

---

**End of playbook.** When in doubt, study the ✅ files and copy patterns. When you encounter ambiguity not covered here, stop and escalate rather than guess.
