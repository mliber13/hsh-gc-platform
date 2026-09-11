/**
 * Read-only per-trade v2 vs v3 comparison.
 * Used by scripts/scan-v2-v3-per-trade.mjs (via the harness) against an
 * offline JSON dump — no database writes, no converter changes.
 */
import { buildDrywallQuoteCalculations } from '../../src/lib/drywall/buildDrywallQuoteCalculations'
import { buildV3FromV2 } from '../../src/lib/drywall/convertQuoteV2ToV3'
import { hydrateDrywallQuote } from '../../src/lib/drywall/createEmptyDrywallQuote'
import { hydrateDrywallQuoteV3 } from '../../src/lib/drywall/createEmptyDrywallQuoteV3'
import { applyLaborBurden } from '../../src/lib/drywall/calculations/quantityUtils'
import { computeQuoteV3Totals, type QuoteV3MarkupBreakdown } from '../../src/lib/drywall/quoteV3Math'
import type { DrywallQuote, QuoteLineItemType } from '../../src/types/drywall'
import type { OrgDrywallCatalogs } from '../../src/types/drywallCatalogs'

const CENT = 0.01

type TradeKey =
  | 'drywall_material'
  | 'drywall_hanger'
  | 'drywall_finisher'
  | 'drywall_accessories'
  | 'rc_channel_material'
  | 'rc_channel_labor'
  | 'suspended_grid_material'
  | 'suspended_grid_labor'
  | 'metal_stud_material'
  | 'metal_stud_labor'
  | 'insulation_material'
  | 'insulation_labor'
  | 'acoustic_material'
  | 'acoustic_labor'
  | 'frp_material'
  | 'frp_labor'
  | 'door_install_material'
  | 'door_install_labor'
  | 'cleanup'
  | 'grand_total'

const TRADE_KEYS: TradeKey[] = [
  'drywall_material',
  'drywall_hanger',
  'drywall_finisher',
  'drywall_accessories',
  'rc_channel_material',
  'rc_channel_labor',
  'suspended_grid_material',
  'suspended_grid_labor',
  'metal_stud_material',
  'metal_stud_labor',
  'insulation_material',
  'insulation_labor',
  'acoustic_material',
  'acoustic_labor',
  'frp_material',
  'frp_labor',
  'door_install_material',
  'door_install_labor',
  'cleanup',
  'grand_total',
]

export interface ScanProjectInput {
  id: string
  name: string
  v2Quote: unknown
  v3Quote: unknown
}

export interface TradeDeltaRow {
  projectId: string
  projectName: string
  path: 'live_v3' | 'fresh_convert'
  trade: TradeKey
  v2: number
  v3: number
  absDelta: number
  pctDelta: number
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function pct(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

function emptyTrades(): Record<TradeKey, number> {
  return Object.fromEntries(TRADE_KEYS.map((k) => [k, 0])) as Record<TradeKey, number>
}

function v2Trades(calc: Record<string, unknown>, v2: DrywallQuote): Record<TradeKey, number> {
  const out = emptyTrades()
  out.drywall_material = num(calc.materialCost)
  out.drywall_hanger = applyLaborBurden(num(calc.hangerCost), v2.hangerIncludeLaborBurden)
  out.drywall_finisher = applyLaborBurden(num(calc.finisherCost), v2.finisherIncludeLaborBurden)
  out.drywall_accessories = 0
  out.rc_channel_material = num(calc.rcChannelMaterialCost)
  out.rc_channel_labor = num(calc.rcChannelLaborCost)
  out.suspended_grid_material = num(calc.suspendedGridMaterialCost)
  out.suspended_grid_labor = num(calc.suspendedGridLaborCost)
  out.metal_stud_material = num(calc.metalStudMaterialCost)
  out.metal_stud_labor = num(calc.metalStudLaborCost)
  out.insulation_material = num(calc.insulationMaterialCost)
  out.insulation_labor = num(calc.insulationLaborCost)
  out.acoustic_material = num(calc.acousticCeilingMaterialCost)
  out.acoustic_labor = num(calc.acousticCeilingLaborCost)
  out.frp_material = num(calc.frpMaterialCost)
  out.frp_labor = num(calc.frpLaborCost)
  out.door_install_material = 0
  out.door_install_labor = 0
  out.cleanup = applyLaborBurden(num(calc.prepCleanCost), v2.prepCleanIncludeLaborBurden)
  out.grand_total = num(calc.finalTotal) || num(calc.calculatedTotal)
  return out
}

function v3Trades(routine: QuoteV3MarkupBreakdown): Record<TradeKey, number> {
  const out = emptyTrades()
  const t = routine.byTrade ?? {}
  const dry = t.drywall
  out.drywall_material = dry?.material ?? 0
  out.drywall_hanger = dry?.hangerLabor ?? 0
  out.drywall_finisher = dry?.finisherLabor ?? 0
  out.drywall_accessories = dry?.accessories ?? 0
  const fill = (type: QuoteLineItemType, mat: TradeKey, lab: TradeKey) => {
    const row = t[type]
    out[mat] = row?.material ?? 0
    out[lab] = row?.componentLabor ?? 0
  }
  fill('rc_channel', 'rc_channel_material', 'rc_channel_labor')
  fill('suspended_grid', 'suspended_grid_material', 'suspended_grid_labor')
  fill('metal_stud', 'metal_stud_material', 'metal_stud_labor')
  fill('insulation', 'insulation_material', 'insulation_labor')
  fill('acoustic', 'acoustic_material', 'acoustic_labor')
  fill('frp', 'frp_material', 'frp_labor')
  fill('door_install', 'door_install_material', 'door_install_labor')
  out.cleanup = routine.cleanupTotal
  out.grand_total = routine.total
  return out
}

function rowsFor(
  project: ScanProjectInput,
  path: TradeDeltaRow['path'],
  v2: Record<TradeKey, number>,
  v3: Record<TradeKey, number>,
): TradeDeltaRow[] {
  return TRADE_KEYS.map((trade) => {
    const absDelta = v3[trade] - v2[trade]
    const denom = Math.abs(v2[trade]) > CENT ? Math.abs(v2[trade]) : Math.abs(v3[trade])
    const pctDelta = denom > CENT ? (absDelta / denom) * 100 : absDelta === 0 ? 0 : 100
    return {
      projectId: project.id,
      projectName: project.name,
      path,
      trade,
      v2: v2[trade],
      v3: v3[trade],
      absDelta,
      pctDelta,
    }
  }).filter((row) => Math.abs(row.absDelta) >= CENT || Math.abs(row.v2) >= CENT || Math.abs(row.v3) >= CENT)
}

export function scanProject(
  project: ScanProjectInput,
  catalogs: OrgDrywallCatalogs,
): { rows: TradeDeltaRow[]; storedLineCount: number; hydratedLineCount: number; notes: string[] } {
  const v2 = hydrateDrywallQuote(project.v2Quote)
  const calc = buildDrywallQuoteCalculations(v2) as Record<string, unknown>
  const v2Amounts = v2Trades(calc, v2)

  const stored = project.v3Quote && typeof project.v3Quote === 'object'
    ? (project.v3Quote as { lineItems?: unknown[] })
    : {}
  const storedLineCount = Array.isArray(stored.lineItems) ? stored.lineItems.length : 0

  const live = hydrateDrywallQuoteV3(project.v3Quote)
  const liveTotals = computeQuoteV3Totals(live, catalogs)
  const liveAmounts = v3Trades(liveTotals.routine)

  const converted = buildV3FromV2(v2)
  const convertTotals = computeQuoteV3Totals(converted, catalogs)
  const convertAmounts = v3Trades(convertTotals.routine)

  const notes: string[] = []
  if (storedLineCount === 0 && live.lineItems.length > 0) {
    notes.push(`stale empty v3 repaired on hydrate → ${live.lineItems.length} line(s)`)
  }
  if ((v2.breakdowns?.length ?? 0) > 0) {
    notes.push(`${v2.breakdowns?.length} v2 breakdown(s)`)
  }

  return {
    storedLineCount,
    hydratedLineCount: live.lineItems.length,
    notes,
    rows: [
      ...rowsFor(project, 'live_v3', v2Amounts, liveAmounts),
      ...rowsFor(project, 'fresh_convert', v2Amounts, convertAmounts),
    ],
  }
}

export function printScanReport(
  results: Array<{
    project: ScanProjectInput
    storedLineCount: number
    hydratedLineCount: number
    notes: string[]
    rows: TradeDeltaRow[]
  }>,
): void {
  const disagree = (path: TradeDeltaRow['path']) =>
    results
      .flatMap((r) => r.rows.filter((row) => row.path === path && Math.abs(row.absDelta) >= CENT))
      .sort((a, b) => Math.abs(b.absDelta) - Math.abs(a.absDelta))

  const liveDisagree = disagree('live_v3')
  const convertDisagree = disagree('fresh_convert')

  const cleanLive = results.filter(
    (r) => !r.rows.some((row) => row.path === 'live_v3' && Math.abs(row.absDelta) >= CENT),
  ).length
  const cleanConvert = results.filter(
    (r) => !r.rows.some((row) => row.path === 'fresh_convert' && Math.abs(row.absDelta) >= CENT),
  ).length

  console.log(`Projects scanned: ${results.length}`)
  console.log(`Clean live-v3 vs v2 (all trades ≤ $0.01): ${cleanLive}`)
  console.log(`Clean fresh-convert vs v2 (all trades ≤ $0.01): ${cleanConvert}`)
  console.log('')
  console.log('Notes / empty stored v3:')
  for (const r of results) {
    if (r.notes.length === 0 && r.storedLineCount > 0) continue
    console.log(
      `  ${r.project.name}  storedLines=${r.storedLineCount} hydratedLines=${r.hydratedLineCount}` +
        (r.notes.length ? `  (${r.notes.join('; ')})` : ''),
    )
  }
  console.log('')

  const printTop = (title: string, rows: TradeDeltaRow[], limit = 25) => {
    console.log(`--- ${title} (${rows.length} trade-rows over 1¢) ---`)
    if (rows.length === 0) {
      console.log('  (none)')
      return
    }
    for (const row of rows.slice(0, limit)) {
      console.log(
        `  ${fmt(Math.abs(row.absDelta)).padStart(12)}  ${pct(row.pctDelta).padStart(8)}  ${row.trade.padEnd(24)}  ${row.projectName.padEnd(36)}  v2 ${fmt(row.v2)}  v3 ${fmt(row.v3)}`,
      )
    }
    if (rows.length > limit) console.log(`  … ${rows.length - limit} more`)
    console.log('')
  }

  printTop('Live stored v3 − v2 snapshot, by |delta|', liveDisagree)
  printTop('Fresh convert − v2 snapshot, by |delta|', convertDisagree)
}
