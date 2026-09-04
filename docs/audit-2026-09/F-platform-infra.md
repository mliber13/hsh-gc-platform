# Review F — Platform / Infrastructure / Quality layer

Read-only review, 2026-09-03. Repo: `hsh-gc-platform` (React 19 + TS 5.9 + Vite 7 + Supabase; Vercel). All paths relative to repo root. Line counts are from `wc -l` / `grep -c` on the working tree.

## 0. Headline findings

| # | Finding | Evidence |
|---|---|---|
| 1 | **Single 4.55 MB JS chunk, zero code-splitting.** No `React.lazy`, no `Suspense`, no `manualChunks`. 85 `<Route>`s all statically imported (87 imports in `src/routes/index.tsx`). The service worker precaches that chunk, so every deploy re-downloads 4.5 MB to every field phone. | `dist/assets/index-Dkf3tDaC.js` 4,550,532 B; `vite.config.ts` has no `build.rollupOptions`; `grep -rl "lazy(" src` = 0 hits |
| 2 | **No error boundary anywhere.** One render throw = white screen for the whole app (including `/crew`). | `grep -rn "ErrorBoundary\|componentDidCatch\|errorElement" src` = 0 |
| 3 | **"Offline mode with localStorage" dual-path fossil**: `isOnlineMode()` referenced 365 times; `supabaseService.ts` alone has 86 `if (!isOnlineMode())` early-returns; 12 service files still read/write ~17 `hsh_gc_*` localStorage keys. This is a whole shadow persistence layer that no longer serves anyone (Supabase is required in prod). | `src/lib/supabase.ts:11,26-34`; `src/services/storage.ts:35-50`; `src/services/supabaseService.ts:245,292,525,560…` |
| 4 | **No CI, no lint, no formatter, no hooks.** `.github/`, eslint, prettier, husky, `.editorconfig`, `.vscode` all absent. `npm run build` (= `tsc && vite build`) on Vercel is the only gate. Tests (42 files / 240 tests, all green in 4.9 s) are never run automatically. | `ls .github .eslintrc* eslint.config.* .husky` → all missing; `package.json:6-14` |
| 5 | **`supabase db reset` from scratch will fail.** `org_team`, `project_events`, `work_packages` are `ALTER TABLE`d / RLS-enabled but have no `CREATE TABLE` in any migration (created in Dashboard). `pay_periods`, `time_entries`, `project_milestones` are queried from `src` with no DDL either. RPC `increment_use_count` is called but never defined. | `supabase/migrations/20260427000009_a5c2_c9_c10_meta_infra.sql:30-32`; `src/services/sowService.ts:302` |
| 6 | **Edge function `qb-find-vendor` is invoked but doesn't exist in the repo**; three function dirs are empty shells (`accept-invitation`, `invite-user`, `qb-suggest-allocation`). 10 of 23 real functions hand-roll CORS instead of using `_shared/cors.ts`. | `src/services/quickbooksService.ts:263`; `ls supabase/functions/accept-invitation` → empty |
| 7 | **Repo root is a junk drawer**: 40 stale runbook `.md` files (Oct 2025 – Feb 2026), a tracked `.docx` + its `.zip` + an exploded `docx_extract/` tree, `figmasrc.zip`, unused `styles/` Figma export, `clear-projects.html`, `fix_rls_policies.sql`, `item_templates_import.csv`, 4 `.txt` checklists, and `supabase/.temp/*` (tracked; contains `project-ref`, `pooler-url`, churns in every `git status`). | `git ls-files` (see §4) |

## 1. Build / tooling

### package.json / scripts
- `package.json:6-14`: only `dev / build / preview / test / supabase:deploy / supabase:deploy:receive-sms / admin:update-user-email`. No `lint`, `typecheck`, `format`, `test:ci`, `gen:types`.
- `package.json:54-66` riff-raff from `npm init`: `"main": "postcss.config.js"`, `"license": "ISC"`, `"directories": {"doc": "docs"}`, description in Markdown bold. Harmless but sloppy; `"main"` pointing at postcss config is nonsense.
- `@types/uuid` sits in `dependencies` (`package.json:33`) and is unnecessary — `uuid@13` ships its own types.
- Root `deno.lock` (212 KB, `deno.lock:1-6`) is a Deno lockfile for the **npm** package.json, not for edge functions (its specifiers are `npm:@radix-ui/...`). Created by running `deno` in the root (likely the push spike). Delete; add to `.gitignore` unless functions get a real `deno.json`.

### vite.config.ts
- `vite.config.ts:60-63` `define` hard-inlines `VITE_SUPABASE_URL`/`ANON_KEY` — redundant (Vite already exposes `VITE_*`) but harmless.
- No `build.rollupOptions.output.manualChunks`, no `chunkSizeWarningLimit` (so every build prints the 500 kB warning and it's been ignored).
- Vitest config lives here (`vite.config.ts:64-73`), `environment: 'node'` — correct for the current pure-logic tests; there are 0 `.test.tsx` files and no jsdom/testing-library installed.

### PWA (`vite.config.ts:14-56`, `src/sw.ts`, `src/main.tsx`)
- Strategy `injectManifest`, `registerType: 'autoUpdate'`, `skipWaiting()` + `clientsClaim()` (`src/sw.ts:11-12`), `updateSW(true)` on `onNeedRefresh` unless `hasUnsavedWork()` (`src/main.tsx:18-24`), plus a 15-min interval and visibility/focus re-check (`src/main.tsx:31-38`). This is a sane, aggressive auto-update setup for field devices.
- Precache manifest: 29 entries (`dist/sw.js`), including the 4.55 MB main chunk, 6 Geist woff2 subsets (Cyrillic, Latin-ext — ~55 KB you don't need), 6 Daisy mascot PNGs, and **three 158 KB PNGs that are the same unresized logo** (`public/pwa-192x192.png`, `pwa-512x512.png`, `HSH Contractor Logo - Color.png` all 158,395 B). `maximumFileSizeToCacheInBytes: 5 MB` (`vite.config.ts:50`) was raised specifically to let the monolith chunk through — the next feature pushes it over and the SW silently stops precaching the app.
- "Offline claims": the SW only precaches shell assets; every screen fetches Supabase live, so "offline" = a shell that renders and then fails. Nothing in the app checks `navigator.onLine`. Don't market it as offline-capable.
- `devOptions.enabled: false` comment "Force service worker update" is stale.

### tsconfig.json
- `strict: true` but `noUnusedLocals: false`, `noUnusedParameters: false` (`tsconfig.json:29-30`). `include: ["src"]` — so `src/scripts/*.ts` (two Oct-2025 one-off localStorage→Supabase migration scripts, referenced nowhere) are type-checked on every build.
- No `tsconfig.node.json` for `vite.config.ts`; no `tsconfig` for `supabase/functions` (Deno) — editor/tsc see those files only by accident of `include`.

### vercel.json
- `vercel.json:2-15`: three rewrites; the first two (`/vendor-quote/:token*`, `/quote/:token*`) are fully covered by the catch-all and can go.
- Headers: only `/sw.js` cache-control. **No security headers** (no `X-Frame-Options`/`frame-ancestors`, no `X-Content-Type-Options`, no `Referrer-Policy`, no `Permissions-Policy`, no HSTS beyond Vercel default). The share pages (`/quote/:token`, `/customer-schedule`, `/supplier-order-share`) are public and clickjackable.
- No explicit `Cache-Control: immutable` for `/assets/*` (Vercel defaults are OK, but be explicit since the SW also caches them).

### Dependencies (`npm ls --depth=0`, `npm outdated`, import grep)

| Category | Packages | Note |
|---|---|---|
| **Unused (0 imports in src)** | `@radix-ui/react-checkbox`, `@radix-ui/react-toast`, `workbox-window` (pulled transitively by vite-plugin-pwa anyway), `@types/uuid` | Remove. The radix-toast entry is why the orchestrator thought "two toast systems" — only sonner is actually used (96 files, 0 `useToast`). |
| **Single-file heavyweights** | `framer-motion` (1 file: `src/components/drywall/dashboard/DashboardPage.tsx`; ~120 KB gz), `react-markdown`+`remark-gfm`+`remark-breaks` (1 file: `ScopeMarkdownPreview.tsx`), `recharts` (4 files), `xlsx` (4 files, 0.18.5 is the last npm release — abandoned on npm, known prototype-pollution CVE-2023-30533), `jspdf`+`jspdf-autotable` (11/7 files; Vite already split html2canvas 202 KB + purify 22 KB + `index.es` 159 KB from it) | Prime `React.lazy` candidates. `xlsx`: pin or move to the maintained `https://cdn.sheetjs.com` build / `exceljs`. |
| **Major-version gaps** | `vite` 7→8, `vitest` 2→5, `typescript` 5.9→7, `tailwindcss` 3.4→4.3, `lucide-react` 0.545→1.40, `jspdf` 3→4, `uuid` 13→14, `framer-motion` 12→13, `@vitejs/plugin-react` 5→6 | None urgent. Tailwind 4 is a real migration (config-in-CSS); do it as its own task or stay on 3.4.x. Vitest 5 requires Vite 8. |
| **Minor drift** | `@supabase/supabase-js` 2.75→2.114 (39 minors behind; includes auth/realtime fixes), all radix, react 19.2.0→19.2.8, react-router 7.14→7.18 | One `npm update` session. |
| **Duplicated concerns** | Date formatting: `date-fns` (67 files) + 66 `toLocaleDateString` + 125 `toLocaleString` + `src/lib/dateFormat.ts` (used by 4 files). IDs: `uuid` `v4()` 80× + `crypto.randomUUID` 9×. | Not two libs, but two conventions each; pick one. Only one icon lib (lucide) — good. |

### dist/ chunk sizes (built 2026-08-05, gitignored)

| File | Bytes |
|---|---|
| `assets/index-Dkf3tDaC.js` | **4,550,532** |
| `assets/html2canvas.esm-*.js` | 202,363 |
| `assets/index.es-*.js` (jspdf) | 159,327 |
| `assets/index-*.css` | 116,957 |
| 6 × Geist woff2 | ~115,000 total |

Obvious wins: lazy-load per route group (GC estimating / drywall / HR / crew / public share pages), lazy `ProFormaGenerator` (5,149 lines) + `DealWorkspace` (4,715) + `ProjectActuals` (3,467), dynamic-import `xlsx`, `jspdf`, `recharts`, `framer-motion`, `react-markdown`. A crew user on `/crew` should not download the pro-forma engine. Expect main chunk 4.5 MB → <1 MB with ~2 h of work.

## 2. App shell

| Item | Status | Cite |
|---|---|---|
| `src/main.tsx` | Clean: StrictMode → BrowserRouter → AuthProvider → App. SW registration inline. | `src/main.tsx:16-50` |
| `src/App.tsx` | 25 lines: ThemeProvider + `<AppRoutes/>` + sonner `<Toaster/>`. Good. | `src/App.tsx:16-23` |
| `src/routes/index.tsx` | 1,103 lines, 85 `<Route>`, 87 static imports, one `AuthedLayout` wrapper at L178; `RequirePermission` imported once. Two `window.location.href = '/'` hard reloads at L518/529 (sign-out path). | |
| Error boundaries | **None** (route-level or global). | grep = 0 |
| Toasts | sonner only (96 files). `@radix-ui/react-toast` installed but unused. **29 native `confirm()` calls** (22 as `window.confirm`) across 15 files — `SelectionBook.tsx` ×7, `DealWorkspace.tsx` ×4, `ScheduleBuilder`/`EstimateBuilder` ×3 each, plus 8 drywall files. 0 `alert()`. | |
| Theming | `next-themes` via `src/components/theme-provider.tsx`; `useTheme` in 3 components. Tailwind `darkMode: ["class"]` — consistent. | |
| Contexts | `AuthContext` (188 lines, 3 effects, `onAuthStateChange` at L67, gates on `isOnlineMode()`), `PageTitleContext` (89), `TradeCategoriesContext` (94). Small and reasonable. | |
| Hooks | 4 only: `use-mobile`, `useActiveWorkspace` (localStorage `hsh:activeWorkspace`), `usePermissions`, `usePullToRefresh`. Data fetching is all ad-hoc `useEffect` in components — no query cache, no dedupe. | `src/hooks/` |
| `src/lib/supabase.ts` | Hand-written `Database` type (125 lines, 2 tables, `address: any`) that is **not** passed to `createClient<Database>` — dead. No `supabase gen types` in scripts. Placeholder URL fallback + "offline mode" warning (L10-23). | `src/lib/supabase.ts:14-23,37-125` |
| "Online Mode Check" noise | The literal string isn't in src; the noise is `src/lib/supabase.ts:11` `console.warn('⚠️ Supabase credentials not found. Running in offline mode…')` plus 365 `isOnlineMode()` call sites. | |

### Global timers / polling (complete list)

| Where | Interval | Notes |
|---|---|---|
| `src/main.tsx:31` | 15 min | SW update check (+ visibility/focus triggers) |
| `src/components/comms/CommsNotificationBell.tsx:15,45` | 60 s | Mounted in `AppHeader` AND `CrewShell`; server-side RPC now (cheap) |
| `src/components/drywall/field/FieldReviewNotificationBell.tsx:12,36` | 120 s | |
| `src/components/drywall/comms/CommsLogPanel.tsx:34,102` | 60 s | Per open project comms panel |
| `src/components/drywall/info/CustomerCommsCard.tsx:93` | 20 s | |
| `src/routes/CustomerSchedulePage.tsx:216` | 20 s | Public page — 20 s poll from an anonymous share link |
| 9 `visibilitychange`/`focus` listeners | — | |
| `setTimeout` | 14 total; magic numbers 60_000, 2500, 1000 — not a problem | |

No Supabase Realtime is used; polling is the only push. Fine for scale, but the 20 s public-page poll is the one to reconsider (egress incident precedent).

### localStorage keys in use
`hsh_gc_projects, hsh_gc_estimates, hsh_gc_trades, hsh_gc_takeoff_items, hsh_gc_actuals, hsh_gc_labor_entries, hsh_gc_material_entries, hsh_gc_subcontractor_entries, hsh_gc_daily_logs, hsh_gc_change_orders, hsh_gc_time_clock_entries, hsh_gc_historical_rates, hsh_gc_estimate_templates, hsh_gc_schedule_templates, hsh_gc_user_preferences` (`src/services/storage.ts:35-50` — the offline-mode shadow DB), `hsh_gc_item_templates` (`itemTemplateService.ts:13`), `hsh-plans` (`planService.ts:20`), `hsh:activeWorkspace` (`useActiveWorkspace.ts:32`), `meeting:viewMode:${userId}`, per-project `QuoteV3ConvertBanner` dismiss key, and ProFormaGenerator's saved-inputs `storageKey` (`ProFormaGenerator.tsx:645-1478`). Stale-state risk: `planService`, `itemTemplateService`, `estimateTemplateService` still fall back to localStorage — a user on a second device silently sees different templates. Also `sessionStorage` ×3.

## 3. Quality infrastructure

| Metric | Value |
|---|---|
| Test files | 42 (30 `src/lib/drywall`, 7 `src/lib`, 3 `src/services`, 1 `src/lib/drywall/calculations`, 1 `src/components/hr/payroll`) + 2 opt-in harnesses in `scripts/` |
| `npx vitest run` | 42 files / 240 tests pass, 4.85 s |
| Component tests | 0 (`*.test.tsx` = 0; no jsdom / testing-library) |
| GC-side tests | 0 — `supabaseService.ts` (5,074 lines), `proformaService.ts` (1,848), `ProFormaGenerator.tsx` (5,149) untested |
| `as any` | 173 total. Top: `DealWorkspace.tsx` 26, `ProjectActuals.tsx` 21, `supabaseService.ts` 18, `laborImportService.ts` 16, `EstimateBuilder.tsx` 15, `proformaExportService.ts` 13, `smsService.ts` 12, `ProFormaGenerator.tsx` 10, `proformaService.ts` 6, `ItemLibrary.tsx` 5 |
| `: any` | 262 |
| `console.log` | 93 — 87 of them in four files: `backupService.ts` 41, `src/scripts/migrateToSupabase.ts` 28, `backupVerification.ts` 18, `migratePlansToSupabase.ts` 6. `console.error` 678, `console.warn` 76. |
| Empty catches | 7 (`selectionBookService.ts:560,568,604,810,818,855`, `selectionScheduleService.ts:63`) |
| `eslint-disable` | 6 (`react-hooks/exhaustive-deps`) — with no ESLint installed, these are decoration |
| `@ts-ignore` | 0 |
| `@deprecated` | 15 (10 in `src/types/drywall.ts` / `proforma.ts` — kept for backward-compat reads; 3 in services) |
| TODO | 2 (`backupService.ts:415` "Implement restore logic"; `types/phase2Labor.ts:14`) |
| `window.location.href/assign` | 4 (`routes/index.tsx:518,529`, `CrewSignupPage.tsx:121`, `quickbooksService.ts:82` — OAuth redirect, legit) |

**What a CI pipeline needs** (one GitHub Actions workflow, ~40 lines): `npm ci` → `npx tsc --noEmit` → `npx vitest run` → `npx vite build` (fail on chunk > N) → optionally `supabase db lint`/dry-run migrations against a Postgres service container. Add ESLint flat config with `typescript-eslint` + `react-hooks` (the 6 disables already assume it), Prettier, and a `simple-git-hooks`/`lefthook` pre-commit running `tsc` + tests on changed files. Since Cursor and Claude both commit to `master` (per memory), a required CI check on push is the cheapest safety net.

## 4. Repo hygiene

### Root-level files that don't belong (all tracked unless noted)

| Group | Files | Action |
|---|---|---|
| Oct–Nov 2025 setup runbooks (superseded by working infra) | `GETTING_STARTED.md`, `PROJECT_PLAN.md`, `BACKEND_STATUS.md`, `PHASE_1_COMPLETE.md`, `PHASE_2_ROADMAP.md`, `ROLE_PERMISSIONS.md`, `TESTING_USER_MANAGEMENT.md`, `USER_MANAGEMENT.md`, `USER_MANAGEMENT_SUMMARY.md`, `SUPABASE_SETUP.md`, `APPLY_TEMPLATE_FEATURE.md`, `DEPLOY_EMAIL_FUNCTION.md`, `EMAIL_SETUP.md`, `WORKFLOW_IMPROVEMENTS.md`, `CHECK_QUOTE_DOCUMENTS_BUCKET.md`, `CHECK_VERCEL_DEPLOYMENT.md`, `CLEAR_SERVICE_WORKER.md`, `DEPLOY_TO_VERCEL.md`, `FIX_QUOTE_LINKS.md`, `FIX_SERVICE_WORKER_404.md`, `SETUP_QUOTE_DOCUMENTS_BUCKET.md`, `CHECK_FUNCTION_STATUS.md`, `FIND_SUPABASE_REF.md`, `INSTALL_SUPABASE_CLI.md`, `TROUBLESHOOT_EMAIL.md`, `SETUP_PROJECT_DOCUMENTS.md`, `BACKUP_VERIFICATION_GUIDE.md`, `DEPLOY_FEEDBACK_EMAIL_FUNCTION.md`, `DEAL_DOCUMENT_SHARE_DASHBOARD.md`, `SETUP_DEAL_DOCUMENTS.md` (30 files) | Delete (git history keeps them). Fold any still-true nugget (e.g. "email confirm must be OFF", storage bucket names) into CLAUDE.md / `docs/OPERATIONS.md`. |
| QR-code brainstorm (Dec 2025, never built) | `QR_CODE_BRAINSTORM.md`, `QR_CODE_REAL_VALUE.md`, `QR_CODE_SYSTEM_PLAN.md` | `docs/archive/ideas/` or delete |
| Jul–Aug 2026 implementation briefs (Cursor hand-offs, work shipped) | `FIELD_FOREMAN_ROLE_BRIEF.md`, `SCHEDULE_CHANGE_LOG_BRIEF.md`, `PUSH_NOTIFICATIONS_BRIEF.md`, `QUOTE_TRUST_BATCH_BRIEF.md`, `SUSPENDED_GRID_V3_PORT_BRIEF.md`, `DOOR_INSTALL_IMPLEMENTATION_BRIEF.md` (untracked) | Move to `docs/briefs/` (they're the same species as `docs/DRYWALL_D*_IMPLEMENTATION_BRIEF*.md`) |
| Business documents, not code | `HSH Architect Engineer Verification.txt`, `HSH Closing Site Start Checklist.txt`, `HSH Due Diligence Checklist.txt`, `HSh Selection Sheet.txt`, `HSH_GC_Workflow_Playbook.docx`, `HSH_GC_Workflow_Playbook.zip` (byte-identical to the docx), `docx_extract/` (17 files — the docx unzipped) | Delete from repo; live in Drive. If the playbook text is a product spec, keep one `.md` export under `docs/reference/`. |
| Design fossils | `figmasrc.zip` (235 KB), `styles/` (4 Figma-exported CSS files, nothing imports them — `index.html` only loads `/src/main.tsx`) | Delete |
| One-off data / scripts | `clear-projects.html`, `fix_rls_policies.sql`, `item_templates_import.csv`, `agent-tools-migration-payload.json` (23 bytes) | Delete (`scripts/archive/` already has the item-template SQL) |
| Local/untracked | `tmp/` (gitignored: Sherman St backup 697 KB), `scripts/.parity-payload.tmp.json`, `scripts/.env.admin.local` (ignored, good), `scripts/.pdf-smoke-runner.mjs` (tracked hidden file), `.claude/launch.json` | Track `.claude/launch.json` (harmless, useful); gitignore `scripts/.*.tmp.json`; rename `.pdf-smoke-runner.mjs` to visible or archive |
| `supabase/.temp/` | 8 files tracked (`project-ref`, `pooler-url`, `cli-latest`…) — CLI scratch, churns constantly (`M supabase/.temp/cli-latest` right now) | `git rm -r --cached supabase/.temp` + gitignore |
| Spike | `scripts/push-spike/` (untracked; `deno.json`, `deno.lock`, `spike_webpush.ts`) — push shipped 2026-07-29 via `_shared/webpush.ts` | Delete, or move to `scripts/archive/` |
| Root `deno.lock` | Deno lock for npm deps, not functions | Delete |
| `package.json` | `"main": "postcss.config.js"`, `"license": "ISC"`, `directories` | Trim |

### scripts/ triage

| Reusable tools (keep, document) | One-off / done (→ `scripts/archive/`) |
|---|---|
| `supabase-audit-recon.mjs` (memory says re-run), `admin-update-user-email.mjs` (+ `admin-email.env.example`), `build-parity-payload-for-project.mjs`, `quote-v3-parity.harness.test.ts`, `stale-v3-convert-backfill.harness.test.ts`, `stale-v3-convert-audit.mjs`, `lib/`, `fixtures/` | `a5c2-c1-smoke.mjs`, `a5c2-c2-smoke.mjs`, `a5e-env-check.mjs`, `a5e-storage-migration.mjs` (Apr 2026 A5 migration), `apply-stale-convert.mjs`, `build-parity-fixtures.mjs`, `drywall-field-accessory-parity*.mjs`, `drywall-quote-parity.{mjs,ts}`, `extract-drywall-calc.mjs`, `quote-v3-accessory-spotcheck.mjs`, `quote-v3-parity-test.mjs`, `generate-restaurant-structural-template-json.mjs`, `seed-restaurant-structural-template.mjs`, `write-restaurant-structural-migration.mjs`, `.pdf-smoke-runner.mjs` |

`payroll-recovery-scratch/` (referenced repeatedly in memory: `cleanup-metadata-bloat.mjs`, BT import pipeline, metadata backup JSON) **does not exist anywhere in the repo** (`find` + `git ls-files` = 0). It lives outside the repo or was deleted — the metadata-bloat cleanup tool and the 2026-07-21 backup JSON are therefore not versioned. Worth locating and checking in (minus data) under `scripts/maintenance/`.

`src/scripts/migrateToSupabase.ts` + `migratePlansToSupabase.ts` (Oct 2025, localStorage→Supabase, unreferenced, 34 of the 93 `console.log`s) — delete.

### docs/ reorganization (48 files, 2026-02 → 2026-08)

| Bucket | Files | Destination |
|---|---|---|
| **Current reference — keep at `docs/`** | `DESIGN_LANGUAGE.md`, `UI_PORT_PLAYBOOK.md`, `RBAC_PLAN.md` + `RBAC_PHASE2_MAPPING.md` (merge → `RBAC.md`), `SCHEDULE_TARGET_MODEL.md`, `ESTIMATE_AND_ACTUALS_STRUCTURE.md`, `STORAGE_SETUP.md`, `SUPABASE_HEALTH_AUDIT.md`, `AUDIT.md` (CHANGELOG section only — body stale per memory), `VERSION_1_5_ROADMAP.md`, `GC_WORKSPACE_LESSONS.md`, `DRYWALL_DIVISION_OPERATIONS_PLAN.md` (decisions register), `DRYWALL_LAUNCH_SMOKE_TEST.md` (turn into a reusable release checklist), `QBO_CONNECT_PRODUCTION.md`, `QUICKBOOKS_API_SETUP.md`, `QBO_INTUIT_COMPLIANCE_CHECKLIST.md` | `docs/` (reference) + `docs/ops/` for QBO/storage/supabase runbooks |
| **Completed plans — history** | `A5_PLAN.md`, `A5D_PLAN.md`, `A5E_RUNBOOK.md`, `A5C_BRANCH_VERIFICATION.md`, `A5C2_C1_PILOT.md`, `A5C2_C2…C6*.md` (7), `FEATURE_CLEANUP.md`, `GAMEPLAN_RETIREMENT.md`, `HR_PORT_PLAN.md`, `DRYWALL_PORT_PLAN.md`, `QUOTE_STAGE_REDESIGN_PLAN.md`, `QUOTE_V3_PARITY_REPORT.md`, `DRYWALL_V3_POLISH_BUNDLE.md`, `DRYWALL_D1/D2/D4/D6_IMPLEMENTATION_BRIEF(S).md`, `QUOTE_DOCUMENT_PLAN.md`, `CREW_TIME_CLOCK_PLAN.md`, `LABOR_QBO_BURDEN_PHASE1.md`, `phase-2-real-time-labor.md`, `RESTORE_PROJECT_VISIBLE_IN_GC.md`, `schedule-items-trace.md` | `docs/history/` (keep — they're the only written architecture rationale) |
| **Superseded / delete** | `QBO_PASTE_QB_GET_JOB_TRANSACTIONS.ts` (440-line paste copy of an edge function, already drifted), `QBO_DEPLOY_EDGE_FUNCTION_VIA_DASHBOARD.md` (CLI deploy exists), `supabase/functions/send-deal-document-share/index-standalone.ts` (same "paste into dashboard" pattern) | delete |
| **Ideas not scheduled** | `AI_USER_MANUAL_PLAN.md`, `estimate-assist-v2-planning.md` | `docs/ideas/` |

**`docs/INDEX.md`** should be ≤60 lines: (1) one-paragraph what-the-app-is + the two divisions (GC / Drywall) + roles; (2) "Read these first" — DESIGN_LANGUAGE, RBAC, SCHEDULE_TARGET_MODEL, ESTIMATE_AND_ACTUALS_STRUCTURE, DRYWALL_DIVISION_OPERATIONS_PLAN §decisions; (3) Ops runbooks table (deploy, migrations, edge functions + secrets, QBO, storage buckets, SMS/A2P status, push/VAPID); (4) History table with one line + ship date per archived plan; (5) Ideas; (6) "Where memory lives" note pointing at the Claude memory dir so the two don't diverge.

### Proposed `CLAUDE.md` (root, ~80 lines)
- **Commands**: `npm run dev`, `npm run build` (= tsc + vite), `npm test`, `npx tsc --noEmit`, `supabase db push`, `supabase functions deploy <name>` (`receive-sms` needs `--no-verify-jwt`), `node scripts/supabase-audit-recon.mjs`.
- **Architecture map**: `src/routes/index.tsx` (85 routes; `AuthedLayout` gate; `/crew` shell; public share pages `/quote/:token`, `/customer-schedule`, `/supplier-order-share`), `src/services/*` = Supabase data layer (GC in `supabaseService.ts`, drywall in `drywall*Service.ts`), `src/lib/drywall/*` = pure calc engine (tested), `src/lib/rbac.ts` + `usePermissions`, `src/contexts/AuthContext`, edge functions list + `_shared/`.
- **Conventions**: sonner for toasts (never radix toast); `date-fns`/`lib/dateFormat` for dates; `crypto.randomUUID` vs `uuid` (pick); RPC-first for crew writes (SECURITY DEFINER pattern); never select full `projects.metadata` on list paths; migrations `YYYYMMDDHHMMSS_snake.sql`, idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`); staged migrations go in `supabase/pending/`.
- **Gotchas**: Supabase Auth "Confirm email" must stay OFF (crew invite flow); `roles[0]` is effective role (crew clock vs HR clock); `schedules.user_id` NOT NULL; `isOnlineMode()` is a legacy fossil — never add new branches; don't run Cursor + Claude commits on master concurrently; `supabase/.temp` churn is noise.
- **Testing**: vitest node env; calc-engine tests in `src/lib/drywall`; parity harnesses need `PARITY_PAYLOAD_PATH`.

## 5. Edge functions

23 real functions + `_shared/{cors.ts (8 lines), qb.ts (85), webpush.ts (179)}`. All use `serve` from `deno.land/std@0.168.0` (23/23 — 2022 vintage; `Deno.serve` is the current API) and `esm.sh/@supabase/supabase-js@2` unpinned (20/20 — floating major).

| Boilerplate | Count | Duplicated in |
|---|---|---|
| Own `corsHeaders` instead of `_shared/cors.ts` | 10 | `deal-coach-chat`, all 9 `qb-*` |
| `createClient(...)` | 19 files (21 calls) | every function; no `_shared/supabase.ts` (`adminClient()` / `userClient(req)`) |
| `Authorization` header extraction + `auth.getUser()` | 14 | no `_shared/auth.ts` (`requireUser(req)`) |
| Resend email send | 7 | no `_shared/email.ts` |
| Twilio send | 2 (`send-sms`, `send-customer-sms`) | no `_shared/twilio.ts` |
| Error `Response` literals | dozens | no `_shared/http.ts` (`json()`, `error()`) |

Dead / inconsistent:
- **Empty dirs**: `accept-invitation/`, `invite-user/`, `qb-suggest-allocation/` (no `index.ts`) — `supabase functions deploy` (no name) will choke or skip them; delete.
- **Missing function**: `qb-find-vendor` invoked at `src/services/quickbooksService.ts:263` but no `supabase/functions/qb-find-vendor/` — either deployed by hand from the Dashboard (unversioned) or a dead code path. Verify in Dashboard.
- `send-deal-document-share/index-standalone.ts` — dashboard-paste copy, 36 diff lines from `index.ts`; delete.
- `receive-sms` (Twilio webhook), `send-meeting-*-digest` ×2 and `send-supplier-schedule-digest` (pg_cron `net.http_post`) are correctly not invoked from src.
- No `supabase/config.toml` in repo → per-function `verify_jwt` etc. is Dashboard-only state; no `deno.json`/`import_map.json` → no shared pinning of `std`/`supabase-js` versions. The `receive-sms --no-verify-jwt` requirement lives only in an npm script.

## 6. Migrations

179 files, three naming eras: 66 × `NNN_` (001–066), 9 × `YYYYMMDD_` (Apr–May 2026), 104 × `YYYYMMDDHHMMSS_`. Two oddities sort as year-2000: `20000201000000_multi_user_shared_access.sql`, `20002501000000_create_selection_room_spec_sheets.sql` (month "25"). No duplicate version prefixes; no same-day 8-digit/14-digit collisions, so **ordering is stable** — but the mixed eras are a trap for anyone writing a new one.

| Check | Result |
|---|---|
| `CREATE TABLE` without `IF NOT EXISTS` | 10 files (001, 003, 007, 021, 022, 047, 20002501…, 20260511000001, 20260514, 20260515000003) — fine for a fresh reset, breaks re-apply |
| `CREATE POLICY` files | 73, of which 48 have `DROP POLICY IF EXISTS`; 25 are non-idempotent |
| `CREATE FUNCTION` (no `OR REPLACE`) | 5 (`20000201…`, `20260723170000`, `20260724130000`, `20260724140000`, `20260818130000`) |
| pg_cron | 001 (`create extension`), `20260506_meeting_digest_cron.sql`, `20260818120001_…cron.sql` — cron jobs reference `functions/v1/<name>` URLs and project-specific secrets (vault ×2) |
| Storage buckets | created in 5 migrations — good |
| **Objects referenced but never created** | `org_team`, `project_events`, `work_packages` (ALTER/RLS in `20260427000009_…:30-32`, created in Dashboard); `pay_periods`, `time_entries` (first seen `20260427000006`), `project_milestones` — all queried from src; RPC `increment_use_count` (`sowService.ts:302`) |
| `supabase/pending/` | 1 staged file `20260730120100_anon_lockdown_drop_policies.sql` + README with preconditions (Batch A Part B). Memory says Batch A is DONE 2026-07-30 — if Part B was applied via MCP, this file is stale; if not, the anon `USING (true)` policies are still live. Reconcile. |

**Verdict:** a from-scratch `supabase db reset` is **not possible today**. Fix = one "baseline" migration (`supabase db dump --schema public` of the live schema, or at minimum `CREATE TABLE IF NOT EXISTS` for the 6 orphan tables + the missing RPC) placed before `20260427000009`, then a CI job that runs `supabase db reset` against a throwaway Postgres to keep it that way. Also `git rm --cached supabase/.temp`.

## 7. Top 15 actions (value/risk ordered)

### One afternoon of hygiene (S each, near-zero risk)
| # | Action | Size |
|---|---|---|
| 1 | Delete the 30 stale root runbooks, QR docs, `.txt/.docx/.zip/docx_extract/figmasrc.zip/styles/clear-projects.html/fix_rls_policies.sql/item_templates_import.csv/agent-tools-migration-payload.json`, root `deno.lock`, `src/scripts/`, `send-deal-document-share/index-standalone.ts`, `docs/QBO_PASTE_*.ts`; move the 6 briefs to `docs/briefs/`; `git rm -r --cached supabase/.temp` + gitignore; gitignore `scripts/.*.tmp.json`; track `.claude/launch.json` | S |
| 2 | Remove unused deps (`@radix-ui/react-checkbox`, `@radix-ui/react-toast`, `@types/uuid`, `workbox-window`); trim `package.json` metadata; drop the two redundant `vercel.json` rewrites | S |
| 3 | Delete empty function dirs; resolve `qb-find-vendor` (check Dashboard → add source or remove call); resolve `supabase/pending/` vs live state | S |
| 4 | `docs/` → `docs/{ops,history,ideas,briefs}` + `docs/INDEX.md`; write root `CLAUDE.md` (§4 outline) | S |
| 5 | Add `vercel.json` security headers (`X-Frame-Options: DENY` except share pages → `frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) and explicit `immutable` for `/assets/*` | S |
| 6 | Resize PWA icons (3 × 158 KB → ~5/15 KB); drop Cyrillic/Latin-ext font subsets from precache; replace `maximumFileSizeToCacheInBytes` bump with real splitting (see #8) | S |
| 7 | Add `lint`/`typecheck`/`format` scripts + ESLint flat config + Prettier; run once, commit the reformat separately | S–M |

### Structural (M/L)
| # | Action | Size | Why |
|---|---|---|---|
| 8 | **Route-level code splitting**: `React.lazy` per route group + `Suspense` fallback; dynamic-import `xlsx`, `jspdf`, `recharts`, `framer-motion`, `react-markdown`; add `manualChunks` for vendor. Target main chunk < 1 MB. | M | 4.5 MB per deploy to every phone; SW precache cap about to overflow |
| 9 | **Error boundaries**: one global (with "reload app" + copy-error) and one per route group / around `/crew`. | S–M | white-screen risk on every render throw |
| 10 | **GitHub Actions CI**: tsc + vitest + build + (later) `supabase db reset` smoke. Make it required on `master`. | M | two AI agents committing to master with no gate |
| 11 | **Migration baseline**: dump live schema for the 6 orphan tables + `increment_use_count`; normalize naming going forward; add `supabase/config.toml` (verify_jwt per function) and a `supabase/functions/deno.json` import map pinning `std` + `supabase-js`. | M | `db reset` impossible; Dashboard-only state |
| 12 | **Kill the offline-mode fossil**: remove `isOnlineMode()` (365 refs) and `src/services/storage.ts` localStorage shadow DB; make `supabase.ts` throw if env missing; migrate `planService`/`itemTemplateService`/`estimateTemplateService` fully to Supabase. Do it in a dedicated PR with tsc as the guide. | L | 86 dead branches in the 5k-line service; stale-template bugs across devices |
| 13 | **Edge `_shared` consolidation**: `supabase.ts` (admin/user clients), `auth.ts` (`requireUser`), `http.ts` (json/error/cors), `email.ts`, `twilio.ts`; migrate to `Deno.serve`; pin versions. ~23 functions × 20 lines each. | M | 10 copies of CORS, 14 of auth, 7 of Resend |
| 14 | **Replace 29 `confirm()` with a shared `ConfirmDialog`** (radix dialog already in `ui/`), starting with `SelectionBook`/`DealWorkspace`. | M | native confirm blocks the PWA thread, looks broken in standalone mode |
| 15 | **Type-safety debt**: `supabase gen types` → `src/types/database.ts`, `createClient<Database>`; then burn down `as any` in `DealWorkspace`/`ProjectActuals`/`supabaseService`/`laborImportService`; flip `noUnusedLocals` on. Add jsdom + a handful of component smoke tests for the crew pages. | L | 173 `as any`, dead hand-written `Database` type, 0 UI tests |

Sequencing suggestion: 1–7 in one sitting; then 10 (CI) before 8/9 so the splitting refactor is verified; 11 and 13 together (both touch Supabase-side plumbing); 12 and 15 last, as their own PRs.
