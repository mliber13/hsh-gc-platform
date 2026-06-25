import { buildV3FromV2, v2QuoteFromV3Snapshot } from './convertQuoteV2ToV3'
import { hydrateDrywallQuoteV3, prepareDrywallQuoteV3ForSave } from './createEmptyDrywallQuoteV3'
import { computeQuoteV3Totals } from './quoteV3Math'
import type { DrywallQuote, DrywallQuoteV3, QuoteLineItem } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'

function parseNum(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** v2 waste → expected per-line waste_pct on a fresh convert. */
export function expectedWastePctFromV2(v2: DrywallQuote): number {
  if (v2.wastePercentage === '' || v2.wastePercentage == null) return 10
  return parseNum(v2.wastePercentage, 10)
}

export function collectStaleConvertSignals(
  liveQuote: Record<string, unknown>,
  v2: DrywallQuote,
): string[] {
  const signals: string[] = []

  if (liveQuote.hanger_include_labor_burden == null) {
    signals.push('hanger_include_labor_burden missing')
  }
  if (liveQuote.finisher_include_labor_burden == null) {
    signals.push('finisher_include_labor_burden missing')
  }
  if (liveQuote.prep_clean_include_labor_burden == null) {
    signals.push('prep_clean_include_labor_burden missing')
  }

  const expectedWaste = expectedWastePctFromV2(v2)
  const lines = Array.isArray(liveQuote.lineItems) ? liveQuote.lineItems : []
  const drywallLines = lines.filter(
    (raw) => (raw as QuoteLineItem).type === 'drywall' || (raw as QuoteLineItem).type == null,
  )

  if (drywallLines.length === 0 && parseNum(v2.sqft, 0) > 0) {
    signals.push('no drywall lineItems but v2 snapshot has sqft')
  }

  drywallLines.forEach((raw, i) => {
    const line = raw as QuoteLineItem
    if (line.accessories_in_material_rate == null) {
      signals.push(`line[${i}] accessories_in_material_rate missing`)
    }
    const waste = line.waste_pct != null ? parseNum(line.waste_pct, NaN) : undefined
    if (!Number.isFinite(waste) || waste !== expectedWaste) {
      signals.push(
        `line[${i}] waste_pct=${line.waste_pct ?? 'null'} (expected ${expectedWaste} from v2)`,
      )
    }
  })

  return signals
}

export function isStaleV3Convert(liveQuote: Record<string, unknown>, v2Snapshot: unknown): boolean {
  const v2 = v2QuoteFromV3Snapshot(v2Snapshot)
  return collectStaleConvertSignals(liveQuote, v2).length > 0
}

export function buildFreshV3FromSnapshot(
  liveQuote: Record<string, unknown>,
  v2Snapshot: unknown,
): DrywallQuoteV3 {
  const v2 = v2QuoteFromV3Snapshot(v2Snapshot)
  const fresh = buildV3FromV2(v2)
  const quoteNumber =
    typeof liveQuote.quoteNumber === 'string' && liveQuote.quoteNumber.trim()
      ? liveQuote.quoteNumber.trim()
      : fresh.quoteNumber
  return { ...fresh, quoteNumber }
}

export interface StaleConvertTotals {
  liveTotal: number
  freshTotal: number
  variance: number
}

export function compareStaleConvertTotals(
  liveQuote: Record<string, unknown>,
  v2Snapshot: unknown,
  catalogs: OrgDrywallCatalogs,
): StaleConvertTotals {
  const liveHydrated = hydrateDrywallQuoteV3(liveQuote)
  const liveTotal = computeQuoteV3Totals(liveHydrated, catalogs).routine.total
  const fresh = buildFreshV3FromSnapshot(liveQuote, v2Snapshot)
  const freshTotal = computeQuoteV3Totals(fresh, catalogs).routine.total
  return { liveTotal, freshTotal, variance: liveTotal - freshTotal }
}

export function describeRefreshFieldChanges(
  liveQuote: Record<string, unknown>,
  fresh: DrywallQuoteV3,
): string[] {
  const changes: string[] = []

  const quoteFields: Array<[string, unknown, unknown]> = [
    ['hanger_include_labor_burden', liveQuote.hanger_include_labor_burden, fresh.hanger_include_labor_burden],
    ['finisher_include_labor_burden', liveQuote.finisher_include_labor_burden, fresh.finisher_include_labor_burden],
    ['prep_clean_include_labor_burden', liveQuote.prep_clean_include_labor_burden, fresh.prep_clean_include_labor_burden],
    ['prep_clean_rate', liveQuote.prep_clean_rate, fresh.prep_clean_rate],
    ['overhead_pct', liveQuote.overhead_pct, fresh.overhead_pct],
    ['profit_pct', liveQuote.profit_pct, fresh.profit_pct],
    ['sales_tax_pct', liveQuote.sales_tax_pct, fresh.sales_tax_pct],
  ]

  for (const [key, before, after] of quoteFields) {
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push(`quote.${key}: ${JSON.stringify(before)} → ${JSON.stringify(after)}`)
    }
  }

  const liveLines = Array.isArray(liveQuote.lineItems) ? liveQuote.lineItems : []
  const freshLines = fresh.lineItems
  changes.push(`lineItems count: ${liveLines.length} → ${freshLines.length}`)

  const max = Math.max(liveLines.length, freshLines.length)
  for (let i = 0; i < max; i++) {
    const live = liveLines[i] as QuoteLineItem | undefined
    const next = freshLines[i]
    if (!live || !next) continue
    const lineFields: Array<[string, unknown, unknown]> = [
      ['accessories_in_material_rate', live.accessories_in_material_rate, next.accessories_in_material_rate],
      ['waste_pct', live.waste_pct, next.waste_pct],
      ['custom_material_rate', live.custom_material_rate, next.custom_material_rate],
      ['custom_hanger_rate', live.custom_hanger_rate, next.custom_hanger_rate],
      ['custom_finisher_rate', live.custom_finisher_rate, next.custom_finisher_rate],
      ['catalog_id', live.catalog_id, next.catalog_id],
      ['finish_scope_id', live.finish_scope_id, next.finish_scope_id],
    ]
    for (const [key, before, after] of lineFields) {
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        changes.push(`line[${i}].${key}: ${JSON.stringify(before)} → ${JSON.stringify(after)}`)
      }
    }
  }

  return changes
}

export function prepareRefreshedQuotePayload(
  liveQuote: Record<string, unknown>,
  v2Snapshot: unknown,
): Record<string, unknown> {
  const fresh = buildFreshV3FromSnapshot(liveQuote, v2Snapshot)
  return prepareDrywallQuoteV3ForSave(fresh)
}

export const BATCH_ARCHIVE_KEY = 'quote_v3_archive_2026_06_08'

export function archiveKeyForTimestamp(iso: string): string {
  const slug = iso.replace(/[:.]/g, '-')
  return `quote_v3_archive_${slug}`
}
