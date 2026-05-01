import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Textarea } from './ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { ArrowLeft, ChevronDown, Download, Mic, MicOff, Pencil, Play, Plus, Save, Send, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePageTitle } from '@/contexts/PageTitleContext'
import type { Deal } from '@/types/deal'
import type { Project } from '@/types'
import type { ForSalePhaseInput, ProFormaInput, ProFormaMode, ProFormaProjection } from '@/types/proforma'
import { computeDealReadiness, materialForSaleContext, type DealReadiness } from '@/lib/dealReadiness'
import { computePhaseAllocationShares } from '@/lib/forSalePhaseAllocation'
import { createDeal, deleteDeal, fetchDeals } from '@/services/dealService'
import {
  clearDealActivityEvents,
  clearDealActivityEventsByTypes,
  listDealActivityEvents,
  listDealProFormaVersions,
  logDealActivityEvent,
  loadDealProFormaInputs,
  loadDealWorkspaceContext,
  saveDealProFormaDraft,
  saveDealProFormaVersion,
  saveDealWorkspaceContext,
} from '@/services/supabaseService'
import { calculateProForma } from '@/services/proformaService'
import { exportProFormaToExcel, exportProFormaToPDF } from '@/services/proformaExportService'
import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'

type WorkspaceStage = 'coaching' | 'scenario' | 'proforma'
type FieldStatus = 'confirmed' | 'approx' | 'empty'

interface WorkspaceMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: string
  extractionChips?: string[]
}

interface StageMarker {
  id: string
  stage: WorkspaceStage
  createdAt: string
}

interface ActivityItem {
  id: string
  eventType: string
  eventText: string
  createdAt: string
}

interface CoachResponse {
  reply: string
  fieldUpdates?: Partial<ProFormaInput>
  notesAppend?: string
  taskSuggestions?: string[]
  confidence?: number
  stageSuggestion?: WorkspaceStage
  suggestedUpdates?: Partial<ProFormaInput>
}

interface FieldMeta {
  status: FieldStatus
  source: 'user' | 'ai'
  updatedAt: string
}

interface DealWorkspaceProps {
  dealId?: string
  onBack: () => void
}

type WorkspaceCenterTab =
  | 'assumptions'
  | 'phase-pro-forma'
  | 'cash-flow'
  | 'investor-returns'
  | 'public-sector'
  | 'dashboard'
  | 'analysis'
type DebtLocApplyTo = 'loc-limit' | 'debt-amount' | 'bond-capacity'
type DebtInstrumentType = 'revolving-interest-only' | 'term-interest-only' | 'amortizing'
type IncentiveApplyTo = 'infrastructure-reduction' | 'cost-reduction' | 'equity-source'
type IncentiveTimingMode = 'upfront' | 'construction-percent' | 'by-phase' | 'at-closings'

interface DebtLocStackRow {
  id: string
  label: string
  amount: number
  interestRate: number
  debtType: DebtInstrumentType
  applyTo: DebtLocApplyTo
}

interface IncentiveStackRow {
  id: string
  label: string
  amount: number
  applyTo: IncentiveApplyTo
  timingMode: IncentiveTimingMode
  constructionPercent: number
  phaseNames: string
}

/** Tokens from "Phase 1, Phase 4" style CSV (trimmed, lowercased). */
function parseIncentivePhaseNameTokens(phaseNamesCsv: string): string[] {
  const out: string[] = []
  for (const part of (phaseNamesCsv || '').split(',')) {
    const t = part.trim().toLowerCase()
    if (t) out.push(t)
  }
  return out
}

/**
 * When at least one infrastructure (TIF) incentive uses timing "by-phase" with Applied Phases set,
 * allocate the full canonical TIF equally across matched phase names only.
 * Otherwise keep legacy behavior: TIF ∝ phase unit count.
 */
function allocateTifAcrossPhases(params: {
  phases: Array<{ name?: string; unitCount?: number }>
  tifTotal: number
  incentiveRows: IncentiveStackRow[]
}): number[] {
  const { phases, tifTotal, incentiveRows } = params
  const totalUnits = Math.max(
    1,
    phases.reduce((sum, p) => sum + (Number(p.unitCount) || 0), 0),
  )
  const unitShareTif = (idx: number) => {
    const u = Number(phases[idx]?.unitCount || 0)
    return tifTotal * (u / totalUnits)
  }

  if (tifTotal <= 0 || !phases.length) {
    return phases.map(() => 0)
  }

  const byPhaseInfra = incentiveRows.filter(
    (r) =>
      r.applyTo === 'infrastructure-reduction' &&
      r.timingMode === 'by-phase' &&
      String(r.phaseNames || '').trim() &&
      Number(r.amount || 0) > 0,
  )

  if (!byPhaseInfra.length) {
    return phases.map((_, idx) => unitShareTif(idx))
  }

  const tokenSet = new Set<string>()
  for (const r of byPhaseInfra) {
    for (const t of parseIncentivePhaseNameTokens(r.phaseNames)) {
      tokenSet.add(t)
    }
  }

  const matchedIdx: number[] = []
  phases.forEach((p, idx) => {
    const key = String(p.name || '').trim().toLowerCase()
    if (key && tokenSet.has(key)) matchedIdx.push(idx)
  })

  if (!matchedIdx.length) {
    return phases.map((_, idx) => unitShareTif(idx))
  }

  const per = tifTotal / matchedIdx.length
  return phases.map((_, idx) => (matchedIdx.includes(idx) ? per : 0))
}

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`
const buildInitialCoachMessage = (dealName: string): WorkspaceMessage => ({
  id: uid(),
  role: 'assistant',
  text: `Let's work this deal. Start by telling me what you know about "${dealName}" and I will populate the model as we go.`,
  createdAt: new Date().toISOString(),
})

// Stage colors per docs/UI_PORT_PLAYBOOK.md §7 pill recipe
const STAGE_COLOR: Record<WorkspaceStage, string> = {
  coaching: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  scenario: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  proforma: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
}

const STAGE_DEAL_ACCENT: Record<WorkspaceStage, string> = {
  coaching: 'bg-amber-500',
  scenario: 'bg-sky-500',
  proforma: 'bg-emerald-500',
}

function buildDealUnderwritingProject(deal: Deal): Project {
  const syntheticId = `deal-${deal.id}`
  return {
    id: syntheticId,
    name: deal.deal_name,
    type: 'residential-new-build',
    status: 'estimating',
    projectNumber: undefined,
    client: {
      id: `${syntheticId}-client`,
      name: deal.contact?.name || deal.deal_name,
      email: deal.contact?.email,
      phone: deal.contact?.phone,
      company: deal.contact?.company,
      address: deal.location,
    },
    address: { street: deal.location, city: '', state: '', zip: '' },
    city: undefined,
    state: undefined,
    zipCode: undefined,
    metadata: { source: 'deal-workspace', dealId: deal.id },
    createdAt: new Date(),
    updatedAt: new Date(),
    startDate: undefined,
    endDate: undefined,
    estimatedCompletionDate: undefined,
    actualCompletionDate: undefined,
    estimate: {
      id: `${syntheticId}-estimate`,
      projectId: syntheticId,
      version: 1,
      trades: [],
      takeoff: [],
      subtotal: 0,
      overhead: 0,
      profit: 0,
      contingency: 0,
      totalEstimate: 0,
      totals: {
        basePriceTotal: 0,
        contingency: 0,
        grossProfitTotal: 0,
        totalEstimated: 0,
        marginOfProfit: 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      notes: 'Deal workspace synthetic estimate',
    },
    actuals: undefined,
    schedule: undefined,
    documents: undefined,
    qbProjectId: null,
    qbProjectName: null,
    specs: undefined,
    notes: undefined,
  }
}

function defaultInputForDeal(deal: Deal): ProFormaInput {
  const startDate = deal.expected_start_date ? new Date(deal.expected_start_date) : new Date()
  return {
    projectId: `deal-${deal.id}`,
    proFormaMode: 'general-development',
    contractValue: deal.projected_cost || 0,
    paymentMilestones: [],
    monthlyOverhead: 0,
    overheadAllocationMethod: 'proportional',
    projectionMonths: 12,
    startDate,
    totalProjectSquareFootage: 0,
    underwritingEstimatedConstructionCost: 0,
    useDevelopmentProforma: true,
    landCost: 0,
    siteWorkCost: 0,
    softCostPercent: 0,
    contingencyPercent: 0,
    constructionMonths: undefined,
    loanToCostPercent: 0,
    investorEquity: 0,
    preferredReturnRateAnnual: 0,
    preferredReturnPaidFrequency: 'monthly',
    investorProfitShareOnCompletion: 0,
    developerProfitShareOnCompletion: 0,
    monthlyCarryPerUnit: 0,
    avgConstructionPeriodMonths: 0,
    rentalUnits: [],
    includeRentalIncome: false,
    operatingExpenses: {
      propertyManagementPercent: 0,
      maintenanceReservePercent: 0,
      monthlyPropertyInsurance: 0,
      annualPropertyTax: 0,
      monthlyUtilities: 0,
      monthlyOther: 0,
    },
    includeOperatingExpenses: false,
    debtService: {
      loanAmount: 0,
      interestRate: 0,
      loanTermMonths: 360,
      startDate,
      paymentType: 'principal-interest',
    },
    includeDebtService: false,
    forSalePhasedLoc: {
      enabled: true,
      totalUnits: 0,
      averageSalePrice: 0,
      presaleDepositPercent: 0,
      phaseTimingMode: 'trigger-based',
      salesPaceUnitsPerMonth: 0,
      infrastructureCost: 0,
      tifInfrastructureReduction: 0,
      incentiveCostReduction: 0,
      incentiveEquitySource: 0,
      fixedLocLimit: 0,
      ltcPercent: 0,
      salesAllocationBuckets: {
        locPaydownPercent: 70,
        reinvestPercent: 20,
        reservePercent: 10,
        distributionPercent: 0,
      },
      phases: [],
    },
  }
}

/**
 * Model Mode "Development" was wired to `general-development`, but phased LOC, presales/closings,
 * and TIF reimbursement only run when `proFormaMode === 'for-sale-phased-loc'`. Align the engine
 * input whenever for-sale assumptions are present (deal workspace).
 */
function proFormaInputForEngine(inp: ProFormaInput): ProFormaInput {
  if (inp.proFormaMode === 'rental-hold') return inp
  if (!materialForSaleContext(inp)) return inp
  const fs = inp.forSalePhasedLoc
  return {
    ...inp,
    proFormaMode: 'for-sale-phased-loc',
    forSalePhasedLoc: fs ? { ...fs, enabled: true } : fs,
  }
}

function deepMerge<T extends Record<string, any>>(base: T, patch: Partial<T>): T {
  const out: any = Array.isArray(base) ? [...base] : { ...base }
  Object.keys(patch || {}).forEach((k) => {
    const pv = (patch as any)[k]
    const bv = (base as any)[k]
    if (pv === undefined) return
    if (pv && typeof pv === 'object' && !Array.isArray(pv) && bv && typeof bv === 'object' && !Array.isArray(bv)) {
      out[k] = deepMerge(bv, pv)
    } else {
      out[k] = pv
    }
  })
  return out
}

/** Total uses (hard + land + soft + contingency) — matches memo / LTC sizing basis. */
function totalDevUsesForConfidence(inp: ProFormaInput): number {
  const hard = inp.underwritingEstimatedConstructionCost || 0
  const land = inp.landCost || 0
  const site = inp.siteWorkCost || 0
  const soft = hard * ((inp.softCostPercent || 0) / 100)
  const contingency = hard * ((inp.contingencyPercent || 0) / 100)
  return hard + land + site + soft + contingency
}

/** Σ (unitCount × buildMonths) per for-sale phase — general carry basis (unit-months). */
function sumPhaseUnitMonthsCarryBasis(inp: ProFormaInput | null): number {
  const phases = inp?.forSalePhasedLoc?.phases
  if (!phases?.length) return 0
  return phases.reduce((sum, p) => {
    const u = Math.max(0, Number(p.unitCount || 0))
    const m = Math.max(0, Number(p.buildMonths || 0))
    return sum + u * m
  }, 0)
}

function getCalculatedCarryCost(inp: ProFormaInput | null): number {
  if (!inp) return 0
  const perUnit = Number(inp.monthlyCarryPerUnit || 0)
  const phaseUnitMonths = sumPhaseUnitMonthsCarryBasis(inp)
  if (perUnit > 0 && phaseUnitMonths > 0) {
    return roundMoney(perUnit * phaseUnitMonths)
  }
  const units = Number(inp.forSalePhasedLoc?.totalUnits || 0)
  const avgMonths = Number(inp.avgConstructionPeriodMonths || 0)
  if (units > 0 && perUnit > 0 && avgMonths > 0) {
    return roundMoney(perUnit * units * avgMonths)
  }
  return roundMoney(Number(inp.monthlyOverhead || 0) * Number(inp.projectionMonths || 0))
}

function getCarryCostFieldTitle(inp: ProFormaInput | null): string {
  if (!inp) return ''
  const perUnit = Number(inp.monthlyCarryPerUnit || 0)
  if (perUnit > 0 && sumPhaseUnitMonthsCarryBasis(inp) > 0) {
    return 'Carry = monthly carry per unit × sum over phases (units × build months). Phase table splits this total by each phase’s unit-months share.'
  }
  const units = Number(inp.forSalePhasedLoc?.totalUnits || 0)
  const avgMonths = Number(inp.avgConstructionPeriodMonths || 0)
  if (units > 0 && perUnit > 0 && avgMonths > 0) {
    return 'Carry = monthly carry per unit × total units × construction period (months). Used when phase build months are all zero or phases are empty.'
  }
  return 'Carry = monthly overhead × project duration (months). Used when unit-based carry inputs are not set.'
}

function getProjectTotalCost(inp: ProFormaInput | null): number {
  if (!inp) return 0
  const hard = Number(inp.underwritingEstimatedConstructionCost || 0)
  const soft = hard * (Number(inp.softCostPercent || 0) / 100)
  const contingency = hard * (Number(inp.contingencyPercent || 0) / 100)
  return (
    Number(inp.landCost || 0) +
    Number(inp.siteWorkCost || 0) +
    Number(inp.forSalePhasedLoc?.infrastructureCost || 0) +
    hard +
    soft +
    contingency +
    getCalculatedCarryCost(inp)
  )
}

function getMonthsPerPrefPeriod(freq: ProFormaInput['preferredReturnPaidFrequency']): number {
  switch (freq) {
    case 'quarterly':
      return 3
    case 'semi-annual':
      return 6
    case 'annual':
      return 12
    case 'monthly':
    default:
      return 1
  }
}

function getPrefFrequencyLabel(freq: ProFormaInput['preferredReturnPaidFrequency']): string {
  switch (freq) {
    case 'quarterly':
      return 'Quarterly'
    case 'semi-annual':
      return 'Semi-Annual'
    case 'annual':
      return 'Annual'
    case 'monthly':
    default:
      return 'Monthly'
  }
}

function parseNumberInput(raw: string): number {
  const cleaned = String(raw || '').replace(/[$,%]/g, '').replace(/,/g, '').trim()
  if (!cleaned) return 0
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseWholeNumberInput(raw: string): number {
  const cleaned = String(raw || '').replace(/[$,%]/g, '').replace(/,/g, '').trim()
  if (!cleaned) return 0
  const parsed = parseInt(cleaned, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatWithCommas(value: number | null | undefined, fixedDigits?: number): string {
  if (value == null || Number.isNaN(value)) return ''
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return ''
  if (fixedDigits != null) {
    return numeric.toLocaleString('en-US', {
      minimumFractionDigits: fixedDigits,
      maximumFractionDigits: fixedDigits,
    })
  }
  return numeric.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function formatCurrency(value: number | null | undefined, fixedDigits = 2): string {
  const formatted = formatWithCommas(value, fixedDigits)
  return formatted ? `$${formatted}` : ''
}

function formatPercent(value: number | null | undefined, fixedDigits = 2): string {
  const formatted = formatWithCommas(value, fixedDigits)
  return formatted ? `${formatted}%` : ''
}

function formatWorkbookMonthHeader(label: string): string {
  const parsed = new Date(label)
  if (!Number.isNaN(parsed.getTime())) {
    const mon = parsed.toLocaleString('en-US', { month: 'short' })
    const yy = String(parsed.getFullYear()).slice(-2)
    return `${mon}/${yy}`
  }
  const compact = String(label || '').replace(' 20', '/')
  return compact.length > 7 ? compact.slice(0, 7) : compact
}

const USES_PATHS_FOR_LTC_DEBT_SYNC = new Set([
  'underwritingEstimatedConstructionCost',
  'landCost',
  'siteWorkCost',
  'softCostPercent',
  'contingencyPercent',
])

/** Annual % on revolving LOC: custom stack `loc-limit` row wins, else debtService. */
function effectiveLocAnnualPercent(inp: ProFormaInput | null): number {
  if (!inp) return 0
  const rows =
    ((inp as any)?.customStacks?.debtLocRows as Array<{ applyTo?: string; interestRate?: number }>) || []
  const locRow = rows.find((r) => r.applyTo === 'loc-limit')
  const fromStack = locRow != null ? Number(locRow.interestRate) : NaN
  if (Number.isFinite(fromStack) && fromStack >= 0) return fromStack
  return Number(inp.debtService?.interestRate || 0)
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/** General-development: debt amount = total uses × LTC% (matches proforma engine sources/uses). */
function syncDebtAmountFromLtc(inp: ProFormaInput): ProFormaInput {
  if ((inp.proFormaMode || 'general-development') !== 'general-development') return inp
  const total = totalDevUsesForConfidence(inp)
  const ltc = inp.loanToCostPercent || 0
  const loan = total > 0 && ltc >= 0 ? roundMoney(total * (ltc / 100)) : 0
  return {
    ...inp,
    debtService: {
      ...inp.debtService,
      loanAmount: loan,
    },
  }
}

/** General-development: LTC% = debt ÷ total uses (clamped 0–100). */
function syncLtcFromDebtAmount(inp: ProFormaInput): ProFormaInput {
  if ((inp.proFormaMode || 'general-development') !== 'general-development') return inp
  const total = totalDevUsesForConfidence(inp)
  const loan = inp.debtService?.loanAmount || 0
  if (total <= 0) {
    return { ...inp, loanToCostPercent: 0 }
  }
  const pct = Math.min(100, Math.max(0, (loan / total) * 100))
  return {
    ...inp,
    loanToCostPercent: Math.round(pct * 10000) / 10000,
  }
}

function applyGeneralDevLtcDebtSyncAfterMerge(
  next: ProFormaInput,
  updatedPaths: Set<string>,
): ProFormaInput {
  if ((next.proFormaMode || 'general-development') !== 'general-development') return next
  const touchedLoan = updatedPaths.has('debtService.loanAmount')
  const touchedLtc = updatedPaths.has('loanToCostPercent')
  const touchedUses = [...USES_PATHS_FOR_LTC_DEBT_SYNC].some((p) => updatedPaths.has(p))
  if (touchedLtc || touchedUses) return syncDebtAmountFromLtc(next)
  if (touchedLoan) return syncLtcFromDebtAmount(next)
  return next
}

function flattenFieldUpdates(obj: Record<string, any>, prefix = ''): Array<{ path: string; value: any }> {
  const rows: Array<{ path: string; value: any }> = []
  Object.entries(obj || {}).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      rows.push(...flattenFieldUpdates(value, path))
    } else {
      rows.push({ path, value })
    }
  })
  return rows
}

function setByPath(obj: Record<string, any>, path: string, value: any): void {
  const keys = path.split('.')
  let cur: Record<string, any> = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    if (!cur[k] || typeof cur[k] !== 'object' || Array.isArray(cur[k])) cur[k] = {}
    cur = cur[k]
  }
  cur[keys[keys.length - 1]] = value
}

const COACH_PATH_ALIASES: Record<string, string> = {
  // for-sale aliases frequently emitted by the coach
  forSaleTotalUnits: 'forSalePhasedLoc.totalUnits',
  forSaleAverageSalePrice: 'forSalePhasedLoc.averageSalePrice',
  forSaleSalesPaceUnitsPerMonth: 'forSalePhasedLoc.salesPaceUnitsPerMonth',
  forSalePresaleDepositPercent: 'forSalePhasedLoc.presaleDepositPercent',
  forSaleLtcPercent: 'forSalePhasedLoc.ltcPercent',
  forSaleFixedLocLimit: 'forSalePhasedLoc.fixedLocLimit',
  forSaleInfrastructureCost: 'forSalePhasedLoc.infrastructureCost',
  forSaleTifReduction: 'forSalePhasedLoc.tifInfrastructureReduction',
  'forSaleSalesBuckets.locPaydownPercent': 'forSalePhasedLoc.salesAllocationBuckets.locPaydownPercent',
  'forSaleSalesBuckets.reinvestPercent': 'forSalePhasedLoc.salesAllocationBuckets.reinvestPercent',
  'forSaleSalesBuckets.reservePercent': 'forSalePhasedLoc.salesAllocationBuckets.reservePercent',
  'forSaleSalesBuckets.distributionPercent': 'forSalePhasedLoc.salesAllocationBuckets.distributionPercent',
  'forSaleUnits.unitCount': 'forSalePhasedLoc.totalUnits',
  'forSaleUnits.pricePerUnit': 'forSalePhasedLoc.averageSalePrice',
  'forSaleUnits.salesPacePerMonth': 'forSalePhasedLoc.salesPaceUnitsPerMonth',
  // incentive aliases
  'incentives.tifAmount': 'forSalePhasedLoc.tifInfrastructureReduction',
  'incentives.grantAmount': 'forSalePhasedLoc.incentiveCostReduction',
  tifAmount: 'forSalePhasedLoc.tifInfrastructureReduction',
  grantAmount: 'forSalePhasedLoc.incentiveCostReduction',
  // common shorthand aliases
  ltcPercent: 'loanToCostPercent',
  constructionDurationMonths: 'constructionMonths',
  hardCosts: 'underwritingEstimatedConstructionCost',
}

const IGNORED_COACH_PATHS = new Set<string>([
  'forSaleUnits.totalSellout',
  'forSaleUnits.monthsToSellout',
  'incentives.tifTiming',
  'incentives.tifCommitted',
  'incentives.totalIncentives',
  'totalSellout',
  'monthsToSellout',
  'tifTiming',
  'tifCommitted',
  'totalIncentives',
])

function normalizeCoachUpdates(updates: Partial<ProFormaInput>): Partial<ProFormaInput> {
  const flattened = flattenFieldUpdates((updates || {}) as Record<string, any>)
  const normalized: Record<string, any> = {}
  flattened.forEach(({ path, value }) => {
    if (IGNORED_COACH_PATHS.has(path)) return
    const targetPath = COACH_PATH_ALIASES[path] || path
    setByPath(normalized, targetPath, value)
  })
  return normalized as Partial<ProFormaInput>
}

function parseForSalePhasesFromText(text: string): {
  phases: ForSalePhaseInput[]
  /** First non-zero ASP found in phase blocks (applied to global average when body has no sale price line). */
  inferredAverageSalePrice?: number
} {
  if (!text || !/phase\s+\d+/i.test(text)) return { phases: [] }
  const blocks = text
    .split(/\r?\n(?=Phase\s+\d+\b)/i)
    .map((b) => b.trim())
    .filter((b) => /^Phase\s+\d+\b/i.test(b))

  const phases: ForSalePhaseInput[] = []
  let inferredAverageSalePrice: number | undefined
  blocks.forEach((block) => {
    const phaseNum = Number((block.match(/^Phase\s+(\d+)/i) || [])[1] || phases.length + 1)
    const totalUnits = Number((block.match(/(\d+(?:\.\d+)?)\s*units?/i) || [])[1] || 0)
    const buildMonths = Number((block.match(/Build Months:\s*(\d+(?:\.\d+)?)/i) || [])[1] || 0)
    const presaleStartMonth = Number((block.match(/Presale Start Month Offset:\s*(\d+(?:\.\d+)?)/i) || [])[1] || 0)
    const closeStartMonth = Number((block.match(/Close Start Month Offset:\s*(\d+(?:\.\d+)?)/i) || [])[1] || 0)
    const presaleTriggerPercent = Number((block.match(/Presale Trigger Percent:\s*(\d+(?:\.\d+)?)/i) || [])[1] || 0)
    const blockAsp = Number((block.match(/Avg Sale Price:\s*\$?([\d,]+(?:\.\d+)?)/i) || [])[1]?.replace(/,/g, '') || 0)
    if (blockAsp > 0 && inferredAverageSalePrice === undefined) inferredAverageSalePrice = blockAsp
    phases.push({
      id: uid(),
      name: `Phase ${phaseNum}`,
      startMonthOffset: 0,
      unitCount: totalUnits,
      buildMonths,
      closeStartMonthOffset: closeStartMonth,
      presaleStartMonthOffset: presaleStartMonth,
      presaleTriggerPercent,
    })
  })

  return {
    phases: phases.filter((p) => p.unitCount > 0),
    inferredAverageSalePrice,
  }
}

function parseForSaleImportFromText(text: string): Partial<ProFormaInput> {
  if (!text) return {}
  const t = text
  const num = (re: RegExp): number | undefined => {
    const m = t.match(re)
    if (!m?.[1]) return undefined
    const raw = m[1].replace(/,/g, '').trim()
    // Handle shorthand: "12.3 million", "10.47M", "1.43B" etc.
    const multiplierMatch = raw.match(/^([\d.]+)\s*(million|M|billion|B)$/i)
    if (multiplierMatch) {
      const base = parseFloat(multiplierMatch[1])
      const suffix = multiplierMatch[2].toLowerCase()
      return base * (suffix === 'billion' || suffix === 'b' ? 1_000_000_000 : 1_000_000)
    }
    return Number(raw)
  }
  const monthWordToNumber = (s: string): number | null => {
    const m = s.toLowerCase()
    const map: Record<string, number> = {
      january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    }
    return Object.prototype.hasOwnProperty.call(map, m) ? map[m] : null
  }

  const parsed: Partial<ProFormaInput> = {}
  if (/for-sale-phased-loc|for-sale|phased loc/i.test(t)) parsed.proFormaMode = 'general-development'
  const startMatch = t.match(/start(?:ing)?\s+([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\,?\s+(\d{4})/i)
  if (startMatch) {
    const month = monthWordToNumber(startMatch[1])
    const day = Number(startMatch[2])
    const year = Number(startMatch[3])
    if (month != null && Number.isFinite(day) && Number.isFinite(year)) parsed.startDate = new Date(year, month, day)
  }
  const projectionMonths =
    num(/(\d+)\s*-\s*month projection/i) ??
    num(/(\d+)\s*month projection/i) ??
    num(/projection(?:\s+window)?\s*(?:of)?\s*(\d+)/i) ??
    num(/projection months?\s*:\s*(\d+)/i)
  if (projectionMonths) parsed.projectionMonths = projectionMonths as ProFormaInput['projectionMonths']
  const totalUnits = num(/(\d+)\s*-\s*unit/i) ?? num(/(\d+)\s*units?/i) ?? num(/total units?\s*:\s*(\d+)/i)
  const avgSalePrice = num(/sale price(?:\s+of)?\s*\$?([\d,]+(?:\.\d+)?)/i) ?? num(/average sale price\s*:\s*\$?([\d,]+(?:\.\d+)?)/i)
  const devCost = num(/total development cost(?:\s*\(.*?\))?\s*(?:is|of|about)?\s*\$?([\d,.]+(?:\s*(?:million|M|billion|B))?)/i)
  const ltc = num(/(\d+(?:\.\d+)?)\s*%?\s*ltc/i) ?? num(/ltc percent\s*:\s*(\d+(?:\.\d+)?)/i)
  const locLimit = num(/loc limit(?:\s+would be\s+right around)?\s*\$?([\d,.]+(?:\s*(?:million|M|billion|B))?)/i) ?? num(/fixed loc limit\s*:\s*\$?([\d,.]+(?:\s*(?:million|M|billion|B))?)/i)
  const presaleDeposit = num(/(\d+(?:\.\d+)?)\s*%?\s*presale deposit/i) ?? num(/presale deposit percent\s*:\s*(\d+(?:\.\d+)?)/i)
  const infra = num(/infrastructure(?:\s+cost)?\s*(?:is|:)\s*\$?([\d,.]+(?:\s*(?:million|M|billion|B))?)/i)
  const tif = num(/tif(?:\s+that covers[^$\d]*)?\s*\$?([\d,.]+(?:\s*(?:million|M|billion|B))?)/i) ?? num(/tif (?:amount|reduction)\s*:\s*\$?([\d,.]+(?:\s*(?:million|M|billion|B))?)/i)
  const grant = num(/welcome home ohio(?:\s+grant)?[^$\d]*\$?([\d,.]+(?:\s*(?:million|M|billion|B))?)/i) ?? num(/grant(?:\s+cost reduction)?\s*(?:by about|of|:)?\s*\$?([\d,.]+(?:\s*(?:million|M|billion|B))?)/i)
  const pace = num(/sales pace(?:\s+at)?\s*(\d+(?:\.\d+)?)\s*units?\/month/i) ?? num(/capping.*?(\d+(?:\.\d+)?)\s*units? per month/i)
  const paydown = num(/(\d+(?:\.\d+)?)\s*%\s*(?:toward|to)\s*loc paydown/i)
  const reinvest = num(/(\d+(?:\.\d+)?)\s*%\s*(?:toward|to)\s*reinvest/i)
  const reserve = num(/(\d+(?:\.\d+)?)\s*%\s*(?:to)\s*reserve/i)
  const distribution = num(/(\d+(?:\.\d+)?)\s*%\s*(?:to)\s*distribution/i)

  const { phases: phasesFromBlocks, inferredAverageSalePrice } = parseForSalePhasesFromText(t)
  let phases = phasesFromBlocks
  if (phases.length === 0) {
    const unitsList = t.match(/four phases\s*[—-]\s*(\d+)\s*units?\s*,\s*(\d+)\s*units?\s*,\s*(\d+)\s*units?\s*,\s*(?:then.*?of\s*)?(\d+)\b/i)
    const buildMonths = num(/each phase takes about\s*(\d+)\s*months?\s*to build/i) || 8
    const trigger = num(/(\d+(?:\.\d+)?)\s*% presold/i) || 50
    const p0 = num(/phase 1.*?month\s*(\d+)/i) || 0
    const p1 = num(/phase 2.*?month\s*(\d+)/i) || 4
    const p2 = num(/phase 3.*?month\s*(\d+)/i) || 8
    const p3 = num(/phase 4.*?month\s*(\d+)/i) || 12
    const closeOffset = num(/closings (?:beginning at|begin at|start(?:ing)?)\s*month\s*(\d+)/i) || 8
    if (unitsList) {
      const units = [Number(unitsList[1]), Number(unitsList[2]), Number(unitsList[3]), Number(unitsList[4])]
      const starts = [p0, p1, p2, p3]
      phases = units.map((u, i) => ({
        id: uid(),
        name: `Phase ${i + 1}`,
        startMonthOffset: starts[i],
        unitCount: u,
        buildMonths,
        presaleStartMonthOffset: starts[i],
        closeStartMonthOffset: starts[i] + closeOffset,
        presaleTriggerPercent: trigger,
      }))
    }
  }

  const forSalePatch: any = {}
  if (totalUnits != null) forSalePatch.totalUnits = totalUnits
  if (avgSalePrice != null) forSalePatch.averageSalePrice = avgSalePrice
  else if (inferredAverageSalePrice != null && inferredAverageSalePrice > 0) {
    forSalePatch.averageSalePrice = inferredAverageSalePrice
  }
  if (ltc != null) forSalePatch.ltcPercent = ltc
  if (locLimit != null) forSalePatch.fixedLocLimit = locLimit
  if (presaleDeposit != null) forSalePatch.presaleDepositPercent = presaleDeposit
  if (infra != null) forSalePatch.infrastructureCost = infra
  if (tif != null) forSalePatch.tifInfrastructureReduction = tif
  if (grant != null) forSalePatch.incentiveCostReduction = grant
  if (pace != null) forSalePatch.salesPaceUnitsPerMonth = pace
  if (phases.length > 0) forSalePatch.phases = phases
  if (paydown != null || reinvest != null || reserve != null || distribution != null) {
    forSalePatch.salesAllocationBuckets = {
      locPaydownPercent: paydown ?? 0,
      reinvestPercent: reinvest ?? 0,
      reservePercent: reserve ?? 0,
      distributionPercent: distribution ?? 0,
    }
  }

  if (devCost != null) parsed.underwritingEstimatedConstructionCost = devCost
  if (Object.keys(forSalePatch).length > 0) parsed.forSalePhasedLoc = deepMerge((parsed.forSalePhasedLoc || {}) as any, forSalePatch)
  return parsed
}

const FIELD_LABELS: Record<string, string> = {
  proFormaMode: 'Model Mode',
  projectId: 'Project ID',
  contractValue: 'Contract Value',
  paymentMilestones: 'Payment Milestones',
  monthlyOverhead: 'Monthly Overhead',
  overheadAllocationMethod: 'Overhead Allocation Method',
  projectionMonths: 'Projection Months',
  startDate: 'Start Date',
  useDevelopmentProforma: 'Development ProForma',
  underwritingEstimatedConstructionCost: 'Estimated Construction Cost',
  landCost: 'Land Cost',
  siteWorkCost: 'Site Work Cost',
  softCostPercent: 'Soft Cost %',
  contingencyPercent: 'Contingency %',
  loanToCostPercent: 'Loan To Cost %',
  investorEquity: 'Investor Equity',
  preferredReturnRateAnnual: 'Preferred Return Rate (annual)',
  preferredReturnPaidFrequency: 'Preferred Return Paid Frequency',
  investorProfitShareOnCompletion: 'Investor Profit Share %',
  developerProfitShareOnCompletion: 'Developer Profit Share %',
  monthlyCarryPerUnit: 'Monthly Carry per Unit',
  avgConstructionPeriodMonths: 'Construction period (months)',
  constructionMonths: 'Construction Duration (months)',
  includeRentalIncome: 'Include Rental Income',
  rentalUnits: 'Rental Units',
  includeOperatingExpenses: 'Include Operating Expenses',
  includeDebtService: 'Include Debt Service',
  'debtService.loanAmount': 'Debt Amount',
  'debtService.interestRate': 'Debt Interest Rate %',
  'debtService.loanTermMonths': 'Debt Term (months)',
  'debtService.startDate': 'Debt Start Date',
  'debtService.paymentType': 'Debt Payment Type',
  'operatingExpenses.propertyManagementPercent': 'Property Management %',
  'operatingExpenses.maintenanceReservePercent': 'Maintenance Reserve %',
  'operatingExpenses.monthlyPropertyInsurance': 'Monthly Property Insurance',
  'operatingExpenses.annualPropertyTax': 'Annual Property Tax',
  'operatingExpenses.monthlyUtilities': 'Monthly Utilities',
  'operatingExpenses.monthlyOther': 'Monthly Other Operating Expense',
  'forSalePhasedLoc.totalUnits': 'For-Sale Units',
  'forSalePhasedLoc.averageSalePrice': 'Average Sale Price',
  'forSalePhasedLoc.salesPaceUnitsPerMonth': 'Sales Pace (units/mo)',
  'forSalePhasedLoc.presaleDepositPercent': 'Presale Deposit %',
  'forSalePhasedLoc.ltcPercent': 'LOC LTC Cap %',
  'forSalePhasedLoc.fixedLocLimit': 'Fixed LOC Limit',
  'forSalePhasedLoc.phases': 'For-Sale Phases',
  'forSalePhasedLoc.infrastructureCost': 'Infrastructure Cost',
  'forSalePhasedLoc.tifInfrastructureReduction': 'TIF Amount',
  'forSalePhasedLoc.incentiveCostReduction': 'Grant / Incentive Cost Reduction',
  'forSalePhasedLoc.incentiveEquitySource': 'Incentive Equity Source',
  totalProjectSquareFootage: 'Total Project Square Footage',
}

function humanizeKey(part: string): string {
  return part
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (ch) => ch.toUpperCase())
}

function toHumanFieldLabel(path: string): string {
  const direct = FIELD_LABELS[path]
  if (direct) return direct

  const parts = path.split('.')
  if (parts.length === 1) return humanizeKey(parts[0])

  const section = humanizeKey(parts[0])
  const leaf = humanizeKey(parts.slice(1).join(' '))
  return `${section} - ${leaf}`
}

function formatValue(value: any, path?: string): string {
  if (typeof value === 'number') {
    const p = path || ''
    if (/salesPaceUnitsPerMonth/i.test(p)) return `${value.toLocaleString('en-US')} units/mo`
    if (/totalUnits|unitCount/i.test(p)) return `${value.toLocaleString('en-US')} units`
    if (/percent|rate/i.test(p)) return `${value.toLocaleString('en-US')}%`
    if (/cost|value|amount|price|loan|overhead|insurance|tax|utilities|equity|limit/i.test(p)) {
      return `$${value.toLocaleString('en-US')}`
    }
    if (/month/i.test(p)) return `${value.toLocaleString('en-US')} months`
    return value.toLocaleString('en-US')
  }
  if (value instanceof Date) return value.toISOString().split('T')[0]
  if (typeof value === 'string' && /date/i.test(path || '')) {
    const maybeDate = new Date(value)
    if (!Number.isNaN(maybeDate.getTime())) return maybeDate.toISOString().split('T')[0]
  }
  if (Array.isArray(value)) return `${value.length} item(s)`
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value ?? '')
}

function parseCaptureNotesSections(text: string): {
  hasStructuredSections: boolean
  sections: Array<{ heading: 'Ready' | 'Needs input' | 'Notes'; items: string[] }>
  remainingLines: string[]
} {
  const normalized = String(text || '').replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const order: Array<'Ready' | 'Needs input' | 'Notes'> = ['Ready', 'Needs input', 'Notes']
  const sectionsMap: Record<'Ready' | 'Needs input' | 'Notes', string[]> = {
    Ready: [],
    'Needs input': [],
    Notes: [],
  }
  let current: 'Ready' | 'Needs input' | 'Notes' | null = null
  const remainingLines: string[] = []

  lines.forEach((lineRaw) => {
    const line = lineRaw.trim()
    if (!line) return
    const headerMatch = line.match(/^(Ready|Needs input|Notes)\s*:\s*$/i)
    if (headerMatch) {
      const h = headerMatch[1].toLowerCase()
      current = h === 'ready' ? 'Ready' : h === 'needs input' ? 'Needs input' : 'Notes'
      return
    }
    const cleaned = line.replace(/^[-*]\s+/, '').trim()
    if (current) {
      sectionsMap[current].push(cleaned)
    } else {
      remainingLines.push(cleaned)
    }
  })

  const sections = order
    .map((heading) => ({ heading, items: sectionsMap[heading] }))
    .filter((s) => s.items.length > 0)
  return {
    hasStructuredSections: sections.length > 0,
    sections,
    remainingLines,
  }
}

const NON_VISIBLE_CAPTURE_PATTERNS: RegExp[] = [
  /\bsoft\s*cost\s*%?\b/i,
  /\bcontingency\s*%?\b/i,
  /\bloc\s*ltc\s*cap\b/i,
  /\bloan\s*to\s*cost\b/i,
  /\bsales\s*pace\b/i,
  /\bavg(\.|erage)?\s*sale\s*price\b/i,
]

function isVisibleCaptureLine(line: string): boolean {
  const normalized = String(line || '').trim()
  if (!normalized) return false
  return !NON_VISIBLE_CAPTURE_PATTERNS.some((re) => re.test(normalized))
}

function sanitizeCaptureNotesAppend(text?: string): string | null {
  if (!text) return null
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
  const kept = lines.filter((line) => {
    if (!line) return false
    if (/^(Ready|Needs input|Notes)\s*:\s*$/i.test(line)) return true
    return isVisibleCaptureLine(line.replace(/^[-*]\s+/, ''))
  })
  const out = kept.join('\n').trim()
  return out || null
}

function sanitizeTaskSuggestions(tasks?: string[]): string[] {
  if (!tasks?.length) return []
  return tasks.map((t) => t.trim()).filter((t) => t && isVisibleCaptureLine(t))
}

async function invokeDealCoach(params: {
  deal: Deal
  stage: WorkspaceStage
  currentInput: ProFormaInput
  history: WorkspaceMessage[]
  userMessage: string
}): Promise<CoachResponse> {
  const systemPrompt = `You are an HSH GC deal coach.
Return strict JSON object only:
{
  "reply": "string",
  "fieldUpdates": { ...partial ProFormaInput diff... },
  "notesAppend": "string optional - concise notes summary to append",
  "taskSuggestions": ["string", "string"] optional - short actionable tasks,
  "confidence": 0.0-1.0,
  "stageSuggestion": "coaching|scenario|proforma"
}
Rules:
- Respect modes: rental-hold and general-development (development).
- Ask clarifying questions before writing uncertain mode-specific fields.
- Use high confidence only for explicit user-provided values.
- Keep numeric fields numeric and nested objects valid.
- If user is conversational/rambling, summarize clearly in notesAppend and propose crisp next actions in taskSuggestions.
- Keep "reply" very short (max 1 sentence) when many fields are being updated.
- Prefer canonical keys only (forSalePhasedLoc.*, debtService.*, etc.) and avoid alias keys like forSaleTotalUnits / forSaleLtcPercent.
- For large for-sale imports, prioritize complete fieldUpdates (especially forSalePhasedLoc.phases) over verbose reply text.
- For notes/task audits, use UI-facing labels (e.g., "LOC LTC Cap %", "Sales Pace (units/mo)", "Soft Cost %", "Contingency %"), never raw internal key names.
- Do not suggest fields that are not visible/editable in the current workspace view; if uncertain, suggest the nearest visible control label instead.
- Keep notesAppend highly readable with this structure:
  Ready:
  - <item>
  Needs input:
  - <item>
  Notes:
  - <item>
- Keep taskSuggestions short, action-first, and specific to visible controls.
`
  const payload = {
    model: 'claude-sonnet-4-6',
    systemPrompt,
    deal: params.deal,
    stage: params.stage,
    currentInput: params.currentInput,
    history: params.history.slice(-20),
    userMessage: params.userMessage,
  }

  const { data, error } = await supabase.functions.invoke('deal-coach-chat', { body: payload })
  if (error) {
    throw error
  }
  const tryExtractStructuredFromReply = (replyText?: string): CoachResponse | null => {
    if (!replyText) return null
    const t = replyText.trim()
    const fenced = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    const candidate = fenced?.[1]?.trim() || t
    const firstBrace = candidate.indexOf('{')
    const lastBrace = candidate.lastIndexOf('}')
    if (firstBrace < 0 || lastBrace <= firstBrace) return null
    try {
      const parsed = JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as Partial<CoachResponse>
      if (parsed && typeof parsed === 'object') {
        return {
          reply: typeof parsed.reply === 'string' ? parsed.reply : 'I reviewed your update.',
          fieldUpdates:
            parsed.fieldUpdates && typeof parsed.fieldUpdates === 'object'
              ? (parsed.fieldUpdates as Partial<ProFormaInput>)
              : {},
          notesAppend: typeof parsed.notesAppend === 'string' ? parsed.notesAppend : undefined,
          taskSuggestions:
            Array.isArray(parsed.taskSuggestions)
              ? parsed.taskSuggestions.filter((t): t is string => typeof t === 'string' && !!t.trim())
              : undefined,
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
          stageSuggestion:
            parsed.stageSuggestion === 'coaching' ||
            parsed.stageSuggestion === 'scenario' ||
            parsed.stageSuggestion === 'proforma'
              ? parsed.stageSuggestion
              : undefined,
        }
      }
    } catch {
      return null
    }
    return null
  }
  if (data && typeof data === 'object' && 'reply' in data) {
    const asCoach = data as CoachResponse
    const hasFieldUpdates = !!(asCoach.fieldUpdates && Object.keys(asCoach.fieldUpdates).length > 0)
    if (!hasFieldUpdates) {
      const extracted = tryExtractStructuredFromReply(asCoach.reply)
      if (extracted) return extracted
    }
    return asCoach
  }
  return {
    reply:
      'I could not parse a structured update from that message. I can still help—please provide the values you want set (mode, costs, timeline, financing).',
    fieldUpdates: {},
    confidence: 0,
  }
}

function fieldClass(status: FieldStatus): string {
  if (status === 'confirmed') return 'border-green-300 bg-green-50'
  if (status === 'approx') return 'border-amber-300 bg-amber-50'
  return 'border-border bg-input text-foreground font-medium placeholder:text-muted-foreground'
}

function fmtMoney(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n))
}

function fmtPct(n: number | undefined | null, digits = 1): string {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return `${Number(n).toFixed(digits)}%`
}

function fmtShortDate(d: Date | string | undefined): string {
  if (!d) return '—'
  const dt = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function MemoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(10rem,42%)_1fr] gap-2 py-1.5 border-b border-border/60/60 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground tabular-nums">{value}</span>
    </div>
  )
}

function AssumptionInputRow({
  label,
  children,
  unboundedControls,
}: {
  label: string
  children: React.ReactNode
  /** Wide controls (e.g. multi-segment % strip) — do not cap inputs at 210px. */
  unboundedControls?: boolean
}) {
  return (
    <div className="grid grid-cols-[160px_1fr] items-center gap-2 py-0.5 border-b border-border/60/40 last:border-b-0">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div
        className={
          unboundedControls
            ? "min-w-0 [&_input]:h-7 [&_input]:w-full [&_input]:min-w-0 [&_input]:max-w-none [&_input]:text-xs [&_button[role='combobox']]:h-7 [&_button[role='combobox']]:max-w-[210px] [&_button[role='combobox']]:text-xs"
            : "[&_input]:h-7 [&_input]:max-w-[210px] [&_input]:text-xs [&_button[role='combobox']]:h-7 [&_button[role='combobox']]:max-w-[210px] [&_button[role='combobox']]:text-xs"
        }
      >
        {children}
      </div>
    </div>
  )
}

interface ProformaMemoViewProps {
  dealName: string
  input: ProFormaInput
  projection: ProFormaProjection | null
  readiness: DealReadiness
  onEditAssumptions: () => void
}

function ProformaMemoView({ dealName, input, projection, readiness, onEditAssumptions }: ProformaMemoViewProps) {
  const modeLabel =
    input.proFormaMode === 'rental-hold'
      ? 'Rental hold'
      : 'Development'
  const hard = input.underwritingEstimatedConstructionCost || 0
  const land = input.landCost || 0
  const site = input.siteWorkCost || 0
  const soft = hard * ((input.softCostPercent || 0) / 100)
  const contingency = hard * ((input.contingencyPercent || 0) / 100)
  const totalUses = hard + land + site + soft + contingency
  const fs = input.forSalePhasedLoc
  const s = projection?.summary
  const phases = fs?.phases || []
  const buckets = fs?.salesAllocationBuckets

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <div className="rounded-lg border border-border/60 bg-muted/90 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground tracking-tight">Pro forma memo</h2>
        <p className="text-sm text-muted-foreground mt-1">{dealName}</p>
        <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
          This is a living summary of the model. The deal assistant and your edits update the same underlying inputs. Use{' '}
          <button type="button" className="text-blue-400 hover:underline" onClick={onEditAssumptions}>
            All assumptions
          </button>{' '}
          for full field-by-field control.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-xs items-center">
          <span
            className={`rounded border px-2 py-1 ${
              readiness.proformaReady
                ? 'border-emerald-700 bg-emerald-950/40 text-emerald-200'
                : 'border-border/70 bg-card/60 text-muted-foreground'
            }`}
          >
            {readiness.proformaReady
              ? 'Model ready — run pro forma'
              : `Coverage ${readiness.score}% · ${readiness.failedCriticalCount} critical gap${readiness.failedCriticalCount === 1 ? '' : 's'}`}
          </span>
          <span className="rounded border border-border/70 bg-card/60 px-2 py-1 text-muted-foreground">
            {projection ? 'Engine run — results below' : 'Run ProForma in the header for full outputs'}
          </span>
        </div>
        {!readiness.proformaReady && readiness.blockers.length > 0 && (
          <div className="rounded border border-amber-900/45 bg-amber-950/25 p-3 mt-3">
            <div className="text-xs font-medium text-amber-200/95 mb-1.5">Still needed</div>
            <ul className="text-xs text-amber-100/90 list-disc pl-4 space-y-0.5">
              {readiness.blockers.slice(0, 8).map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            {readiness.blockers.length > 8 && (
              <div className="text-[10px] text-amber-200/70 mt-1.5">+{readiness.blockers.length - 8} more</div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/90 p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Deal overview</h3>
        <MemoRow label="Structure" value={modeLabel} />
        <MemoRow label="Start date" value={fmtShortDate(input.startDate)} />
        <MemoRow label="Projection (months)" value={input.projectionMonths ?? '—'} />
        <MemoRow label="Contract value" value={fmtMoney(input.contractValue)} />
        <MemoRow label="Total SF (if set)" value={input.totalProjectSquareFootage ? `${input.totalProjectSquareFootage.toLocaleString()} sf` : '—'} />
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/90 p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Uses (underwriting basis)</h3>
        <MemoRow label="Est. construction / hard" value={fmtMoney(hard)} />
        <MemoRow label="Land" value={fmtMoney(land)} />
        <MemoRow label="Site work" value={fmtMoney(site)} />
        <MemoRow label={`Soft (${fmtPct(input.softCostPercent || 0, 0)} of hard)`} value={fmtMoney(soft)} />
        <MemoRow label={`Contingency (${fmtPct(input.contingencyPercent || 0, 0)} of hard)`} value={fmtMoney(contingency)} />
        <MemoRow label="Indicative total (hard + land + site + soft + contingency)" value={<span className="font-semibold">{fmtMoney(totalUses)}</span>} />
      </div>

      {(fs &&
        ((fs.totalUnits ?? 0) > 0 || (fs.averageSalePrice ?? 0) > 0 || phases.length > 0)) && (
        <div className="rounded-lg border border-border/60 bg-muted/90 p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Development For-Sale / LOC</h3>
          <MemoRow label="Total units" value={fs?.totalUnits ?? '—'} />
          <MemoRow label="Average sale price" value={fmtMoney(fs?.averageSalePrice)} />
          <MemoRow label="Presale deposit" value={fs?.presaleDepositPercent != null ? fmtPct(fs.presaleDepositPercent, 0) : '—'} />
          <MemoRow label="LOC LTC cap" value={fs?.ltcPercent != null ? fmtPct(fs.ltcPercent, 0) : '—'} />
          <MemoRow label="Fixed LOC limit" value={fmtMoney(fs?.fixedLocLimit)} />
          <MemoRow label="Sales pace cap" value={fs?.salesPaceUnitsPerMonth != null ? `${fs.salesPaceUnitsPerMonth} units/mo` : '—'} />
          <MemoRow label="Infrastructure cost" value={fmtMoney(fs?.infrastructureCost)} />
          <MemoRow label="TIF / infra reduction" value={fmtMoney(fs?.tifInfrastructureReduction)} />
          <MemoRow label="Grant / cost reduction" value={fmtMoney(fs?.incentiveCostReduction)} />
          <MemoRow label="Incentive equity source" value={fmtMoney(fs?.incentiveEquitySource)} />
          {buckets && (
            <MemoRow
              label="Sales proceeds split"
              value={`LOC paydown ${buckets.locPaydownPercent ?? 0}% · Reinvest ${buckets.reinvestPercent ?? 0}% · Reserve ${buckets.reservePercent ?? 0}% · Cash-out ${buckets.distributionPercent ?? 0}%`}
            />
          )}
          {phases.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <div className="text-xs text-muted-foreground mb-2">Phases</div>
              <table className="w-full text-xs text-left border border-border/60 rounded-md overflow-hidden">
                <thead className="bg-card/80 text-muted-foreground">
                  <tr>
                    <th className="p-2 font-medium">Phase</th>
                    <th className="p-2 font-medium">Units</th>
                    <th className="p-2 font-medium">Build mo</th>
                    <th className="p-2 font-medium">Presale M</th>
                    <th className="p-2 font-medium">Close M</th>
                    <th className="p-2 font-medium">Trigger %</th>
                  </tr>
                </thead>
                <tbody className="text-foreground">
                  {phases.map((p) => (
                    <tr key={p.id} className="border-t border-border/60">
                      <td className="p-2">{p.name || '—'}</td>
                      <td className="p-2">{p.unitCount || '—'}</td>
                      <td className="p-2">{p.buildMonths || '—'}</td>
                      <td className="p-2">{p.presaleStartMonthOffset ?? '—'}</td>
                      <td className="p-2">{p.closeStartMonthOffset ?? '—'}</td>
                      <td className="p-2">{p.presaleTriggerPercent != null ? fmtPct(p.presaleTriggerPercent, 0) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-border/60 bg-muted/90 p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Financing (summary)</h3>
        <MemoRow label="Loan to cost (project)" value={input.loanToCostPercent != null ? fmtPct(input.loanToCostPercent, 0) : '—'} />
        <MemoRow label="Debt amount" value={fmtMoney(input.debtService?.loanAmount)} />
        <MemoRow label="Debt rate / term" value={`${input.debtService?.interestRate != null ? fmtPct(input.debtService.interestRate, 2) : '—'} · ${input.debtService?.loanTermMonths ?? '—'} mo`} />
      </div>

      {input.proFormaMode === 'rental-hold' && (
        <div className="rounded-lg border border-border/60 bg-muted/90 p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Rental operations</h3>
          <MemoRow label="Rental income included" value={input.includeRentalIncome ? 'Yes' : 'No'} />
          <MemoRow label="Operating expenses included" value={input.includeOperatingExpenses ? 'Yes' : 'No'} />
          <MemoRow label="Debt service included" value={input.includeDebtService ? 'Yes' : 'No'} />
        </div>
      )}

      {projection && s && (
        <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-5">
          <h3 className="text-sm font-semibold text-emerald-200 uppercase tracking-wide mb-2">Engine results</h3>
          <MemoRow label="Total estimated cost" value={fmtMoney(projection.totalEstimatedCost)} />
          <MemoRow label="Projected profit" value={fmtMoney(projection.projectedProfit)} />
          <MemoRow label="Projected margin" value={projection.projectedMargin != null ? fmtPct(projection.projectedMargin, 1) : '—'} />
          {s.forSaleProjectIrr != null && <MemoRow label="For-sale project IRR" value={fmtPct(s.forSaleProjectIrr, 1)} />}
          {s.forSaleEquityMultiple != null && <MemoRow label="For-sale equity multiple" value={`${s.forSaleEquityMultiple.toFixed(2)}x`} />}
          {s.forSalePeakLocBalance != null && <MemoRow label="Peak LOC balance" value={fmtMoney(s.forSalePeakLocBalance)} />}
          {s.forSaleEndingLocBalance != null && <MemoRow label="Ending LOC balance" value={fmtMoney(s.forSaleEndingLocBalance)} />}
          {s.totalInterestDuringConstruction != null && s.totalInterestDuringConstruction > 0 && (
            <MemoRow label="Interest during construction" value={fmtMoney(s.totalInterestDuringConstruction)} />
          )}
          {s.irr != null && input.proFormaMode === 'rental-hold' && <MemoRow label="IRR (rental path)" value={fmtPct(s.irr, 1)} />}
        </div>
      )}

      <div className="pb-6">
        <Button
          size="sm"
          variant="outline"
          className="border-border/60 bg-muted text-foreground hover:bg-muted/70 hover:text-white"
          onClick={onEditAssumptions}
        >
          Open all assumptions
        </Button>
      </div>
    </div>
  )
}

export function DealWorkspace({ dealId, onBack }: DealWorkspaceProps) {
  const navigate = useNavigate()
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDealId, setSelectedDealId] = useState<string | undefined>(dealId)
  const [stage, setStage] = useState<WorkspaceStage>('coaching')
  const [input, setInput] = useState<ProFormaInput | null>(null)
  const [projection, setProjection] = useState<ProFormaProjection | null>(null)
  const [messages, setMessages] = useState<WorkspaceMessage[]>([])
  const [markers, setMarkers] = useState<StageMarker[]>([])
  const [pendingSuggestions, setPendingSuggestions] = useState<Partial<ProFormaInput> | null>(null)
  const [pendingNotesAppend, setPendingNotesAppend] = useState<string | null>(null)
  const [pendingTaskSuggestions, setPendingTaskSuggestions] = useState<string[] | null>(null)
  const [fieldMeta, setFieldMeta] = useState<Record<string, FieldMeta>>({})
  const [chatValue, setChatValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [deletingDeal, setDeletingDeal] = useState(false)
  const [creatingDeal, setCreatingDeal] = useState(false)
  const [createDealModalOpen, setCreateDealModalOpen] = useState(false)
  const [newDealForm, setNewDealForm] = useState({
    deal_name: '',
    location: '',
    type: 'commercial' as Deal['type'],
    status: 'active-pipeline' as Deal['status'],
    unit_count: '',
    projected_cost: '',
    expected_start_date: '',
  })
  const [loadingDealState, setLoadingDealState] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [runPromptReason, setRunPromptReason] = useState<string | null>(null)
  const [centerTab, setCenterTab] = useState<WorkspaceCenterTab>('assumptions')
  const [notesDraft, setNotesDraft] = useState('')
  const [tasksDraft, setTasksDraft] = useState('')
  const [activityEvents, setActivityEvents] = useState<ActivityItem[]>([])
  const [versionOptions, setVersionOptions] = useState<Array<{ id: string; label: string }>>([])
  const [clearMenuValue, setClearMenuValue] = useState('')
  const [versionMenuValue, setVersionMenuValue] = useState('')
  const [actionsMenuValue, setActionsMenuValue] = useState('')
  const [editingDebtAmount, setEditingDebtAmount] = useState<Record<string, string>>({})
  const [editingIncentiveAmount, setEditingIncentiveAmount] = useState<Record<string, string>>({})

  // Centered title in the AppHeader (Deal Workspace renders inside shell now)
  usePageTitle('Deal Workspace')
  /** Local string while Cost per SF is focused so typing is not overwritten by formatted derived value. */
  const [costPerSfDraft, setCostPerSfDraft] = useState<string | null>(null)
  /** Local string while Sale Price per SF is focused (derived from average sale price ÷ unit SF). */
  const [salePricePerSfDraft, setSalePricePerSfDraft] = useState<string | null>(null)
  /** Local string while Presale Deposit % is focused (stored value is a number, not a formatted string). */
  const [presaleDepositPctDraft, setPresaleDepositPctDraft] = useState<string | null>(null)
  /** Plain numeric strings while Land / Site / Infrastructure $ fields are focused (avoid formatCurrency fighting input). */
  const [costSummaryMoneyDraft, setCostSummaryMoneyDraft] = useState<{
    landCost: string | null
    siteWorkCost: string | null
    infrastructureCost: string | null
  }>({ landCost: null, siteWorkCost: null, infrastructureCost: null })
  /** Draft strings while Monthly Carry / Avg Construction Period are focused (avoid formatted value fighting input). */
  const [carryConstructionDraft, setCarryConstructionDraft] = useState<{
    monthlyCarryPerUnit: string | null
    avgConstructionPeriodMonths: string | null
  }>({ monthlyCarryPerUnit: null, avgConstructionPeriodMonths: null })
  const [investorEquityDraft, setInvestorEquityDraft] = useState<string | null>(null)
  const [investorTermsPercentDraft, setInvestorTermsPercentDraft] = useState<{
    preferredReturnRateAnnual: string | null
    investorProfitShareOnCompletion: string | null
    developerProfitShareOnCompletion: string | null
  }>({
    preferredReturnRateAnnual: null,
    investorProfitShareOnCompletion: null,
    developerProfitShareOnCompletion: null,
  })
  const [expandedPhaseRowId, setExpandedPhaseRowId] = useState<string | null>(null)
  const recognitionRef = useRef<any>(null)
  const autosaveTimerRef = useRef<number | null>(null)
  const contextAutosaveTimerRef = useRef<number | null>(null)
  const hasLoadedDealRef = useRef(false)

  const normalizeRestoredInput = (saved: any, deal: Deal): ProFormaInput => {
    let restoredInput: ProFormaInput = {
      ...(defaultInputForDeal(deal) as any),
      ...(saved?.currentInput || saved?.input || saved || {}),
      startDate:
        saved?.currentInput?.startDate || saved?.input?.startDate || saved?.startDate
          ? new Date(saved?.currentInput?.startDate || saved?.input?.startDate || saved?.startDate)
          : defaultInputForDeal(deal).startDate,
      debtService: {
        ...(defaultInputForDeal(deal).debtService as any),
        ...((saved?.currentInput?.debtService || saved?.input?.debtService || saved?.debtService || {}) as any),
        startDate:
          saved?.currentInput?.debtService?.startDate ||
          saved?.input?.debtService?.startDate ||
          saved?.debtService?.startDate
            ? new Date(
                saved?.currentInput?.debtService?.startDate ||
                  saved?.input?.debtService?.startDate ||
                  saved?.debtService?.startDate,
              )
            : defaultInputForDeal(deal).startDate,
      },
    }
    if ((restoredInput.proFormaMode || 'general-development') === 'general-development') {
      restoredInput = syncDebtAmountFromLtc(restoredInput)
    }
    return restoredInput
  }

  const selectedDeal = useMemo(
    () => deals.find((d) => d.id === selectedDealId) || null,
    [deals, selectedDealId],
  )

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const rows = await fetchDeals()
      setDeals(rows)
      const first = dealId || rows[0]?.id
      setSelectedDealId(first)
      setLoading(false)
    }
    load()
  }, [dealId])

  useEffect(() => {
    const loadState = async () => {
      if (!selectedDeal) return
      setCostPerSfDraft(null)
      setSalePricePerSfDraft(null)
      setPresaleDepositPctDraft(null)
      setCostSummaryMoneyDraft({ landCost: null, siteWorkCost: null, infrastructureCost: null })
      setCarryConstructionDraft({ monthlyCarryPerUnit: null, avgConstructionPeriodMonths: null })
      setInvestorEquityDraft(null)
      setInvestorTermsPercentDraft({
        preferredReturnRateAnnual: null,
        investorProfitShareOnCompletion: null,
        developerProfitShareOnCompletion: null,
      })
      hasLoadedDealRef.current = false
      setLoadingDealState(true)
      const saved = await loadDealProFormaInputs(selectedDeal.id)
      if (saved) {
        const restored = saved as any
        const restoredInput = normalizeRestoredInput(restored, selectedDeal)
        setInput(restoredInput)
        setStage((restored.stage as WorkspaceStage) || 'coaching')
        setMessages(Array.isArray(restored.messages) ? restored.messages : [])
        setFieldMeta(restored.fieldMeta || {})
      } else {
        setInput(defaultInputForDeal(selectedDeal))
        setStage('coaching')
        setMessages([buildInitialCoachMessage(selectedDeal.deal_name)])
        setFieldMeta({})
      }
      const workspaceContext = await loadDealWorkspaceContext(selectedDeal.id)
      setNotesDraft(workspaceContext?.notesText || '')
      setTasksDraft(workspaceContext?.tasksText || '')
      const events = await listDealActivityEvents(selectedDeal.id, 120)
      setActivityEvents(
        events.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          eventText: e.eventText,
          createdAt: e.createdAt,
        })),
      )
      setProjection(null)
      setPendingSuggestions(null)
      setMarkers([])
      setRunPromptReason(null)
      setCenterTab('assumptions')
      hasLoadedDealRef.current = true
      setLoadingDealState(false)
    }
    loadState()
  }, [selectedDeal?.id])

  useEffect(() => {
    const loadVersions = async () => {
      if (!selectedDeal?.id) return
      const rows = await listDealProFormaVersions(selectedDeal.id)
      setVersionOptions(
        rows.map((v) => ({
          id: v.id,
          label: v.isDraft ? 'Draft (latest autosave)' : (v.versionLabel || `Version ${v.versionNumber}`),
        })),
      )
    }
    loadVersions()
  }, [selectedDeal?.id, saving])

  useEffect(() => {
    if (!selectedDeal || !input || !hasLoadedDealRef.current) return
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = window.setTimeout(async () => {
      setSaving(true)
      await saveDealProFormaDraft(selectedDeal.id, {
        currentInput: {
          ...input,
          startDate: input.startDate?.toISOString?.() || input.startDate,
          debtService: {
            ...input.debtService,
            startDate: input.debtService.startDate?.toISOString?.() || input.debtService.startDate,
          },
        },
        stage,
        messages,
        fieldMeta,
      })
      setSaving(false)
    }, 1200)
    return () => {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current)
    }
  }, [selectedDeal?.id, input, stage, messages, fieldMeta])

  useEffect(() => {
    if (!selectedDeal || !hasLoadedDealRef.current) return
    if (contextAutosaveTimerRef.current) window.clearTimeout(contextAutosaveTimerRef.current)
    contextAutosaveTimerRef.current = window.setTimeout(async () => {
      await saveDealWorkspaceContext(selectedDeal.id, {
        notesText: notesDraft,
        tasksText: tasksDraft,
      })
    }, 1200)
    return () => {
      if (contextAutosaveTimerRef.current) window.clearTimeout(contextAutosaveTimerRef.current)
    }
  }, [selectedDeal?.id, notesDraft, tasksDraft])

  const readiness = useMemo(() => computeDealReadiness(input), [input])

  const roughMetrics = useMemo(() => {
    if (!input) return { equityRequired: 0, roughIrr: 0 }

    if (materialForSaleContext(input) && input.forSalePhasedLoc) {
      const loc = input.forSalePhasedLoc
      const totalDev = input.underwritingEstimatedConstructionCost || 0
      const locLimit = loc.fixedLocLimit || 0
      const tif = loc.tifInfrastructureReduction || 0
      const grants = loc.incentiveCostReduction || 0
      const incentiveEquity = loc.incentiveEquitySource || 0
      const equityRequired = Math.max(0, totalDev - locLimit - tif - grants - incentiveEquity)
      const totalRevenue = (loc.totalUnits || 0) * (loc.averageSalePrice || 0)
      const roughIrr = equityRequired > 0 ? ((totalRevenue - totalDev) / equityRequired) * 100 : 0
      return { equityRequired, roughIrr }
    }

    const hard = input.underwritingEstimatedConstructionCost || 0
    const land = input.landCost || 0
    const soft = hard * ((input.softCostPercent || 0) / 100)
    const contingency = hard * ((input.contingencyPercent || 0) / 100)
    const totalDev = hard + land + soft + contingency
    const debtFromLtc = totalDev * ((input.loanToCostPercent || 0) / 100)
    const debt = Math.max(input.debtService?.loanAmount || 0, debtFromLtc)
    const equityRequired = Math.max(0, totalDev - debt)
    const value = input.contractValue || 0
    const roughIrr = equityRequired > 0 ? ((value - totalDev) / equityRequired) * 100 : 0
    return { equityRequired, roughIrr }
  }, [input])

  const carbonMetrics = useMemo(() => {
    if (!input) return null
    const fs = input.forSalePhasedLoc
    const units = fs?.totalUnits || 0
    const salePrice = fs?.averageSalePrice || 0
    const equity = Number(input?.investorEquity || input?.forSalePhasedLoc?.incentiveEquitySource || 0)
    const prefRate = Number(input?.preferredReturnRateAnnual || 10)
    const prefFreq = (input?.preferredReturnPaidFrequency || 'monthly') as ProFormaInput['preferredReturnPaidFrequency']
    const investorSplit = Number(input?.investorProfitShareOnCompletion || 20)
    const developerSplit = Number(input?.developerProfitShareOnCompletion || 80)
    const durationMonths = Number(input.projectionMonths || 0)
    const monthsPerPrefPeriod = getMonthsPerPrefPeriod(prefFreq)
    const prefPeriods = durationMonths > 0 ? Math.ceil(durationMonths / monthsPerPrefPeriod) : 0
    const periodsPerYear = 12 / monthsPerPrefPeriod
    const monthlyPref = equity > 0 ? (equity * (prefRate / 100)) / 12 : 0
    const prefPerPeriod = periodsPerYear > 0 ? (equity * (prefRate / 100)) / periodsPerYear : 0
    const totalPref = prefPerPeriod * prefPeriods
    const grossRevenue = units * salePrice + Number(fs?.tifInfrastructureReduction || 0)
    const hard = Number(input.underwritingEstimatedConstructionCost || 0)
    const land = Number(input.landCost || 0)
    const site = Number(input.siteWorkCost || 0)
    const soft = hard * (Number(input.softCostPercent || 0) / 100)
    const contingency = hard * (Number(input.contingencyPercent || 0) / 100)
    const infra = Number(fs?.infrastructureCost || 0)
    const carry = getCalculatedCarryCost(input)
    const baselineCost = hard + land + site + soft + contingency + infra + carry
    const interest = Number(projection?.summary?.totalInterestDuringConstruction || 0)
    const netProfit = grossRevenue - baselineCost - interest
    const profitAfterPref = netProfit - totalPref
    const investorProfitShare = Math.max(0, profitAfterPref * (investorSplit / 100))
    const developerProfitShare = Math.max(0, profitAfterPref * (developerSplit / 100))
    const investorPayout = equity + totalPref + investorProfitShare
    const investorMoic = equity > 0 ? investorPayout / equity : null
    const annualPropertyTaxRevenue = grossRevenue * 0.025
    const tifPaybackYears = Number(fs?.tifInfrastructureReduction || 0) > 0 && annualPropertyTaxRevenue > 0
      ? Number(fs?.tifInfrastructureReduction || 0) / annualPropertyTaxRevenue
      : null
    const public10YrNetReturn = (annualPropertyTaxRevenue * 10) - Number(fs?.tifInfrastructureReduction || 0)
    return {
      units,
      salePrice,
      investorEquity: equity,
      grossRevenue,
      baselineCost,
      interest,
      netProfit,
      monthlyPref,
      prefPerPeriod,
      prefPeriods,
      prefFrequencyLabel: getPrefFrequencyLabel(prefFreq),
      totalPref,
      investorSplit,
      developerSplit,
      investorProfitShare,
      developerProfitShare,
      investorPayout,
      investorMoic,
      tifAmount: Number(fs?.tifInfrastructureReduction || 0),
      annualPropertyTaxRevenue,
      tifPaybackYears,
      public10YrNetReturn,
    }
  }, [input, projection])

  const dashboardMetrics = useMemo(() => {
    const summary = projection?.summary
    const projectedProfit = projection?.projectedProfit ?? carbonMetrics?.netProfit ?? null
    const investorMoic = summary?.forSaleEquityMultiple ?? carbonMetrics?.investorMoic ?? null
    const distributedTotal = summary?.forSaleDistributionTotal ?? null
    const developerSplitPct = Number(input?.developerProfitShareOnCompletion || 80)
    const developerShare =
      distributedTotal != null
        ? distributedTotal * (developerSplitPct / 100)
        : (carbonMetrics?.developerProfitShare ?? null)

    return {
      projectedProfit,
      investorMoic,
      developerShare,
      peakLocBalance: summary?.forSalePeakLocBalance ?? null,
      tifPaybackYears: carbonMetrics?.tifPaybackYears ?? null,
      usesProjectionValues: Boolean(projection),
    }
  }, [input?.developerProfitShareOnCompletion, projection, carbonMetrics])

  const analysisMetrics = useMemo(() => {
    const summary = projection?.summary
    const totalInterest = Number(summary?.totalInterestDuringConstruction || carbonMetrics?.interest || 0)
    const totalExpensesExInterest =
      projection?.totalEstimatedCost != null
        ? Math.max(0, Number(projection.totalEstimatedCost) - totalInterest)
        : Number(carbonMetrics?.baselineCost || 0)
    const totalRevenue =
      summary?.forSaleTotalRevenue ??
      (projection?.contractValue ?? carbonMetrics?.grossRevenue ?? null)
    const netProjectProfit = projection?.projectedProfit ?? carbonMetrics?.netProfit ?? null
    const distributedCash = summary?.forSaleDistributionTotal ?? null
    const developerSplitPct = Number(input?.developerProfitShareOnCompletion || 80)
    const investorSplitPct = Number(input?.investorProfitShareOnCompletion || 20)
    const developerTakeHome =
      distributedCash != null
        ? distributedCash * (developerSplitPct / 100)
        : (carbonMetrics?.developerProfitShare ?? null)
    const investorPayout =
      distributedCash != null
        ? distributedCash * (investorSplitPct / 100)
        : (carbonMetrics?.investorPayout ?? null)

    return {
      totalExpensesExInterest,
      totalRevenue,
      totalInterest,
      totalPreferredReturn: carbonMetrics?.totalPref ?? null,
      netProjectProfit,
      developerTakeHome,
      investorPayout,
      peakLocBalance: summary?.forSalePeakLocBalance ?? null,
      finalLocBalance: summary?.forSaleEndingLocBalance ?? null,
    }
  }, [
    projection,
    input?.developerProfitShareOnCompletion,
    input?.investorProfitShareOnCompletion,
    carbonMetrics,
  ])

  const investorReturnsMetrics = useMemo(() => {
    const summary = projection?.summary
    const investorEquity =
      summary?.forSaleEquityDeployed ??
      Number(input?.investorEquity || input?.forSalePhasedLoc?.incentiveEquitySource || carbonMetrics?.investorEquity || 0)
    const totalPreferredReturn = carbonMetrics?.totalPref ?? null
    const investorSplitPct = Number(input?.investorProfitShareOnCompletion || carbonMetrics?.investorSplit || 20)
    const developerSplitPct = Number(input?.developerProfitShareOnCompletion || carbonMetrics?.developerSplit || 80)
    const distributedCash = summary?.forSaleDistributionTotal ?? null
    const investorProfitShare =
      distributedCash != null
        ? distributedCash * (investorSplitPct / 100)
        : (carbonMetrics?.investorProfitShare ?? null)
    const totalInvestorPayout =
      distributedCash != null
        ? distributedCash * (investorSplitPct / 100)
        : (carbonMetrics?.investorPayout ?? null)
    const investorMoic =
      summary?.forSaleEquityMultiple ??
      (investorEquity > 0 && totalInvestorPayout != null ? totalInvestorPayout / investorEquity : carbonMetrics?.investorMoic ?? null)

    return {
      investorEquity,
      monthlyPreferredReturn: carbonMetrics?.monthlyPref ?? null,
      totalPreferredReturn,
      investorProfitShare,
      investorSplitPct,
      developerSplitPct,
      totalInvestorPayout,
      investorMoic,
    }
  }, [projection, input, carbonMetrics])

  const publicSectorMetrics = useMemo(() => {
    const summary = projection?.summary
    const totalRevenue =
      summary?.forSaleTotalRevenue ??
      (carbonMetrics?.grossRevenue ?? ((input?.forSalePhasedLoc?.totalUnits || 0) * (input?.forSalePhasedLoc?.averageSalePrice || 0)))
    const annualPropertyTaxRevenue = totalRevenue * 0.025
    const tifAmount = Number(input?.forSalePhasedLoc?.tifInfrastructureReduction || 0)
    const tifPaybackYears = tifAmount > 0 && annualPropertyTaxRevenue > 0 ? tifAmount / annualPropertyTaxRevenue : null
    const public10YrNetReturn = (annualPropertyTaxRevenue * 10) - tifAmount
    return {
      annualPropertyTaxRevenue,
      tifPaybackYears,
      public10YrNetReturn,
    }
  }, [projection, input, carbonMetrics?.grossRevenue])

  const validationChecks = useMemo(() => {
    if (!input) return []
    const fs = input.forSalePhasedLoc
    const phaseUnits = (fs?.phases || []).reduce((sum, p) => sum + (Number(p.unitCount) || 0), 0)
    const checks = [
      { label: 'Total units > 0', pass: Number(fs?.totalUnits || 0) > 0 },
      { label: 'Phase units = total units', pass: Math.abs(phaseUnits - Number(fs?.totalUnits || 0)) <= 1 },
      { label: 'Average sale price > 0', pass: Number(fs?.averageSalePrice || 0) > 0 },
      { label: 'LOC limit set', pass: Number(fs?.fixedLocLimit || 0) > 0 },
      { label: 'Peak LOC within limit', pass: Number(projection?.summary?.forSalePeakLocBalance || 0) <= Number(fs?.fixedLocLimit || 0) || Number(fs?.fixedLocLimit || 0) === 0 },
      { label: 'No critical readiness blockers', pass: readiness.failedCriticalCount === 0 },
    ]
    return checks
  }, [input, projection, readiness.failedCriticalCount])

  const phaseProFormaRows = useMemo(() => {
    const fs = input?.forSalePhasedLoc
    const phases = fs?.phases || []
    const avg = Number(fs?.averageSalePrice || 0)
    const depPct = Number(fs?.presaleDepositPercent || 0)
    const depShare = depPct / 100
    const tifTotal = Number(fs?.tifInfrastructureReduction || 0)
    const incentiveRowsForTif =
      ((input as any)?.customStacks?.incentiveRows as IncentiveStackRow[]) || []
    const tifByPhase = allocateTifAcrossPhases({ phases, tifTotal, incentiveRows: incentiveRowsForTif })
    const infraTotal = Number(fs?.infrastructureCost || 0)
    const landTotal = Number(input?.landCost || 0)
    const siteTotal = Number(input?.siteWorkCost || 0)
    const totalUnits = Math.max(1, phases.reduce((sum, p) => sum + (Number(p.unitCount) || 0), 0))
    const totalConstruction = Number(input?.underwritingEstimatedConstructionCost || 0)
    const totalCarry = getCalculatedCarryCost(input || null)
    const perUnitCarry = Number(input?.monthlyCarryPerUnit || 0)
    const phaseUnitMonthsArr = phases.map((p) => {
      const u = Math.max(0, Number(p.unitCount || 0))
      const m = Math.max(0, Number(p.buildMonths || 0))
      return u * m
    })
    const sumPhaseUnitMonths = phaseUnitMonthsArr.reduce((a, b) => a + b, 0)
    const infraShares =
      phases.length && infraTotal > 0
        ? computePhaseAllocationShares(phases, (p) => p.infrastructureAllocationPercent ?? 0, 'infra')
        : phases.map(() => 0)
    const landShares =
      phases.length && landTotal > 0
        ? computePhaseAllocationShares(phases, (p) => p.landAllocationPercent ?? 0, 'landSite')
        : phases.map(() => 0)
    const siteShares =
      phases.length && siteTotal > 0
        ? computePhaseAllocationShares(phases, (p) => p.siteWorkAllocationPercent ?? 0, 'landSite')
        : phases.map(() => 0)

    return phases.map((p, idx) => {
      const units = Number(p.unitCount || 0)
      const unitShare = units / totalUnits
      const phaseRevenue = units * avg
      const presale = phaseRevenue * depShare
      const close = phaseRevenue * Math.max(0, 1 - depShare)
      const constructionCost = totalConstruction * unitShare
      const landCost = landTotal * (landShares[idx] || 0)
      const siteCost = siteTotal * (siteShares[idx] || 0)
      const infra = infraTotal * (infraShares[idx] || 0)
      const carry =
        perUnitCarry > 0 && sumPhaseUnitMonths > 0
          ? roundMoney(perUnitCarry * (phaseUnitMonthsArr[idx] || 0))
          : roundMoney(totalCarry * unitShare)
      const tif = tifByPhase[idx] ?? 0
      const totalCosts = constructionCost + landCost + siteCost + infra + carry
      const totalRevenue = phaseRevenue + tif
      return {
        id: p.id,
        phase: p.name,
        units,
        presale,
        close,
        tif,
        totalRevenue,
        hardCost: constructionCost,
        infra,
        carry,
        totalCosts,
        profit: totalRevenue - totalCosts,
      }
    })
  }, [input])

  const cashFlowWorkbookRows = useMemo(() => {
    const timeline = projection?.forSaleLocTimeline || []
    const fallback = projection?.monthlyCashFlows || []
    const displayMonths = 26
    const months = (timeline.length ? timeline.map((m) => m.monthLabel) : fallback.map((m) => m.monthLabel))
    if (months.length === 0) return null
    const avg = Number(input?.forSalePhasedLoc?.averageSalePrice || 0)
    const depPct = Number(input?.forSalePhasedLoc?.presaleDepositPercent || 0)
    const depShare = depPct / 100

    const calcFromTimeline = (cb: (m: any) => number) => timeline.map((m) => cb(m) || 0)
    const calcFromFallback = (cb: (m: any) => number) => fallback.map((m) => cb(m) || 0)
    const fromTimeline = timeline.length > 0

    const presaleDeposits = fromTimeline
      ? calcFromTimeline((m) => Number(m.presalesThisMonth || 0) * avg * depShare)
      : calcFromFallback((m) => Number(m.milestonePayments || 0))
    const closingProceeds = fromTimeline
      ? calcFromTimeline((m) => Number(m.closingsThisMonth || 0) * avg * (1 - depShare))
      : calcFromFallback((m) => Math.max(0, Number(m.totalInflow || 0) - Number(m.milestonePayments || 0)))
    const totalSalesRevenue = presaleDeposits.map((v, i) => v + closingProceeds[i])
    const totalInflow = calcFromFallback((m) => Number(m.totalInflow || 0))
    const locDraw = fromTimeline ? calcFromTimeline((m) => Number(m.locDraw || 0)) : calcFromFallback((m) => Number(m.netCashFlow || 0) < 0 ? Math.abs(Number(m.netCashFlow || 0)) : 0)
    const locRepayment = fromTimeline ? calcFromTimeline((m) => Number(m.locPaydown || 0)) : calcFromFallback((m) => Number(m.netCashFlow || 0) > 0 ? Number(m.netCashFlow || 0) : 0)
    const locBalance = fromTimeline
      ? calcFromTimeline((m) => Number(m.locBalance || 0))
      : (() => {
          let bal = 0
          return locDraw.map((d, i) => {
            bal = bal + d - locRepayment[i]
            return bal
          })
        })()
    const locOpeningBalance = locBalance.map((_, i) => (i === 0 ? 0 : locBalance[i - 1]))
    const unfundedShortfall = new Array(months.length).fill(0)
    const totalOutflow = calcFromFallback((m) => Number(m.totalOutflow || 0))
    const prefPaidSeries = fromTimeline
      ? calcFromTimeline((m) => Number((m as { preferredReturnPaid?: number }).preferredReturnPaid || 0))
      : (() => {
          const prefFrequency = (input?.preferredReturnPaidFrequency ||
            'monthly') as ProFormaInput['preferredReturnPaidFrequency']
          const monthsPerPrefPeriod = Math.max(1, getMonthsPerPrefPeriod(prefFrequency))
          const prefPerMonth = Number(carbonMetrics?.monthlyPref || 0)
          const modeledMonths = Math.max(0, Number(input?.projectionMonths || 0))
          return months.map((_, i) => {
            const monthNumber = i + 1
            if (monthNumber > modeledMonths) return 0
            if (monthNumber % monthsPerPrefPeriod === 0) {
              return prefPerMonth * monthsPerPrefPeriod
            }
            if (monthNumber === modeledMonths) {
              const monthsIntoCurrentPeriod = ((monthNumber - 1) % monthsPerPrefPeriod) + 1
              return prefPerMonth * monthsIntoCurrentPeriod
            }
            return 0
          })
        })()
    const constructionUses = totalOutflow.map((t, i) =>
      fromTimeline ? Math.max(0, t - (prefPaidSeries[i] || 0)) : t,
    )
    const investorEquityRow = new Array(months.length).fill(0)
    investorEquityRow[0] = Number(input?.investorEquity || input?.forSalePhasedLoc?.incentiveEquitySource || 0)
    const tifReimbursement = fromTimeline
      ? timeline.map((m) => Number((m as { tifReimbursement?: number }).tifReimbursement || 0))
      : totalInflow.map((inflow, i) => Math.max(0, inflow - totalSalesRevenue[i]))
    const totalInfusion = investorEquityRow.map((v, i) => v + tifReimbursement[i])
    const investorEquityReturn = new Array(months.length).fill(0)
    const investorProfitShareDistribution = new Array(months.length).fill(0)
    const visibleTimeline = timeline
    const defaultPayoutMonthIndex = Math.max(
      0,
      Math.min(
        months.length - 1,
        Math.max(0, Number(input?.projectionMonths || months.length) - 1),
      ),
    )
    let payoutMonthIndex = defaultPayoutMonthIndex
    if (fromTimeline && visibleTimeline.length > 0) {
      let lastClosingMonthIndex = -1
      for (let i = visibleTimeline.length - 1; i >= 0; i--) {
        if (Number(visibleTimeline[i]?.closingsThisMonth || 0) > 0) {
          lastClosingMonthIndex = i
          break
        }
      }
      if (lastClosingMonthIndex >= 0) {
        const payoffOffset = visibleTimeline
          .slice(lastClosingMonthIndex)
          .findIndex((m) => Number(m.locBalance || 0) <= 0 && Number(m.bondBalance || 0) <= 0)
        payoutMonthIndex =
          payoffOffset >= 0
            ? lastClosingMonthIndex + payoffOffset
            : lastClosingMonthIndex
      }
    }
    investorEquityReturn[payoutMonthIndex] = Number(carbonMetrics?.investorEquity || 0)
    investorProfitShareDistribution[payoutMonthIndex] = Number(carbonMetrics?.investorProfitShare || 0)
    const totalInvestorPayoutsRow = prefPaidSeries.map(
      (p, i) => p + investorEquityReturn[i] + investorProfitShareDistribution[i],
    )
    const operatingCashFlow = totalSalesRevenue.map((v, i) =>
      fromTimeline
        ? v + totalInfusion[i] - totalOutflow[i]
        : v + totalInfusion[i] - totalOutflow[i] - prefPaidSeries[i],
    )
    const cumulativeOperating = (() => {
      let c = 0
      return operatingCashFlow.map((n) => {
        c += n
        return c
      })
    })()
    const locInterest = calcFromFallback((m) => Number(m.interestDuringConstruction || 0))
    const netBeforeLoc = operatingCashFlow.map((v, i) => v - locInterest[i])
    const netCashFlow = netBeforeLoc.map(
      (v, i) => v + locDraw[i] - locRepayment[i] - investorEquityReturn[i] - investorProfitShareDistribution[i],
    )
    const cumulativeNet = (() => {
      let c = 0
      return netCashFlow.map((n) => {
        c += n
        return c
      })
    })()

    const rows = [
        { label: 'EXPENSES', values: [], kind: 'header' },
        { label: 'Construction & project uses', values: constructionUses, kind: 'data' },
        {
          label: fromTimeline ? 'Total cash uses (construction + pref)' : 'Total Expenses',
          values: totalOutflow,
          kind: 'total',
        },
        { label: 'REVENUE', values: [], kind: 'header' },
        { label: `Presale Deposits (${depPct.toFixed(0)}%)`, values: presaleDeposits, kind: 'data' },
        { label: `Closing Proceeds (${Math.max(0, 100 - depPct).toFixed(0)}%)`, values: closingProceeds, kind: 'data' },
        { label: 'Total Sales Revenue', values: totalSalesRevenue, kind: 'total' },
        { label: 'EQUITY & CASH INFUSIONS', values: [], kind: 'header' },
        { label: '  Investor Equity', values: investorEquityRow, kind: 'data' },
        { label: '  TIF Reimbursement', values: tifReimbursement, kind: 'data' },
        { label: 'Total Cash Infusions', values: totalInfusion, kind: 'total' },
        { label: 'INVESTOR PAYOUTS', values: [], kind: 'header' },
        {
          label: `  Preferred return (${carbonMetrics?.prefFrequencyLabel || 'Monthly'})`,
          values: prefPaidSeries,
          kind: 'data',
        },
        { label: '  Equity returned to investor (at completion)', values: investorEquityReturn, kind: 'data' },
        { label: '  Investor profit share (at completion)', values: investorProfitShareDistribution, kind: 'data' },
        { label: 'Total investor payouts', values: totalInvestorPayoutsRow, kind: 'total' },
        { label: 'PRE-FINANCING CASH FLOW', values: [], kind: 'header' },
        { label: 'Operating Cash Flow', values: operatingCashFlow, kind: 'data' },
        { label: 'Cumulative Operating CF', values: cumulativeOperating, kind: 'total' },
        {
          label: `LINE OF CREDIT (${Number(effectiveLocAnnualPercent(input)).toFixed(2)}% Revolving)`,
          values: [],
          kind: 'header',
        },
        { label: '  Opening Balance', values: locOpeningBalance, kind: 'data' },
        { label: '  Interest Due', values: locInterest, kind: 'data' },
        { label: 'Net Before LOC', values: netBeforeLoc, kind: 'data' },
        { label: '  LOC Draw', values: locDraw, kind: 'data' },
        { label: '  LOC Repayment', values: locRepayment, kind: 'data' },
        { label: '  Closing Balance', values: locBalance, kind: 'total' },
        { label: '  Unfunded Shortfall', values: unfundedShortfall, kind: 'data' },
        { label: 'NET CASH FLOW (After Financing)', values: [], kind: 'header' },
        { label: 'Monthly Free Cash', values: netCashFlow, kind: 'total' },
        { label: 'Cumulative Free Cash', values: cumulativeNet, kind: 'total' },
      ]
    const fullTotalsByLabel = Object.fromEntries(
      rows
        .filter((row) => row.kind !== 'header')
        .map((row) => [
          row.label,
          (row.values as number[]).reduce((sum, n) => sum + (Number(n) || 0), 0),
        ]),
    ) as Record<string, number>
    const clipValues = (vals: number[]) => vals.slice(0, displayMonths)
    return {
      months: months.slice(0, displayMonths),
      rows: rows.map((row) =>
        row.kind === 'header'
          ? row
          : { ...row, values: clipValues(row.values as number[]) },
      ),
      fullTotalsByLabel,
    }
  }, [
    projection,
    input,
    carbonMetrics?.monthlyPref,
    carbonMetrics?.prefFrequencyLabel,
    carbonMetrics?.investorEquity,
    carbonMetrics?.investorProfitShare,
  ])

  const cashFlowAudit = useMemo(() => {
    const configuredTif = Number(input?.forSalePhasedLoc?.tifInfrastructureReduction || 0)
    const workbookTif = Number(cashFlowWorkbookRows?.fullTotalsByLabel?.['  TIF Reimbursement'] || 0)
    const tifDelta = workbookTif - configuredTif
    const payoutTarget = Number(carbonMetrics?.investorPayout || 0)
    const workbookPayout = Number(cashFlowWorkbookRows?.fullTotalsByLabel?.['Total investor payouts'] || 0)
    const payoutDelta = workbookPayout - payoutTarget
    const locLimit = Number(input?.forSalePhasedLoc?.fixedLocLimit || 0)
    const peakLoc = Number(projection?.summary?.forSalePeakLocBalance || 0)
    const endingLoc = Number(projection?.summary?.forSaleEndingLocBalance || 0)
    const locInterest = Number(projection?.summary?.totalInterestDuringConstruction || 0)
    return {
      configuredTif,
      workbookTif,
      tifDelta,
      payoutTarget,
      workbookPayout,
      payoutDelta,
      locLimit,
      peakLoc,
      endingLoc,
      locInterest,
    }
  }, [input, projection, carbonMetrics?.investorPayout, cashFlowWorkbookRows])

  const selectedDealStage = (deal: Deal): WorkspaceStage => {
    if (deal.converted_to_projects) return 'proforma'
    if ((deal.projected_cost || 0) > 0) return 'scenario'
    return 'coaching'
  }

  const setField = (path: string, value: any) => {
    if (!input) return
    const keys = path.split('.')
    let next: any = { ...input }
    let cur: any = next
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]
      cur[k] = cur[k] ? { ...cur[k] } : {}
      cur = cur[k]
    }
    cur[keys[keys.length - 1]] = value

    if ((next.proFormaMode || 'general-development') === 'general-development') {
      if (path === 'debtService.loanAmount') {
        next = syncLtcFromDebtAmount(next)
      } else if (path === 'loanToCostPercent' || USES_PATHS_FOR_LTC_DEBT_SYNC.has(path)) {
        next = syncDebtAmountFromLtc(next)
      } else if (path === 'proFormaMode' && value === 'general-development') {
        next = syncDebtAmountFromLtc(next)
      }
    }

    setInput(next)
    setFieldMeta((prev) => ({
      ...prev,
      [path]: { status: 'confirmed', source: 'user', updatedAt: new Date().toISOString() },
    }))
  }

  const setModeSelection = (value: string) => {
    if (!input) return
    if (value === 'rental-hold') {
      setField('proFormaMode', 'rental-hold')
      return
    }
    const nextMode = materialForSaleContext(input) ? 'for-sale-phased-loc' : 'general-development'
    setField('proFormaMode', nextMode)
  }

  const defaultDebtLocRows = (): DebtLocStackRow[] => ([
    {
      id: 'loc-primary',
      label: 'Primary LOC',
      amount: input?.forSalePhasedLoc?.fixedLocLimit || 0,
      interestRate: Number(input?.debtService?.interestRate || 0),
      debtType: 'revolving-interest-only',
      applyTo: 'loc-limit',
    },
    {
      id: 'debt-primary',
      label: 'Primary Debt',
      amount: input?.debtService?.loanAmount || 0,
      interestRate: Number(input?.debtService?.interestRate || 0),
      debtType: 'term-interest-only',
      applyTo: 'debt-amount',
    },
  ])

  const defaultIncentiveRows = (): IncentiveStackRow[] => ([
    {
      id: 'incentive-tif',
      label: 'TIF',
      amount: input?.forSalePhasedLoc?.tifInfrastructureReduction || 0,
      applyTo: 'infrastructure-reduction',
      timingMode: 'by-phase',
      constructionPercent: 0,
      phaseNames: '',
    },
    {
      id: 'incentive-grant',
      label: 'Grant / Incentive',
      amount: input?.forSalePhasedLoc?.incentiveCostReduction || 0,
      applyTo: 'cost-reduction',
      timingMode: 'upfront',
      constructionPercent: 0,
      phaseNames: '',
    },
    {
      id: 'incentive-equity',
      label: 'Incentive Equity Source',
      amount: input?.forSalePhasedLoc?.incentiveEquitySource || 0,
      applyTo: 'equity-source',
      timingMode: 'upfront',
      constructionPercent: 0,
      phaseNames: '',
    },
  ])

  const rawDebtLocRows: DebtLocStackRow[] = ((input as any)?.customStacks?.debtLocRows as DebtLocStackRow[]) || defaultDebtLocRows()
  const firstBondRowIdx = rawDebtLocRows.findIndex((r) => r.applyTo === 'bond-capacity')
  const legacyBondRate = input?.forSalePhasedLoc?.bondRatePercent
  const debtLocRows: DebtLocStackRow[] = rawDebtLocRows.map((row, i) => {
    const isBond = row.applyTo === 'bond-capacity'
    let interestRate = Number((row as any).interestRate || 0)
    if (isBond && i === firstBondRowIdx && !interestRate && legacyBondRate) {
      interestRate = Number(legacyBondRate)
    }
    return {
      ...row,
      interestRate,
      debtType: ((row as any).debtType as DebtInstrumentType) || 'revolving-interest-only',
    }
  })
  const rawIncentiveRows: IncentiveStackRow[] = ((input as any)?.customStacks?.incentiveRows as IncentiveStackRow[]) || defaultIncentiveRows()
  const incentiveRows: IncentiveStackRow[] = rawIncentiveRows.map((row) => ({
    ...row,
    timingMode: ((row as any).timingMode as IncentiveTimingMode) || 'upfront',
    constructionPercent: Number((row as any).constructionPercent || 0),
    phaseNames: String((row as any).phaseNames || ''),
  }))

  const applyStackRows = (nextDebtRows: DebtLocStackRow[], nextIncentiveRows: IncentiveStackRow[]) => {
    if (!input) return
    const locLimit = nextDebtRows.filter((r) => r.applyTo === 'loc-limit').reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
    const debtAmount = nextDebtRows.filter((r) => r.applyTo === 'debt-amount').reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
    const bondRows = nextDebtRows.filter((r) => r.applyTo === 'bond-capacity')
    const bondCapacity = bondRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
    const primaryBond = bondRows[0]
    const bondRateSync = primaryBond ? Number(primaryBond.interestRate || 0) : undefined
    const tifInfra = nextIncentiveRows.filter((r) => r.applyTo === 'infrastructure-reduction').reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
    const costReduction = nextIncentiveRows.filter((r) => r.applyTo === 'cost-reduction').reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
    const equitySource = nextIncentiveRows.filter((r) => r.applyTo === 'equity-source').reduce((sum, r) => sum + (Number(r.amount) || 0), 0)

    const forSalePhasedLocPatch: Record<string, unknown> = {
      fixedLocLimit: locLimit,
      bondCapacity,
      bondFinancingEnabled: bondCapacity > 0,
      tifInfrastructureReduction: tifInfra,
      incentiveCostReduction: costReduction,
      incentiveEquitySource: equitySource,
    }
    if (primaryBond) {
      forSalePhasedLocPatch.bondRatePercent = bondRateSync ?? 0
    }

    let next = deepMerge(input as any, {
      customStacks: {
        debtLocRows: nextDebtRows,
        incentiveRows: nextIncentiveRows,
      },
      debtService: {
        loanAmount: debtAmount,
      },
      forSalePhasedLoc: forSalePhasedLocPatch,
    } as any)
    const fspl = next.forSalePhasedLoc as Record<string, unknown> | undefined
    if (fspl && !primaryBond) {
      delete fspl.bondRatePercent
      delete fspl.bondLtcOverridePercent
    }
    if ((next.proFormaMode || 'general-development') === 'general-development') {
      next = syncLtcFromDebtAmount(next)
    }
    setInput(next)
  }

  const isDevelopmentMode = input?.proFormaMode !== 'rental-hold'
  const phaseRows = input?.forSalePhasedLoc?.phases || []
  const phaseTimingMode = input?.forSalePhasedLoc?.phaseTimingMode || 'trigger-based'

  const addPhaseRow = () => {
    setInput((prev) => {
      if (!prev?.forSalePhasedLoc) return prev
      const fs = prev.forSalePhasedLoc
      const phases = fs.phases || []
      const defaultStartMonth = phases.reduce((max, p) => {
        const start = Number(p.startMonthOffset ?? 0)
        const duration = Number(p.buildMonths || 0)
        return Math.max(max, Math.max(0, start) + Math.max(0, duration))
      }, 0)
      const next: ForSalePhaseInput = {
        id: uid(),
        name: `Phase ${phases.length + 1}`,
        startMonthOffset: defaultStartMonth,
        unitCount: 0,
        buildMonths: 0,
        presaleStartMonthOffset: 0,
        closeStartMonthOffset: 0,
        presaleTriggerPercent: 0,
        infrastructureAllocationPercent: 0,
        landAllocationPercent: 0,
        siteWorkAllocationPercent: 0,
      }
      return { ...prev, forSalePhasedLoc: { ...fs, phases: [...phases, next] } }
    })
    setFieldMeta((m) => ({
      ...m,
      'forSalePhasedLoc.phases': { status: 'confirmed', source: 'user', updatedAt: new Date().toISOString() },
    }))
  }

  const updatePhaseRow = (id: string, key: keyof ForSalePhaseInput, value: any) => {
    setInput((prev) => {
      if (!prev?.forSalePhasedLoc?.phases) return prev
      const fs = prev.forSalePhasedLoc
      const phases = fs.phases.map((p) => (p.id === id ? { ...p, [key]: value } : p))
      return { ...prev, forSalePhasedLoc: { ...fs, phases } }
    })
    setFieldMeta((m) => ({
      ...m,
      'forSalePhasedLoc.phases': { status: 'confirmed', source: 'user', updatedAt: new Date().toISOString() },
    }))
  }

  const removePhaseRow = (id: string) => {
    setInput((prev) => {
      if (!prev?.forSalePhasedLoc?.phases) return prev
      const fs = prev.forSalePhasedLoc
      const phases = fs.phases.filter((p) => p.id !== id)
      return { ...prev, forSalePhasedLoc: { ...fs, phases } }
    })
    setFieldMeta((m) => ({
      ...m,
      'forSalePhasedLoc.phases': { status: 'confirmed', source: 'user', updatedAt: new Date().toISOString() },
    }))
  }

  const applyUpdates = (updates: Partial<ProFormaInput>, source: 'ai' | 'user', status: FieldStatus) => {
    if (!input) return []
    const normalizedUpdates = normalizeCoachUpdates(updates)
    const flat = flattenFieldUpdates(normalizedUpdates as any)
    const updatedPaths = new Set(flat.map((u) => u.path))
    let next = deepMerge(input as any, normalizedUpdates as any)
    next = applyGeneralDevLtcDebtSyncAfterMerge(next as ProFormaInput, updatedPaths)
    setInput(next)
    const chips = flat.map((u) => `${toHumanFieldLabel(u.path)}: ${formatValue(u.value, u.path)}`)
    const now = new Date().toISOString()
    setFieldMeta((prev) => {
      const copy = { ...prev }
      flat.forEach(({ path }) => {
        copy[path] = { status, source, updatedAt: now }
      })
      return copy
    })
    return chips
  }

  const appendActivity = (eventType: string, eventText: string, eventData?: any) => {
    const now = new Date().toISOString()
    setActivityEvents((prev) => [{ id: uid(), eventType, eventText, createdAt: now }, ...prev])
    if (selectedDeal?.id) {
      void logDealActivityEvent(selectedDeal.id, { eventType, eventText, eventData })
    }
  }

  const addStageMarkerIfChanged = (nextStage: WorkspaceStage) => {
    if (nextStage === stage) return
    setMarkers((prev) => [...prev, { id: uid(), stage: nextStage, createdAt: new Date().toISOString() }])
    setStage(nextStage)
    appendActivity('stage_change', `Stage changed to ${nextStage}.`)
  }

  const handleSend = async (forcedText?: string) => {
    if (!selectedDeal || !input) return
    const userText = (forcedText ?? chatValue).trim()
    if (!userText) return
    setChatValue('')
    const userMsg: WorkspaceMessage = {
      id: uid(),
      role: 'user',
      text: userText,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    appendActivity('chat_user', `User: ${userText}`, { role: 'user' })
    const summarizeCaptureRequested = /summarize[\s\S]{0,80}(notes|tasks)/i.test(userText)
    if (/\b(move|go|switch|ready|run)\b[\s\S]{0,40}\b(pro[\s-]?forma|full mode)\b/i.test(userText)) {
      setRunPromptReason('You requested pro forma build. Review inputs, then click Run ProForma.')
    }

    try {
      const response = await invokeDealCoach({
        deal: selectedDeal,
        stage,
        currentInput: input,
        history: [...messages, userMsg],
        userMessage: userText,
      })

      // Recovery for long imports: if coach misses phases but user provided them in text, parse and apply.
      const parsedImportUpdates = parseForSaleImportFromText(userText)
      if (Object.keys(parsedImportUpdates).length > 0) {
        response.fieldUpdates = deepMerge((response.fieldUpdates || {}) as any, parsedImportUpdates as any)
      }

      const aiConfidence = response.confidence ?? 0
      let chips: string[] = []
      if (response.fieldUpdates && Object.keys(response.fieldUpdates).length > 0) {
        if (aiConfidence >= 0.85) {
          chips = applyUpdates(response.fieldUpdates, 'ai', 'confirmed')
        } else {
          const normalizedUpdates = normalizeCoachUpdates(response.fieldUpdates)
          setPendingSuggestions(normalizedUpdates)
          chips = flattenFieldUpdates(normalizedUpdates as any).map(
            (u) => `${toHumanFieldLabel(u.path)}: ${formatValue(u.value, u.path)}`,
          )
          const now = new Date().toISOString()
          setFieldMeta((prev) => {
            const copy = { ...prev }
            flattenFieldUpdates(normalizedUpdates as any).forEach(({ path }) => {
              copy[path] = { status: 'approx', source: 'ai', updatedAt: now }
            })
            return copy
          })
        }
      }
      const sanitizedNotesAppend = sanitizeCaptureNotesAppend(response.notesAppend)
      const sanitizedTaskSuggestions = sanitizeTaskSuggestions(response.taskSuggestions)
      if (sanitizedNotesAppend) {
        setPendingNotesAppend(sanitizedNotesAppend)
      }
      if (sanitizedTaskSuggestions.length > 0) {
        setPendingTaskSuggestions(sanitizedTaskSuggestions)
      }
      const hasWorkspaceCaptureSuggestions =
        !!sanitizedNotesAppend || sanitizedTaskSuggestions.length > 0

      const nextStage = (response.stageSuggestion || readiness.suggestedStage) as WorkspaceStage
      if (nextStage !== 'proforma') {
        addStageMarkerIfChanged(nextStage)
      } else {
        setRunPromptReason('AI suggests this deal is ready for full pro forma build.')
      }

      const assistantText = summarizeCaptureRequested && !hasWorkspaceCaptureSuggestions
        ? `${response.reply || 'I reviewed your update.'}\n\nNo notes/tasks suggestions were returned for this request, so there is nothing to approve yet.`
        : (response.reply || 'I updated the model state.')
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'assistant',
          text: assistantText,
          extractionChips: chips,
          createdAt: new Date().toISOString(),
        },
      ])
      appendActivity('chat_assistant', `Assistant: ${assistantText}`, { role: 'assistant' })
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'assistant',
          text:
            `I could not reach the deal assistant function. ${error?.message || 'Please verify Supabase edge function "deal-coach-chat".'}`,
          createdAt: new Date().toISOString(),
        },
      ])
      appendActivity('chat_error', `Coach function error: ${error?.message || 'unknown error'}`)
    }
  }

  const handleRunProForma = () => {
    if (!selectedDeal || !input) return
    setRunning(true)
    try {
      const proj = calculateProForma(
        buildDealUnderwritingProject(selectedDeal),
        [],
        proFormaInputForEngine(input),
      )
      setProjection(proj)
      setStage('proforma')
      setRunPromptReason(null)
      setMarkers((prev) => [...prev, { id: uid(), stage: 'proforma', createdAt: new Date().toISOString() }])
      appendActivity('proforma_run', 'Ran ProForma projection.')
    } finally {
      setRunning(false)
    }
  }

  const handleSaveVersion = async () => {
    if (!selectedDeal || !input) return
    setSaving(true)
    await saveDealProFormaVersion(selectedDeal.id, {
      currentInput: {
        ...input,
        startDate: input.startDate?.toISOString?.() || input.startDate,
        debtService: {
          ...input.debtService,
          startDate: input.debtService.startDate?.toISOString?.() || input.debtService.startDate,
        },
      },
      stage,
      messages,
      fieldMeta,
    })
    appendActivity('version_save', 'Saved ProForma version snapshot.')
    setSaving(false)
  }

  const handleLoadVersionInputsOnly = async (versionId: string) => {
    if (!selectedDeal || !versionId) return
    const savedVersion = await loadDealProFormaInputs(selectedDeal.id, versionId)
    if (!savedVersion) return
    const versionInput = normalizeRestoredInput(savedVersion, selectedDeal)
    setInput(versionInput)
    setProjection(null)
    setPendingSuggestions(null)
    setPendingNotesAppend(null)
    setPendingTaskSuggestions(null)
    setRunPromptReason('Loaded version inputs. Chat context was kept.')
    setCenterTab('assumptions')
    appendActivity('version_load', 'Loaded a saved version (inputs only).')
  }

  const handleClearWorkspace = async () => {
    if (!selectedDeal) return
    const confirmed = window.confirm(
      `Clear this workspace for "${selectedDeal.deal_name}"?\n\nThis will reset inputs, notes, tasks, AI chat, and activity history for this deal.`,
    )
    if (!confirmed) return

    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current)
    if (contextAutosaveTimerRef.current) window.clearTimeout(contextAutosaveTimerRef.current)

    const freshInput = defaultInputForDeal(selectedDeal)
    const starterMessages = [buildInitialCoachMessage(selectedDeal.deal_name)]
    const clearedStage: WorkspaceStage = 'coaching'

    setSaving(true)
    setInput(freshInput)
    setStage(clearedStage)
    setMessages(starterMessages)
    setFieldMeta({})
    setProjection(null)
    setPendingSuggestions(null)
    setPendingNotesAppend(null)
    setPendingTaskSuggestions(null)
    setMarkers([])
    setRunPromptReason('Workspace reset complete. You can start this deal fresh.')
    setChatValue('')
    setNotesDraft('')
    setTasksDraft('')
    setActivityEvents([])
    setCenterTab('assumptions')

    await Promise.all([
      saveDealProFormaDraft(selectedDeal.id, {
        currentInput: {
          ...freshInput,
          startDate: freshInput.startDate?.toISOString?.() || freshInput.startDate,
          debtService: {
            ...freshInput.debtService,
            startDate: freshInput.debtService.startDate?.toISOString?.() || freshInput.debtService.startDate,
          },
        },
        stage: clearedStage,
        messages: starterMessages,
        fieldMeta: {},
      }),
      saveDealWorkspaceContext(selectedDeal.id, {
        notesText: '',
        tasksText: '',
      }),
      clearDealActivityEvents(selectedDeal.id),
    ])
    setSaving(false)
  }

  const handleClearInputsOnly = async () => {
    if (!selectedDeal || !input) return
    const confirmed = window.confirm(
      `Clear all inputs for "${selectedDeal.deal_name}"?\n\nThis resets pro forma fields but keeps notes, tasks, and current chat history.`,
    )
    if (!confirmed) return

    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current)

    const freshInput = defaultInputForDeal(selectedDeal)
    const clearedStage: WorkspaceStage = 'coaching'
    setSaving(true)
    setInput(freshInput)
    setStage(clearedStage)
    setFieldMeta({})
    setProjection(null)
    setPendingSuggestions(null)
    setPendingNotesAppend(null)
    setPendingTaskSuggestions(null)
    setMarkers([])
    setRunPromptReason('Inputs reset. Chat/notes/tasks were kept.')
    setCenterTab('assumptions')

    await saveDealProFormaDraft(selectedDeal.id, {
      currentInput: {
        ...freshInput,
        startDate: freshInput.startDate?.toISOString?.() || freshInput.startDate,
        debtService: {
          ...freshInput.debtService,
          startDate: freshInput.debtService.startDate?.toISOString?.() || freshInput.debtService.startDate,
        },
      },
      stage: clearedStage,
      messages,
      fieldMeta: {},
    })
    setSaving(false)
  }

  const handleClearChatOnly = async () => {
    if (!selectedDeal || !input) return
    const confirmed = window.confirm(
      `Clear AI chat history for "${selectedDeal.deal_name}"?\n\nThis keeps your inputs, notes, and tasks.`,
    )
    if (!confirmed) return

    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current)

    const starterMessages = [buildInitialCoachMessage(selectedDeal.deal_name)]
    setSaving(true)
    setMessages(starterMessages)
    setChatValue('')
    setPendingSuggestions(null)
    setPendingNotesAppend(null)
    setPendingTaskSuggestions(null)
    setRunPromptReason('Chat history cleared. Inputs/notes/tasks were kept.')
    setActivityEvents((prev) =>
      prev.filter((e) => !['chat_user', 'chat_assistant', 'chat_error'].includes(e.eventType)),
    )

    await Promise.all([
      saveDealProFormaDraft(selectedDeal.id, {
        currentInput: {
          ...input,
          startDate: input.startDate?.toISOString?.() || input.startDate,
          debtService: {
            ...input.debtService,
            startDate: input.debtService.startDate?.toISOString?.() || input.debtService.startDate,
          },
        },
        stage,
        messages: starterMessages,
        fieldMeta,
      }),
      clearDealActivityEventsByTypes(selectedDeal.id, ['chat_user', 'chat_assistant', 'chat_error']),
    ])
    setSaving(false)
  }

  const handleClearMenuChange = (value: string) => {
    setClearMenuValue('')
    if (value === 'clear-inputs') void handleClearInputsOnly()
    if (value === 'clear-chat') void handleClearChatOnly()
    if (value === 'clear-workspace') void handleClearWorkspace()
  }

  const handleVersionMenuChange = (value: string) => {
    setVersionMenuValue('')
    if (value === 'save-version') {
      void handleSaveVersion()
      return
    }
    if (value.startsWith('load:')) {
      const versionId = value.replace('load:', '')
      void handleLoadVersionInputsOnly(versionId)
    }
  }

  const handleActionsMenuChange = (value: string) => {
    setActionsMenuValue('')
    if (value === 'run-proforma') {
      handleRunProForma()
      return
    }
    if (value === 'delete-deal') {
      void handleDeleteSelectedDeal()
      return
    }
    if (value === 'export-pdf' && projection) {
      exportProFormaToPDF(projection)
    }
    if (value === 'export-excel' && projection) {
      exportProFormaToExcel(projection)
    }
  }

  const handleDeleteSelectedDeal = async () => {
    if (!selectedDeal) return
    const confirmed = window.confirm(
      `Delete "${selectedDeal.deal_name}"?\n\nThis permanently removes this deal and its workspace data. This action cannot be undone.`,
    )
    if (!confirmed) return

    setDeletingDeal(true)
    try {
      const targetDealId = selectedDeal.id
      const success = await deleteDeal(targetDealId)
      if (!success) {
        window.alert('Failed to delete deal. Please try again.')
        return
      }

      setDeals((prevDeals) => {
        const remainingDeals = prevDeals.filter((deal) => deal.id !== targetDealId)
        if (remainingDeals.length === 0) {
          setSelectedDealId(undefined)
          onBack()
          return remainingDeals
        }

        if (selectedDealId === targetDealId) {
          const nextDealId = remainingDeals[0].id
          setSelectedDealId(nextDealId)
          navigate(`/deals/workspace/${nextDealId}`, { replace: true })
        }
        return remainingDeals
      })
    } finally {
      setDeletingDeal(false)
    }
  }

  const handleCreateDeal = async () => {
    if (creatingDeal) return
    const dealName = newDealForm.deal_name.trim()
    if (!dealName) return
    const location = newDealForm.location.trim() || 'TBD'
    const unitCount = newDealForm.unit_count.trim()
    const projectedCost = newDealForm.projected_cost.trim()

    setCreatingDeal(true)
    try {
      const created = await createDeal({
        deal_name: dealName,
        location,
        type: newDealForm.type,
        status: newDealForm.status,
        unit_count: unitCount ? Number(unitCount) : undefined,
        projected_cost: projectedCost ? Number(projectedCost) : undefined,
        expected_start_date: newDealForm.expected_start_date || undefined,
      })
      if (!created) {
        window.alert('Failed to create deal. Please try again.')
        return
      }

      setDeals((prevDeals) => [created, ...prevDeals.filter((deal) => deal.id !== created.id)])
      setSelectedDealId(created.id)
      navigate(`/deals/workspace/${created.id}`, { replace: true })
      setCreateDealModalOpen(false)
      setNewDealForm({
        deal_name: '',
        location: '',
        type: 'commercial',
        status: 'active-pipeline',
        unit_count: '',
        projected_cost: '',
        expected_start_date: '',
      })
    } finally {
      setCreatingDeal(false)
    }
  }

  const startVoice = () => {
    const SpeechRecognitionImpl = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionImpl) return
    const rec = new SpeechRecognitionImpl()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.onresult = (event: any) => {
      let text = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        text += event.results[i][0]?.transcript || ''
      }
      setChatValue((prev) => `${prev}${prev && text ? ' ' : ''}${text}`.trim())
    }
    rec.onend = () => setIsListening(false)
    rec.start()
    recognitionRef.current = rec
    setIsListening(true)
  }

  const stopVoice = () => {
    if (recognitionRef.current) recognitionRef.current.stop()
    setIsListening(false)
  }

  const stageLegend = (
    <div className="space-y-1 text-xs text-muted-foreground">
      <div className="font-semibold text-foreground">Stage Guide</div>
      <div><span className="inline-block h-2 w-2 rounded-full bg-amber-500 mr-2" />Coaching</div>
      <div><span className="inline-block h-2 w-2 rounded-full bg-blue-500 mr-2" />Scenario</div>
      <div><span className="inline-block h-2 w-2 rounded-full bg-green-500 mr-2" />ProForma</div>
    </div>
  )

  if (loading || loadingDealState) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground">Loading deal workspace…</div>
  }

  if (!selectedDeal) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        No deals found for workspace.
      </div>
    )
  }

  if (!input) {
    return <div className="flex h-[60vh] items-center justify-center text-muted-foreground">Loading deal workspace…</div>
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col bg-background text-foreground">
      <Dialog open={createDealModalOpen} onOpenChange={setCreateDealModalOpen}>
        <DialogContent className="sm:max-w-lg border-border/60 bg-card text-foreground">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-lg font-semibold">Create New Deal</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">Enter deal details and open it in the workspace.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="new-deal-name">Deal Name *</Label>
                <Input
                  id="new-deal-name"
                  value={newDealForm.deal_name}
                  onChange={(e) => setNewDealForm((prev) => ({ ...prev, deal_name: e.target.value }))}
                  placeholder="e.g. Oakwood Townhomes"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="new-deal-location">Location</Label>
                <Input
                  id="new-deal-location"
                  value={newDealForm.location}
                  onChange={(e) => setNewDealForm((prev) => ({ ...prev, location: e.target.value }))}
                  placeholder="Address or city"
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select
                  value={newDealForm.type}
                  onValueChange={(value) => setNewDealForm((prev) => ({ ...prev, type: value as Deal['type'] }))}
                >
                  <SelectTrigger className="border-border/60 bg-card text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    <SelectItem value="residential">Residential</SelectItem>
                    <SelectItem value="new-single-family">New Single Family</SelectItem>
                    <SelectItem value="multifamily">Multifamily</SelectItem>
                    <SelectItem value="mixed-residential">Mixed Residential</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={newDealForm.status}
                  onValueChange={(value) => setNewDealForm((prev) => ({ ...prev, status: value as Deal['status'] }))}
                >
                  <SelectTrigger className="border-border/60 bg-card text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active-pipeline">Active Pipeline</SelectItem>
                    <SelectItem value="early-stage">Early Stage</SelectItem>
                    <SelectItem value="concept-pre-funding">Concept / Pre-Funding</SelectItem>
                    <SelectItem value="very-early">Very Early</SelectItem>
                    <SelectItem value="pending-docs">Pending Docs</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="new-deal-units">Unit Count</Label>
                <Input
                  id="new-deal-units"
                  type="number"
                  min="0"
                  value={newDealForm.unit_count}
                  onChange={(e) => setNewDealForm((prev) => ({ ...prev, unit_count: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="new-deal-projected-cost">Projected Cost</Label>
                <Input
                  id="new-deal-projected-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newDealForm.projected_cost}
                  onChange={(e) => setNewDealForm((prev) => ({ ...prev, projected_cost: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="new-deal-start-date">Expected Start Date</Label>
                <Input
                  id="new-deal-start-date"
                  type="date"
                  value={newDealForm.expected_start_date}
                  onChange={(e) => setNewDealForm((prev) => ({ ...prev, expected_start_date: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateDealModalOpen(false)} disabled={creatingDeal}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleCreateDeal()} disabled={creatingDeal || !newDealForm.deal_name.trim()}>
              {creatingDeal ? 'Creating...' : 'Create Deal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Top action strip — back link + deal name/stage on left, action menus on right */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border/60 bg-card/50 px-4 py-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold">{selectedDeal.deal_name}</span>
          <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', STAGE_COLOR[stage])}>
            {stage}
          </span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={clearMenuValue} onValueChange={handleClearMenuChange} disabled={saving}>
            <SelectTrigger className="h-8 w-[160px]">
              <SelectValue placeholder="Clear Actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="clear-inputs">Clear Inputs</SelectItem>
              <SelectItem value="clear-chat">Clear Chat</SelectItem>
              <SelectItem value="clear-workspace">Clear Workspace</SelectItem>
            </SelectContent>
          </Select>

          <Select value={versionMenuValue} onValueChange={handleVersionMenuChange} disabled={saving}>
            <SelectTrigger className="h-8 w-[200px]">
              <SelectValue placeholder="Versions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="save-version">Save New Version</SelectItem>
              {versionOptions.map((v) => (
                <SelectItem key={v.id} value={`load:${v.id}`}>{`Load: ${v.label}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={actionsMenuValue} onValueChange={handleActionsMenuChange} disabled={running || deletingDeal}>
            <SelectTrigger className="h-8 w-[160px]">
              <SelectValue placeholder="Actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="run-proforma">Run ProForma</SelectItem>
              <SelectItem value="export-pdf" disabled={!projection}>Export PDF</SelectItem>
              <SelectItem value="export-excel" disabled={!projection}>Export Excel</SelectItem>
              <SelectItem value="delete-deal">Delete Deal</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        <aside className="w-[220px] bg-card border-r border-border/60 p-3 overflow-y-auto">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs uppercase text-muted-foreground">Deals</div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setCreateDealModalOpen(true)}
              disabled={creatingDeal}
              className="h-7 border-border/60 bg-card px-2 text-foreground hover:bg-muted"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              New
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {deals.map((d) => {
              const dStage = selectedDealStage(d)
              return (
                <button
                  key={d.id}
                  onClick={() => {
                    setSelectedDealId(d.id)
                    navigate(`/deals/workspace/${d.id}`, { replace: true })
                  }}
                  className={`relative w-full text-left rounded border p-2 pl-3 ${selectedDealId === d.id ? 'border-blue-500 bg-blue-950/40' : 'border-border/60 bg-card hover:bg-muted'}`}
                >
                  <span className={`absolute left-0 top-0 h-full w-1 rounded-l ${STAGE_DEAL_ACCENT[dStage]}`} />
                  <div className="font-medium text-sm truncate text-foreground">{d.deal_name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {(d.unit_count || 0) > 0 ? `${d.unit_count} units` : 'Units TBD'} · {d.custom_type || d.type}
                  </div>
                  <div className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded border ${STAGE_COLOR[dStage]}`}>{dStage}</div>
                </button>
              )
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-border/60">{stageLegend}</div>
        </aside>

        <main className="flex-1 min-w-0 p-3 overflow-y-auto bg-card [&_label]:text-[11px] [&_label]:text-foreground [&_input]:h-8 [&_input]:text-xs [&_input]:bg-input [&_input]:border-border [&_input]:text-foreground [&_input]:placeholder:text-muted-foreground [&_button[role='combobox']]:h-8 [&_button[role='combobox']]:text-xs [&_button[role='combobox']]:bg-input [&_button[role='combobox']]:border-border [&_button[role='combobox']]:text-foreground [&_.rounded-md]:rounded-sm">
          <div className="mb-3 flex flex-wrap gap-2 border-b border-border/60 pb-2">
            <Button size="sm" className={centerTab === 'assumptions' ? '' : 'bg-muted border-border/60 text-foreground hover:bg-muted/70'} variant={centerTab === 'assumptions' ? 'default' : 'outline'} onClick={() => setCenterTab('assumptions')}>Assumptions</Button>
            <Button size="sm" className={centerTab === 'phase-pro-forma' ? '' : 'bg-muted border-border/60 text-foreground hover:bg-muted/70'} variant={centerTab === 'phase-pro-forma' ? 'default' : 'outline'} onClick={() => setCenterTab('phase-pro-forma')}>Phase Pro Forma</Button>
            <Button size="sm" className={centerTab === 'cash-flow' ? '' : 'bg-muted border-border/60 text-foreground hover:bg-muted/70'} variant={centerTab === 'cash-flow' ? 'default' : 'outline'} onClick={() => setCenterTab('cash-flow')}>Cash Flow</Button>
            <Button size="sm" className={centerTab === 'investor-returns' ? '' : 'bg-muted border-border/60 text-foreground hover:bg-muted/70'} variant={centerTab === 'investor-returns' ? 'default' : 'outline'} onClick={() => setCenterTab('investor-returns')}>Investor Returns</Button>
            <Button size="sm" className={centerTab === 'public-sector' ? '' : 'bg-muted border-border/60 text-foreground hover:bg-muted/70'} variant={centerTab === 'public-sector' ? 'default' : 'outline'} onClick={() => setCenterTab('public-sector')}>Public Sector</Button>
            <Button size="sm" className={centerTab === 'dashboard' ? '' : 'bg-muted border-border/60 text-foreground hover:bg-muted/70'} variant={centerTab === 'dashboard' ? 'default' : 'outline'} onClick={() => setCenterTab('dashboard')}>Dashboard</Button>
            <Button size="sm" className={centerTab === 'analysis' ? '' : 'bg-muted border-border/60 text-foreground hover:bg-muted/70'} variant={centerTab === 'analysis' ? 'default' : 'outline'} onClick={() => setCenterTab('analysis')}>Analysis & Insights</Button>
          </div>

          {centerTab === 'dashboard' && (
            <div className="space-y-3">
              <div className="mb-3">
                <div className="flex items-center justify-between text-sm text-foreground">
                  <span>Model coverage</span>
                  <span className="font-semibold">{readiness.score}%</span>
                </div>
                <div className="w-full h-2 bg-muted/70 rounded mt-1">
                  <div className="h-2 bg-green-500 rounded" style={{ width: `${readiness.score}%` }} />
                </div>
                {readiness.proformaReady ? (
                  <p className="text-xs text-emerald-400 mt-2">All critical checks pass — you can run pro forma.</p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-2 leading-snug">
                    <span className="text-muted-foreground">Gaps: </span>
                    {readiness.blockers.slice(0, 5).join(' · ')}
                    {readiness.blockers.length > 5 ? ' …' : ''}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Card className="bg-muted border-border/60">
                  <CardHeader className="py-3"><CardTitle className="text-base text-foreground">Projected Profit</CardTitle></CardHeader>
                  <CardContent className="pt-0 text-xl font-semibold text-foreground">{fmtMoney(dashboardMetrics.projectedProfit)}</CardContent>
                </Card>
                <Card className="bg-muted border-border/60">
                  <CardHeader className="py-3"><CardTitle className="text-base text-foreground">Investor MOIC</CardTitle></CardHeader>
                  <CardContent className="pt-0 text-xl font-semibold text-foreground">{dashboardMetrics.investorMoic != null ? `${dashboardMetrics.investorMoic.toFixed(2)}x` : '—'}</CardContent>
                </Card>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Card className="bg-muted border-border/60"><CardHeader className="py-2"><CardTitle className="text-sm text-foreground">Developer Share ({Number(input?.developerProfitShareOnCompletion || 80).toFixed(0)}%)</CardTitle></CardHeader><CardContent className="pt-0 text-foreground">{fmtMoney(dashboardMetrics.developerShare)}</CardContent></Card>
                <Card className="bg-muted border-border/60"><CardHeader className="py-2"><CardTitle className="text-sm text-foreground">Peak LOC Balance</CardTitle></CardHeader><CardContent className="pt-0 text-foreground">{fmtMoney(dashboardMetrics.peakLocBalance)}</CardContent></Card>
                <Card className="bg-muted border-border/60"><CardHeader className="py-2"><CardTitle className="text-sm text-foreground">TIF Payback (yrs)</CardTitle></CardHeader><CardContent className="pt-0 text-foreground">{dashboardMetrics.tifPaybackYears != null ? dashboardMetrics.tifPaybackYears.toFixed(2) : '—'}</CardContent></Card>
              </div>
              {dashboardMetrics.usesProjectionValues && (
                <div className="text-[11px] text-muted-foreground">
                  Dashboard KPIs are synced to the latest ProForma engine output.
                </div>
              )}
              <Card className="bg-muted border-border/60">
                <CardHeader className="py-2"><CardTitle className="text-base text-foreground">Deal Snapshot</CardTitle></CardHeader>
                <CardContent className="text-sm text-foreground space-y-1">
                  <div><strong>Deal:</strong> {selectedDeal.deal_name}</div>
                  <div><strong>Mode:</strong> {input.proFormaMode === 'rental-hold' ? 'Rental Hold' : 'Development'}</div>
                  <div><strong>Current Stage:</strong> {stage}</div>
                  <div><strong>Messages:</strong> {messages.length}</div>
                </CardContent>
              </Card>
              <ProformaMemoView
                dealName={selectedDeal.deal_name}
                input={input}
                projection={projection}
                readiness={readiness}
                onEditAssumptions={() => setCenterTab('assumptions')}
              />
            </div>
          )}

          {centerTab === 'assumptions' && (
          <div className="space-y-2 [&_input]:h-7 [&_input]:text-xs [&_button[role='combobox']]:h-7 [&_button[role='combobox']]:text-xs">
          <Card className="bg-muted border-border/60">
            <CardContent className="py-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                <div className="md:col-span-1">
                  <Label className="text-xs">Model Mode</Label>
                  <Select
                    value={input.proFormaMode === 'rental-hold' ? 'rental-hold' : 'development'}
                    onValueChange={setModeSelection}
                  >
                    <SelectTrigger className={fieldClass(fieldMeta['proFormaMode']?.status || 'empty')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="development">Development</SelectItem>
                      <SelectItem value="rental-hold">Rental Hold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2 text-xs text-muted-foreground">
                  Select the model path before entering assumptions so readiness, sections, and calculations align with the deal type.
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
            <Card className="bg-muted border-border/60 md:col-span-3">
              <CardHeader className="py-2"><CardTitle className="text-base text-foreground">Project Overview</CardTitle></CardHeader>
              <CardContent className="space-y-0.5">
                <AssumptionInputRow label="Total Units">
                  <Input className={fieldClass(fieldMeta['forSalePhasedLoc.totalUnits']?.status || 'empty')} value={input.forSalePhasedLoc?.totalUnits ? formatWithCommas(input.forSalePhasedLoc.totalUnits) : ''} onChange={(e) => setField('forSalePhasedLoc.totalUnits', parseWholeNumberInput(e.target.value))} />
                </AssumptionInputRow>
                <AssumptionInputRow label="Unit Size (SF)">
                  <Input className={fieldClass(fieldMeta['totalProjectSquareFootage']?.status || 'empty')} value={input.totalProjectSquareFootage ? formatWithCommas(input.totalProjectSquareFootage) : ''} onChange={(e) => setField('totalProjectSquareFootage', parseNumberInput(e.target.value))} />
                </AssumptionInputRow>
                <AssumptionInputRow label="Cost per SF">
                  <Input
                    value={(() => {
                      const units = input.forSalePhasedLoc?.totalUnits || 0
                      const unitSize = input.totalProjectSquareFootage || 0
                      const denom = units * unitSize
                      if (costPerSfDraft !== null) return costPerSfDraft
                      if (denom <= 0) return ''
                      const implied = (input.underwritingEstimatedConstructionCost || 0) / denom
                      if (!Number.isFinite(implied)) return ''
                      return formatCurrency(implied, 2)
                    })()}
                    onFocus={() => {
                      const units = input.forSalePhasedLoc?.totalUnits || 0
                      const unitSize = input.totalProjectSquareFootage || 0
                      const denom = units * unitSize
                      if (denom <= 0) {
                        setCostPerSfDraft('')
                        return
                      }
                      const implied = (input.underwritingEstimatedConstructionCost || 0) / denom
                      setCostPerSfDraft(Number.isFinite(implied) ? String(roundMoney(implied)) : '')
                    }}
                    onChange={(e) => {
                      const raw = e.target.value
                      setCostPerSfDraft(raw)
                      const units = input.forSalePhasedLoc?.totalUnits || 0
                      const unitSize = input.totalProjectSquareFootage || 0
                      const denom = units * unitSize
                      if (denom <= 0) return
                      const costPerSf = parseNumberInput(raw)
                      setField('underwritingEstimatedConstructionCost', costPerSf * denom)
                    }}
                    onBlur={() => {
                      setCostPerSfDraft(null)
                    }}
                  />
                </AssumptionInputRow>
                <AssumptionInputRow label="Construction Cost per Unit">
                  <Input
                    className="!bg-muted !border-cyan-600/70 !text-cyan-200 font-semibold cursor-not-allowed"
                    value={
                      (input.forSalePhasedLoc?.totalUnits || 0) > 0
                        ? formatCurrency((input.underwritingEstimatedConstructionCost || 0) / (input.forSalePhasedLoc?.totalUnits || 1), 2)
                        : ''
                    }
                    readOnly
                  />
                </AssumptionInputRow>
                <AssumptionInputRow label="Sale Price per SF">
                  <Input
                    value={(() => {
                      const unitSize = input.totalProjectSquareFootage || 0
                      if (salePricePerSfDraft !== null) return salePricePerSfDraft
                      if (unitSize <= 0) return ''
                      const implied = (input.forSalePhasedLoc?.averageSalePrice || 0) / unitSize
                      if (!Number.isFinite(implied)) return ''
                      return formatCurrency(implied, 2)
                    })()}
                    onFocus={() => {
                      const unitSize = input.totalProjectSquareFootage || 0
                      if (unitSize <= 0) {
                        setSalePricePerSfDraft('')
                        return
                      }
                      const implied = (input.forSalePhasedLoc?.averageSalePrice || 0) / unitSize
                      setSalePricePerSfDraft(Number.isFinite(implied) ? String(roundMoney(implied)) : '')
                    }}
                    onChange={(e) => {
                      const raw = e.target.value
                      setSalePricePerSfDraft(raw)
                      const unitSize = input.totalProjectSquareFootage || 0
                      if (unitSize <= 0) return
                      const salePerSf = parseNumberInput(raw)
                      setField('forSalePhasedLoc.averageSalePrice', salePerSf * unitSize)
                    }}
                    onBlur={() => {
                      setSalePricePerSfDraft(null)
                    }}
                  />
                </AssumptionInputRow>
                <AssumptionInputRow label="Sale Price per Unit">
                  <Input
                    className="!bg-muted !border-cyan-600/70 !text-cyan-200 font-semibold cursor-not-allowed"
                    value={input.forSalePhasedLoc?.averageSalePrice ? formatCurrency(input.forSalePhasedLoc.averageSalePrice, 2) : ''}
                    readOnly
                  />
                </AssumptionInputRow>
                <AssumptionInputRow label="Presale Deposit (%)">
                  <Input
                    className={fieldClass(fieldMeta['forSalePhasedLoc.presaleDepositPercent']?.status || 'empty')}
                    value={
                      presaleDepositPctDraft !== null
                        ? presaleDepositPctDraft
                        : formatPercent(input.forSalePhasedLoc?.presaleDepositPercent ?? 0, 2)
                    }
                    onFocus={() => {
                      const p = Number(input.forSalePhasedLoc?.presaleDepositPercent ?? 0)
                      setPresaleDepositPctDraft(Number.isFinite(p) ? String(roundMoney(p)) : '')
                    }}
                    onChange={(e) => {
                      const raw = e.target.value
                      setPresaleDepositPctDraft(raw)
                      setField('forSalePhasedLoc.presaleDepositPercent', parseNumberInput(raw))
                    }}
                    onBlur={() => {
                      setPresaleDepositPctDraft(null)
                    }}
                  />
                </AssumptionInputRow>
                <AssumptionInputRow label="Presale Deposit ($)">
                  <div className="flex min-w-0 w-full flex-nowrap items-center gap-1.5">
                    <Input
                      className="!h-7 shrink-0 !max-w-[210px] !bg-muted !border-cyan-600/70 !text-cyan-200 font-semibold cursor-not-allowed"
                      value={formatCurrency(
                        (input.forSalePhasedLoc?.averageSalePrice || 0) *
                          ((input.forSalePhasedLoc?.presaleDepositPercent || 0) / 100),
                        2,
                      )}
                      readOnly
                    />
                    <div className="flex min-w-0 min-h-0 flex-1 justify-end overflow-hidden">
                      <span className="sr-only">Deposit availability</span>
                      <div className="ml-auto flex max-w-full min-w-0 flex-nowrap items-center gap-1">
                        <div
                          className="inline-flex shrink-0 rounded border border-border/70 overflow-hidden"
                          title="Deposit availability: when presale cash offsets construction draws during the build vs. held toward closing."
                        >
                          {(
                            [
                              {
                                mode: 'full' as const,
                                label: 'Instant',
                                title:
                                  'Collected presale deposits are modeled as fully available to offset construction draws as soon as they are received.',
                              },
                              {
                                mode: 'percent' as const,
                                label: 'Partial',
                                title:
                                  'Open the share control on the right to set what portion of each deposit offsets draws during the build.',
                              },
                              {
                                mode: 'at-closing' as const,
                                label: 'Closing',
                                title: 'Presale deposits do not offset construction draws until unit closings (at closing).',
                              },
                            ] as const
                          ).map(({ mode, label, title }) => {
                            const active = (input.forSalePhasedLoc?.depositUsageMode || 'full') === mode
                            return (
                              <Button
                                key={mode}
                                type="button"
                                size="sm"
                                variant="ghost"
                                title={title}
                                className={`h-7 min-w-0 shrink-0 rounded-none px-1.5 text-[10px] leading-none ${
                                  active
                                    ? 'bg-cyan-700/40 text-cyan-100 hover:bg-cyan-700/50'
                                    : 'bg-card text-muted-foreground hover:bg-muted'
                                }`}
                                onClick={() => {
                                  setField('forSalePhasedLoc.depositUsageMode', mode)
                                  if (mode === 'percent' && input.forSalePhasedLoc?.depositUsablePercent == null) {
                                    setField('forSalePhasedLoc.depositUsablePercent', 100)
                                  }
                                }}
                              >
                                {label}
                              </Button>
                            )
                          })}
                        </div>
                        <div className="flex h-7 w-[3.125rem] shrink-0 items-stretch justify-stretch">
                        {(input.forSalePhasedLoc?.depositUsageMode || 'full') === 'percent' ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 w-full min-w-0 gap-px rounded border border-border/70 bg-card px-0.5 text-[9px] text-cyan-100 hover:bg-muted"
                                title="Edit share of deposit that offsets draws during the build"
                              >
                                <span className="min-w-0 truncate tabular-nums leading-none">
                                  {formatPercent(Number(input.forSalePhasedLoc?.depositUsablePercent ?? 100), 0)}
                                </span>
                                <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-70" aria-hidden />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-64 space-y-2 border-border/70 bg-muted p-3">
                              <p className="text-[11px] leading-snug text-muted-foreground">
                                Portion of each presale deposit that reduces modeled construction draws during the build. The remainder is treated as held toward closing.
                              </p>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Usable during build</Label>
                                <Input
                                  className="h-8 !border-border/70 !bg-card text-xs text-foreground"
                                  inputMode="decimal"
                                  value={formatPercent(
                                    Math.min(100, Math.max(0, Number(input.forSalePhasedLoc?.depositUsablePercent ?? 100))),
                                    2,
                                  )}
                                  onChange={(e) =>
                                    setField(
                                      'forSalePhasedLoc.depositUsablePercent',
                                      Math.min(100, Math.max(0, parseNumberInput(e.target.value))),
                                    )
                                  }
                                />
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {[25, 50, 75, 100].map((n) => (
                                  <Button
                                    key={n}
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-[10px] text-muted-foreground hover:bg-muted/70 hover:text-white"
                                    onClick={() => setField('forSalePhasedLoc.depositUsablePercent', n)}
                                  >
                                    {n}%
                                  </Button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <div
                            className="h-7 w-full rounded-md border border-transparent bg-transparent"
                            aria-hidden
                          />
                        )}
                      </div>
                    </div>
                    </div>
                  </div>
                </AssumptionInputRow>
                <AssumptionInputRow label="Project Duration (months)">
                  <Input className={fieldClass(fieldMeta['projectionMonths']?.status || 'empty')} value={input.projectionMonths ? formatWithCommas(input.projectionMonths) : ''} onChange={(e) => setField('projectionMonths', parseWholeNumberInput(e.target.value))} />
                </AssumptionInputRow>
                <AssumptionInputRow label="Start Date">
                  <Input type="date" className={fieldClass(fieldMeta['startDate']?.status || 'empty')} value={input.startDate ? new Date(input.startDate).toISOString().split('T')[0] : ''} onChange={(e) => setField('startDate', new Date(e.target.value))} />
                </AssumptionInputRow>
              </CardContent>
            </Card>

            <Card className="bg-muted border-border/60 md:col-span-3">
              <CardHeader className="py-2"><CardTitle className="text-base text-foreground">Cost Summary</CardTitle></CardHeader>
              <CardContent className="space-y-0.5">
                <AssumptionInputRow label="Land Purchase">
                  <Input
                    className={fieldClass(fieldMeta['landCost']?.status || 'empty')}
                    value={
                      costSummaryMoneyDraft.landCost !== null
                        ? costSummaryMoneyDraft.landCost
                        : formatCurrency(Number(input.landCost || 0), 2)
                    }
                    onFocus={() => {
                      const v = Number(input.landCost || 0)
                      setCostSummaryMoneyDraft((d) => ({
                        ...d,
                        landCost: Number.isFinite(v) ? String(roundMoney(v)) : '',
                      }))
                    }}
                    onChange={(e) => {
                      const raw = e.target.value
                      setCostSummaryMoneyDraft((d) => ({ ...d, landCost: raw }))
                      setField('landCost', parseNumberInput(raw))
                    }}
                    onBlur={() => {
                      setCostSummaryMoneyDraft((d) => ({ ...d, landCost: null }))
                    }}
                  />
                </AssumptionInputRow>
                <AssumptionInputRow label="Site Work">
                  <Input
                    className={fieldClass(fieldMeta['siteWorkCost']?.status || 'empty')}
                    value={
                      costSummaryMoneyDraft.siteWorkCost !== null
                        ? costSummaryMoneyDraft.siteWorkCost
                        : formatCurrency(Number(input.siteWorkCost || 0), 2)
                    }
                    onFocus={() => {
                      const v = Number(input.siteWorkCost || 0)
                      setCostSummaryMoneyDraft((d) => ({
                        ...d,
                        siteWorkCost: Number.isFinite(v) ? String(roundMoney(v)) : '',
                      }))
                    }}
                    onChange={(e) => {
                      const raw = e.target.value
                      setCostSummaryMoneyDraft((d) => ({ ...d, siteWorkCost: raw }))
                      setField('siteWorkCost', parseNumberInput(raw))
                    }}
                    onBlur={() => {
                      setCostSummaryMoneyDraft((d) => ({ ...d, siteWorkCost: null }))
                    }}
                  />
                </AssumptionInputRow>
                <AssumptionInputRow label="Infrastructure Cost">
                  <Input
                    className={fieldClass(fieldMeta['forSalePhasedLoc.infrastructureCost']?.status || 'empty')}
                    value={
                      costSummaryMoneyDraft.infrastructureCost !== null
                        ? costSummaryMoneyDraft.infrastructureCost
                        : formatCurrency(Number(input.forSalePhasedLoc?.infrastructureCost || 0), 2)
                    }
                    onFocus={() => {
                      const v = Number(input.forSalePhasedLoc?.infrastructureCost || 0)
                      setCostSummaryMoneyDraft((d) => ({
                        ...d,
                        infrastructureCost: Number.isFinite(v) ? String(roundMoney(v)) : '',
                      }))
                    }}
                    onChange={(e) => {
                      const raw = e.target.value
                      setCostSummaryMoneyDraft((d) => ({ ...d, infrastructureCost: raw }))
                      setField('forSalePhasedLoc.infrastructureCost', parseNumberInput(raw))
                    }}
                    onBlur={() => {
                      setCostSummaryMoneyDraft((d) => ({ ...d, infrastructureCost: null }))
                    }}
                  />
                </AssumptionInputRow>
                <AssumptionInputRow label="Construction Cost">
                  <div className="flex min-w-0 w-full flex-nowrap items-center gap-1.5">
                    <Input
                      className="!h-7 shrink-0 !max-w-[210px] !bg-muted !border-cyan-600/70 !text-cyan-200 font-semibold cursor-not-allowed"
                      value={input.underwritingEstimatedConstructionCost ? formatCurrency(input.underwritingEstimatedConstructionCost, 2) : ''}
                      readOnly
                    />
                    {isDevelopmentMode ? (
                      <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-2">
                        <span className="sr-only">Construction spend curve</span>
                        <div
                          className="inline-flex shrink-0 rounded-md border border-cyan-600/50 overflow-hidden"
                          title="Spend curve — how hard costs are spread across construction months."
                        >
                          {(
                            [
                              {
                                curve: 'linear' as const,
                                label: 'Linear',
                                title: 'Linear: costs spread evenly across each phase’s construction months.',
                              },
                              {
                                curve: 'front-loaded' as const,
                                label: 'Front',
                                title: 'Front-loaded: more cost early in each phase’s construction period.',
                              },
                              {
                                curve: 'back-loaded' as const,
                                label: 'Back',
                                title: 'Back-loaded: more cost late in each phase’s construction period.',
                              },
                            ] as const
                          ).map(({ curve, label, title }) => {
                            const active = (input.forSalePhasedLoc?.constructionSpendCurve || 'linear') === curve
                            return (
                              <Button
                                key={curve}
                                type="button"
                                size="sm"
                                variant="ghost"
                                title={title}
                                className={`h-7 shrink-0 rounded-none px-1.5 text-[10px] leading-none ${
                                  active
                                    ? 'bg-cyan-700/40 text-cyan-100 hover:bg-cyan-700/50'
                                    : 'bg-card text-muted-foreground hover:bg-muted'
                                }`}
                                onClick={() => setField('forSalePhasedLoc.constructionSpendCurve', curve)}
                              >
                                {label}
                              </Button>
                            )
                          })}
                        </div>
                        {phaseTimingMode === 'trigger-based' ? (
                          <>
                            <span className="sr-only">Presale trigger for construction draws</span>
                            <div
                              className="inline-flex shrink-0 rounded-md border border-border/70 overflow-hidden"
                              title="Presale trigger — whether phase presold % thresholds gate modeled construction draws."
                            >
                              {(
                                [
                                  {
                                    on: true,
                                    label: 'On',
                                    title: 'On: construction draws respect each phase’s presold % trigger (uses presales).',
                                  },
                                  {
                                    on: false,
                                    label: 'Off',
                                    title: 'Off: draw timing does not use that presale trigger linkage.',
                                  },
                                ] as const
                              ).map(({ on, label, title }) => {
                                const active = (input.forSalePhasedLoc?.triggerUsesPresales !== false) === on
                                return (
                                  <Button
                                    key={String(on)}
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    title={title}
                                    className={`h-7 shrink-0 rounded-none px-1.5 text-[10px] leading-none ${
                                      active
                                        ? 'bg-cyan-700/40 text-cyan-100 hover:bg-cyan-700/50'
                                        : 'bg-card text-muted-foreground hover:bg-muted'
                                    }`}
                                    onClick={() => setField('forSalePhasedLoc.triggerUsesPresales', on)}
                                  >
                                    {label}
                                  </Button>
                                )
                              })}
                            </div>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </AssumptionInputRow>
                <AssumptionInputRow label="Monthly Carry per Unit">
                  <Input
                    className={fieldClass(fieldMeta['monthlyCarryPerUnit']?.status || 'empty')}
                    value={
                      carryConstructionDraft.monthlyCarryPerUnit !== null
                        ? carryConstructionDraft.monthlyCarryPerUnit
                        : formatCurrency(Number(input.monthlyCarryPerUnit || 0), 2)
                    }
                    onFocus={() => {
                      const v = Number(input.monthlyCarryPerUnit || 0)
                      setCarryConstructionDraft((d) => ({
                        ...d,
                        monthlyCarryPerUnit: Number.isFinite(v) ? String(roundMoney(v)) : '',
                      }))
                    }}
                    onChange={(e) => {
                      const raw = e.target.value
                      setCarryConstructionDraft((d) => ({ ...d, monthlyCarryPerUnit: raw }))
                      setField('monthlyCarryPerUnit', parseNumberInput(raw))
                    }}
                    onBlur={() => {
                      setCarryConstructionDraft((d) => ({ ...d, monthlyCarryPerUnit: null }))
                    }}
                  />
                </AssumptionInputRow>
                <AssumptionInputRow label="Construction period (months)">
                  <Input
                    title="When each phase has build months filled in, carry uses phase unit-months instead and this field is ignored. Otherwise: one number of months assumed for all units together — monthly carry per unit × total units × this value."
                    className={fieldClass(fieldMeta['avgConstructionPeriodMonths']?.status || 'empty')}
                    value={
                      carryConstructionDraft.avgConstructionPeriodMonths !== null
                        ? carryConstructionDraft.avgConstructionPeriodMonths
                        : formatWithCommas(Number(input.avgConstructionPeriodMonths || 0), 2)
                    }
                    onFocus={() => {
                      const v = Number(input.avgConstructionPeriodMonths || 0)
                      setCarryConstructionDraft((d) => ({
                        ...d,
                        avgConstructionPeriodMonths: Number.isFinite(v) ? String(roundMoney(v)) : '',
                      }))
                    }}
                    onChange={(e) => {
                      const raw = e.target.value
                      setCarryConstructionDraft((d) => ({ ...d, avgConstructionPeriodMonths: raw }))
                      setField('avgConstructionPeriodMonths', parseNumberInput(raw))
                    }}
                    onBlur={() => {
                      setCarryConstructionDraft((d) => ({ ...d, avgConstructionPeriodMonths: null }))
                    }}
                  />
                </AssumptionInputRow>
                <AssumptionInputRow label="Carry Cost">
                  <Input
                    className="!bg-muted !border-cyan-600/70 !text-cyan-200 font-semibold cursor-not-allowed"
                    title={getCarryCostFieldTitle(input)}
                    value={formatCurrency(getCalculatedCarryCost(input), 2)}
                    readOnly
                  />
                </AssumptionInputRow>
                <AssumptionInputRow label="Project Total Cost">
                  <Input
                    className="!bg-muted !border-cyan-600/70 !text-cyan-200 font-semibold cursor-not-allowed"
                    value={formatCurrency(getProjectTotalCost(input), 2)}
                    readOnly
                  />
                </AssumptionInputRow>
              </CardContent>
            </Card>

            <Card className="bg-muted border-border/60 md:col-span-2">
              <CardHeader className="py-2"><CardTitle className="text-base text-foreground">Investor Terms</CardTitle></CardHeader>
              <CardContent className="space-y-0.5">
                <AssumptionInputRow label="Investor Equity">
                  <Input
                    className={fieldClass(fieldMeta['investorEquity']?.status || 'empty')}
                    value={investorEquityDraft !== null ? investorEquityDraft : input.investorEquity ? formatCurrency(input.investorEquity, 2) : ''}
                    onFocus={() => {
                      const v = Number(input.investorEquity || 0)
                      setInvestorEquityDraft(Number.isFinite(v) ? String(roundMoney(v)) : '')
                    }}
                    onChange={(e) => {
                      const raw = e.target.value
                      setInvestorEquityDraft(raw)
                      setField('investorEquity', parseNumberInput(raw))
                    }}
                    onBlur={() => setInvestorEquityDraft(null)}
                  />
                </AssumptionInputRow>
                <AssumptionInputRow label="Preferred Return Rate (Annual)">
                  <Input
                    className={fieldClass(fieldMeta['preferredReturnRateAnnual']?.status || 'empty')}
                    value={
                      investorTermsPercentDraft.preferredReturnRateAnnual !== null
                        ? investorTermsPercentDraft.preferredReturnRateAnnual
                        : input.preferredReturnRateAnnual
                          ? formatPercent(input.preferredReturnRateAnnual, 2)
                          : ''
                    }
                    onFocus={() => {
                      const v = Number(input.preferredReturnRateAnnual || 0)
                      setInvestorTermsPercentDraft((d) => ({
                        ...d,
                        preferredReturnRateAnnual: Number.isFinite(v) ? String(roundMoney(v)) : '',
                      }))
                    }}
                    onChange={(e) => {
                      const raw = e.target.value
                      setInvestorTermsPercentDraft((d) => ({ ...d, preferredReturnRateAnnual: raw }))
                      setField('preferredReturnRateAnnual', parseNumberInput(raw))
                    }}
                    onBlur={() =>
                      setInvestorTermsPercentDraft((d) => ({ ...d, preferredReturnRateAnnual: null }))
                    }
                  />
                </AssumptionInputRow>
                <AssumptionInputRow label="Preferred Return Paid">
                  <Select value={input.preferredReturnPaidFrequency || 'monthly'} onValueChange={(v) => setField('preferredReturnPaidFrequency', v)}>
                    <SelectTrigger className={fieldClass(fieldMeta['preferredReturnPaidFrequency']?.status || 'empty')}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="semi-annual">Semi-Annual</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </AssumptionInputRow>
                <AssumptionInputRow label="Preferred Return Payment (Selected Period)">
                  <Input
                    className="!bg-muted !border-cyan-600/70 !text-cyan-200 font-semibold cursor-not-allowed"
                    value={formatCurrency((carbonMetrics?.prefPerPeriod as number) || 0, 2)}
                    readOnly
                  />
                </AssumptionInputRow>
                <AssumptionInputRow label="Total Pref Returned">
                  <Input
                    className="!bg-muted !border-cyan-600/70 !text-cyan-200 font-semibold cursor-not-allowed"
                    value={formatCurrency((carbonMetrics?.totalPref as number) || 0, 2)}
                    readOnly
                  />
                </AssumptionInputRow>
                <AssumptionInputRow label="Investor Profit Share on Completion (%)">
                  <Input
                    className={fieldClass(fieldMeta['investorProfitShareOnCompletion']?.status || 'empty')}
                    value={
                      investorTermsPercentDraft.investorProfitShareOnCompletion !== null
                        ? investorTermsPercentDraft.investorProfitShareOnCompletion
                        : input.investorProfitShareOnCompletion
                          ? formatPercent(input.investorProfitShareOnCompletion, 2)
                          : ''
                    }
                    onFocus={() => {
                      const v = Number(input.investorProfitShareOnCompletion || 0)
                      setInvestorTermsPercentDraft((d) => ({
                        ...d,
                        investorProfitShareOnCompletion: Number.isFinite(v) ? String(roundMoney(v)) : '',
                      }))
                    }}
                    onChange={(e) => {
                      const raw = e.target.value
                      setInvestorTermsPercentDraft((d) => ({ ...d, investorProfitShareOnCompletion: raw }))
                      setField('investorProfitShareOnCompletion', parseNumberInput(raw))
                    }}
                    onBlur={() =>
                      setInvestorTermsPercentDraft((d) => ({ ...d, investorProfitShareOnCompletion: null }))
                    }
                  />
                </AssumptionInputRow>
                <AssumptionInputRow label="Developer Profit Share on Completion (%)">
                  <Input
                    className={fieldClass(fieldMeta['developerProfitShareOnCompletion']?.status || 'empty')}
                    value={
                      investorTermsPercentDraft.developerProfitShareOnCompletion !== null
                        ? investorTermsPercentDraft.developerProfitShareOnCompletion
                        : input.developerProfitShareOnCompletion
                          ? formatPercent(input.developerProfitShareOnCompletion, 2)
                          : ''
                    }
                    onFocus={() => {
                      const v = Number(input.developerProfitShareOnCompletion || 0)
                      setInvestorTermsPercentDraft((d) => ({
                        ...d,
                        developerProfitShareOnCompletion: Number.isFinite(v) ? String(roundMoney(v)) : '',
                      }))
                    }}
                    onChange={(e) => {
                      const raw = e.target.value
                      setInvestorTermsPercentDraft((d) => ({ ...d, developerProfitShareOnCompletion: raw }))
                      setField('developerProfitShareOnCompletion', parseNumberInput(raw))
                    }}
                    onBlur={() =>
                      setInvestorTermsPercentDraft((d) => ({ ...d, developerProfitShareOnCompletion: null }))
                    }
                  />
                </AssumptionInputRow>
              </CardContent>
            </Card>

            {isDevelopmentMode && (
            <Card className="bg-muted border-border/60 md:col-span-4">
              <CardContent className="space-y-3 !p-3">
                <CardTitle className="text-base font-semibold text-foreground">Capital Stack & Incentive Stack</CardTitle>
                <div className="grid gap-2 sm:gap-3 lg:grid-cols-2 lg:items-start">
                  <div className="min-w-0 space-y-1">
                    <Label className="text-xs text-muted-foreground">Debt / LOC Stack</Label>
                    <div className="inline-flex w-full min-w-0 max-w-full flex-nowrap rounded border border-cyan-600/50 overflow-hidden divide-x divide-border/60">
                      {(
                        [
                          {
                            short: 'LOC limit',
                            title: 'LOC Limit (from stack)',
                            value: formatCurrency(Number(input.forSalePhasedLoc?.fixedLocLimit || 0), 2),
                          },
                          {
                            short: 'Debt amt',
                            title: 'Debt Amount (from stack)',
                            value: formatCurrency(Number(input.debtService?.loanAmount || 0), 2),
                          },
                          {
                            short: 'Bond cap',
                            title: 'Bond Capacity (from stack)',
                            value: formatCurrency(Number(input.forSalePhasedLoc?.bondCapacity || 0), 2),
                          },
                        ] as const
                      ).map(({ short, title, value }) => (
                        <div key={short} className="flex min-w-0 flex-1 flex-col gap-0.5 bg-card/90 px-1 py-1">
                          <span className="truncate text-[9px] font-medium uppercase tracking-wide text-muted-foreground" title={title}>
                            {short}
                          </span>
                          <Input
                            className="!h-7 cursor-not-allowed border-0 bg-transparent px-0.5 text-center text-[11px] tabular-nums text-cyan-100 shadow-none focus-visible:ring-0"
                            readOnly
                            title={title}
                            value={value}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="min-w-0 space-y-1">
                    <Label className="text-xs text-muted-foreground">Closing sale proceeds split</Label>
                    <div className="inline-flex w-full min-w-0 max-w-full flex-nowrap rounded border border-cyan-600/50 overflow-hidden divide-x divide-border/60">
                      {(
                        [
                          {
                            key: 'locPaydownPercent' as const,
                            short: 'LOC paydown',
                            meta: 'forSalePhasedLoc.salesAllocationBuckets.locPaydownPercent',
                          },
                          {
                            key: 'reinvestPercent' as const,
                            short: 'Reinvest',
                            meta: 'forSalePhasedLoc.salesAllocationBuckets.reinvestPercent',
                          },
                          {
                            key: 'reservePercent' as const,
                            short: 'Reserve',
                            meta: 'forSalePhasedLoc.salesAllocationBuckets.reservePercent',
                          },
                          {
                            key: 'distributionPercent' as const,
                            short: 'Cash-out',
                            meta: 'forSalePhasedLoc.salesAllocationBuckets.distributionPercent',
                            longTitle:
                              'Closing proceeds taken as cash-out in the LOC waterfall (not investor vs developer profit %).',
                          },
                        ] as const
                      ).map(({ key, short, meta, ...rest }) => (
                        <div key={key} className="flex min-w-0 flex-1 flex-col gap-0.5 bg-card/90 px-1 py-1">
                          <span
                            className="truncate text-[9px] font-medium uppercase tracking-wide text-muted-foreground"
                            title={'longTitle' in rest ? rest.longTitle : undefined}
                          >
                            {short}
                          </span>
                          <Input
                            className={`!h-7 text-center tabular-nums ${fieldClass(fieldMeta[meta]?.status || 'empty')}`}
                            inputMode="decimal"
                            title={'longTitle' in rest ? rest.longTitle : undefined}
                            value={
                              input.forSalePhasedLoc?.salesAllocationBuckets?.[key] === undefined ||
                              input.forSalePhasedLoc?.salesAllocationBuckets?.[key] === null
                                ? ''
                                : String(input.forSalePhasedLoc.salesAllocationBuckets[key])
                            }
                            onChange={(e) =>
                              setField(`forSalePhasedLoc.salesAllocationBuckets.${key}`, parseNumberInput(e.target.value))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="space-y-2 border-t border-border/60/50 pt-2">
                    {debtLocRows.map((row) => (
                      <div key={row.id} className="grid grid-cols-1 md:grid-cols-12 gap-2">
                        <div className="md:col-span-3">
                          <Label className="text-xs">Source name</Label>
                          <Input
                            value={row.label}
                            onChange={(e) => {
                              const next = debtLocRows.map((r) => (r.id === row.id ? { ...r, label: e.target.value } : r))
                              applyStackRows(next, incentiveRows)
                            }}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-xs">Amount</Label>
                          <Input
                            value={editingDebtAmount[row.id] ?? (row.amount ? formatCurrency(row.amount, 2) : '')}
                            onFocus={() => {
                              setEditingDebtAmount((prev) => ({
                                ...prev,
                                [row.id]: row.amount ? String(row.amount) : '',
                              }))
                            }}
                            onChange={(e) => {
                              const raw = e.target.value
                              setEditingDebtAmount((prev) => ({ ...prev, [row.id]: raw }))
                            }}
                            onBlur={() => {
                              const raw = editingDebtAmount[row.id] ?? ''
                              const parsed = parseNumberInput(raw)
                              const next = debtLocRows.map((r) => (r.id === row.id ? { ...r, amount: parsed } : r))
                              applyStackRows(next, incentiveRows)
                              setEditingDebtAmount((prev) => {
                                const { [row.id]: _drop, ...rest } = prev
                                return rest
                              })
                            }}
                          />
                        </div>
                        <div className="md:col-span-1">
                          <Label className="text-xs">Rate %</Label>
                          <Input
                            value={row.interestRate || ''}
                            onChange={(e) => {
                              const next = debtLocRows.map((r) => (r.id === row.id ? { ...r, interestRate: parseNumberInput(e.target.value) } : r))
                              applyStackRows(next, incentiveRows)
                            }}
                          />
                        </div>
                        <div className="md:col-span-3">
                          <Label className="text-xs">Type</Label>
                          <Select
                            value={row.debtType}
                            onValueChange={(v) => {
                              const next = debtLocRows.map((r) => (r.id === row.id ? { ...r, debtType: v as DebtInstrumentType } : r))
                              applyStackRows(next, incentiveRows)
                            }}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="revolving-interest-only">Revolving - Interest Only</SelectItem>
                              <SelectItem value="term-interest-only">Term - Interest Only</SelectItem>
                              <SelectItem value="amortizing">Amortizing</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-xs">Applies To</Label>
                          <Select
                            value={row.applyTo}
                            onValueChange={(v) => {
                              const applyTo = v as DebtLocApplyTo
                              const next = debtLocRows.map((r) => (r.id === row.id ? { ...r, applyTo } : r))
                              applyStackRows(next, incentiveRows)
                            }}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="loc-limit">LOC Limit</SelectItem>
                              <SelectItem value="debt-amount">Debt Amount</SelectItem>
                              <SelectItem value="bond-capacity">Bond Capacity</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="md:col-span-1 flex items-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const next = debtLocRows.filter((r) => r.id !== row.id)
                              applyStackRows(next, incentiveRows)
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      title="Add a row to the capital structure. Use Applies to for LOC limit, debt amount, or bond capacity."
                      onClick={() =>
                        applyStackRows(
                          [...debtLocRows, { id: uid(), label: '', amount: 0, interestRate: 0, debtType: 'revolving-interest-only', applyTo: 'loc-limit' }],
                          incentiveRows,
                        )
                      }
                    >
                      Add Capital
                    </Button>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Incentive Stack</Label>
                  <div className="mt-1 space-y-2">
                    {incentiveRows.map((row) => (
                      <div key={row.id} className="grid grid-cols-1 md:grid-cols-12 gap-2">
                        <div className="md:col-span-4">
                          <Label className="text-xs">Incentive Name</Label>
                          <Input
                            value={row.label}
                            onChange={(e) => {
                              const next = incentiveRows.map((r) => (r.id === row.id ? { ...r, label: e.target.value } : r))
                              applyStackRows(debtLocRows, next)
                            }}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-xs">Amount</Label>
                          <Input
                            value={editingIncentiveAmount[row.id] ?? (row.amount ? formatCurrency(row.amount, 2) : '')}
                            onFocus={() => {
                              setEditingIncentiveAmount((prev) => ({
                                ...prev,
                                [row.id]: Number.isFinite(Number(row.amount || 0)) ? String(roundMoney(Number(row.amount || 0))) : '',
                              }))
                            }}
                            onChange={(e) => {
                              const raw = e.target.value
                              setEditingIncentiveAmount((prev) => ({ ...prev, [row.id]: raw }))
                              const next = incentiveRows.map((r) =>
                                r.id === row.id ? { ...r, amount: parseNumberInput(raw) } : r,
                              )
                              applyStackRows(debtLocRows, next)
                            }}
                            onBlur={() => {
                              setEditingIncentiveAmount((prev) => {
                                const next = { ...prev }
                                delete next[row.id]
                                return next
                              })
                            }}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-xs">Applies To</Label>
                          <Select
                            value={row.applyTo}
                            onValueChange={(v) => {
                              const next = incentiveRows.map((r) => (r.id === row.id ? { ...r, applyTo: v as IncentiveApplyTo } : r))
                              applyStackRows(debtLocRows, next)
                            }}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="infrastructure-reduction">Infrastructure Reduction</SelectItem>
                              <SelectItem value="cost-reduction">Total Cost Reduction</SelectItem>
                              <SelectItem value="equity-source">Equity Source (Pre-Draw)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="md:col-span-3">
                          <Label className="text-xs">Applied When</Label>
                          <Select
                            value={row.timingMode}
                            onValueChange={(v) => {
                              const next = incentiveRows.map((r) => (r.id === row.id ? { ...r, timingMode: v as IncentiveTimingMode } : r))
                              applyStackRows(debtLocRows, next)
                            }}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="upfront">Upfront (Month 1)</SelectItem>
                              <SelectItem value="construction-percent">By Construction %</SelectItem>
                              <SelectItem value="by-phase">By Phase</SelectItem>
                              <SelectItem value="at-closings">At Closings</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="md:col-span-1 flex items-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const next = incentiveRows.filter((r) => r.id !== row.id)
                              applyStackRows(debtLocRows, next)
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                        {row.timingMode === 'construction-percent' && (
                          <div className="md:col-span-12">
                            <Label className="text-xs">Construction % Trigger</Label>
                            <Input
                              value={row.constructionPercent || ''}
                              onChange={(e) => {
                                const next = incentiveRows.map((r) =>
                                  r.id === row.id ? { ...r, constructionPercent: parseNumberInput(e.target.value) } : r,
                                )
                                applyStackRows(debtLocRows, next)
                              }}
                            />
                          </div>
                        )}
                        {row.timingMode === 'by-phase' && (
                          <div className="md:col-span-12">
                            <Label className="text-xs">Applied Phases (comma-separated names)</Label>
                            <Input
                              placeholder="Phase 1, Phase 4"
                              value={row.phaseNames || ''}
                              onChange={(e) => {
                                const next = incentiveRows.map((r) => (r.id === row.id ? { ...r, phaseNames: e.target.value } : r))
                                applyStackRows(debtLocRows, next)
                              }}
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">
                              Names must match the Phases table (spacing/case ignored). Phase Pro Forma splits the TIF amount evenly across listed phases; the for-sale LOC engine books reimbursement cash evenly across construction months for each listed phase (then flows through sales cash and LOC paydown like other inflows).
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        applyStackRows(debtLocRows, [
                          ...incentiveRows,
                          {
                            id: uid(),
                            label: '',
                            amount: 0,
                            applyTo: 'cost-reduction',
                            timingMode: 'upfront',
                            constructionPercent: 0,
                            phaseNames: '',
                          },
                        ])
                      }
                    >
                      Add Incentive
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            )}
          </div>

            <div className="space-y-2">
            {isDevelopmentMode && (
              <Card className="bg-muted border-border/60">
                <CardHeader className="py-2">
                  <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <div className="flex items-center gap-2 justify-self-start">
                      <CardTitle className="text-base text-foreground">Phases</CardTitle>
                    </div>
                    <div className="flex items-center justify-center gap-3">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">Sale Mode</Label>
                        <div className="inline-flex rounded-md border border-border/70/70 overflow-hidden">
                          {(['combined', 'presales', 'closings'] as const).map((mode) => {
                            const active = (input.forSalePhasedLoc?.salesPaceMode || 'combined') === mode
                            return (
                              <Button
                                key={mode}
                                type="button"
                                size="sm"
                                variant="ghost"
                                className={`h-7 rounded-none px-2 text-[11px] ${
                                  active
                                    ? 'bg-cyan-700/35 text-cyan-100 hover:bg-cyan-700/45'
                                    : 'bg-card/60 text-muted-foreground hover:bg-muted'
                                }`}
                                onClick={() => setField('forSalePhasedLoc.salesPaceMode', mode)}
                              >
                                {mode}
                              </Button>
                            )
                          })}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">Timing</Label>
                        <div className="inline-flex rounded-md border border-border/70/70 overflow-hidden">
                          {(
                            [
                              { mode: 'trigger-based' as const, label: 'Trigger' },
                              { mode: 'fixed-schedule' as const, label: 'Fixed' },
                            ] as const
                          ).map(({ mode, label }) => {
                            const active = phaseTimingMode === mode
                            return (
                              <Button
                                key={mode}
                                type="button"
                                size="sm"
                                variant="ghost"
                                title={mode === 'fixed-schedule' ? 'Start phases by explicit start month' : 'Unlock phases by sales trigger'}
                                className={`h-7 rounded-none px-2 text-[11px] ${
                                  active
                                    ? 'bg-cyan-700/35 text-cyan-100 hover:bg-cyan-700/45'
                                    : 'bg-card/60 text-muted-foreground hover:bg-muted'
                                }`}
                                onClick={() => setField('forSalePhasedLoc.phaseTimingMode', mode)}
                              >
                                {label}
                              </Button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="justify-self-start xl:justify-self-end">
                      <Button size="sm" variant="outline" onClick={addPhaseRow}>Add Phase</Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {phaseRows.length === 0 && <div className="text-xs text-muted-foreground">No phases added yet.</div>}
                    {phaseRows.length > 0 && (
                      <div className="overflow-x-auto rounded-lg border border-border/60/30">
                        <div className="min-w-[860px]">
                          <div className="grid grid-cols-[minmax(8rem,0.9fr)_4.25rem_4.25rem_4.25rem_4.25rem_4.25rem_minmax(10rem,1fr)_3.6rem_4.2rem] gap-x-1 border-b border-border/60/40 bg-muted/30 px-2 py-1">
                            <Label className="text-[11px] text-muted-foreground">Phase</Label>
                            <Label className="text-[11px] text-muted-foreground">Units</Label>
                            <Label className="text-[11px] text-muted-foreground">Build</Label>
                            <Label className="ml-1 text-[11px] text-muted-foreground">Start</Label>
                            <Label className="text-[11px] text-muted-foreground">Presale</Label>
                            <Label className="text-[11px] text-muted-foreground">Close</Label>
                            <Label className="ml-1 text-[11px] text-muted-foreground">Allocation</Label>
                            <Label className="text-[11px] text-muted-foreground">End</Label>
                            <Label className="text-[11px] text-muted-foreground">Actions</Label>
                          </div>
                          {phaseRows.map((phase, idx) => {
                            const pctStr = (v: number | undefined) =>
                              v === undefined || v === null || Number.isNaN(v) ? '' : String(v)
                            const startMo = Math.max(0, Number(phase.startMonthOffset || 0))
                            const buildMonths = Math.max(0, Number(phase.buildMonths || 0))
                            const endMo = startMo + buildMonths
                            const exceedsDuration = phaseTimingMode === 'fixed-schedule' && endMo > Number(input.projectionMonths || 0)
                            const isExpanded = expandedPhaseRowId === phase.id
                            const allocationSummary = `Infra ${Number(phase.infrastructureAllocationPercent || 0)} / Land ${Number(phase.landAllocationPercent || 0)} / Site ${Number(phase.siteWorkAllocationPercent || 0)}`
                            return (
                              <div key={phase.id} className={idx % 2 === 0 ? 'bg-card/22' : 'bg-card/12'}>
                                <div className="grid grid-cols-[minmax(8rem,0.9fr)_4.25rem_4.25rem_4.25rem_4.25rem_4.25rem_minmax(10rem,1fr)_3.6rem_4.2rem] gap-x-1 items-center px-2 py-1.5 border-b border-border/60/55">
                                  <div className="text-xs font-medium text-foreground truncate">{phase.name || `Phase ${idx + 1}`}</div>
                                  <div className="text-xs text-foreground text-center">{phase.unitCount || 0}</div>
                                  <div className="text-xs text-foreground text-center">{phase.buildMonths || 0}</div>
                                  <div className="text-xs text-foreground text-center">{phase.startMonthOffset ?? 0}</div>
                                  <div className="text-xs text-foreground text-center">{phase.presaleStartMonthOffset ?? 0}</div>
                                  <div className="text-xs text-foreground text-center">{phase.closeStartMonthOffset ?? 0}</div>
                                  <div className="text-xs text-muted-foreground truncate">{allocationSummary}</div>
                                  <div className="text-center">
                                    <span
                                      className={`inline-flex text-[10px] rounded-full border px-1.5 py-0.5 font-medium ${
                                        exceedsDuration
                                          ? 'border-amber-500/60 text-amber-200 bg-amber-900/20'
                                          : 'border-cyan-700/45 text-cyan-200 bg-cyan-900/20'
                                      }`}
                                    >
                                      {endMo}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 justify-end">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 p-0 text-muted-foreground/80 hover:text-foreground"
                                      title={isExpanded ? 'Collapse editor' : 'Edit phase'}
                                      onClick={() => setExpandedPhaseRowId((curr) => (curr === phase.id ? null : phase.id))}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="outline"
                                      className="h-7 w-7 p-0 border-border/70/35 bg-card/10"
                                      title={`Remove ${phase.name || 'phase'}`}
                                      aria-label={`Remove ${phase.name || 'phase'}`}
                                      onClick={() => removePhaseRow(phase.id)}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </div>
                                {isExpanded ? (
                                  <div className="px-3 py-2 bg-card/18 border-b border-border/60/55">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                      <div className="space-y-1.5">
                                        <div className="text-[11px] font-medium text-muted-foreground">Core & Timeline</div>
                                        <div className="grid grid-cols-5 gap-1.5">
                                          <div>
                                            <Label className="text-[10px] text-muted-foreground">Units</Label>
                                            <Input
                                              className="h-7 text-center bg-card/20 border-border/60/30 px-1 text-xs"
                                              value={phase.unitCount === 0 ? '' : String(phase.unitCount)}
                                              onChange={(e) => updatePhaseRow(phase.id, 'unitCount', parseInt(e.target.value || '0', 10))}
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-[10px] text-muted-foreground">Build</Label>
                                            <Input
                                              className="h-7 text-center bg-card/20 border-border/60/30 px-1 text-xs"
                                              value={phase.buildMonths === 0 ? '' : String(phase.buildMonths)}
                                              onChange={(e) => updatePhaseRow(phase.id, 'buildMonths', parseInt(e.target.value || '0', 10))}
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-[10px] text-muted-foreground">Start</Label>
                                            <Input
                                              className="h-7 text-center bg-card/20 border-border/60/30 px-1 text-xs"
                                              value={phase.startMonthOffset === undefined || phase.startMonthOffset === null ? '' : String(phase.startMonthOffset)}
                                              onChange={(e) => updatePhaseRow(phase.id, 'startMonthOffset', parseInt(e.target.value || '0', 10))}
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-[10px] text-muted-foreground">Presale</Label>
                                            <Input
                                              className="h-7 text-center bg-card/20 border-border/60/30 px-1 text-xs"
                                              value={phase.presaleStartMonthOffset === undefined || phase.presaleStartMonthOffset === null ? '' : String(phase.presaleStartMonthOffset)}
                                              onChange={(e) => updatePhaseRow(phase.id, 'presaleStartMonthOffset', parseInt(e.target.value || '0', 10))}
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-[10px] text-muted-foreground">Close</Label>
                                            <Input
                                              className="h-7 text-center bg-card/20 border-border/60/30 px-1 text-xs"
                                              value={phase.closeStartMonthOffset === undefined || phase.closeStartMonthOffset === null ? '' : String(phase.closeStartMonthOffset)}
                                              onChange={(e) => updatePhaseRow(phase.id, 'closeStartMonthOffset', parseInt(e.target.value || '0', 10))}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                      <div className="space-y-1.5">
                                        <div className="text-[11px] font-medium text-muted-foreground">Cost Allocation</div>
                                        <div className="grid grid-cols-3 gap-1.5">
                                          <div>
                                            <Label className="text-[10px] text-muted-foreground">Infra %</Label>
                                            <Input
                                              className="h-7 text-center bg-card/20 border-border/60/30 px-1 text-xs"
                                              value={pctStr(phase.infrastructureAllocationPercent)}
                                              onChange={(e) => updatePhaseRow(phase.id, 'infrastructureAllocationPercent', parseFloat(e.target.value) || 0)}
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-[10px] text-muted-foreground">Land %</Label>
                                            <Input
                                              className="h-7 text-center bg-card/20 border-border/60/30 px-1 text-xs"
                                              value={pctStr(phase.landAllocationPercent)}
                                              onChange={(e) => updatePhaseRow(phase.id, 'landAllocationPercent', parseFloat(e.target.value) || 0)}
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-[10px] text-muted-foreground">Site %</Label>
                                            <Input
                                              className="h-7 text-center bg-card/20 border-border/60/30 px-1 text-xs"
                                              value={pctStr(phase.siteWorkAllocationPercent)}
                                              onChange={(e) => updatePhaseRow(phase.id, 'siteWorkAllocationPercent', parseFloat(e.target.value) || 0)}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}


            {input.proFormaMode === 'rental-hold' && (
            <Card className="bg-muted border-border/60">
              <CardHeader className="py-2"><CardTitle className="text-base text-foreground">Operations & Debt (Expanded)</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Include Rental Income</Label>
                  <Select value={input.includeRentalIncome ? 'yes' : 'no'} onValueChange={(v) => setField('includeRentalIncome', v === 'yes')}>
                    <SelectTrigger className={fieldClass(fieldMeta['includeRentalIncome']?.status || 'empty')}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Include Operating Expenses</Label>
                  <Select value={input.includeOperatingExpenses ? 'yes' : 'no'} onValueChange={(v) => setField('includeOperatingExpenses', v === 'yes')}>
                    <SelectTrigger className={fieldClass(fieldMeta['includeOperatingExpenses']?.status || 'empty')}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Property Management %</Label><Input className={fieldClass(fieldMeta['operatingExpenses.propertyManagementPercent']?.status || 'empty')} value={input.operatingExpenses.propertyManagementPercent || ''} onChange={(e) => setField('operatingExpenses.propertyManagementPercent', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Maintenance Reserve %</Label><Input className={fieldClass(fieldMeta['operatingExpenses.maintenanceReservePercent']?.status || 'empty')} value={input.operatingExpenses.maintenanceReservePercent || ''} onChange={(e) => setField('operatingExpenses.maintenanceReservePercent', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Monthly Insurance</Label><Input className={fieldClass(fieldMeta['operatingExpenses.monthlyPropertyInsurance']?.status || 'empty')} value={input.operatingExpenses.monthlyPropertyInsurance || ''} onChange={(e) => setField('operatingExpenses.monthlyPropertyInsurance', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Annual Property Tax</Label><Input className={fieldClass(fieldMeta['operatingExpenses.annualPropertyTax']?.status || 'empty')} value={input.operatingExpenses.annualPropertyTax || ''} onChange={(e) => setField('operatingExpenses.annualPropertyTax', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Monthly Utilities</Label><Input className={fieldClass(fieldMeta['operatingExpenses.monthlyUtilities']?.status || 'empty')} value={input.operatingExpenses.monthlyUtilities || ''} onChange={(e) => setField('operatingExpenses.monthlyUtilities', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Monthly Other OpEx</Label><Input className={fieldClass(fieldMeta['operatingExpenses.monthlyOther']?.status || 'empty')} value={input.operatingExpenses.monthlyOther || ''} onChange={(e) => setField('operatingExpenses.monthlyOther', parseFloat(e.target.value) || 0)} /></div>
                <div>
                  <Label className="text-xs">Include Debt Service</Label>
                  <Select value={input.includeDebtService ? 'yes' : 'no'} onValueChange={(v) => setField('includeDebtService', v === 'yes')}>
                    <SelectTrigger className={fieldClass(fieldMeta['includeDebtService']?.status || 'empty')}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Debt Payment Type</Label>
                  <Select value={input.debtService.paymentType || 'principal-interest'} onValueChange={(v) => setField('debtService.paymentType', v)}>
                    <SelectTrigger className={fieldClass(fieldMeta['debtService.paymentType']?.status || 'empty')}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="principal-interest">Principal + Interest</SelectItem>
                      <SelectItem value="interest-only">Interest Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
            )}

            {input.proFormaMode === 'rental-hold' && (
            <Card className="bg-muted border-border/60">
              <CardHeader className="py-2"><CardTitle className="text-base text-foreground">Exit, Waterfall & Tax (Expanded)</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div><Label className="text-xs">Exit Cap Rate %</Label><Input className={fieldClass(fieldMeta['exitCapRate']?.status || 'empty')} value={input.exitCapRate || ''} onChange={(e) => setField('exitCapRate', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Refinance LTV %</Label><Input className={fieldClass(fieldMeta['refinanceLTVPercent']?.status || 'empty')} value={input.refinanceLTVPercent || ''} onChange={(e) => setField('refinanceLTVPercent', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Tax Rate %</Label><Input className={fieldClass(fieldMeta['taxRatePercent']?.status || 'empty')} value={input.taxRatePercent || ''} onChange={(e) => setField('taxRatePercent', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Annual Depreciation</Label><Input className={fieldClass(fieldMeta['annualDepreciation']?.status || 'empty')} value={input.annualDepreciation || ''} onChange={(e) => setField('annualDepreciation', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Annual Appreciation %</Label><Input className={fieldClass(fieldMeta['annualAppreciationPercent']?.status || 'empty')} value={input.annualAppreciationPercent || ''} onChange={(e) => setField('annualAppreciationPercent', parseFloat(e.target.value) || 0)} /></div>
                <div>
                  <Label className="text-xs">Value Method</Label>
                  <Select value={input.valueMethod || 'stabilized'} onValueChange={(v) => setField('valueMethod', v)}>
                    <SelectTrigger className={fieldClass(fieldMeta['valueMethod']?.status || 'empty')}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="stabilized">stabilized</SelectItem><SelectItem value="noi-based">noi-based</SelectItem></SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
            )}

          </div>
          </div>
          )}

          {centerTab === 'phase-pro-forma' && (
            <Card className="bg-muted border-border/60">
              <CardHeader className="py-2">
                <CardTitle className="text-base text-foreground">Phase Pro Forma</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-foreground">
                {phaseProFormaRows.length > 0 ? (
                  <div className="overflow-auto border border-border/60 rounded p-2 bg-card">
                    <div className="min-w-[1080px] space-y-1 text-[11px]">
                      <div className="grid grid-cols-[140px_repeat(9,minmax(88px,1fr))] gap-1 text-muted-foreground font-semibold">
                        <div>Phase</div>
                        <div>Units</div>
                        <div>Presale</div>
                        <div>Closing</div>
                        <div>TIF</div>
                        <div>Total Revenue</div>
                        <div>Carrying cost</div>
                        <div>Total Costs</div>
                        <div>Profit</div>
                        <div>Margin</div>
                      </div>
                      {phaseProFormaRows.map((r) => (
                        <div key={r.id} className="grid grid-cols-[140px_repeat(9,minmax(88px,1fr))] gap-1 border-t border-border/60 pt-1">
                          <div>{r.phase}</div>
                          <div>{r.units}</div>
                          <div>{Math.round(r.presale).toLocaleString('en-US')}</div>
                          <div>{Math.round(r.close).toLocaleString('en-US')}</div>
                          <div>{Math.round(r.tif).toLocaleString('en-US')}</div>
                          <div>{Math.round(r.totalRevenue).toLocaleString('en-US')}</div>
                          <div>{Math.round(r.carry).toLocaleString('en-US')}</div>
                          <div>{Math.round(r.totalCosts).toLocaleString('en-US')}</div>
                          <div>{Math.round(r.profit).toLocaleString('en-US')}</div>
                          <div>{r.totalRevenue > 0 ? `${((r.profit / r.totalRevenue) * 100).toFixed(1)}%` : '—'}</div>
                        </div>
                      ))}
                      <div className="grid grid-cols-[140px_repeat(9,minmax(88px,1fr))] gap-1 border-t-2 border-border/60 pt-1 font-semibold">
                        <div>TOTAL</div>
                        <div>{phaseProFormaRows.reduce((s, r) => s + r.units, 0)}</div>
                        <div>{Math.round(phaseProFormaRows.reduce((s, r) => s + r.presale, 0)).toLocaleString('en-US')}</div>
                        <div>{Math.round(phaseProFormaRows.reduce((s, r) => s + r.close, 0)).toLocaleString('en-US')}</div>
                        <div>{Math.round(phaseProFormaRows.reduce((s, r) => s + r.tif, 0)).toLocaleString('en-US')}</div>
                        <div>{Math.round(phaseProFormaRows.reduce((s, r) => s + r.totalRevenue, 0)).toLocaleString('en-US')}</div>
                        <div>{Math.round(phaseProFormaRows.reduce((s, r) => s + r.carry, 0)).toLocaleString('en-US')}</div>
                        <div>{Math.round(phaseProFormaRows.reduce((s, r) => s + r.totalCosts, 0)).toLocaleString('en-US')}</div>
                        <div>{Math.round(phaseProFormaRows.reduce((s, r) => s + r.profit, 0)).toLocaleString('en-US')}</div>
                        <div>
                          {phaseProFormaRows.reduce((s, r) => s + r.totalRevenue, 0) > 0
                            ? `${((phaseProFormaRows.reduce((s, r) => s + r.profit, 0) / phaseProFormaRows.reduce((s, r) => s + r.totalRevenue, 0)) * 100).toFixed(1)}%`
                            : '—'}
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2">
                      Carrying cost matches Assumptions (Carry Cost): when monthly carry per unit and phase build months are set, each phase gets carry proportional to (units × build months); otherwise it is split by unit count. Included in Total Costs (hard + land + site + infra + carry).
                    </p>
                  </div>
                ) : (
                  <div className="text-muted-foreground">No phases yet. Add phases under `Assumptions` in for-sale mode.</div>
                )}
              </CardContent>
            </Card>
          )}

          {centerTab === 'cash-flow' && (
            <Card className="bg-muted border-border/60">
              <CardHeader className="py-2">
                <CardTitle className="text-base text-foreground">Cash Flow</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-foreground">
                {projection?.monthlyCashFlows?.length ? (
                  <>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="rounded border border-border/60 p-2 bg-card"><div className="text-[10px] text-muted-foreground">Peak Cash Needed</div><div>{fmtMoney(projection.summary?.peakCashNeeded)}</div></div>
                      <div className="rounded border border-border/60 p-2 bg-card"><div className="text-[10px] text-muted-foreground">Months Negative</div><div>{projection.summary?.monthsNegative ?? '—'}</div></div>
                      <div className="rounded border border-border/60 p-2 bg-card"><div className="text-[10px] text-muted-foreground">Peak LOC</div><div>{fmtMoney(projection.summary?.forSalePeakLocBalance)}</div></div>
                      <div className="rounded border border-border/60 p-2 bg-card"><div className="text-[10px] text-muted-foreground">LOC Interest</div><div>{fmtMoney(projection.summary?.totalInterestDuringConstruction)}</div></div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Monthly summary (first 36 months): engine rollup of all modeled cash sources (draws, sales, equity, etc.) vs uses; net is in minus out for that month.
                    </p>
                    <div className="max-h-[360px] overflow-auto border border-border/60 rounded">
                      <div className="flex items-baseline gap-2 px-2 py-1.5 border-b border-border/70 bg-card/80 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0 z-[1]">
                        <div className="w-[6.25rem] shrink-0">Month</div>
                        <div className="grid min-w-0 flex-1 grid-cols-3 gap-x-1.5">
                          <div className="text-right">Cash in</div>
                          <div className="text-right">Cash out</div>
                          <div className="text-right">Net</div>
                        </div>
                      </div>
                      {projection.monthlyCashFlows.slice(0, 36).map((m) => (
                        <div key={m.month} className="flex items-baseline gap-2 px-2 py-1 border-b border-border/60 text-xs">
                          <div
                            className="w-[6.25rem] shrink-0 truncate pr-0.5 text-muted-foreground"
                            title={m.monthLabel}
                          >
                            {m.monthLabel}
                          </div>
                          <div className="grid min-w-0 flex-1 grid-cols-3 gap-x-1.5">
                            <div className="text-right tabular-nums">{fmtMoney(m.totalInflow)}</div>
                            <div className="text-right tabular-nums">{fmtMoney(m.totalOutflow)}</div>
                            <div className="text-right tabular-nums">{fmtMoney(m.netCashFlow)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {cashFlowWorkbookRows && (
                      <div className="overflow-auto border border-border/60 rounded p-2 bg-card">
                        <div className="text-xs text-muted-foreground mb-2">Workbook-style monthly matrix (first 26 months)</div>
                        <div className="min-w-[1300px] space-y-1 text-[11px]">
                        <div className="grid grid-cols-[220px_repeat(26,minmax(56px,1fr))_100px] gap-1">
                            <div className="text-muted-foreground">Row</div>
                            {cashFlowWorkbookRows.months.map((m, idx) => (
                              <div
                                key={`mh-${idx}`}
                                className="text-muted-foreground whitespace-nowrap px-0.5"
                                title={m}
                              >
                                {formatWorkbookMonthHeader(m)}
                              </div>
                            ))}
                          <div className="text-muted-foreground font-semibold">TOTAL</div>
                          </div>
                          {cashFlowWorkbookRows.rows.map((row) => (
                            row.kind === 'header' ? (
                              <div key={row.label} className="grid grid-cols-[220px_repeat(26,minmax(56px,1fr))_100px] gap-1 border-t-2 border-border/60 pt-2">
                                <div className="text-foreground font-semibold">{row.label}</div>
                              </div>
                            ) : (
                              <div
                                key={row.label}
                                className={`grid grid-cols-[220px_repeat(26,minmax(56px,1fr))_100px] gap-1 border-t border-border/60 pt-1 ${
                                  row.kind === 'total' ? 'font-semibold bg-card/40' : ''
                                }`}
                              >
                                <div className={row.kind === 'total' ? 'text-foreground' : 'text-muted-foreground'}>{row.label}</div>
                                {row.values.map((v, idx) => (
                                  <div key={`${row.label}-${idx}`}>{Math.round(v).toLocaleString('en-US')}</div>
                                ))}
                                <div className="font-semibold">{Math.round(row.values.reduce((sum, n) => sum + (Number(n) || 0), 0)).toLocaleString('en-US')}</div>
                              </div>
                            )
                          ))}
                        </div>
                        <div className="mt-3 text-[11px] text-muted-foreground border-t border-border/60 pt-2">
                          TIF reimbursement follows the phased engine (same basis as Phase Pro Forma totals, spread over construction).
                          {' '}Configured TIF: <span className="text-muted-foreground font-semibold">{fmtMoney(input?.forSalePhasedLoc?.tifInfrastructureReduction || 0)}</span>.
                          {' '}Workbook TIF total: <span className="text-muted-foreground font-semibold">{fmtMoney(cashFlowWorkbookRows.fullTotalsByLabel?.['  TIF Reimbursement'] || 0)}</span>.
                          Preferred return is the first line under INVESTOR PAYOUTS; the total row is pref + completion amounts.
                          LOC draws in the engine now cover construction shortfalls plus preferred return, up to the LOC limit.
                          Equity return and profit share are concentrated at completion (Mo{' '}
                          {Math.max(1, Number(input?.projectionMonths || 26))} when applicable).
                          Engine distributed cash: <span className="text-muted-foreground font-semibold">{fmtMoney(projection?.summary?.forSaleDistributionTotal)}</span>.
                          {' '}Workbook vs engine:{' '}
                          <span className="text-muted-foreground font-semibold">
                            {fmtMoney(
                              Number(cashFlowWorkbookRows.fullTotalsByLabel?.['Total investor payouts'] || 0) -
                                Number(projection?.summary?.forSaleDistributionTotal || 0),
                            )}
                          </span>
                        </div>
                      </div>
                    )}
                    <Card className="bg-card border-border/60">
                      <CardHeader className="py-2">
                        <CardTitle className="text-sm text-foreground">PROJECT TOTALS</CardTitle>
                      </CardHeader>
                      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                        <div className="rounded border border-border/60 p-2">
                          <div className="text-muted-foreground">Total Expenses (excl. interest)</div>
                          <div className="text-foreground font-semibold">{fmtMoney(analysisMetrics.totalExpensesExInterest)}</div>
                        </div>
                        <div className="rounded border border-border/60 p-2">
                          <div className="text-muted-foreground">Total Revenue (Sales + TIF)</div>
                          <div className="text-foreground font-semibold">{fmtMoney(analysisMetrics.totalRevenue)}</div>
                        </div>
                        <div className="rounded border border-border/60 p-2">
                          <div className="text-muted-foreground">Total LOC Interest Paid</div>
                          <div className="text-foreground font-semibold">{fmtMoney(analysisMetrics.totalInterest)}</div>
                        </div>
                        <div className="rounded border border-border/60 p-2">
                          <div className="text-muted-foreground">Total Preferred Return Paid</div>
                          <div className="text-foreground font-semibold">{fmtMoney(analysisMetrics.totalPreferredReturn)}</div>
                        </div>
                        <div className="rounded border border-border/60 p-2">
                          <div className="text-muted-foreground">Net Project Profit</div>
                          <div className="text-foreground font-semibold">{fmtMoney(analysisMetrics.netProjectProfit)}</div>
                        </div>
                        <div className="rounded border border-border/60 p-2">
                          <div className="text-muted-foreground">Developer Take-Home</div>
                          <div className="text-foreground font-semibold">{fmtMoney(analysisMetrics.developerTakeHome)}</div>
                        </div>
                        <div className="rounded border border-border/60 p-2">
                          <div className="text-muted-foreground">
                            Total Investor Payout (Mo {Math.max(1, Number(input?.projectionMonths || 26))})
                          </div>
                          <div className="text-foreground font-semibold">{fmtMoney(analysisMetrics.investorPayout)}</div>
                        </div>
                        <div className="rounded border border-border/60 p-2">
                          <div className="text-muted-foreground">Peak LOC Balance</div>
                          <div className="text-foreground font-semibold">{fmtMoney(analysisMetrics.peakLocBalance)}</div>
                        </div>
                        <div className="rounded border border-border/60 p-2">
                          <div className="text-muted-foreground">Final LOC Balance</div>
                          <div className="text-foreground font-semibold">{fmtMoney(analysisMetrics.finalLocBalance)}</div>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <div className="text-muted-foreground">Run ProForma to view monthly cash flow.</div>
                )}
              </CardContent>
            </Card>
          )}

          {centerTab === 'investor-returns' && (
            <Card className="bg-muted border-border/60">
              <CardHeader className="py-2">
                <CardTitle className="text-base text-foreground">Investor Returns</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-foreground">
                <div className="rounded border border-border/60 p-2 bg-card"><div className="text-[10px] text-muted-foreground">Investor Equity</div><div>{fmtMoney(investorReturnsMetrics.investorEquity)}</div></div>
                <div className="rounded border border-border/60 p-2 bg-card"><div className="text-[10px] text-muted-foreground">Monthly Preferred Return</div><div>{fmtMoney(investorReturnsMetrics.monthlyPreferredReturn)}</div></div>
                <div className="rounded border border-border/60 p-2 bg-card"><div className="text-[10px] text-muted-foreground">Total Preferred Return</div><div>{fmtMoney(investorReturnsMetrics.totalPreferredReturn)}</div></div>
                <div className="rounded border border-border/60 p-2 bg-card"><div className="text-[10px] text-muted-foreground">Investor Profit Share</div><div>{fmtMoney(investorReturnsMetrics.investorProfitShare)}</div></div>
                <div className="rounded border border-border/60 p-2 bg-card"><div className="text-[10px] text-muted-foreground">Investor / Developer Split</div><div>{`${investorReturnsMetrics.investorSplitPct}% / ${investorReturnsMetrics.developerSplitPct}%`}</div></div>
                <div className="rounded border border-border/60 p-2 bg-card"><div className="text-[10px] text-muted-foreground">Total Investor Payout</div><div>{fmtMoney(investorReturnsMetrics.totalInvestorPayout)}</div></div>
                <div className="rounded border border-border/60 p-2 bg-card"><div className="text-[10px] text-muted-foreground">Investor MOIC</div><div>{investorReturnsMetrics.investorMoic != null ? `${investorReturnsMetrics.investorMoic.toFixed(2)}x` : '—'}</div></div>
              </CardContent>
            </Card>
          )}

          {centerTab === 'public-sector' && (
            <Card className="bg-muted border-border/60">
              <CardHeader className="py-2">
                <CardTitle className="text-base text-foreground">Public Sector</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-foreground">
                <div className="rounded border border-border/60 p-2 bg-card"><div className="text-[10px] text-muted-foreground">Infrastructure Cost</div><div>{fmtMoney(input.forSalePhasedLoc?.infrastructureCost)}</div></div>
                <div className="rounded border border-border/60 p-2 bg-card"><div className="text-[10px] text-muted-foreground">TIF / Infra Reduction</div><div>{fmtMoney(input.forSalePhasedLoc?.tifInfrastructureReduction)}</div></div>
                <div className="rounded border border-border/60 p-2 bg-card"><div className="text-[10px] text-muted-foreground">Incentive Cost Reduction</div><div>{fmtMoney(input.forSalePhasedLoc?.incentiveCostReduction)}</div></div>
                <div className="rounded border border-border/60 p-2 bg-card"><div className="text-[10px] text-muted-foreground">Total Units</div><div>{input.forSalePhasedLoc?.totalUnits || 0}</div></div>
                <div className="rounded border border-border/60 p-2 bg-card"><div className="text-[10px] text-muted-foreground">Annual Property Tax Revenue (2.5% of revenue)</div><div>{fmtMoney(publicSectorMetrics.annualPropertyTaxRevenue)}</div></div>
                <div className="rounded border border-border/60 p-2 bg-card"><div className="text-[10px] text-muted-foreground">TIF Payback Period</div><div>{publicSectorMetrics.tifPaybackYears != null ? `${publicSectorMetrics.tifPaybackYears.toFixed(2)} years` : '—'}</div></div>
                <div className="rounded border border-border/60 p-2 bg-card"><div className="text-[10px] text-muted-foreground">Public 10yr Net Return</div><div>{fmtMoney(publicSectorMetrics.public10YrNetReturn)}</div></div>
              </CardContent>
            </Card>
          )}

          {centerTab === 'analysis' && (
            <div className="space-y-3">
              <Card className="bg-muted border-border/60">
                <CardHeader className="py-2"><CardTitle className="text-base text-foreground">Validation Checks</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-xs text-foreground">
                  {validationChecks.map((c) => (
                    <div key={c.label} className="flex items-center justify-between rounded border border-border/60 bg-card px-2 py-1">
                      <span>{c.label}</span>
                      <span className={c.pass ? 'text-emerald-400' : 'text-rose-400'}>{c.pass ? 'PASS' : 'CHECK'}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card className="bg-muted border-border/60">
                <CardHeader className="py-2"><CardTitle className="text-base text-foreground">Deal Notes</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <Textarea
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    placeholder="Capture owner notes, calls, commitments, and follow-ups..."
                    className="min-h-[180px]"
                  />
                </CardContent>
              </Card>
              <Card className="bg-muted border-border/60">
                <CardHeader className="py-2"><CardTitle className="text-base text-foreground">Deal Tasks</CardTitle></CardHeader>
                <CardContent>
                  <Textarea
                    value={tasksDraft}
                    onChange={(e) => setTasksDraft(e.target.value)}
                    placeholder={"Track next actions (one per line), owners, and due dates...\nExample: Verify TIF disbursement timing - Mike - 2026-05-01"}
                    className="min-h-[160px]"
                  />
                </CardContent>
              </Card>
              <Card className="bg-muted border-border/60">
                <CardHeader className="py-2"><CardTitle className="text-base text-foreground">Activity Timeline</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {activityEvents.slice(0, 30).map((a) => (
                    <div key={a.id} className="border border-border/60 rounded p-2 text-xs bg-card">
                      <div className="font-semibold uppercase text-[10px] text-muted-foreground">{a.eventType}</div>
                      <div className="text-foreground mt-0.5 whitespace-pre-wrap">{a.eventText}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </main>

        <aside className="w-[340px] bg-card border-l border-border/60 flex flex-col min-h-0">
          <div className="p-3 border-b border-border/60">
            <div className="text-sm font-semibold">Deal Assistant</div>
            <div className="mt-2 flex gap-1 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="bg-muted border-border/60 text-foreground hover:bg-muted/70"
                onClick={() => handleSend('What am I missing?')}
              >
                What am I missing?
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="bg-muted border-border/60 text-foreground hover:bg-muted/70"
                onClick={() => handleSend('Run a scenario with conservative assumptions.')}
              >
                Run a scenario
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="bg-muted border-border/60 text-foreground hover:bg-muted/70"
                onClick={() => handleSend('Stress test this deal.')}
              >
                Stress test this
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="bg-muted border-border/60 text-foreground hover:bg-muted/70"
                onClick={() =>
                  handleSend(
                    'Summarize this deal in a clean audit format using visible UI labels only. In notesAppend, use sections: Ready, Needs input, Notes. Then return short action-oriented taskSuggestions tied to visible controls. Return notesAppend and taskSuggestions.',
                  )
                }
              >
                Summarize to Notes/Tasks
              </Button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
            {messages.map((m) => (
              <div key={m.id} className={`rounded border p-2 ${m.role === 'assistant' ? 'bg-card border-border/60' : 'bg-blue-950/35 border-blue-800/60'}`}>
                <div className="text-xs uppercase text-muted-foreground mb-1">{m.role}</div>
                <div className="text-sm text-foreground whitespace-pre-wrap">{m.text}</div>
                {!!m.extractionChips?.length && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {m.extractionChips.map((c) => (
                      <span key={c} className="text-[11px] px-1.5 py-0.5 rounded bg-green-100 text-green-800 border border-green-200">{c}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {markers.map((marker) => (
              <div key={marker.id} className="text-center text-[11px] text-muted-foreground py-1 border-y border-border/60 bg-muted/50">
                {marker.stage === 'coaching' ? 'Deal coaching' : marker.stage === 'scenario' ? 'Scenario exploration' : 'ProForma build'}
              </div>
            ))}
            {pendingSuggestions && (
              <div className="rounded border border-amber-700/60 bg-amber-950/40 p-2">
                <div className="text-xs font-semibold text-amber-300">Suggested updates (review then apply)</div>
                <div className="mt-1 text-xs text-amber-200 space-y-1">
                  {flattenFieldUpdates(pendingSuggestions as any).map((u) => (
                    <div key={u.path}>{toHumanFieldLabel(u.path)}: {formatValue(u.value, u.path)}</div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => { applyUpdates(pendingSuggestions, 'ai', 'approx'); setPendingSuggestions(null) }}>Apply all</Button>
                  <Button size="sm" variant="outline" className="border-border/70 text-foreground hover:bg-muted/70" onClick={() => setPendingSuggestions(null)}>Dismiss</Button>
                </div>
              </div>
            )}
            {(pendingNotesAppend || (pendingTaskSuggestions && pendingTaskSuggestions.length > 0)) && (
              <div className="rounded border border-blue-700/60 bg-blue-950/40 p-2">
                <div className="text-xs font-semibold text-blue-300">Suggested workspace capture</div>
                {!!pendingNotesAppend && (
                  <div className="mt-1">
                    <div className="text-[11px] font-semibold text-blue-300">Notes summary</div>
                    {(() => {
                      const parsed = parseCaptureNotesSections(pendingNotesAppend)
                      if (!parsed.hasStructuredSections) {
                        return <div className="text-xs text-blue-200 whitespace-pre-wrap">{pendingNotesAppend}</div>
                      }
                      return (
                        <div className="mt-1 space-y-1.5">
                          {parsed.sections.map((section) => (
                            <div key={section.heading}>
                              <div className="text-[11px] font-semibold text-blue-200">{section.heading}</div>
                              <div className="mt-0.5 space-y-0.5">
                                {section.items.map((item, idx) => (
                                  <div key={`${section.heading}-${idx}`} className="text-xs text-blue-200">
                                    - {item}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                          {parsed.remainingLines.length > 0 && (
                            <div className="text-xs text-blue-200 whitespace-pre-wrap">{parsed.remainingLines.join('\n')}</div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )}
                {!!pendingTaskSuggestions?.length && (
                  <div className="mt-1">
                    <div className="text-[11px] font-semibold text-blue-300">Task suggestions</div>
                    <div className="mt-0.5 space-y-0.5">
                      {pendingTaskSuggestions.map((task, idx) => (
                        <div key={`${task}-${idx}`} className="text-xs text-blue-200">- {task}</div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-2 flex gap-2 flex-wrap">
                  {!!pendingNotesAppend && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setNotesDraft((prev) => (prev.trim() ? `${prev.trim()}\n\n${pendingNotesAppend}` : pendingNotesAppend))
                        appendActivity('notes_capture', 'Assistant summary added to notes.')
                        setPendingNotesAppend(null)
                      }}
                    >
                      Add to Notes
                    </Button>
                  )}
                  {!!pendingTaskSuggestions?.length && (
                    <Button
                      size="sm"
                      onClick={() => {
                        const block = pendingTaskSuggestions.map((t) => `- [ ] ${t}`).join('\n')
                        setTasksDraft((prev) => (prev.trim() ? `${prev.trim()}\n${block}` : block))
                        appendActivity('tasks_capture', 'Assistant suggestions added to tasks.')
                        setPendingTaskSuggestions(null)
                      }}
                    >
                      Add to Tasks
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-border/70 text-foreground hover:bg-muted/70"
                    onClick={() => {
                      setPendingNotesAppend(null)
                      setPendingTaskSuggestions(null)
                    }}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            )}
          </div>
          <div className="p-3 border-t border-border/60">
            {stage !== 'proforma' && (readiness.proformaReady || !!runPromptReason) && (
              <div className="mb-2 rounded border border-green-300 bg-green-50 p-2 text-xs text-green-800">
                {runPromptReason || 'AI indicates readiness for ProForma stage.'}
                <div className="mt-1">
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => addStageMarkerIfChanged('proforma')}>Confirm transition</Button>
                    <Button size="sm" variant="outline" onClick={handleRunProForma}>Run ProForma now</Button>
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={isListening ? stopVoice : startVoice}
                className={isListening ? 'bg-green-900/40 border-green-600 text-green-200 hover:bg-green-800/50' : 'bg-muted border-border/60 text-foreground hover:bg-muted/70'}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Textarea
                value={chatValue}
                onChange={(e) => setChatValue(e.target.value)}
                placeholder="Ask the deal assistant..."
                className="min-h-[42px] max-h-[120px] bg-input border-border text-foreground placeholder:text-muted-foreground"
              />
              <Button onClick={() => handleSend()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

