# HSH GC Platform — Design Language

**Source:** v0 generation (b_kUxZlzDGSDm.zip, 2026-04-29) seeded with screenshots of existing pages alongside Vercel as a reference. Design decisions reviewed and confirmed by owner.

**Purpose:** durable spec for the visual + interaction language. Whenever you build something new, it should match this. Whenever you migrate something old, the target is this.

**Stack note:** v0 generated Next.js 16. We're staying on Vite. The color tokens, typography, spacing, and component variants below all transfer cleanly. The runtime-specific bits (`next/link`, `next/font`, `useSearchParams`, App Router) need translation to React Router + `@fontsource/geist`. None of that affects the visual language.

---

## 1. Theme system — light + dark, dark default

CSS variables in `oklch()` color space. Light mode at `:root`; dark mode under `.dark` class. v0 uses Tailwind's `@theme inline` block to wire variables to utility classes (e.g., `bg-background`, `text-foreground`).

### 1.1 Light mode (`:root`)

| Token | Value (oklch) | Usage |
|---|---|---|
| `--background` | `1 0 0` (pure white) | Page background |
| `--foreground` | `0.145 0 0` (near-black) | Body text |
| `--card` | `1 0 0` | Card surface |
| `--card-foreground` | `0.145 0 0` | Card text |
| `--popover` | `1 0 0` | Popover/dropdown surface |
| `--popover-foreground` | `0.145 0 0` | |
| `--primary` | `0.205 0 0` (very dark gray) | Primary buttons, key actions |
| `--primary-foreground` | `0.985 0 0` (off-white) | Text on primary surfaces |
| `--secondary` | `0.97 0 0` (near-white) | Secondary buttons, subtle surfaces |
| `--secondary-foreground` | `0.205 0 0` | Text on secondary |
| `--muted` | `0.97 0 0` | Muted backgrounds |
| `--muted-foreground` | `0.556 0 0` (mid gray) | Muted text, descriptions |
| `--accent` | `0.97 0 0` | Hover states, accent surfaces |
| `--accent-foreground` | `0.205 0 0` | |
| `--destructive` | `0.577 0.245 27.325` (red) | Destructive action surface |
| `--destructive-foreground` | `0.577 0.245 27.325` | |
| `--border` | `0.922 0 0` (light gray) | Borders, dividers |
| `--input` | `0.922 0 0` | Input backgrounds |
| `--ring` | `0.708 0 0` | Focus ring |
| `--radius` | `0.625rem` (10px) | Base radius (also derives sm/md/lg/xl) |

Sidebar gets its own scoped tokens (`--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, etc.) so the sidebar can have a slightly different palette from the main content area.

### 1.2 Dark mode (`.dark`)

| Token | Value | Note |
|---|---|---|
| `--background` | `0.145 0 0` | Near-black |
| `--foreground` | `0.985 0 0` | Off-white |
| `--card` | `0.145 0 0` | Card matches background (no card lift in dark) |
| `--primary` | `0.985 0 0` | Inverted: primary is light in dark mode |
| `--primary-foreground` | `0.205 0 0` | |
| `--secondary` | `0.269 0 0` (dark gray) | |
| `--muted` | `0.269 0 0` | |
| `--muted-foreground` | `0.708 0 0` (lighter gray) | |
| `--accent` | `0.269 0 0` | |
| `--destructive` | `0.396 0.141 25.723` (deeper red) | |
| `--border` | `0.269 0 0` | Borders subtle in dark |
| `--input` | `0.269 0 0` | |
| `--ring` | `0.439 0 0` | |
| `--sidebar` | `0.205 0 0` | **Sidebar slightly lighter than main bg** — gives layering |
| `--sidebar-primary` | `0.488 0.243 264.376` (purple-blue) | **Accent color in sidebar — distinctive brand color in dark mode** |

**Key insight:** in dark mode, the sidebar uses a light-purple-blue accent (`--sidebar-primary`) — this is the closest the design language gets to a "brand color." Use sparingly: sidebar logo background, active nav state, key CTAs.

### 1.3 Chart colors (data viz)

5-color rotation, distinct between light and dark.

| Token | Light | Dark |
|---|---|---|
| `--chart-1` | orange | purple-blue |
| `--chart-2` | teal | green |
| `--chart-3` | dark blue | yellow-orange |
| `--chart-4` | yellow | violet |
| `--chart-5` | yellow-orange | pink-red |

Use these for any analytics, budget reports, variance charts.

---

## 2. Typography — Geist font family

**Font stack:**

| Family | Use |
|---|---|
| `Geist` (sans) | All UI text, body, headings |
| `Geist Mono` | IDs, code, monospace data (project numbers, currency? — TBD) |

**Vite implementation note:** v0 uses `next/font/google`. We'll use `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` (npm install, import in app entry).

### 2.1 Type scale (extracted from v0 components)

v0 uses Tailwind's default scale with these conventions observed in components:

| Use | Class | Size / Weight |
|---|---|---|
| Body default | `text-sm` | 0.875rem (14px), regular |
| Page heading | `text-2xl font-semibold` | 1.5rem, semibold |
| Section heading | `text-lg font-semibold` | 1.125rem, semibold |
| Card title | `font-semibold leading-none` | inherits, semibold, tight leading |
| Card description / muted | `text-sm text-muted-foreground` | 0.875rem, mid-gray |
| Tiny / labels / badges | `text-xs font-medium` | 0.75rem, medium |
| Button text | `text-sm font-medium` | 0.875rem, medium |

**Notable:** v0 defaults to `text-sm` for most body content, not `text-base`. This is denser than Tailwind defaults — matches the Vercel / Supabase Dashboard "tools for serious users" feel.

---

## 3. Spacing scale

Tailwind's default spacing (4px base) is used. Conventions observed in v0:

| Use | Class | Pixels |
|---|---|---|
| Element gap inline | `gap-2` | 8px |
| Compact gap | `gap-1.5` | 6px |
| Section gap | `gap-6` | 24px |
| Card internal padding | `px-6 py-6` | 24px |
| Page margin | `p-6` | 24px |
| Sidebar item padding | `px-2 py-1.5` (approximate) | 8/6px |

**Rule of thumb:** dense spacing inside cards (12–16px between elements), generous spacing between sections (24px+), full-width content within cards.

---

## 4. Component variants

### 4.1 Button (`components/ui/button.tsx`)

Sizes:
| Size | Height | Padding | Use |
|---|---|---|---|
| `sm` | 32px | px-3 | Toolbar buttons, table actions |
| `default` | 36px | px-4 | Standard buttons |
| `lg` | 40px | px-6 | Hero CTAs, primary page actions |
| `icon` | 36px square | — | Icon-only |
| `icon-sm` | 32px square | — | Compact icon button |
| `icon-lg` | 40px square | — | Hero icon button |

Variants:
| Variant | Use |
|---|---|
| `default` | Primary action (one per page) |
| `destructive` | Delete, remove, irreversible |
| `outline` | Secondary action with border |
| `secondary` | Tertiary action |
| `ghost` | Minimal — toolbar/icon buttons, low-key inline actions |
| `link` | Text link styled as button (rare) |

**Hierarchy rule:** at most ONE `default` (primary) button per page or modal. Everything else is `outline`, `secondary`, or `ghost`.

### 4.2 Card (`components/ui/card.tsx`)

Composition: `<Card>` → `<CardHeader>` → `<CardTitle>` + `<CardDescription>` + `<CardAction>` → `<CardContent>` → `<CardFooter>`.

Defaults:
- `rounded-xl` (12px)
- 1px border using `--border` token
- `shadow-sm` (subtle, only in light mode)
- `py-6 px-6` internal padding
- `bg-card`, `text-card-foreground`

In dark mode, card surface matches the page background — the border alone provides delineation. No "lifted card" effect.

### 4.3 Badge (`components/ui/badge.tsx`)

Sizes: small only (`px-2 py-0.5 text-xs`).

Variants:
| Variant | Use |
|---|---|
| `default` | Neutral badge, primary color |
| `secondary` | Subtle badge, secondary color |
| `destructive` | Error/red badge |
| `outline` | Bordered transparent badge |

**Status colors (extracted from `project-card.tsx`):** v0 uses 4 distinct status palettes for project state. These should be defined as semantic tokens, not arbitrary Tailwind classes:

| Status | Bg | Text | Border | Dot |
|---|---|---|---|---|
| Estimating | `violet-500/15` | `violet-400` | `violet-500/30` | `violet-400` |
| In Progress | `emerald-500/15` | `emerald-400` | `emerald-500/30` | `emerald-400` |
| Completed | `sky-500/15` | `sky-400` | `sky-500/30` | `sky-400` |
| On Hold | `amber-500/15` | `amber-400` | `amber-500/30` | `amber-400` |

The `bg-X-500/15` + `text-X-400` + `border-X-500/30` pattern produces a soft tinted badge that reads cleanly in both modes.

### 4.4 Input / Form

Standard shadcn Input. `border` token + `bg-background`. Same height as `default` button (36px) for alignment.

### 4.5 Sidebar / navigation primitives

v0 ships `components/ui/sidebar.tsx` from shadcn — a full sidebar primitive system: `Sidebar`, `SidebarHeader`, `SidebarContent`, `SidebarFooter`, `SidebarGroup`, `SidebarGroupLabel`, `SidebarGroupContent`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarMenuBadge`, `SidebarRail`, `SidebarTrigger`, `SidebarInset`. Plus a `<SidebarProvider>` context.

Adopt this entire primitive system from shadcn during foundation phase. Don't roll our own.

### 4.6 Toasts — Sonner

Replace all 176 existing `alert()` calls with `sonner.toast()`. Variants:
- `toast.success("...")` — green tick
- `toast.error("...")` — red X
- `toast.info("...")` — neutral
- `toast.warning("...")` — yellow

Auto-dismiss default 4s. Action buttons supported (e.g., "Undo").

---

## 5. Layout shell — persistent sidebar + meta header

### 5.1 Top-level structure

```
┌──────────────────────────────────────────────────────────┐
│ <SidebarProvider>                                        │
│  ┌──────────┬───────────────────────────────────────────┐│
│  │ Sidebar  │ SidebarInset (main content)               ││
│  │          │ ┌───────────────────────────────────────┐ ││
│  │ HSH GC   │ │ <header>                              │ ││
│  │ branding │ │  ┌──────────────────┐  ┌────────────┐ │ ││
│  │ ─────    │ │  │ Project / Deal   │  │ Workspace  │ │ ││
│  │ Modules  │ │  │ Selector (left)  │  │ Switcher   │ │ ││
│  │ ─────    │ │  └──────────────────┘  └────────────┘ │ ││
│  │ Reports  │ │ </header>                             │ ││
│  │ ─────    │ ├───────────────────────────────────────┤ ││
│  │ Settings │ │ <main>                                │ ││
│  │          │ │   Page content                        │ ││
│  │ Footer:  │ │ </main>                               │ ││
│  │ Avatar   │ └───────────────────────────────────────┘ ││
│  └──────────┴───────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

### 5.2 Header structure (top bar within SidebarInset)

A single horizontal strip across the top of the main content area — same row as the `<SidebarTrigger>`. Its job is to surface the **two meta-controls** that determine "what am I working on" + "which world am I in":

**Left side:**
- `<SidebarTrigger>` — collapse/expand the sidebar (shadcn primitive)
- **Project / Deal / Tenant Selector** — dropdown showing the currently-active entity within the current workspace, with quick-switch to others.
  - **Visible on:** Dashboard, any module page within an entity context (Estimates, Actuals, etc.), the Deal Workspace, project detail views.
  - **Hidden on:** Settings, Team / Org admin, and other global pages where no specific entity is active.

**Right side:**
- **Workspace Switcher** — dropdown-pill style (current workspace name + chevron, à la Vercel team switcher). Toggles between Projects / Deals / Tenants. Switching workspaces re-renders the sidebar nav AND defaults the project selector to the most recently active entity within the new workspace.

**Header height:** ~52px target (Vercel/Supabase Dashboard convention range is 48–56px).

**Mobile / collapsed sidebar behavior:** the header remains fixed and full-width; the sidebar slides over as an off-canvas drawer rather than reflowing the content. Header content (selector + switcher) does not reflow when the sidebar collapses.

This keeps the sidebar focused entirely on **module navigation within the current workspace** — no meta-controls competing for attention there.

**Patterns this mirrors:**
- Vercel Dashboard: team switcher on left, workspace controls on right
- Linear: workspace + view selector on top bar, sidebar is pure nav
- Supabase Dashboard: project selector on left, role/notifications on right

### 5.3 Workspace switcher behavior

Three workspaces, each driving the sidebar's internal nav:

| Workspace | Top-level sidebar groups |
|---|---|
| **Projects** | Modules + Reports + Settings |
| **Deals** | Deal Analysis + Analysis & Insights + Settings |
| **Tenants** | Pipeline + Settings |

Selected workspace persists across navigation (localStorage-backed). When user switches workspaces, the sidebar re-renders with the new workspace's nav structure, and the project selector updates to show the most recent entity in that workspace (e.g., switching to Deals shows the most-recently-viewed deal in the left selector).

### 5.4 Per-workspace IA (corrected from v0 default per owner)

#### Projects workspace

```
Modules
  Dashboard          (LayoutDashboard icon)
  Estimates          (Calculator)
  Actuals            (DollarSign)
  Forms              (FileText)            ← corrected: v0 missed
  Schedule           (Calendar)
  Selections         (ListChecks)
  Docs               (FileText)
  Change Orders      (ClipboardList)
  Purchase Orders    (Receipt or similar)  ← corrected: v0 missed
  Invoices           (Receipt)
  QuickBooks         (—)                   ← corrected: v0 missed

Reports
  Budget Reports     (PieChart)
  Analytics          (BarChart3)

Settings
  (see §5.5)
```

#### Deals workspace

```
Deal Analysis
  Dashboard          (LayoutDashboard)
  Assumptions        (ClipboardList)
  Phase Pro Forma    (Calendar)
  Cash Flow          (TrendingUp)
  Investor Returns   (Wallet)
  Public Sector      (Briefcase)

Analysis & Insights
  Analysis & Insights (LineChart)
  Documents          (FileText)

Settings
  (see §5.5)
```

#### Tenants workspace

```
Pipeline
  Pipeline           (Kanban)
  Tenants            (UsersRound)

Settings
  (see §5.5)
```

### 5.5 Settings (global, accessible from any workspace)

```
Settings
  Item Library
  Plan Library
  Trade Categories
  SOW Management
  Feedback (admin)
  Users / Org
  QuickBooks API config (also accessible from Projects workspace)
  Account / Profile
```

Most "library" / "admin" / "global config" surfaces live here.

### 5.6 Sidebar footer

Avatar with user initials, dropdown menu for: profile, theme toggle, sign out.

---

## 6. Navigation — cross-workspace + breadcrumbs

### 6.1 Cross-workspace navigation (Deal → Project)

Owner's data model: a Deal can spawn multiple Tenants, each Tenant becomes a Project. Most Projects today are standalone (no Deal); some come from a Deal.

Required pattern: when a Project came from a Deal, there must be a way to navigate Deal ↔ Project.

**Recommended pattern: breadcrumb + relationship card.**

- **Breadcrumb in page header:** when on a Project that came from a Deal, breadcrumb reads `Deals › <Deal Name> › <Tenant> › <Project Name>`. Click any segment to jump. When on a Project not from a Deal, just `Projects › <Project Name>`.
- **Relationship card on Project detail:** small card on the right showing "From deal: <name>" with a "Open deal →" link. Symmetric: on Deal detail, list of "Spawned projects" with links.

### 6.2 Within-workspace navigation

Sidebar handles top-level. Within a page (e.g., a Project), internal navigation can use:
- **Tabs** (`components/ui/tabs.tsx`) — for parallel views of the same entity (e.g., Project: Overview / Estimate / Actuals / Documents)
- **Sub-routes** when content is heavy enough to deserve a URL (estimates editor, deal proforma)

---

## 7. Status colors — semantic tokens

Beyond the 4 project statuses (§4.3), use these semantic colors consistently:

| Meaning | Color family | Bg/Text/Border pattern |
|---|---|---|
| Success / Active | emerald | `emerald-500/15`, `emerald-400`, `emerald-500/30` |
| In progress / Estimating | violet | `violet-500/15`, `violet-400`, `violet-500/30` |
| Info / Completed | sky | `sky-500/15`, `sky-400`, `sky-500/30` |
| Warning / On Hold | amber | `amber-500/15`, `amber-400`, `amber-500/30` |
| Destructive / Error | red (`destructive` token) | use `--destructive` token |
| Neutral / Default | gray (`muted`) | use `--muted` token |

Avoid introducing new color families ad-hoc. If you find yourself wanting a 6th status color, audit whether it's actually a different state or just a stylistic itch.

---

## 8. Feel principles

When in doubt about a design decision, default toward:

1. **Dense over spacious.** This is a tools-for-work app, not a marketing site. Default `text-sm`, tight spacing, multi-column layouts where data warrants.
2. **Dark mode is first-class.** Both themes work, but dark gets the brand-color sidebar accent. Don't design something that only looks good in light mode.
3. **Borders, not shadows.** Light mode has `shadow-sm` on cards; dark mode relies entirely on borders. Heavy shadows are out of style.
4. **Subtle status colors.** Always use the `bg-X-500/15` + `text-X-400` pattern, never solid bright fills. Status badges should hint, not shout.
5. **One primary action per surface.** If you have two `default`-variant buttons on the same page, you've made the wrong choice on one of them.
6. **Keyboard-first interactions over mouse-first.** Where Radix primitives provide keyboard support (dropdowns, dialogs, menus), use them. Don't build custom replacements.
7. **Real data, real states.** Empty states, loading states, error states are first-class. Every list view has all four (loading / empty / data / error).

---

## 9. Translation from v0 (Next.js) to Vite

When porting any v0 component:

| Next.js | Vite equivalent |
|---|---|
| `import Link from 'next/link'` | `import { Link } from 'react-router-dom'` |
| `import { Geist, Geist_Mono } from 'next/font/google'` | `import '@fontsource-variable/geist'` (in app entry) |
| `import { useSearchParams } from 'next/navigation'` | `import { useSearchParams } from 'react-router-dom'` |
| `import { Analytics } from '@vercel/analytics/next'` | Drop or use `@vercel/analytics/react` if applicable |
| `"use client"` directive | Remove (not needed in Vite SPA) |
| `app/<page>/page.tsx` route | `<Route path="/<page>" element={<Page />} />` in router |
| `metadata` export | `<title>` + `<meta>` via React Helmet or similar |

The component bodies (JSX, Tailwind classes, Radix imports, hooks) are identical — only the framework wrappers change.

---

## 10. Migration checklist (high level)

This doc is the spec. To migrate the existing app to it:

1. **Foundation:** install fonts, themes, sonner, react-router-dom, copy CSS tokens into `index.css`, update `tailwind.config.js`.
2. **Sidebar primitives:** copy v0's `components/ui/sidebar.tsx` (full shadcn primitive set) into the project.
3. **Shell:** build `<AppLayout>` with sidebar + workspace switcher. Wire routes.
4. **Page-by-page:** dashboard first, then each module. Replace `alert()` with `toast()` as you touch each page.
5. **Cross-workspace nav:** implement breadcrumb + relationship card for Deal → Project.
6. **Cleanup:** remove unused legacy components as they're replaced.

Detailed migration plan lives in `docs/UI_MIGRATION_PLAN.md` (TBD when execution starts).

---

## 11. What's NOT in this spec

Things that are deliberately not codified yet:

- **Specific page layouts.** This doc defines primitives. Page layouts are decided in v0 mockups + during implementation.
- **Charts / data viz beyond color tokens.** Recharts is included in v0's dependencies; specific chart styles will emerge as we build them.
- **Animations / motion.** Use Tailwind's `transition-*` utilities + `tw-animate-css` for now; codify if a pattern emerges.
- **Mobile / responsive behavior.** Sidebar collapses on small screens (shadcn primitive handles it); specific responsive tweaks will be page-by-page.
- **Brand assets.** Logo, favicon, icon set — exists in repo but not codified here.

---

## 12. Sources

- v0 export `b_kUxZlzDGSDm.zip` (2026-04-29) — extracted to `/tmp/v0-extract/` during analysis
- Owner's design decisions in conversation 2026-04-29
- Vercel Dashboard + Supabase Dashboard (visual reference for Geist + density + sidebar patterns)
