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
import type { ProFormaInput, ProFormaMode, ProFormaProjection } from '@/types/proforma'
import { fetchDeals } from '@/services/dealService'
import { loadDealProFormaInputs, saveDealProFormaDraft, saveDealProFormaVersion } from '@/services/supabaseService'
import { calculateProForma } from '@/services/proformaService'
import { exportProFormaToExcel, exportProFormaToPDF } from '@/services/proformaExportService'
import { supabase } from '@/lib/supabase'

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

interface CoachResponse {
  reply: string
  fieldUpdates?: Partial<ProFormaInput>
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

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`

const STAGE_COLOR: Record<WorkspaceStage, string> = {
  coaching: 'bg-amber-100 text-amber-800 border-amber-200',
  scenario: 'bg-blue-100 text-blue-800 border-blue-200',
  proforma: 'bg-green-100 text-green-800 border-green-200',
}

const REQUIRED_FIELDS_BY_MODE: Record<ProFormaMode, string[]> = {
  'rental-hold': [
    'projectId',
    'contractValue',
    'projectionMonths',
    'startDate',
    'includeRentalIncome',
    'rentalUnits',
    'includeOperatingExpenses',
    'operatingExpenses.propertyManagementPercent',
    'includeDebtService',
    'debtService.loanAmount',
  ],
  'general-development': [
    'projectId',
    'contractValue',
    'projectionMonths',
    'startDate',
    'useDevelopmentProforma',
    'underwritingEstimatedConstructionCost',
    'landCost',
    'softCostPercent',
    'contingencyPercent',
    'loanToCostPercent',
  ],
  'for-sale-phased-loc': [
    'projectId',
    'proFormaMode',
    'projectionMonths',
    'startDate',
    'forSalePhasedLoc.totalUnits',
    'forSalePhasedLoc.averageSalePrice',
    'forSalePhasedLoc.presaleDepositPercent',
    'forSalePhasedLoc.ltcPercent',
    'forSalePhasedLoc.fixedLocLimit',
    'forSalePhasedLoc.phases',
  ],
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
    metadata: { source: 'deal-pipeline', dealId: deal.id },
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
    constructionMonths: 0,
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

function getByPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj)
}

function isPopulated(value: any): boolean {
  if (value == null) return false
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  if (value instanceof Date) return !Number.isNaN(value.getTime())
  if (typeof value === 'boolean') return true
  if (typeof value === 'object') return Object.keys(value).length > 0
  return false
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
  'forSaleUnits.unitCount': 'forSalePhasedLoc.totalUnits',
  'forSaleUnits.pricePerUnit': 'forSalePhasedLoc.averageSalePrice',
  'forSaleUnits.salesPacePerMonth': 'forSalePhasedLoc.salesPaceUnitsPerMonth',
  // common shorthand aliases
  ltcPercent: 'loanToCostPercent',
  constructionDurationMonths: 'constructionMonths',
  hardCosts: 'underwritingEstimatedConstructionCost',
}

function normalizeCoachUpdates(updates: Partial<ProFormaInput>): Partial<ProFormaInput> {
  const flattened = flattenFieldUpdates((updates || {}) as Record<string, any>)
  const normalized: Record<string, any> = {}
  flattened.forEach(({ path, value }) => {
    const targetPath = COACH_PATH_ALIASES[path] || path
    setByPath(normalized, targetPath, value)
  })
  return normalized as Partial<ProFormaInput>
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
  'forSalePhasedLoc.drawInterestRateAnnual': 'LOC Interest Rate (annual %)',
  'forSalePhasedLoc.phases': 'For-Sale Phases',
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

function getStageFromConfidence(confidence: number): WorkspaceStage {
  if (confidence >= 85) return 'proforma'
  if (confidence >= 45) return 'scenario'
  return 'coaching'
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
  "confidence": 0.0-1.0,
  "stageSuggestion": "coaching|scenario|proforma"
}
Rules:
- Respect modes: rental-hold, general-development, for-sale-phased-loc.
- Ask clarifying questions before writing uncertain mode-specific fields.
- Use high confidence only for explicit user-provided values.
- Keep numeric fields numeric and nested objects valid.
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
  const [fieldMeta, setFieldMeta] = useState<Record<string, FieldMeta>>({})
  const [chatValue, setChatValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [loadingDealState, setLoadingDealState] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<any>(null)
  const autosaveTimerRef = useRef<number | null>(null)
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
      setLoadingDealState(true)
      const saved = await loadDealProFormaInputs(selectedDeal.id)
      if (saved) {
        const restored = saved as any
        const restoredInput: ProFormaInput = {
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
            text: `Let's coach this deal. Start by telling me what you know about "${selectedDeal.deal_name}" and I will populate the model as we go.`,
            createdAt: new Date().toISOString(),
          },
        ])
        setFieldMeta({})
      }
      setProjection(null)
      setPendingSuggestions(null)
      setMarkers([])
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

  const confidence = useMemo(() => {
    if (!input) return 0
    const mode = (input.proFormaMode || 'general-development') as ProFormaMode
    const required = REQUIRED_FIELDS_BY_MODE[mode]
    const populated = required.filter((path) => isPopulated(getByPath(input, path))).length
    return Math.round((populated / Math.max(1, required.length)) * 100)
  }, [input])

  const roughMetrics = useMemo(() => {
    if (!input) return { equityRequired: 0, roughIrr: 0 }
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
    const next: any = { ...input }
    let cur: any = next
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]
      cur[k] = cur[k] ? { ...cur[k] } : {}
      cur = cur[k]
    }
    cur[keys[keys.length - 1]] = value
    setInput(next)
    setFieldMeta((prev) => ({
      ...prev,
      [path]: { status: 'confirmed', source: 'user', updatedAt: new Date().toISOString() },
    }))
  }

  const applyUpdates = (updates: Partial<ProFormaInput>, source: 'ai' | 'user', status: FieldStatus) => {
    if (!input) return []
    const normalizedUpdates = normalizeCoachUpdates(updates)
    const next = deepMerge(input as any, normalizedUpdates as any)
    setInput(next)
    const flattened = flattenFieldUpdates(normalizedUpdates as any)
    const chips = flattened.map((u) => `${toHumanFieldLabel(u.path)}: ${formatValue(u.value, u.path)}`)
    const now = new Date().toISOString()
    setFieldMeta((prev) => {
      const copy = { ...prev }
      flattened.forEach(({ path }) => {
        copy[path] = { status, source, updatedAt: now }
      })
      return copy
    })
    return chips
  }

  const addStageMarkerIfChanged = (nextStage: WorkspaceStage) => {
    if (nextStage === stage) return
    setMarkers((prev) => [...prev, { id: uid(), stage: nextStage, createdAt: new Date().toISOString() }])
    setStage(nextStage)
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

    try {
      const response = await invokeDealCoach({
        deal: selectedDeal,
        stage,
        currentInput: input,
        history: [...messages, userMsg],
        userMessage: userText,
      })

      const aiConfidence = response.confidence ?? 0
      let chips: string[] = []
      if (response.fieldUpdates && Object.keys(response.fieldUpdates).length > 0) {
        const normalizedUpdates = normalizeCoachUpdates(response.fieldUpdates)
        if (aiConfidence >= 0.85) {
          chips = applyUpdates(normalizedUpdates, 'ai', 'confirmed')
        } else {
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

      const nextStage = response.stageSuggestion || getStageFromConfidence(confidence)
      if (nextStage !== 'proforma') {
        addStageMarkerIfChanged(nextStage)
      }

      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'assistant',
          text: response.reply || 'I updated the model state.',
          extractionChips: chips,
          createdAt: new Date().toISOString(),
        },
      ])
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'assistant',
          text:
            `I could not reach the deal coach function. ${error?.message || 'Please verify Supabase edge function "deal-coach-chat".'}`,
          createdAt: new Date().toISOString(),
        },
      ])
    }
  }

  const handleRunProForma = () => {
    if (!selectedDeal || !input) return
    setRunning(true)
    try {
      const proj = calculateProForma(buildDealUnderwritingProject(selectedDeal), [], input)
      setProjection(proj)
      setStage('proforma')
      setMarkers((prev) => [...prev, { id: uid(), stage: 'proforma', createdAt: new Date().toISOString() }])
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
    <div className="space-y-1 text-xs">
      <div className="font-semibold text-gray-700">Stage Guide</div>
      <div><span className="inline-block h-2 w-2 rounded-full bg-amber-500 mr-2" />Coaching</div>
      <div><span className="inline-block h-2 w-2 rounded-full bg-blue-500 mr-2" />Scenario</div>
      <div><span className="inline-block h-2 w-2 rounded-full bg-green-500 mr-2" />ProForma</div>
    </div>
  )

  if (loading || loadingDealState || !selectedDeal || !input) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading deal workspace...</div>
  }

  return (
    <div className="fixed inset-0 bg-gray-100 flex flex-col">
      <div className="h-12 bg-white border-b px-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <span className="font-semibold truncate">{selectedDeal.deal_name}</span>
          <span className={`text-xs px-2 py-0.5 rounded border ${STAGE_COLOR[stage]}`}>{stage}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSaveVersion} disabled={saving}>
            <Save className="h-4 w-4 mr-1" />
            Save Version
          </Button>
          <Button variant="outline" size="sm" onClick={() => projection && exportProFormaToPDF(projection)} disabled={!projection}>
            <Download className="h-4 w-4 mr-1" />
            Export PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => projection && exportProFormaToExcel(projection)} disabled={!projection}>
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
        <aside className="w-[220px] bg-white border-r p-3 overflow-y-auto">
          <div className="text-xs uppercase text-gray-500 mb-2">Deals</div>
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
                  className={`w-full text-left rounded border p-2 ${selectedDealId === d.id ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`}
                >
                  <div className="font-medium text-sm truncate">{d.deal_name}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {(d.unit_count || 0) > 0 ? `${d.unit_count} units` : 'Units TBD'} · {d.custom_type || d.type}
                  </div>
                  <div className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded border ${STAGE_COLOR[dStage]}`}>{dStage}</div>
                </button>
              )
            })}
          </div>
          <div className="mt-4 pt-3 border-t">{stageLegend}</div>
        </aside>

        <main className="flex-1 min-w-0 p-3 overflow-y-auto">
          <div className="mb-3">
            <div className="flex items-center justify-between text-sm">
              <span>Readiness confidence</span>
              <span className="font-semibold">{confidence}%</span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded mt-1">
              <div className="h-2 bg-green-500 rounded" style={{ width: `${confidence}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">Approx Equity Required</CardTitle></CardHeader>
              <CardContent className="pt-0 text-xl font-semibold">${roughMetrics.equityRequired.toLocaleString('en-US', { maximumFractionDigits: 0 })}</CardContent>
            </Card>
            <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">Approx Project IRR</CardTitle></CardHeader>
              <CardContent className="pt-0 text-xl font-semibold">{roughMetrics.roughIrr.toFixed(1)}%</CardContent>
            </Card>
          </div>

          <div className="space-y-3">
            <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">Deal Structure</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Mode</Label>
                  <Select value={(input.proFormaMode || 'general-development')} onValueChange={(v) => setField('proFormaMode', v as ProFormaMode)}>
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
                  <Label className="text-xs">Start Date</Label>
                  <Input type="date" className={fieldClass(fieldMeta['startDate']?.status || 'empty')} value={input.startDate ? new Date(input.startDate).toISOString().split('T')[0] : ''} onChange={(e) => setField('startDate', new Date(e.target.value))} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">Sources & Uses</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div><Label className="text-xs">Est. Construction Cost</Label><Input className={fieldClass(fieldMeta['underwritingEstimatedConstructionCost']?.status || 'empty')} value={input.underwritingEstimatedConstructionCost || ''} onChange={(e) => setField('underwritingEstimatedConstructionCost', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Land Cost</Label><Input className={fieldClass(fieldMeta['landCost']?.status || 'empty')} value={input.landCost || ''} onChange={(e) => setField('landCost', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Soft Cost %</Label><Input className={fieldClass(fieldMeta['softCostPercent']?.status || 'empty')} value={input.softCostPercent || ''} onChange={(e) => setField('softCostPercent', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Contingency %</Label><Input className={fieldClass(fieldMeta['contingencyPercent']?.status || 'empty')} value={input.contingencyPercent || ''} onChange={(e) => setField('contingencyPercent', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Loan To Cost %</Label><Input className={fieldClass(fieldMeta['loanToCostPercent']?.status || 'empty')} value={input.loanToCostPercent || ''} onChange={(e) => setField('loanToCostPercent', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Debt Amount</Label><Input className={fieldClass(fieldMeta['debtService.loanAmount']?.status || 'empty')} value={input.debtService.loanAmount || ''} onChange={(e) => setField('debtService.loanAmount', parseFloat(e.target.value) || 0)} /></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">Phases</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div><Label className="text-xs">For-Sale Units</Label><Input className={fieldClass(fieldMeta['forSalePhasedLoc.totalUnits']?.status || 'empty')} value={input.forSalePhasedLoc?.totalUnits || ''} onChange={(e) => setField('forSalePhasedLoc.totalUnits', parseInt(e.target.value || '0', 10))} /></div>
                <div><Label className="text-xs">Avg Sale Price</Label><Input className={fieldClass(fieldMeta['forSalePhasedLoc.averageSalePrice']?.status || 'empty')} value={input.forSalePhasedLoc?.averageSalePrice || ''} onChange={(e) => setField('forSalePhasedLoc.averageSalePrice', parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">Presale Deposit %</Label><Input className={fieldClass(fieldMeta['forSalePhasedLoc.presaleDepositPercent']?.status || 'empty')} value={input.forSalePhasedLoc?.presaleDepositPercent || ''} onChange={(e) => setField('forSalePhasedLoc.presaleDepositPercent', parseFloat(e.target.value) || 0)} /></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">Readiness</CardTitle></CardHeader>
              <CardContent className="text-sm text-gray-700">
                {confidence >= 85 ? 'Ready to run ProForma. Confirm stage transition when prompted by AI.' : 'Continue coaching/scenario input until confidence is high enough.'}
              </CardContent>
            </Card>
          </div>
        </main>

        <aside className="w-[340px] bg-white border-l flex flex-col min-h-0">
          <div className="p-3 border-b">
            <div className="text-sm font-semibold">Deal Coach</div>
            <div className="mt-2 flex gap-1 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => handleSend('What am I missing?')}>What am I missing?</Button>
              <Button size="sm" variant="outline" onClick={() => handleSend('Run a scenario with conservative assumptions.')}>Run a scenario</Button>
              <Button size="sm" variant="outline" onClick={() => handleSend('Stress test this deal.')}>Stress test this</Button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
            {messages.map((m) => (
              <div key={m.id} className={`rounded border p-2 ${m.role === 'assistant' ? 'bg-gray-50 border-gray-200' : 'bg-blue-50 border-blue-200'}`}>
                <div className="text-xs uppercase text-gray-500 mb-1">{m.role}</div>
                <div className="text-sm whitespace-pre-wrap">{m.text}</div>
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
              <div key={marker.id} className="text-center text-[11px] text-gray-500 py-1 border-y bg-gray-50">
                {marker.stage === 'coaching' ? 'Deal coaching' : marker.stage === 'scenario' ? 'Scenario exploration' : 'ProForma build'}
              </div>
            ))}
            {pendingSuggestions && (
              <div className="rounded border border-amber-300 bg-amber-50 p-2">
                <div className="text-xs font-semibold text-amber-900">Suggested updates (review then apply)</div>
                <div className="mt-1 text-xs text-amber-800 space-y-1">
                  {flattenFieldUpdates(pendingSuggestions as any).map((u) => (
                    <div key={u.path}>{toHumanFieldLabel(u.path)}: {formatValue(u.value, u.path)}</div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => { applyUpdates(pendingSuggestions, 'ai', 'approx'); setPendingSuggestions(null) }}>Apply all</Button>
                  <Button size="sm" variant="outline" onClick={() => setPendingSuggestions(null)}>Dismiss</Button>
                </div>
              </div>
            )}
          </div>
          <div className="p-3 border-t">
            {stage !== 'proforma' && confidence >= 85 && (
              <div className="mb-2 rounded border border-green-300 bg-green-50 p-2 text-xs text-green-800">
                AI indicates readiness for ProForma stage.
                <div className="mt-1">
                  <Button size="sm" onClick={() => addStageMarkerIfChanged('proforma')}>Confirm transition</Button>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={isListening ? stopVoice : startVoice}
                className={isListening ? 'bg-green-100 border-green-300 text-green-800' : ''}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Textarea
                value={chatValue}
                onChange={(e) => setChatValue(e.target.value)}
                placeholder="Ask the deal coach..."
                className="min-h-[42px] max-h-[120px]"
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

