import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { ArrowLeft, Download, Mic, MicOff, Play, Save, Send } from 'lucide-react'
import type { Deal } from '@/types/deal'
import type { Project } from '@/types'
import type { ForSalePhaseInput, ProFormaInput, ProFormaMode, ProFormaProjection } from '@/types/proforma'
import { computeDealReadiness, materialForSaleContext, type DealReadiness } from '@/lib/dealReadiness'
import { fetchDeals } from '@/services/dealService'
import {
  listDealActivityEvents,
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
import hshLogo from '/HSH Contractor Logo - Color.png'

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

type WorkspaceCenterTab = 'overview' | 'proforma' | 'notes' | 'tasks' | 'activity'
type DebtLocApplyTo = 'loc-limit' | 'debt-amount' | 'bond-capacity'
type IncentiveApplyTo = 'infrastructure-reduction' | 'cost-reduction' | 'equity-source'

interface DebtLocStackRow {
  id: string
  label: string
  amount: number
  applyTo: DebtLocApplyTo
}

interface IncentiveStackRow {
  id: string
  label: string
  amount: number
  applyTo: IncentiveApplyTo
}

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`

const STAGE_COLOR: Record<WorkspaceStage, string> = {
  coaching: 'bg-amber-100 text-amber-800 border-amber-200',
  scenario: 'bg-blue-100 text-blue-800 border-blue-200',
  proforma: 'bg-green-100 text-green-800 border-green-200',
}

const STAGE_DEAL_ACCENT: Record<WorkspaceStage, string> = {
  coaching: 'bg-amber-500',
  scenario: 'bg-blue-500',
  proforma: 'bg-green-500',
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
    projectionMonths: 24,
    startDate,
    totalProjectSquareFootage: 0,
    underwritingEstimatedConstructionCost: deal.projected_cost || 0,
    useDevelopmentProforma: true,
    landCost: 0,
    softCostPercent: 0,
    contingencyPercent: 0,
    constructionMonths: undefined,
    loanToCostPercent: 0,
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
  const soft = hard * ((inp.softCostPercent || 0) / 100)
  const contingency = hard * ((inp.contingencyPercent || 0) / 100)
  return hard + land + soft + contingency
}

const USES_PATHS_FOR_LTC_DEBT_SYNC = new Set([
  'underwritingEstimatedConstructionCost',
  'landCost',
  'softCostPercent',
  'contingencyPercent',
])

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

function parseForSalePhasesFromText(text: string): ForSalePhaseInput[] {
  if (!text || !/phase\s+\d+/i.test(text)) return []
  const blocks = text
    .split(/\r?\n(?=Phase\s+\d+\b)/i)
    .map((b) => b.trim())
    .filter((b) => /^Phase\s+\d+\b/i.test(b))

  const phases: ForSalePhaseInput[] = []
  blocks.forEach((block) => {
    const phaseNum = Number((block.match(/^Phase\s+(\d+)/i) || [])[1] || phases.length + 1)
    const totalUnits = Number((block.match(/(\d+(?:\.\d+)?)\s*units?/i) || [])[1] || 0)
    const buildMonths = Number((block.match(/Build Months:\s*(\d+(?:\.\d+)?)/i) || [])[1] || 0)
    const presaleStartMonth = Number((block.match(/Presale Start Month Offset:\s*(\d+(?:\.\d+)?)/i) || [])[1] || 0)
    const closeStartMonth = Number((block.match(/Close Start Month Offset:\s*(\d+(?:\.\d+)?)/i) || [])[1] || 0)
    const presaleTriggerPercent = Number((block.match(/Presale Trigger Percent:\s*(\d+(?:\.\d+)?)/i) || [])[1] || 0)
    const averageSalePrice = Number((block.match(/Avg Sale Price:\s*\$?([\d,]+(?:\.\d+)?)/i) || [])[1]?.replace(/,/g, '') || 0)
    phases.push({
      id: uid(),
      name: `Phase ${phaseNum}`,
      unitCount: totalUnits,
      avgSalePrice: averageSalePrice,
      buildMonths,
      closeStartMonthOffset: closeStartMonth,
      presaleStartMonthOffset: presaleStartMonth,
      presaleTriggerPercent,
    })
  })

  return phases.filter((p) => p.unitCount > 0)
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
  if (/for-sale-phased-loc/i.test(t)) parsed.proFormaMode = 'for-sale-phased-loc'
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

  const phasesFromBlocks = parseForSalePhasesFromText(t)
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
        unitCount: u,
        buildMonths,
        presaleStartMonthOffset: starts[i],
        closeStartMonthOffset: starts[i] + closeOffset,
        presaleTriggerPercent: trigger,
        avgSalePrice: avgSalePrice || 0,
      }))
    }
  }

  const forSalePatch: any = {}
  if (totalUnits != null) forSalePatch.totalUnits = totalUnits
  if (avgSalePrice != null) forSalePatch.averageSalePrice = avgSalePrice
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
  proFormaMode: 'Mode',
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
  softCostPercent: 'Soft Cost %',
  contingencyPercent: 'Contingency %',
  loanToCostPercent: 'Loan To Cost %',
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
- Respect modes: rental-hold, general-development, for-sale-phased-loc.
- Ask clarifying questions before writing uncertain mode-specific fields.
- Use high confidence only for explicit user-provided values.
- Keep numeric fields numeric and nested objects valid.
- If user is conversational/rambling, summarize clearly in notesAppend and propose crisp next actions in taskSuggestions.
- Keep "reply" very short (max 1 sentence) when many fields are being updated.
- Prefer canonical keys only (forSalePhasedLoc.*, debtService.*, etc.) and avoid alias keys like forSaleTotalUnits / forSaleLtcPercent.
- For large for-sale imports, prioritize complete fieldUpdates (especially forSalePhasedLoc.phases) over verbose reply text.
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
  return 'border-gray-200 bg-white italic text-gray-500'
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
    <div className="grid grid-cols-[minmax(10rem,42%)_1fr] gap-2 py-1.5 border-b border-slate-700/60 text-sm last:border-b-0">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-100 tabular-nums">{value}</span>
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
      : input.proFormaMode === 'for-sale-phased-loc'
        ? 'For-sale phased LOC'
        : 'General development'
  const hard = input.underwritingEstimatedConstructionCost || 0
  const land = input.landCost || 0
  const soft = hard * ((input.softCostPercent || 0) / 100)
  const contingency = hard * ((input.contingencyPercent || 0) / 100)
  const totalUses = hard + land + soft + contingency
  const fs = input.forSalePhasedLoc
  const s = projection?.summary
  const phases = fs?.phases || []
  const buckets = fs?.salesAllocationBuckets

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      {input.proFormaMode === 'general-development' && materialForSaleContext(input) && (
        <div className="rounded-lg border border-amber-700/45 bg-amber-950/20 px-4 py-3 text-xs text-amber-100/90 leading-snug">
          Underwriting data looks like a <span className="font-medium text-amber-50">for-sale phased LOC</span> deal, but Mode is still general-development.
          Readiness checks below include LOC, phases, and incentives. Switch Mode in All assumptions for the matching form layout.
        </div>
      )}
      <div className="rounded-lg border border-slate-700 bg-slate-800/90 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-100 tracking-tight">Pro forma memo</h2>
        <p className="text-sm text-slate-400 mt-1">{dealName}</p>
        <p className="text-sm text-slate-300 mt-3 leading-relaxed">
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
                : 'border-slate-600 bg-slate-900/60 text-slate-300'
            }`}
          >
            {readiness.proformaReady
              ? 'Model ready — run pro forma'
              : `Coverage ${readiness.score}% · ${readiness.failedCriticalCount} critical gap${readiness.failedCriticalCount === 1 ? '' : 's'}`}
          </span>
          <span className="rounded border border-slate-600 bg-slate-900/60 px-2 py-1 text-slate-300">
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

      <div className="rounded-lg border border-slate-700 bg-slate-800/90 p-5">
        <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide mb-2">Deal overview</h3>
        <MemoRow label="Structure" value={modeLabel} />
        <MemoRow label="Start date" value={fmtShortDate(input.startDate)} />
        <MemoRow label="Projection (months)" value={input.projectionMonths ?? '—'} />
        <MemoRow label="Contract value" value={fmtMoney(input.contractValue)} />
        <MemoRow label="Total SF (if set)" value={input.totalProjectSquareFootage ? `${input.totalProjectSquareFootage.toLocaleString()} sf` : '—'} />
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-800/90 p-5">
        <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide mb-2">Uses (underwriting basis)</h3>
        <MemoRow label="Est. construction / hard" value={fmtMoney(hard)} />
        <MemoRow label="Land" value={fmtMoney(land)} />
        <MemoRow label={`Soft (${fmtPct(input.softCostPercent || 0, 0)} of hard)`} value={fmtMoney(soft)} />
        <MemoRow label={`Contingency (${fmtPct(input.contingencyPercent || 0, 0)} of hard)`} value={fmtMoney(contingency)} />
        <MemoRow label="Indicative total (hard + land + soft + contingency)" value={<span className="font-semibold">{fmtMoney(totalUses)}</span>} />
      </div>

      {(input.proFormaMode === 'for-sale-phased-loc' ||
        (fs &&
          ((fs.totalUnits ?? 0) > 0 || (fs.averageSalePrice ?? 0) > 0 || phases.length > 0))) && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/90 p-5">
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide mb-2">For-sale phased LOC</h3>
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
              value={`LOC paydown ${buckets.locPaydownPercent ?? 0}% · Reinvest ${buckets.reinvestPercent ?? 0}% · Reserve ${buckets.reservePercent ?? 0}% · Distribution ${buckets.distributionPercent ?? 0}%`}
            />
          )}
          {phases.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <div className="text-xs text-slate-400 mb-2">Phases</div>
              <table className="w-full text-xs text-left border border-slate-700 rounded-md overflow-hidden">
                <thead className="bg-slate-900/80 text-slate-400">
                  <tr>
                    <th className="p-2 font-medium">Phase</th>
                    <th className="p-2 font-medium">Units</th>
                    <th className="p-2 font-medium">Build mo</th>
                    <th className="p-2 font-medium">Presale M</th>
                    <th className="p-2 font-medium">Close M</th>
                    <th className="p-2 font-medium">Trigger %</th>
                    <th className="p-2 font-medium">ASP</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {phases.map((p) => (
                    <tr key={p.id} className="border-t border-slate-700">
                      <td className="p-2">{p.name || '—'}</td>
                      <td className="p-2">{p.unitCount || '—'}</td>
                      <td className="p-2">{p.buildMonths || '—'}</td>
                      <td className="p-2">{p.presaleStartMonthOffset ?? '—'}</td>
                      <td className="p-2">{p.closeStartMonthOffset ?? '—'}</td>
                      <td className="p-2">{p.presaleTriggerPercent != null ? fmtPct(p.presaleTriggerPercent, 0) : '—'}</td>
                      <td className="p-2">{fmtMoney(p.avgSalePrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-slate-700 bg-slate-800/90 p-5">
        <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide mb-2">Financing (summary)</h3>
        <MemoRow label="Loan to cost (project)" value={input.loanToCostPercent != null ? fmtPct(input.loanToCostPercent, 0) : '—'} />
        <MemoRow label="Debt amount" value={fmtMoney(input.debtService?.loanAmount)} />
        <MemoRow label="Debt rate / term" value={`${input.debtService?.interestRate != null ? fmtPct(input.debtService.interestRate, 2) : '—'} · ${input.debtService?.loanTermMonths ?? '—'} mo`} />
      </div>

      {input.proFormaMode === 'rental-hold' && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/90 p-5">
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide mb-2">Rental operations</h3>
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
          className="border-slate-500 bg-slate-800 text-slate-100 hover:bg-slate-700 hover:text-white"
          onClick={onEditAssumptions}
        >
          Open all assumptions
        </Button>
      </div>
    </div>
  )
}

export function DealWorkspace({ dealId, onBack }: DealWorkspaceProps) {
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
  const [loadingDealState, setLoadingDealState] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [runPromptReason, setRunPromptReason] = useState<string | null>(null)
  const [centerTab, setCenterTab] = useState<WorkspaceCenterTab>('overview')
  const [proformaView, setProformaView] = useState<'memo' | 'assumptions'>('memo')
  const [notesDraft, setNotesDraft] = useState('')
  const [tasksDraft, setTasksDraft] = useState('')
  const [activityEvents, setActivityEvents] = useState<ActivityItem[]>([])
  const recognitionRef = useRef<any>(null)
  const autosaveTimerRef = useRef<number | null>(null)
  const contextAutosaveTimerRef = useRef<number | null>(null)
  const hasLoadedDealRef = useRef(false)

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
      hasLoadedDealRef.current = false
      setLoadingDealState(true)
      const saved = await loadDealProFormaInputs(selectedDeal.id)
      if (saved) {
        const restored = saved as any
        let restoredInput: ProFormaInput = {
          ...(defaultInputForDeal(selectedDeal) as any),
          ...(restored.currentInput || restored.input || restored),
          startDate:
            restored?.currentInput?.startDate || restored?.input?.startDate || restored?.startDate
              ? new Date(restored?.currentInput?.startDate || restored?.input?.startDate || restored?.startDate)
              : defaultInputForDeal(selectedDeal).startDate,
          debtService: {
            ...(defaultInputForDeal(selectedDeal).debtService as any),
            ...((restored?.currentInput?.debtService || restored?.input?.debtService || restored?.debtService || {}) as any),
            startDate:
              restored?.currentInput?.debtService?.startDate ||
              restored?.input?.debtService?.startDate ||
              restored?.debtService?.startDate
                ? new Date(
                    restored?.currentInput?.debtService?.startDate ||
                      restored?.input?.debtService?.startDate ||
                      restored?.debtService?.startDate,
                  )
                : defaultInputForDeal(selectedDeal).startDate,
          },
        }
        if ((restoredInput.proFormaMode || 'general-development') === 'general-development') {
          restoredInput = syncDebtAmountFromLtc(restoredInput)
        }
        setInput(restoredInput)
        setStage((restored.stage as WorkspaceStage) || 'coaching')
        setMessages(Array.isArray(restored.messages) ? restored.messages : [])
        setFieldMeta(restored.fieldMeta || {})
      } else {
        setInput(defaultInputForDeal(selectedDeal))
        setStage('coaching')
        setMessages([
          {
            id: uid(),
            role: 'assistant',
            text: `Let's work this deal. Start by telling me what you know about "${selectedDeal.deal_name}" and I will populate the model as we go.`,
            createdAt: new Date().toISOString(),
          },
        ])
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
      setCenterTab('overview')
      hasLoadedDealRef.current = true
      setLoadingDealState(false)
    }
    loadState()
  }, [selectedDeal?.id])

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

    if (input.proFormaMode === 'for-sale-phased-loc' && input.forSalePhasedLoc) {
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
    if (value === 'rental-hold') {
      setField('proFormaMode', 'rental-hold')
      return
    }
    if (value === 'for-sale-phased-loc') {
      setField('proFormaMode', 'for-sale-phased-loc')
      return
    }
    setField('proFormaMode', 'general-development')
  }

  const defaultDebtLocRows = (): DebtLocStackRow[] => ([
    { id: 'loc-primary', label: 'Primary LOC', amount: input?.forSalePhasedLoc?.fixedLocLimit || 0, applyTo: 'loc-limit' },
    { id: 'debt-primary', label: 'Primary Debt', amount: input?.debtService?.loanAmount || 0, applyTo: 'debt-amount' },
  ])

  const defaultIncentiveRows = (): IncentiveStackRow[] => ([
    { id: 'incentive-tif', label: 'TIF', amount: input?.forSalePhasedLoc?.tifInfrastructureReduction || 0, applyTo: 'infrastructure-reduction' },
    { id: 'incentive-grant', label: 'Grant / Incentive', amount: input?.forSalePhasedLoc?.incentiveCostReduction || 0, applyTo: 'cost-reduction' },
    { id: 'incentive-equity', label: 'Incentive Equity Source', amount: input?.forSalePhasedLoc?.incentiveEquitySource || 0, applyTo: 'equity-source' },
  ])

  const debtLocRows: DebtLocStackRow[] = ((input as any)?.customStacks?.debtLocRows as DebtLocStackRow[]) || defaultDebtLocRows()
  const incentiveRows: IncentiveStackRow[] = ((input as any)?.customStacks?.incentiveRows as IncentiveStackRow[]) || defaultIncentiveRows()

  const applyStackRows = (nextDebtRows: DebtLocStackRow[], nextIncentiveRows: IncentiveStackRow[]) => {
    if (!input) return
    const locLimit = nextDebtRows.filter((r) => r.applyTo === 'loc-limit').reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
    const debtAmount = nextDebtRows.filter((r) => r.applyTo === 'debt-amount').reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
    const bondCapacity = nextDebtRows.filter((r) => r.applyTo === 'bond-capacity').reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
    const tifInfra = nextIncentiveRows.filter((r) => r.applyTo === 'infrastructure-reduction').reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
    const costReduction = nextIncentiveRows.filter((r) => r.applyTo === 'cost-reduction').reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
    const equitySource = nextIncentiveRows.filter((r) => r.applyTo === 'equity-source').reduce((sum, r) => sum + (Number(r.amount) || 0), 0)

    let next = deepMerge(input as any, {
      customStacks: {
        debtLocRows: nextDebtRows,
        incentiveRows: nextIncentiveRows,
      },
      debtService: {
        loanAmount: debtAmount,
      },
      forSalePhasedLoc: {
        fixedLocLimit: locLimit,
        bondCapacity,
        tifInfrastructureReduction: tifInfra,
        incentiveCostReduction: costReduction,
        incentiveEquitySource: equitySource,
      },
    } as any)
    if ((next.proFormaMode || 'general-development') === 'general-development') {
      next = syncLtcFromDebtAmount(next)
    }
    setInput(next)
  }

  const isDevelopmentMode =
    input?.proFormaMode === 'general-development' || input?.proFormaMode === 'for-sale-phased-loc'
  const phaseRows = input?.forSalePhasedLoc?.phases || []

  const addPhaseRow = () => {
    const next: ForSalePhaseInput = {
      id: uid(),
      name: `Phase ${phaseRows.length + 1}`,
      unitCount: 0,
      buildMonths: 0,
      presaleStartMonthOffset: 0,
      closeStartMonthOffset: 0,
      presaleTriggerPercent: 0,
      infrastructureAllocationPercent: 0,
      avgSalePrice: 0,
      hardCostBudget: 0,
      softCostBudget: 0,
      costEntryMode: 'auto',
    }
    setField('forSalePhasedLoc.phases', [...phaseRows, next])
  }

  const updatePhaseRow = (id: string, key: keyof ForSalePhaseInput, value: any) => {
    setField(
      'forSalePhasedLoc.phases',
      phaseRows.map((p) => (p.id === id ? { ...p, [key]: value } : p)),
    )
  }

  const removePhaseRow = (id: string) => {
    setField(
      'forSalePhasedLoc.phases',
      phaseRows.filter((p) => p.id !== id),
    )
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
      if (response.notesAppend && response.notesAppend.trim()) {
        setPendingNotesAppend(response.notesAppend.trim())
      }
      if (response.taskSuggestions && response.taskSuggestions.length > 0) {
        setPendingTaskSuggestions(response.taskSuggestions.map((t) => t.trim()).filter(Boolean))
      }
      const hasWorkspaceCaptureSuggestions =
        !!(response.notesAppend && response.notesAppend.trim()) ||
        !!(response.taskSuggestions && response.taskSuggestions.length > 0)

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
      const proj = calculateProForma(buildDealUnderwritingProject(selectedDeal), [], input)
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
    <div className="space-y-1 text-xs text-slate-300">
      <div className="font-semibold text-slate-200">Stage Guide</div>
      <div><span className="inline-block h-2 w-2 rounded-full bg-amber-500 mr-2" />Coaching</div>
      <div><span className="inline-block h-2 w-2 rounded-full bg-blue-500 mr-2" />Scenario</div>
      <div><span className="inline-block h-2 w-2 rounded-full bg-green-500 mr-2" />ProForma</div>
    </div>
  )

  if (loading || loadingDealState || !selectedDeal || !input) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading deal workspace...</div>
  }

  return (
    <div className="fixed inset-0 bg-slate-900 text-slate-100 flex flex-col">
      <div className="h-20 bg-slate-950 border-b border-slate-800 px-3 flex items-center">
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <Button variant="outline" size="sm" className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <span className="font-semibold truncate">{selectedDeal.deal_name}</span>
          <span className={`text-xs px-2 py-0.5 rounded border ${STAGE_COLOR[stage]}`}>{stage}</span>
        </div>
        <div className="flex items-center justify-center px-2">
          <div className="rounded-md bg-slate-900/70 ring-1 ring-slate-700/70 px-2 py-1 shadow-[0_0_0_1px_rgba(148,163,184,0.08),0_4px_14px_rgba(0,0,0,0.45)]">
            <img
              src={hshLogo}
              alt="HSH Contractor"
              className="h-[6rem] w-auto shrink-0 [filter:drop-shadow(0_1px_0_rgba(255,255,255,0.12))_drop-shadow(0_3px_8px_rgba(0,0,0,0.5))_saturate(1.08)_contrast(1.08)_brightness(1.03)]"
            />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-end gap-2">
          <Button variant="outline" size="sm" className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800" onClick={handleSaveVersion} disabled={saving}>
            <Save className="h-4 w-4 mr-1" />
            Save Version
          </Button>
          <Button variant="outline" size="sm" className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800" onClick={() => projection && exportProFormaToPDF(projection)} disabled={!projection}>
            <Download className="h-4 w-4 mr-1" />
            Export PDF
          </Button>
          <Button variant="outline" size="sm" className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800" onClick={() => projection && exportProFormaToExcel(projection)} disabled={!projection}>
            <Download className="h-4 w-4 mr-1" />
            Export Excel
          </Button>
          <Button size="sm" onClick={handleRunProForma} disabled={running}>
            <Play className="h-4 w-4 mr-1" />
            Run ProForma
          </Button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        <aside className="w-[220px] bg-slate-950 border-r border-slate-800 p-3 overflow-y-auto">
          <div className="text-xs uppercase text-slate-400 mb-2">Deals</div>
          <div className="space-y-2">
            {deals.map((d) => {
              const dStage = selectedDealStage(d)
              return (
                <button
                  key={d.id}
                  onClick={() => {
                    setSelectedDealId(d.id)
                    window.history.replaceState({}, '', `/deals/workspace/${d.id}`)
                  }}
                  className={`relative w-full text-left rounded border p-2 pl-3 ${selectedDealId === d.id ? 'border-blue-500 bg-blue-950/40' : 'border-slate-700 bg-slate-900 hover:bg-slate-800'}`}
                >
                  <span className={`absolute left-0 top-0 h-full w-1 rounded-l ${STAGE_DEAL_ACCENT[dStage]}`} />
                  <div className="font-medium text-sm truncate text-slate-100">{d.deal_name}</div>
                  <div className="text-xs text-slate-400 truncate">
                    {(d.unit_count || 0) > 0 ? `${d.unit_count} units` : 'Units TBD'} · {d.custom_type || d.type}
                  </div>
                  <div className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded border ${STAGE_COLOR[dStage]}`}>{dStage}</div>
                </button>
              )
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800">{stageLegend}</div>
        </aside>

        <main className="flex-1 min-w-0 p-3 overflow-y-auto bg-slate-900 [&_label]:text-[11px] [&_label]:text-slate-200 [&_input]:h-8 [&_input]:text-xs [&_input]:bg-slate-200 [&_input]:border-slate-300 [&_input]:text-slate-900 [&_input]:placeholder:text-slate-500 [&_button[role='combobox']]:h-8 [&_button[role='combobox']]:text-xs [&_button[role='combobox']]:bg-slate-200 [&_button[role='combobox']]:border-slate-300 [&_button[role='combobox']]:text-slate-900 [&_.rounded-md]:rounded-sm">
          <div className="mb-3 flex gap-2 border-b border-slate-800 pb-2">
            <Button size="sm" className={centerTab === 'overview' ? '' : 'bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700'} variant={centerTab === 'overview' ? 'default' : 'outline'} onClick={() => setCenterTab('overview')}>Overview</Button>
            <Button size="sm" className={centerTab === 'proforma' ? '' : 'bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700'} variant={centerTab === 'proforma' ? 'default' : 'outline'} onClick={() => setCenterTab('proforma')}>ProForma</Button>
            <Button size="sm" className={centerTab === 'notes' ? '' : 'bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700'} variant={centerTab === 'notes' ? 'default' : 'outline'} onClick={() => setCenterTab('notes')}>Notes</Button>
            <Button size="sm" className={centerTab === 'tasks' ? '' : 'bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700'} variant={centerTab === 'tasks' ? 'default' : 'outline'} onClick={() => setCenterTab('tasks')}>Tasks</Button>
            <Button size="sm" className={centerTab === 'activity' ? '' : 'bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700'} variant={centerTab === 'activity' ? 'default' : 'outline'} onClick={() => setCenterTab('activity')}>Activity</Button>
          </div>

          {centerTab === 'overview' && (
            <div className="space-y-3">
              <div className="mb-3">
                <div className="flex items-center justify-between text-sm text-slate-200">
                  <span>Model coverage</span>
                  <span className="font-semibold">{readiness.score}%</span>
                </div>
                <div className="w-full h-2 bg-slate-700 rounded mt-1">
                  <div className="h-2 bg-green-500 rounded" style={{ width: `${readiness.score}%` }} />
                </div>
                {readiness.proformaReady ? (
                  <p className="text-xs text-emerald-400 mt-2">All critical checks pass — you can run pro forma.</p>
                ) : (
                  <p className="text-xs text-slate-400 mt-2 leading-snug">
                    <span className="text-slate-300">Gaps: </span>
                    {readiness.blockers.slice(0, 5).join(' · ')}
                    {readiness.blockers.length > 5 ? ' …' : ''}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader className="py-3"><CardTitle className="text-base text-slate-200">Approx Equity Required</CardTitle></CardHeader>
                  <CardContent className="pt-0 text-xl font-semibold text-slate-100">${roughMetrics.equityRequired.toLocaleString('en-US', { maximumFractionDigits: 0 })}</CardContent>
                </Card>
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader className="py-3"><CardTitle className="text-base text-slate-200">Approx ROE</CardTitle></CardHeader>
                  <CardContent className="pt-0 text-xl font-semibold text-slate-100">{roughMetrics.roughIrr.toFixed(1)}%</CardContent>
                </Card>
              </div>
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="py-2"><CardTitle className="text-base text-slate-200">Deal Snapshot</CardTitle></CardHeader>
                <CardContent className="text-sm text-slate-200 space-y-1">
                  <div><strong>Deal:</strong> {selectedDeal.deal_name}</div>
                  <div><strong>Mode:</strong> {input.proFormaMode === 'rental-hold' ? 'rental-hold' : 'development'}</div>
                  <div><strong>Current Stage:</strong> {stage}</div>
                  <div><strong>Messages:</strong> {messages.length}</div>
                </CardContent>
              </Card>
            </div>
          )}

          {centerTab === 'proforma' && (
          <div className="space-y-3">
            {proformaView === 'memo' ? (
              <div className="flex w-full flex-col items-center gap-3">
                <div className="flex w-full flex-wrap justify-center gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => setProformaView('memo')}
                  >
                    Pro forma memo
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700"
                    onClick={() => setProformaView('assumptions')}
                  >
                    All assumptions
                  </Button>
                </div>
                <ProformaMemoView
                  dealName={selectedDeal.deal_name}
                  input={input}
                  projection={projection}
                  readiness={readiness}
                  onEditAssumptions={() => setProformaView('assumptions')}
                />
              </div>
            ) : (
              <>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700"
                onClick={() => setProformaView('memo')}
              >
                Pro forma memo
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={() => setProformaView('assumptions')}
              >
                All assumptions
              </Button>
            </div>
            {input.proFormaMode === 'general-development' && materialForSaleContext(input) && (
              <div className="rounded border border-amber-700/50 bg-amber-950/25 px-3 py-2 text-xs text-amber-100/90 leading-snug">
                For-sale LOC fields are filled while Mode is still general-development. Readiness includes those requirements. Switch Mode to{' '}
                <span className="font-medium text-amber-50">for-sale phased LOC</span> if this is primarily a sell-out / LOC draw model.
              </div>
            )}
          <div className="space-y-2">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="py-2"><CardTitle className="text-base text-slate-200">Deal Structure</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Mode</Label>
                  <Select value={input.proFormaMode === 'rental-hold' ? 'rental-hold' : input.proFormaMode === 'for-sale-phased-loc' ? 'for-sale-phased-loc' : 'general-development'} onValueChange={setModeSelection}>
                    <SelectTrigger className={fieldClass(fieldMeta['proFormaMode']?.status || 'empty')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rental-hold">rental-hold</SelectItem>
                      <SelectItem value="general-development">general-development</SelectItem>
                      <SelectItem value="for-sale-phased-loc">for-sale-phased-loc</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Contract Value</Label>
                  <Input className={fieldClass(fieldMeta['contractValue']?.status || 'empty')} value={input.contractValue || ''} onChange={(e) => setField('contractValue', parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <Label className="text-xs">Projection Months</Label>
                  <Input className={fieldClass(fieldMeta['projectionMonths']?.status || 'empty')} value={input.projectionMonths || ''} onChange={(e) => setField('projectionMonths', parseInt(e.target.value || '24', 10))} />
                </div>
                <div>
                  <Label className="text-xs">Construction Months</Label>
                  <Input className={fieldClass(fieldMeta['constructionMonths']?.status || 'empty')} value={input.constructionMonths || ''} onChange={(e) => setField('constructionMonths', parseInt(e.target.value || '0', 10))} />
                </div>
                <div>
                  <Label className="text-xs">Start Date</Label>
                  <Input type="date" className={fieldClass(fieldMeta['startDate']?.status || 'empty')} value={input.startDate ? new Date(input.startDate).toISOString().split('T')[0] : ''} onChange={(e) => setField('startDate', new Date(e.target.value))} />
                </div>
                <div>
                  <Label className="text-xs">Total Square Footage</Label>
                  <Input className={fieldClass(fieldMeta['totalProjectSquareFootage']?.status || 'empty')} value={input.totalProjectSquareFootage || ''} onChange={(e) => setField('totalProjectSquareFootage', parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <Label className="text-xs">Monthly Overhead</Label>
                  <Input className={fieldClass(fieldMeta['monthlyOverhead']?.status || 'empty')} value={input.monthlyOverhead || ''} onChange={(e) => setField('monthlyOverhead', parseFloat(e.target.value) || 0)} />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="py-2"><CardTitle className="text-base text-slate-200">Sources & Uses</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div><Label className="text-xs">Est. Construction Cost</Label><Input className={fieldClass(fieldMeta['underwritingEstimatedConstructionCost']?.status || 'empty')} value={input.underwritingEstimatedConstructionCost || ''} onChange={(e) => setField('underwritingEstimatedConstructionCost', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Land Cost</Label><Input className={fieldClass(fieldMeta['landCost']?.status || 'empty')} value={input.landCost || ''} onChange={(e) => setField('landCost', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Soft Cost %</Label><Input className={fieldClass(fieldMeta['softCostPercent']?.status || 'empty')} value={input.softCostPercent || ''} onChange={(e) => setField('softCostPercent', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Contingency %</Label><Input className={fieldClass(fieldMeta['contingencyPercent']?.status || 'empty')} value={input.contingencyPercent || ''} onChange={(e) => setField('contingencyPercent', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Loan To Cost %</Label><Input className={fieldClass(fieldMeta['loanToCostPercent']?.status || 'empty')} value={input.loanToCostPercent || ''} onChange={(e) => setField('loanToCostPercent', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Debt Amount</Label><Input className={fieldClass(fieldMeta['debtService.loanAmount']?.status || 'empty')} value={input.debtService.loanAmount || ''} onChange={(e) => setField('debtService.loanAmount', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Debt Interest Rate %</Label><Input className={fieldClass(fieldMeta['debtService.interestRate']?.status || 'empty')} value={input.debtService.interestRate || ''} onChange={(e) => setField('debtService.interestRate', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Debt Term (months)</Label><Input className={fieldClass(fieldMeta['debtService.loanTermMonths']?.status || 'empty')} value={input.debtService.loanTermMonths || ''} onChange={(e) => setField('debtService.loanTermMonths', parseInt(e.target.value || '0', 10))} /></div>
                {input.proFormaMode === 'general-development' && (
                  <p className="text-xs text-slate-400 md:col-span-2 pt-1 leading-snug">
                    Loan to cost and debt amount stay in sync: changing either updates the other from total uses (hard + land + soft + contingency), same as the pro forma engine.
                  </p>
                )}
              </CardContent>
            </Card>

            {isDevelopmentMode && (
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="py-2"><CardTitle className="text-base text-slate-200">Development + Phases</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div><Label className="text-xs">For-Sale Units</Label><Input className={fieldClass(fieldMeta['forSalePhasedLoc.totalUnits']?.status || 'empty')} value={input.forSalePhasedLoc?.totalUnits || ''} onChange={(e) => setField('forSalePhasedLoc.totalUnits', parseInt(e.target.value || '0', 10))} /></div>
                  <div><Label className="text-xs">Avg Sale Price</Label><Input className={fieldClass(fieldMeta['forSalePhasedLoc.averageSalePrice']?.status || 'empty')} value={input.forSalePhasedLoc?.averageSalePrice || ''} onChange={(e) => setField('forSalePhasedLoc.averageSalePrice', parseFloat(e.target.value) || 0)} /></div>
                  <div><Label className="text-xs">Presale Deposit %</Label><Input className={fieldClass(fieldMeta['forSalePhasedLoc.presaleDepositPercent']?.status || 'empty')} value={input.forSalePhasedLoc?.presaleDepositPercent || ''} onChange={(e) => setField('forSalePhasedLoc.presaleDepositPercent', parseFloat(e.target.value) || 0)} /></div>
                  <div><Label className="text-xs">Sales Pace (units/mo)</Label><Input className={fieldClass(fieldMeta['forSalePhasedLoc.salesPaceUnitsPerMonth']?.status || 'empty')} value={input.forSalePhasedLoc?.salesPaceUnitsPerMonth || ''} onChange={(e) => setField('forSalePhasedLoc.salesPaceUnitsPerMonth', parseFloat(e.target.value) || 0)} /></div>
                  <div><Label className="text-xs">LOC LTC Cap %</Label><Input className={fieldClass(fieldMeta['forSalePhasedLoc.ltcPercent']?.status || 'empty')} value={input.forSalePhasedLoc?.ltcPercent || ''} onChange={(e) => setField('forSalePhasedLoc.ltcPercent', parseFloat(e.target.value) || 0)} /></div>
                  <div><Label className="text-xs">Fixed LOC Limit</Label><Input className={fieldClass(fieldMeta['forSalePhasedLoc.fixedLocLimit']?.status || 'empty')} value={input.forSalePhasedLoc?.fixedLocLimit || ''} onChange={(e) => setField('forSalePhasedLoc.fixedLocLimit', parseFloat(e.target.value) || 0)} /></div>
                  <div><Label className="text-xs">Infrastructure Cost</Label><Input className={fieldClass(fieldMeta['forSalePhasedLoc.infrastructureCost']?.status || 'empty')} value={input.forSalePhasedLoc?.infrastructureCost || ''} onChange={(e) => setField('forSalePhasedLoc.infrastructureCost', parseFloat(e.target.value) || 0)} /></div>
                </CardContent>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs">Phase Rows</Label>
                    <Button size="sm" variant="outline" onClick={addPhaseRow}>Add Phase</Button>
                  </div>
                  <div className="space-y-2">
                    {phaseRows.length === 0 && <div className="text-xs text-gray-500">No phases added yet.</div>}
                    {phaseRows.map((phase) => (
                      <div key={phase.id} className="grid grid-cols-1 md:grid-cols-6 gap-1.5 border border-slate-700 rounded p-1.5 bg-slate-900/60">
                        <div><Label className="text-xs">Name</Label><Input value={phase.name || ''} onChange={(e) => updatePhaseRow(phase.id, 'name', e.target.value)} /></div>
                        <div><Label className="text-xs">Units</Label><Input value={phase.unitCount || ''} onChange={(e) => updatePhaseRow(phase.id, 'unitCount', parseInt(e.target.value || '0', 10))} /></div>
                        <div><Label className="text-xs">Build Months</Label><Input value={phase.buildMonths || ''} onChange={(e) => updatePhaseRow(phase.id, 'buildMonths', parseInt(e.target.value || '0', 10))} /></div>
                        <div><Label className="text-xs">Presale Start</Label><Input value={phase.presaleStartMonthOffset || ''} onChange={(e) => updatePhaseRow(phase.id, 'presaleStartMonthOffset', parseInt(e.target.value || '0', 10))} /></div>
                        <div><Label className="text-xs">Close Start</Label><Input value={phase.closeStartMonthOffset || ''} onChange={(e) => updatePhaseRow(phase.id, 'closeStartMonthOffset', parseInt(e.target.value || '0', 10))} /></div>
                        <div><Label className="text-xs">Trigger %</Label><Input value={phase.presaleTriggerPercent || ''} onChange={(e) => updatePhaseRow(phase.id, 'presaleTriggerPercent', parseFloat(e.target.value) || 0)} /></div>
                        <div><Label className="text-xs">Infra %</Label><Input value={phase.infrastructureAllocationPercent || ''} onChange={(e) => updatePhaseRow(phase.id, 'infrastructureAllocationPercent', parseFloat(e.target.value) || 0)} /></div>
                        <div><Label className="text-xs">Hard Cost Budget</Label><Input value={phase.hardCostBudget || ''} onChange={(e) => updatePhaseRow(phase.id, 'hardCostBudget', parseFloat(e.target.value) || 0)} /></div>
                        <div><Label className="text-xs">Soft Cost Budget</Label><Input value={phase.softCostBudget || ''} onChange={(e) => updatePhaseRow(phase.id, 'softCostBudget', parseFloat(e.target.value) || 0)} /></div>
                        <div><Label className="text-xs">Avg Sale Price</Label><Input value={phase.avgSalePrice || ''} onChange={(e) => updatePhaseRow(phase.id, 'avgSalePrice', parseFloat(e.target.value) || 0)} /></div>
                        <div>
                          <Label className="text-xs">Cost Mode</Label>
                          <Select value={phase.costEntryMode || 'auto'} onValueChange={(v) => updatePhaseRow(phase.id, 'costEntryMode', v as 'auto' | 'manual')}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">auto</SelectItem>
                              <SelectItem value="manual">manual</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-end"><Button size="sm" variant="outline" onClick={() => removePhaseRow(phase.id)}>Remove</Button></div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {isDevelopmentMode && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="py-2"><CardTitle className="text-base text-slate-200">Capital Stack & Incentive Stack</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-slate-300">Debt / LOC Stack</Label>
                  <div className="mt-1 grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div><Label className="text-xs">Project LTC %</Label><Input className={fieldClass(fieldMeta['loanToCostPercent']?.status || 'empty')} value={input.loanToCostPercent || ''} onChange={(e) => setField('loanToCostPercent', parseFloat(e.target.value) || 0)} /></div>
                    <div><Label className="text-xs">LOC LTC Cap %</Label><Input className={fieldClass(fieldMeta['forSalePhasedLoc.ltcPercent']?.status || 'empty')} value={input.forSalePhasedLoc?.ltcPercent || ''} onChange={(e) => setField('forSalePhasedLoc.ltcPercent', parseFloat(e.target.value) || 0)} /></div>
                    <div><Label className="text-xs">LOC Limit (from stack)</Label><Input value={input.forSalePhasedLoc?.fixedLocLimit || 0} readOnly /></div>
                    <div><Label className="text-xs">Debt Amount (from stack)</Label><Input value={input.debtService?.loanAmount || 0} readOnly /></div>
                  </div>
                  <div className="mt-2 space-y-2">
                    {debtLocRows.map((row) => (
                      <div key={row.id} className="grid grid-cols-1 md:grid-cols-12 gap-2">
                        <div className="md:col-span-5">
                          <Label className="text-xs">Stack Name</Label>
                          <Input
                            value={row.label}
                            onChange={(e) => {
                              const next = debtLocRows.map((r) => (r.id === row.id ? { ...r, label: e.target.value } : r))
                              applyStackRows(next, incentiveRows)
                            }}
                          />
                        </div>
                        <div className="md:col-span-3">
                          <Label className="text-xs">Amount</Label>
                          <Input
                            value={row.amount || ''}
                            onChange={(e) => {
                              const next = debtLocRows.map((r) => (r.id === row.id ? { ...r, amount: parseFloat(e.target.value) || 0 } : r))
                              applyStackRows(next, incentiveRows)
                            }}
                          />
                        </div>
                        <div className="md:col-span-3">
                          <Label className="text-xs">Applies To</Label>
                          <Select
                            value={row.applyTo}
                            onValueChange={(v) => {
                              const next = debtLocRows.map((r) => (r.id === row.id ? { ...r, applyTo: v as DebtLocApplyTo } : r))
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
                      size="sm"
                      variant="outline"
                      onClick={() => applyStackRows([...debtLocRows, { id: uid(), label: '', amount: 0, applyTo: 'loc-limit' }], incentiveRows)}
                    >
                      Add Debt/LOC Stack
                    </Button>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-slate-300">Incentive Stack</Label>
                  <div className="mt-1 space-y-2">
                    {incentiveRows.map((row) => (
                      <div key={row.id} className="grid grid-cols-1 md:grid-cols-12 gap-2">
                        <div className="md:col-span-5">
                          <Label className="text-xs">Incentive Name</Label>
                          <Input
                            value={row.label}
                            onChange={(e) => {
                              const next = incentiveRows.map((r) => (r.id === row.id ? { ...r, label: e.target.value } : r))
                              applyStackRows(debtLocRows, next)
                            }}
                          />
                        </div>
                        <div className="md:col-span-3">
                          <Label className="text-xs">Amount</Label>
                          <Input
                            value={row.amount || ''}
                            onChange={(e) => {
                              const next = incentiveRows.map((r) => (r.id === row.id ? { ...r, amount: parseFloat(e.target.value) || 0 } : r))
                              applyStackRows(debtLocRows, next)
                            }}
                          />
                        </div>
                        <div className="md:col-span-3">
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
                      </div>
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => applyStackRows(debtLocRows, [...incentiveRows, { id: uid(), label: '', amount: 0, applyTo: 'cost-reduction' }])}
                    >
                      Add Incentive
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            )}

            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="py-2"><CardTitle className="text-base text-slate-200">Readiness</CardTitle></CardHeader>
              <CardContent className="text-sm text-slate-200">
                {readiness.proformaReady
                  ? 'All critical underwriting checks pass — you can run ProForma when the AI confirms stage.'
                  : 'Fill the gaps listed on Overview / memo until coverage is complete, then run ProForma.'}
              </CardContent>
            </Card>

            {input.proFormaMode === 'rental-hold' && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="py-2"><CardTitle className="text-base text-slate-200">Operations & Debt (Expanded)</CardTitle></CardHeader>
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

            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="py-2"><CardTitle className="text-base text-slate-200">Exit, Waterfall & Tax (Expanded)</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div><Label className="text-xs">Exit Cap Rate %</Label><Input className={fieldClass(fieldMeta['exitCapRate']?.status || 'empty')} value={input.exitCapRate || ''} onChange={(e) => setField('exitCapRate', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Refinance LTV %</Label><Input className={fieldClass(fieldMeta['refinanceLTVPercent']?.status || 'empty')} value={input.refinanceLTVPercent || ''} onChange={(e) => setField('refinanceLTVPercent', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">LP Equity %</Label><Input className={fieldClass(fieldMeta['lpEquityPercent']?.status || 'empty')} value={input.lpEquityPercent || ''} onChange={(e) => setField('lpEquityPercent', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">LP Preferred Return %</Label><Input className={fieldClass(fieldMeta['lpPreferredReturnPercent']?.status || 'empty')} value={input.lpPreferredReturnPercent || ''} onChange={(e) => setField('lpPreferredReturnPercent', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">LP Above-Pref Share %</Label><Input className={fieldClass(fieldMeta['lpAbovePrefProfitSharePercent']?.status || 'empty')} value={input.lpAbovePrefProfitSharePercent || ''} onChange={(e) => setField('lpAbovePrefProfitSharePercent', parseFloat(e.target.value) || 0)} /></div>
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

            {isDevelopmentMode && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="py-2"><CardTitle className="text-base text-slate-200">For-Sale LOC Advanced</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Sales Pace Mode</Label>
                  <Select value={input.forSalePhasedLoc?.salesPaceMode || 'combined'} onValueChange={(v) => setField('forSalePhasedLoc.salesPaceMode', v)}>
                    <SelectTrigger className={fieldClass(fieldMeta['forSalePhasedLoc.salesPaceMode']?.status || 'empty')}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="combined">combined</SelectItem><SelectItem value="presales">presales</SelectItem><SelectItem value="closings">closings</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Deposit Usage Mode</Label>
                  <Select value={input.forSalePhasedLoc?.depositUsageMode || 'full'} onValueChange={(v) => setField('forSalePhasedLoc.depositUsageMode', v)}>
                    <SelectTrigger className={fieldClass(fieldMeta['forSalePhasedLoc.depositUsageMode']?.status || 'empty')}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="full">full</SelectItem><SelectItem value="percent">percent</SelectItem><SelectItem value="at-closing">at-closing</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Deposit Usable %</Label><Input className={fieldClass(fieldMeta['forSalePhasedLoc.depositUsablePercent']?.status || 'empty')} value={input.forSalePhasedLoc?.depositUsablePercent || ''} onChange={(e) => setField('forSalePhasedLoc.depositUsablePercent', parseFloat(e.target.value) || 0)} /></div>
                <div>
                  <Label className="text-xs">Construction Spend Curve</Label>
                  <Select value={input.forSalePhasedLoc?.constructionSpendCurve || 'linear'} onValueChange={(v) => setField('forSalePhasedLoc.constructionSpendCurve', v)}>
                    <SelectTrigger className={fieldClass(fieldMeta['forSalePhasedLoc.constructionSpendCurve']?.status || 'empty')}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="linear">linear</SelectItem><SelectItem value="front-loaded">front-loaded</SelectItem><SelectItem value="back-loaded">back-loaded</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Trigger Uses Presales</Label>
                  <Select value={input.forSalePhasedLoc?.triggerUsesPresales === false ? 'no' : 'yes'} onValueChange={(v) => setField('forSalePhasedLoc.triggerUsesPresales', v === 'yes')}>
                    <SelectTrigger className={fieldClass(fieldMeta['forSalePhasedLoc.triggerUsesPresales']?.status || 'empty')}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Bond LTC Override %</Label><Input className={fieldClass(fieldMeta['forSalePhasedLoc.bondLtcOverridePercent']?.status || 'empty')} value={input.forSalePhasedLoc?.bondLtcOverridePercent || ''} onChange={(e) => setField('forSalePhasedLoc.bondLtcOverridePercent', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Bond Rate %</Label><Input className={fieldClass(fieldMeta['forSalePhasedLoc.bondRatePercent']?.status || 'empty')} value={input.forSalePhasedLoc?.bondRatePercent || ''} onChange={(e) => setField('forSalePhasedLoc.bondRatePercent', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Bond Capacity</Label><Input className={fieldClass(fieldMeta['forSalePhasedLoc.bondCapacity']?.status || 'empty')} value={input.forSalePhasedLoc?.bondCapacity || ''} onChange={(e) => setField('forSalePhasedLoc.bondCapacity', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">LOC Paydown %</Label><Input className={fieldClass(fieldMeta['forSalePhasedLoc.salesAllocationBuckets.locPaydownPercent']?.status || 'empty')} value={input.forSalePhasedLoc?.salesAllocationBuckets?.locPaydownPercent || ''} onChange={(e) => setField('forSalePhasedLoc.salesAllocationBuckets.locPaydownPercent', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Reinvest %</Label><Input className={fieldClass(fieldMeta['forSalePhasedLoc.salesAllocationBuckets.reinvestPercent']?.status || 'empty')} value={input.forSalePhasedLoc?.salesAllocationBuckets?.reinvestPercent || ''} onChange={(e) => setField('forSalePhasedLoc.salesAllocationBuckets.reinvestPercent', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Reserve %</Label><Input className={fieldClass(fieldMeta['forSalePhasedLoc.salesAllocationBuckets.reservePercent']?.status || 'empty')} value={input.forSalePhasedLoc?.salesAllocationBuckets?.reservePercent || ''} onChange={(e) => setField('forSalePhasedLoc.salesAllocationBuckets.reservePercent', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Distribution %</Label><Input className={fieldClass(fieldMeta['forSalePhasedLoc.salesAllocationBuckets.distributionPercent']?.status || 'empty')} value={input.forSalePhasedLoc?.salesAllocationBuckets?.distributionPercent || ''} onChange={(e) => setField('forSalePhasedLoc.salesAllocationBuckets.distributionPercent', parseFloat(e.target.value) || 0)} /></div>
              </CardContent>
            </Card>
            )}
          </div>
              </>
            )}
          </div>
          )}

          {centerTab === 'notes' && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="py-2"><CardTitle className="text-base text-slate-200">Deal Notes</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Capture owner notes, calls, commitments, and follow-ups..."
                  className="min-h-[260px]"
                />
                <div className="text-xs text-slate-300">Autosaves to workspace notes for this deal.</div>
              </CardContent>
            </Card>
          )}

          {centerTab === 'tasks' && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="py-2"><CardTitle className="text-base text-slate-200">Deal Tasks</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Textarea
                  value={tasksDraft}
                  onChange={(e) => setTasksDraft(e.target.value)}
                  placeholder={"Track next actions (one per line), owners, and due dates...\nExample: Verify TIF disbursement timing - Mike - 2026-05-01"}
                  className="min-h-[260px]"
                />
                <div className="text-xs text-slate-300">Autosaves to workspace tasks for this deal.</div>
              </CardContent>
            </Card>
          )}

          {centerTab === 'activity' && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="py-2"><CardTitle className="text-base text-slate-200">Activity Timeline</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {activityEvents.slice(0, 60).map((a) => (
                  <div key={a.id} className="border border-slate-700 rounded p-2 text-xs bg-slate-900">
                    <div className="font-semibold uppercase text-[10px] text-slate-400">{a.eventType}</div>
                    <div className="text-slate-200 mt-0.5 whitespace-pre-wrap">{a.eventText}</div>
                    <div className="text-[10px] text-slate-500 mt-1">{new Date(a.createdAt).toLocaleString()}</div>
                  </div>
                ))}
                {activityEvents.length === 0 && <div className="text-xs text-slate-300">No activity yet. Chat, stage changes, runs, and saves will appear here.</div>}
              </CardContent>
            </Card>
          )}
        </main>

        <aside className="w-[340px] bg-slate-950 border-l border-slate-800 flex flex-col min-h-0">
          <div className="p-3 border-b border-slate-800">
            <div className="text-sm font-semibold">Deal Assistant</div>
            <div className="mt-2 flex gap-1 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700"
                onClick={() => handleSend('What am I missing?')}
              >
                What am I missing?
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700"
                onClick={() => handleSend('Run a scenario with conservative assumptions.')}
              >
                Run a scenario
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700"
                onClick={() => handleSend('Stress test this deal.')}
              >
                Stress test this
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700"
                onClick={() =>
                  handleSend(
                    'Summarize the current conversation into concise deal notes and a short actionable task list. Return notesAppend and taskSuggestions.',
                  )
                }
              >
                Summarize to Notes/Tasks
              </Button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
            {messages.map((m) => (
              <div key={m.id} className={`rounded border p-2 ${m.role === 'assistant' ? 'bg-slate-900 border-slate-700' : 'bg-blue-950/35 border-blue-800/60'}`}>
                <div className="text-xs uppercase text-slate-400 mb-1">{m.role}</div>
                <div className="text-sm text-slate-100 whitespace-pre-wrap">{m.text}</div>
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
              <div key={marker.id} className="text-center text-[11px] text-slate-400 py-1 border-y border-slate-700 bg-slate-800/50">
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
                  <Button size="sm" variant="outline" className="border-slate-600 text-slate-200 hover:bg-slate-700" onClick={() => setPendingSuggestions(null)}>Dismiss</Button>
                </div>
              </div>
            )}
            {(pendingNotesAppend || (pendingTaskSuggestions && pendingTaskSuggestions.length > 0)) && (
              <div className="rounded border border-blue-700/60 bg-blue-950/40 p-2">
                <div className="text-xs font-semibold text-blue-300">Suggested workspace capture</div>
                {!!pendingNotesAppend && (
                  <div className="mt-1">
                    <div className="text-[11px] font-semibold text-blue-300">Notes summary</div>
                    <div className="text-xs text-blue-200 whitespace-pre-wrap">{pendingNotesAppend}</div>
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
                    className="border-slate-600 text-slate-200 hover:bg-slate-700"
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
          <div className="p-3 border-t border-slate-800">
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
                className={isListening ? 'bg-green-900/40 border-green-600 text-green-200 hover:bg-green-800/50' : 'bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700'}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Textarea
                value={chatValue}
                onChange={(e) => setChatValue(e.target.value)}
                placeholder="Ask the deal assistant..."
                className="min-h-[42px] max-h-[120px] bg-slate-200 border-slate-300 text-slate-900 placeholder:text-slate-500"
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

