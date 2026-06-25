/**
 * Stale v3 convert audit + backfill preview (read-only math).
 */

import {
  BATCH_ARCHIVE_KEY,
  buildFreshV3FromSnapshot,
  collectStaleConvertSignals,
  compareStaleConvertTotals,
  describeRefreshFieldChanges,
  isStaleV3Convert,
  prepareRefreshedQuotePayload,
} from '../../src/lib/drywall/staleV3ConvertAudit.ts'
import { v2QuoteFromV3Snapshot } from '../../src/lib/drywall/convertQuoteV2ToV3.ts'
import { parseOrgDrywallCatalogs } from '../../src/lib/drywall/catalogUtils.ts'
import type { OrgDrywallCatalogs } from '../../src/types/drywallCatalogs'

export interface StaleConvertProjectInput {
  id: string
  name: string
  quote: Record<string, unknown>
}

export interface StaleConvertAuditResult {
  id: string
  name: string
  convertedAt: string | null
  stale: boolean
  signals: string[]
  liveTotal: number
  freshTotal: number
  variance: number
}

export interface StaleConvertPreviewResult extends StaleConvertAuditResult {
  fieldChanges: string[]
  archiveKey: string
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function convertedAt(quote: Record<string, unknown>): string | null {
  return typeof quote.updatedAt === 'string' ? quote.updatedAt : null
}

export function auditStaleConvertProject(
  project: StaleConvertProjectInput,
  catalogs: OrgDrywallCatalogs,
): StaleConvertAuditResult {
  const snapshot = project.quote.legacyV2Snapshot
  if (!snapshot) {
    return {
      id: project.id,
      name: project.name,
      convertedAt: convertedAt(project.quote),
      stale: false,
      signals: ['no legacyV2Snapshot'],
      liveTotal: 0,
      freshTotal: 0,
      variance: 0,
    }
  }

  const v2 = v2QuoteFromV3Snapshot(snapshot)
  const signals = collectStaleConvertSignals(project.quote, v2)
  const totals = compareStaleConvertTotals(project.quote, snapshot, catalogs)

  return {
    id: project.id,
    name: project.name,
    convertedAt: convertedAt(project.quote),
    stale: signals.length > 0,
    signals,
    ...totals,
  }
}

export function previewStaleConvertRefresh(
  project: StaleConvertProjectInput,
  catalogs: OrgDrywallCatalogs,
): StaleConvertPreviewResult {
  const audit = auditStaleConvertProject(project, catalogs)
  const fresh = buildFreshV3FromSnapshot(project.quote, project.quote.legacyV2Snapshot)
  const fieldChanges = describeRefreshFieldChanges(project.quote, fresh)

  return {
    ...audit,
    fieldChanges,
    archiveKey: BATCH_ARCHIVE_KEY,
  }
}

export function runStaleConvertAudit(
  projects: StaleConvertProjectInput[],
  catalogsPayload: unknown,
): StaleConvertAuditResult[] {
  const catalogs = parseOrgDrywallCatalogs(catalogsPayload)
  return projects.map((p) => auditStaleConvertProject(p, catalogs))
}

export function printStaleConvertAuditReport(results: StaleConvertAuditResult[]): void {
  console.log('\n=== Stale v3 convert audit ===\n')
  const stale = results.filter((r) => r.stale)
  const fresh = results.filter((r) => !r.stale)

  console.log(`Total v3+snapshot projects: ${results.length}`)
  console.log(`Stale: ${stale.length} | Fresh: ${fresh.length}\n`)

  if (stale.length) {
    const header = [
      'Project'.padEnd(26),
      'Converted'.padStart(20),
      'Live'.padStart(12),
      'Fresh'.padStart(12),
      'Variance'.padStart(12),
    ].join(' ')
    console.log('STALE PROJECTS')
    console.log(header)
    console.log('-'.repeat(header.length))
    for (const r of stale) {
      console.log(
        [
          r.name.slice(0, 26).padEnd(26),
          (r.convertedAt?.slice(0, 19) ?? '—').padStart(20),
          fmt(r.liveTotal).padStart(12),
          fmt(r.freshTotal).padStart(12),
          fmt(r.variance).padStart(12),
        ].join(' '),
      )
      console.log(`  signals: ${r.signals.join('; ')}`)
    }
    console.log('')
  }

  if (fresh.length) {
    console.log('FRESH (no action needed):')
    for (const r of fresh) {
      console.log(`  ${r.name} (${r.id})`)
    }
  }
}

export function printStaleConvertPreview(results: StaleConvertPreviewResult[]): void {
  console.log('\n=== Stale v3 convert refresh preview (no writes) ===\n')
  for (const r of results.filter((p) => p.stale)) {
    console.log(`${r.name} (${r.id})`)
    console.log(`  Archive key: metadata.legacy.${r.archiveKey}`)
    console.log(`  Live total: ${fmt(r.liveTotal)} → Fresh: ${fmt(r.freshTotal)} (${fmt(r.variance)})`)
    console.log('  Field changes:')
    for (const line of r.fieldChanges.slice(0, 20)) {
      console.log(`    ${line}`)
    }
    if (r.fieldChanges.length > 20) {
      console.log(`    … +${r.fieldChanges.length - 20} more`)
    }
    console.log('')
  }
}

export function buildRefreshedLegacyQuoteMerge(
  prevQuote: Record<string, unknown>,
  v2Snapshot: unknown,
): Record<string, unknown> {
  const refreshed = prepareRefreshedQuotePayload(prevQuote, v2Snapshot)
  const quoteNumber =
    typeof prevQuote.quoteNumber === 'string' && prevQuote.quoteNumber.trim()
      ? prevQuote.quoteNumber.trim()
      : refreshed.quoteNumber
  return {
    ...refreshed,
    quoteNumber,
    version: 3,
    legacyV2Snapshot: prevQuote.legacyV2Snapshot ?? v2Snapshot,
  }
}

export { BATCH_ARCHIVE_KEY, isStaleV3Convert }
