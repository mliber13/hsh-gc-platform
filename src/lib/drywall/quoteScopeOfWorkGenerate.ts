import {
  QUOTE_LINE_TYPE_LABELS,
  getLineCatalogLabel,
  getLineUnit,
  resolveFinishScope,
} from './quoteV3CatalogResolve'
import type { QuoteLineItem, QuoteLineItemType } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'

const TRADE_ORDER: QuoteLineItemType[] = [
  'drywall',
  'rc_channel',
  'suspended_grid',
  'insulation',
  'acoustic',
  'metal_stud',
  'frp',
]

function formatQty(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0'
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function formatLocations(locations: string[]): string {
  const labels = locations.filter((l) => l && l !== 'Unassigned')
  if (labels.length === 0) return ''
  return ` (${labels.join(', ')})`
}

function collectLocations(lines: QuoteLineItem[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    const loc = line.location?.trim()
    if (!loc || seen.has(loc)) continue
    seen.add(loc)
    out.push(loc)
  }
  return out
}

function summarizeDrywall(lines: QuoteLineItem[], catalogs: OrgDrywallCatalogs): string[] {
  const groups = new Map<string, { qty: number; lines: QuoteLineItem[] }>()
  for (const line of lines) {
    if (!line.quantity) continue
    const key = `${line.catalog_id}|${line.finish_scope_id ?? ''}`
    const g = groups.get(key) ?? { qty: 0, lines: [] }
    g.qty += line.quantity
    g.lines.push(line)
    groups.set(key, g)
  }

  return [...groups.values()].map(({ qty, lines: groupLines }) => {
    const sample = groupLines[0]
    const board = getLineCatalogLabel(sample, catalogs)
    const finish = resolveFinishScope(sample, catalogs)?.display_name ?? 'unspecified finish'
    const finishPhrase =
      sample.finish_scope_id === 'hang_only'
        ? finish
        : finish.toLowerCase().includes('finish')
          ? finish
          : `${finish} finish`
    return `${formatQty(qty)} sqft ${board} with ${finishPhrase}${formatLocations(collectLocations(groupLines))}`
  })
}

function summarizeComponentLines(
  lines: QuoteLineItem[],
  catalogs: OrgDrywallCatalogs,
): string[] {
  const groups = new Map<string, { qty: number; lines: QuoteLineItem[] }>()
  for (const line of lines) {
    if (!line.quantity || !line.catalog_id) continue
    const g = groups.get(line.catalog_id) ?? { qty: 0, lines: [] }
    g.qty += line.quantity
    g.lines.push(line)
    groups.set(line.catalog_id, g)
  }

  return [...groups.entries()].map(([, { qty, lines: groupLines }]) => {
    const sample = groupLines[0]
    const unit = getLineUnit(sample, catalogs)
    const label = getLineCatalogLabel(sample, catalogs)
    return `${formatQty(qty)} ${unit} ${label}${formatLocations(collectLocations(groupLines))}`
  })
}

/** Build customer-facing scope prose from routine line items. */
export function generateScopeOfWorkFromLineItems(
  lineItems: QuoteLineItem[],
  catalogs: OrgDrywallCatalogs,
): string {
  const byType = new Map<QuoteLineItemType, QuoteLineItem[]>()
  for (const line of lineItems) {
    const bucket = byType.get(line.type) ?? []
    bucket.push(line)
    byType.set(line.type, bucket)
  }

  const tradeBlocks: string[] = []

  for (const type of TRADE_ORDER) {
    const lines = byType.get(type)
    if (!lines?.length) continue

    const parts =
      type === 'drywall'
        ? summarizeDrywall(lines, catalogs)
        : summarizeComponentLines(lines, catalogs)

    if (parts.length === 0) continue
    tradeBlocks.push(`${QUOTE_LINE_TYPE_LABELS[type]}: ${parts.join('; ')}`)
  }

  return tradeBlocks.join('. ')
}
