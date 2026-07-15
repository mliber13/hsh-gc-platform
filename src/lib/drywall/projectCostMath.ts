// ============================================================================
// Drywall project cost — pure aggregation (D.1.4)
// ============================================================================

import { parseISO } from 'date-fns'
import type { BidSnapshot, ProductionTimestamps } from '@/types/drywall'
import type { DrywallProjectLaborSummary } from './projectLaborMath'

export interface MaterialEntryFlat {
  id: string
  date: string
  description: string
  vendor: string | null
  amount: number
}

export interface SubEntryFlat {
  id: string
  date: string
  subcontractorName: string
  description: string
  amount: number
}

export interface DrywallProjectCostSummary {
  labor: {
    totalCost: number
    summary: DrywallProjectLaborSummary
  }
  material: {
    totalCost: number
    entries: MaterialEntryFlat[]
  }
  sub: {
    totalCost: number
    entries: SubEntryFlat[]
  }
  totalCost: number
}

export type ProductionWindowBuckets<T> = {
  preProduction: T[]
  duringProduction: T[]
  afterProduction: T[]
  unbounded: T[]
}

export type MarginVsBidResult = {
  marginPct: number | null
  marginUsd: number | null
  marginColor: 'green' | 'yellow' | 'red' | 'neutral'
}

function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : 0
}

function entryDateMs(date: string): number {
  const iso = date.length === 10 ? `${date}T23:59:59.999` : date
  return parseISO(iso).getTime()
}

function timestampMs(ts?: string | null): number | null {
  if (!ts) return null
  const n = Date.parse(ts)
  return Number.isFinite(n) ? n : null
}

function splitByProductionWindow<T>(
  entries: T[],
  timestamps: ProductionTimestamps,
  getDateMs: (entry: T) => number,
): ProductionWindowBuckets<T> {
  const preProduction: T[] = []
  const duringProduction: T[] = []
  const afterProduction: T[] = []
  const unbounded: T[] = []

  const startedMs = timestampMs(timestamps.productionStartedAt)
  if (startedMs == null) {
    return { preProduction, duringProduction, afterProduction, unbounded: [...entries] }
  }

  const completedMs = timestampMs(timestamps.productionCompletedAt)
  const closedMs = timestampMs(timestamps.closedAt) ?? Date.now()

  for (const entry of entries) {
    const endMs = getDateMs(entry)

    if (endMs <= startedMs) {
      preProduction.push(entry)
      continue
    }

    if (completedMs == null || endMs <= completedMs) {
      duringProduction.push(entry)
      continue
    }

    if (endMs <= closedMs) {
      afterProduction.push(entry)
      continue
    }

    unbounded.push(entry)
  }

  return { preProduction, duringProduction, afterProduction, unbounded }
}

export function splitMaterialByProductionWindow(
  entries: MaterialEntryFlat[],
  timestamps: ProductionTimestamps,
): ProductionWindowBuckets<MaterialEntryFlat> {
  return splitByProductionWindow(entries, timestamps, (e) => entryDateMs(e.date))
}

export function splitSubByProductionWindow(
  entries: SubEntryFlat[],
  timestamps: ProductionTimestamps,
): ProductionWindowBuckets<SubEntryFlat> {
  return splitByProductionWindow(entries, timestamps, (e) => entryDateMs(e.date))
}

export function summarizeMaterial(entries: MaterialEntryFlat[]): {
  totalCost: number
  entries: MaterialEntryFlat[]
} {
  const totalCost = entries.reduce((sum, e) => sum + num(e.amount), 0)
  return { totalCost, entries }
}

export function summarizeSub(entries: SubEntryFlat[]): {
  totalCost: number
  entries: SubEntryFlat[]
} {
  const totalCost = entries.reduce((sum, e) => sum + num(e.amount), 0)
  return { totalCost, entries }
}

export function combineProjectCost(
  labor: DrywallProjectLaborSummary,
  material: { totalCost: number; entries: MaterialEntryFlat[] },
  sub: { totalCost: number; entries: SubEntryFlat[] },
): DrywallProjectCostSummary {
  const laborTotal = num(labor.totalCost)
  const materialTotal = num(material.totalCost)
  const subTotal = num(sub.totalCost)
  return {
    labor: { totalCost: laborTotal, summary: labor },
    material: { totalCost: materialTotal, entries: material.entries },
    sub: { totalCost: subTotal, entries: sub.entries },
    totalCost: laborTotal + materialTotal + subTotal,
  }
}

export function computeMarginVsBid(
  costSummary: DrywallProjectCostSummary,
  bidSnapshot: BidSnapshot | null,
): MarginVsBidResult {
  return computeMarginVsContractValue(costSummary, bidSnapshot?.total ?? null)
}

export function computeMarginVsContractValue(
  costSummary: DrywallProjectCostSummary,
  contractValue: number | null,
): MarginVsBidResult {
  if (contractValue == null || num(contractValue) <= 0) {
    return { marginPct: null, marginUsd: null, marginColor: 'neutral' }
  }

  const bid = num(contractValue)
  const cost = num(costSummary.totalCost)
  const marginUsd = bid - cost
  const marginPct = marginUsd / bid

  let marginColor: MarginVsBidResult['marginColor']
  if (marginPct >= 0.3) marginColor = 'green'
  else if (marginPct >= 0.25) marginColor = 'yellow'
  else marginColor = 'red'

  return { marginPct, marginUsd, marginColor }
}

export function computeCurrentCrew(
  summary: DrywallProjectLaborSummary,
  options?: { maxNames?: number },
): { names: string[]; total: number } {
  const maxNames = options?.maxNames ?? 5
  if (summary.byPayPeriod.length === 0) {
    return { names: [], total: 0 }
  }

  const latest = summary.byPayPeriod[summary.byPayPeriod.length - 1]
  const periodEntries = summary.entries.filter((e) => e.payPeriodId === latest.payPeriodId)
  const nameSet = new Set<string>()
  for (const e of periodEntries) {
    const name = String(e.personName ?? '').trim()
    if (name) nameSet.add(name)
  }

  const allNames = [...nameSet].sort((a, b) => a.localeCompare(b))
  return {
    names: allNames.slice(0, maxNames),
    total: allNames.length,
  }
}

export function pickWindowEntries<T>(
  split: ProductionWindowBuckets<T>,
  window: 'all' | 'production' | 'after-production' | 'pre-production',
): T[] {
  switch (window) {
    case 'pre-production':
      return split.preProduction
    case 'production':
      return split.duringProduction
    case 'after-production':
      return split.afterProduction
    default:
      return [
        ...split.preProduction,
        ...split.duringProduction,
        ...split.afterProduction,
        ...split.unbounded,
      ]
  }
}
