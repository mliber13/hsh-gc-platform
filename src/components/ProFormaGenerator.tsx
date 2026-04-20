// ============================================================================
// Pro Forma Generator
// ============================================================================
//
// Component for generating construction loan pro forma financial projections
//

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Project, Trade } from '@/types'
import {
  ProFormaInput,
  ProFormaProjection,
  PaymentMilestone,
  RentalLeaseTerm,
  RentalUnit,
  OperatingExpenses,
  DebtService,
  DealSummaryInputs,
  ProFormaMode,
  ForSalePhaseInput,
  SalesAllocationBuckets,
} from '@/types/proforma'
import { calculateProForma, generateDefaultMilestones } from '@/services/proformaService'
import { getTradesForEstimate_Hybrid } from '@/services/hybridService'
import { exportProFormaToPDF, exportProFormaToExcel } from '@/services/proformaExportService'
import {
  saveProFormaInputs as saveProFormaInputsDB,
  loadProFormaInputs as loadProFormaInputsDB,
  saveDealProFormaDraft,
  saveDealProFormaVersion,
  loadDealProFormaInputs,
  listDealProFormaVersions,
  type DealProFormaVersionMeta,
  saveProjectProFormaVersion,
  loadProjectProFormaVersionInputs,
  listProjectProFormaVersions,
  type ProjectProFormaVersionMeta,
} from '@/services/supabaseService'
import { isOnlineMode } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { X, Plus, Trash2, Download, FileText, Calendar, DollarSign } from 'lucide-react'
import { buildDealSummary } from '@/services/proformaSummaryService'
import { cn } from '@/lib/utils'

interface ProFormaGeneratorProps {
  project: Project
  onClose: () => void
}

type ForSaleIncentiveApplyTo =
  | 'infrastructure-reduction'
  | 'cost-reduction'
  | 'equity-source'
  | 'debt-service'
  | 'equity_source'
type ForSaleIncentiveSourceType = 'debt' | 'equity'
interface ForSaleIncentiveItem {
  id: string
  name: string
  amount: number
  applyTo: ForSaleIncentiveApplyTo
  sourceType: ForSaleIncentiveSourceType
}
type ForSaleDepositUsageMode = 'full' | 'percent' | 'at-closing'
type ForSaleSpendCurve = 'linear' | 'front-loaded' | 'back-loaded'

/** Dense worksheet controls — slightly above browser-default xs for readability */
const DENSE_INPUT = 'h-8 w-full min-w-0 py-0 text-[13px] leading-8 box-border'

const DATE_INPUT = `${DENSE_INPUT} [color-scheme:light]`

/** Fixed-height label rail: inputs align; long labels clip (use title= for full string) */
const WORKSHEET_LABEL =
  'flex h-[2.625rem] w-full max-w-full items-end overflow-hidden text-[13px] font-medium leading-snug text-slate-600'

/** Helper under inputs — compact; line-clamp avoids runaway height */
const FieldHelperSlot = ({ children }: { children?: React.ReactNode }) => (
  <div className="line-clamp-2 min-h-[0.875rem] max-w-full text-[11px] leading-tight text-slate-500">{children ?? null}</div>
)

/** Phase table: bottom-align controls across columns; nowrap labels so inputs stay on one baseline */
const PHASE_CELL = 'flex min-h-0 min-w-0 flex-col justify-end gap-0.5'
const PHASE_LABEL = 'block shrink-0 text-[13px] font-medium leading-none text-slate-600 whitespace-nowrap'

const FIELD_WIDTH = {
  compact: 'w-[104px] shrink-0',
  medium: 'w-[168px] shrink-0',
  large: 'w-[200px] shrink-0',
  /** Primary currency: limited growth so rows don’t turn into slabs */
  growLarge: 'min-w-[140px] max-w-[200px] grow shrink-0 basis-auto',
  growMedium: 'min-w-[120px] max-w-[168px] grow shrink-0 basis-auto',
  growWide: 'min-w-[160px] max-w-[260px] grow shrink-0 basis-auto',
  date: 'w-[138px] shrink-0',
  selectMonths: 'w-[176px] shrink-0',
  selectWide: 'w-[240px] shrink-0',
  percent: 'min-w-[72px] max-w-[120px] grow shrink-0 basis-auto',
} as const

function FormSurface({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`border-b border-slate-200 py-2 last:border-b-0 ${className}`.trim()}>{children}</div>
}

function FormSection({
  title,
  subtitle,
  children,
  className = '',
}: {
  title?: string
  subtitle?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      {title ? <h3 className="text-sm font-semibold leading-tight text-slate-900">{title}</h3> : null}
      {subtitle ? <p className="mt-0.5 text-[13px] leading-snug text-slate-500">{subtitle}</p> : null}
      <div className="mt-1 space-y-1">{children}</div>
    </div>
  )
}

function FormRow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex w-full min-w-0 flex-nowrap items-stretch gap-x-1.5 overflow-x-auto',
        className,
      )}
    >
      {children}
    </div>
  )
}

function FormField({
  width,
  className = '',
  children,
}: {
  width: keyof typeof FIELD_WIDTH | (string & {})
  className?: string
  children: React.ReactNode
}) {
  const w: string =
    width === 'compact'
      ? FIELD_WIDTH.compact
      : width === 'medium'
        ? FIELD_WIDTH.medium
        : width === 'large'
          ? FIELD_WIDTH.large
          : width === 'growLarge'
            ? FIELD_WIDTH.growLarge
            : width === 'growMedium'
              ? FIELD_WIDTH.growMedium
              : width === 'growWide'
                ? FIELD_WIDTH.growWide
                : width === 'date'
                  ? FIELD_WIDTH.date
                  : width === 'selectMonths'
                    ? FIELD_WIDTH.selectMonths
                    : width === 'selectWide'
                      ? FIELD_WIDTH.selectWide
                      : width === 'percent'
                        ? FIELD_WIDTH.percent
                        : width
  return (
    <div className={cn('flex min-h-0 min-w-0 flex-col gap-0.5 self-stretch', w, className)}>{children}</div>
  )
}

/** Section separator inside the worksheet (replaces legacy card stacks). */
function WorkspacePanel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`border-t border-slate-200 px-3 py-2 md:px-3 ${className}`.trim()}>{children}</div>
}

const GRID_FIELD_WIDTH = {
  xs: FIELD_WIDTH.compact,
  sm: 'w-[136px] shrink-0',
  md: FIELD_WIDTH.medium,
  lg: FIELD_WIDTH.large,
} as const

/** Single flex row of fixed-width fields (legacy name; prefer FormRow + FormField). */
function FormGrid({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex w-full min-w-0 flex-nowrap items-stretch gap-x-1.5 overflow-x-auto',
        className,
      )}
    >
      {children}
    </div>
  )
}

function GridField({
  size,
  className = '',
  children,
}: {
  size: keyof typeof GRID_FIELD_WIDTH
  className?: string
  children: React.ReactNode
}) {
  const w = GRID_FIELD_WIDTH[size]
  return (
    <div className={cn('flex min-h-0 min-w-0 flex-col gap-0.5 self-stretch', w, className)}>{children}</div>
  )
}

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-0.5">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {description ? <p className="text-xs text-slate-500">{description}</p> : null}
    </div>
  )
}

function ModeTabButton({
  active,
  label,
  onClick,
  block,
}: {
  active: boolean
  label: string
  onClick: () => void
  block?: boolean
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'default' : 'ghost'}
      className={`h-8 px-2.5 text-[13px] font-semibold tracking-wide ${active ? '' : 'text-slate-600'} ${block ? 'w-full justify-start' : ''}`.trim()}
      onClick={onClick}
    >
      {label}
    </Button>
  )
}

export function ProFormaGenerator({ project, onClose }: ProFormaGeneratorProps) {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [contractValue, setContractValue] = useState<number>(0)
  const lastSyncedTotalRef = useRef<number>(0) // Track the total we last synced with
  const [paymentMilestones, setPaymentMilestones] = useState<PaymentMilestone[]>([])
  const [monthlyOverhead, setMonthlyOverhead] = useState<number>(0)
  const [overheadMethod, setOverheadMethod] = useState<'proportional' | 'flat' | 'none'>('proportional')
  const [projectionMonths, setProjectionMonths] = useState<6 | 12 | 24 | 36 | 60 | 120>(12)
  const [startDate, setStartDate] = useState<string>(
    project.startDate 
      ? new Date(project.startDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]
  )
  const [projection, setProjection] = useState<ProFormaProjection | null>(null)
  
  // Rental income
  const [includeRentalIncome, setIncludeRentalIncome] = useState<boolean>(false)
  const [rentalUnits, setRentalUnits] = useState<RentalUnit[]>([])
  
  // Operating expenses
  const [includeOperatingExpenses, setIncludeOperatingExpenses] = useState<boolean>(false)
  const [operatingExpenses, setOperatingExpenses] = useState<OperatingExpenses>({
    propertyManagementPercent: 0,
    maintenanceReservePercent: 0,
    monthlyPropertyInsurance: 0,
    annualPropertyTax: 0,
    monthlyUtilities: 0,
    monthlyOther: 0,
  })
  
  // Debt service
  const [includeDebtService, setIncludeDebtService] = useState<boolean>(false)
  const [debtService, setDebtService] = useState<DebtService>({
    loanAmount: 0,
    interestRate: 0,
    loanTermMonths: 360, // 30 years default
    startDate: new Date(),
    paymentType: 'principal-interest',
  })
  
  // Construction completion
  const [constructionCompletionDate, setConstructionCompletionDate] = useState<string>('')
  
  // Full development proforma (Sources & Uses, Draw Schedule, IDC)
  const [useDevelopmentProforma, setUseDevelopmentProforma] = useState<boolean>(false)
  const [landCost, setLandCost] = useState<number>(0)
  const [siteWorkCost, setSiteWorkCost] = useState<number>(0)
  const [softCostPercent, setSoftCostPercent] = useState<number>(0)
  const [contingencyPercent, setContingencyPercent] = useState<number>(0)
  const [constructionMonthsInput, setConstructionMonthsInput] = useState<number>(0) // 0 = use date-based
  const [loanToCostPercent, setLoanToCostPercent] = useState<number>(0)
  const [exitCapRate, setExitCapRate] = useState<number>(0)
  const [refinanceLTVPercent, setRefinanceLTVPercent] = useState<number>(0)

  // LP–GP capital structure (Phase 3)
  const [lpEquityPercent, setLpEquityPercent] = useState<number>(50)
  const [lpPreferredReturnPercent, setLpPreferredReturnPercent] = useState<number>(8)
  const [lpAbovePrefProfitSharePercent, setLpAbovePrefProfitSharePercent] = useState<number>(70)

  // Tax modeling (optional)
  const [taxRatePercent, setTaxRatePercent] = useState<number>(0)
  const [annualDepreciation, setAnnualDepreciation] = useState<number>(0)

  // Display-only annual appreciation for value schedule (optional)
  const [annualAppreciationPercent, setAnnualAppreciationPercent] = useState<number>(0)
  type ValueMethod = 'stabilized' | 'noi-based'
  const [valueMethod, setValueMethod] = useState<ValueMethod>('stabilized')
  const [proFormaMode, setProFormaMode] = useState<ProFormaMode>('general-development')
  const [forSaleTotalUnits, setForSaleTotalUnits] = useState<number>(39)
  const [forSaleAverageSalePrice, setForSaleAverageSalePrice] = useState<number>(250000)
  const [forSalePresaleDepositPercent, setForSalePresaleDepositPercent] = useState<number>(5)
  const [forSaleTriggerUsesPresales, setForSaleTriggerUsesPresales] = useState<boolean>(true)
  const [forSaleSalesPaceUnitsPerMonth, setForSaleSalesPaceUnitsPerMonth] = useState<number>(0)
  const [forSaleDepositUsageMode, setForSaleDepositUsageMode] = useState<ForSaleDepositUsageMode>('full')
  const [forSaleDepositUsablePercent, setForSaleDepositUsablePercent] = useState<number>(100)
  const [forSaleConstructionSpendCurve, setForSaleConstructionSpendCurve] = useState<ForSaleSpendCurve>('linear')
  const [forSaleInfrastructureCost, setForSaleInfrastructureCost] = useState<number>(0)
  const [forSaleTotalHardBudget, setForSaleTotalHardBudget] = useState<number>(0)
  const [forSaleTotalSoftBudget, setForSaleTotalSoftBudget] = useState<number>(0)
  const [forSaleTifReduction, setForSaleTifReduction] = useState<number>(0)
  const [forSaleIncentives, setForSaleIncentives] = useState<ForSaleIncentiveItem[]>([])
  const [forSaleFixedLocLimit, setForSaleFixedLocLimit] = useState<number>(0)
  const [forSaleLtcPercent, setForSaleLtcPercent] = useState<number>(85)
  const [forSaleBondFinancingEnabled, setForSaleBondFinancingEnabled] = useState<boolean>(false)
  const [forSaleBondLtcOverridePercent, setForSaleBondLtcOverridePercent] = useState<number>(0)
  const [forSaleBondRatePercent, setForSaleBondRatePercent] = useState<number>(0)
  const [forSaleBondCapacity, setForSaleBondCapacity] = useState<number>(0)
  const [forSaleSalesBuckets, setForSaleSalesBuckets] = useState<SalesAllocationBuckets>({
    locPaydownPercent: 70,
    reinvestPercent: 20,
    reservePercent: 10,
    distributionPercent: 0,
  })
  const [forSalePhases, setForSalePhases] = useState<ForSalePhaseInput[]>([
    {
      id: uuidv4(),
      name: 'Phase 1',
      unitCount: 10,
      buildMonths: 12,
      presaleStartMonthOffset: 2,
      closeStartMonthOffset: 8,
      presaleTriggerPercent: 50,
      infrastructureAllocationPercent: undefined,
      landAllocationPercent: 0,
      siteWorkAllocationPercent: 0,
    },
  ])
  const isForSaleLocMode = proFormaMode === 'for-sale-phased-loc'

  const isDealUnderwriting =
    project.id.startsWith('deal-') ||
    project.metadata?.source === 'deal-pipeline' ||
    project.metadata?.source === 'deal-workspace'

  // Total project square footage
  const [totalProjectSquareFootage, setTotalProjectSquareFootage] = useState<number>(
    project.specs?.totalSquareFootage || project.specs?.livingSquareFootage || 0
  )

  // Deal underwriting-only estimated construction cost (UI + optional math fallback)
  const [underwritingEstimatedConstructionCost, setUnderwritingEstimatedConstructionCost] = useState<number>(0)
  // Attainable housing deal summary (display-only, primarily for deal underwriting mode)
  const [dealSummaryInputs, setDealSummaryInputs] = useState<DealSummaryInputs>({
    incentives: [],
    publicBenefits: [],
  })
  // Raw textarea value for public benefit bullets so users can freely add newlines
  const [publicBenefitsText, setPublicBenefitsText] = useState<string>('')
  const [dealProFormaVersions, setDealProFormaVersions] = useState<DealProFormaVersionMeta[]>([])
  const [selectedDealVersionId, setSelectedDealVersionId] = useState<string>('latest')
  const [projectProFormaVersions, setProjectProFormaVersions] = useState<ProjectProFormaVersionMeta[]>([])
  const [selectedProjectVersionId, setSelectedProjectVersionId] = useState<string>('latest')
  const [newVersionLabel, setNewVersionLabel] = useState<string>('')
  
  // Track if we've loaded saved data (to prevent overwriting with defaults)
  const [hasLoadedSavedData, setHasLoadedSavedData] = useState<boolean>(false)
  // Track if initial load is complete to prevent auto-update from interfering
  const initialLoadCompleteRef = useRef<boolean>(false)

  // Storage key for this project's pro forma inputs
  const storageKey = `hsh_gc_proforma_${project.id}`
  const dealIdForUnderwriting =
    isDealUnderwriting
      ? (project.metadata?.dealId as string | undefined) || project.id.replace(/^deal-/, '')
      : undefined

  // Interface for saved pro forma inputs (serialized to JSON)
  interface SavedProFormaInputsSerialized {
    proFormaMode?: ProFormaMode
    contractValue: number
    paymentMilestones: Array<Omit<PaymentMilestone, 'date'> & { date: string }>
    monthlyOverhead: number
    overheadMethod: 'proportional' | 'flat' | 'none'
    projectionMonths: 6 | 12 | 24 | 36 | 60 | 120
    startDate: string
    totalProjectSquareFootage?: number
    includeRentalIncome: boolean
    rentalUnits: Array<
      Omit<RentalUnit, 'occupancyStartDate' | 'occupancyEndDate' | 'leaseTerms'> & {
        occupancyStartDate?: string
        occupancyEndDate?: string
        leaseTerms?: Array<
          Omit<RentalLeaseTerm, 'startDate' | 'endDate'> & {
            startDate?: string
            endDate?: string
          }
        >
      }
    >
    includeOperatingExpenses: boolean
    operatingExpenses: OperatingExpenses
    includeDebtService: boolean
    debtService: Omit<DebtService, 'startDate'> & { startDate: string }
    constructionCompletionDate: string
    useDevelopmentProforma?: boolean
    landCost?: number
    siteWorkCost?: number
    softCostPercent?: number
    contingencyPercent?: number
    constructionMonths?: number
    loanToCostPercent?: number
    exitCapRate?: number
    refinanceLTVPercent?: number
    lpEquityPercent?: number
    lpPreferredReturnPercent?: number
    lpAbovePrefProfitSharePercent?: number
    taxRatePercent?: number
    annualDepreciation?: number
    annualAppreciationPercent?: number
    valueMethod?: ValueMethod
    underwritingEstimatedConstructionCost?: number
    dealSummaryInputs?: DealSummaryInputs
    forSaleTotalUnits?: number
    forSaleAverageSalePrice?: number
    forSalePresaleDepositPercent?: number
    forSaleTriggerUsesPresales?: boolean
    forSaleSalesPaceUnitsPerMonth?: number
    forSaleDepositUsageMode?: ForSaleDepositUsageMode
    forSaleDepositUsablePercent?: number
    forSaleConstructionSpendCurve?: ForSaleSpendCurve
    forSaleInfrastructureCost?: number
    forSaleTotalHardBudget?: number
    forSaleTotalSoftBudget?: number
    forSaleTifReduction?: number
    forSaleFixedLocLimit?: number
    forSaleLtcPercent?: number
    forSaleBondFinancingEnabled?: boolean
    forSaleBondLtcOverridePercent?: number
    forSaleBondRatePercent?: number
    forSaleBondCapacity?: number
    forSaleSalesBuckets?: SalesAllocationBuckets
    forSalePhases?: ForSalePhaseInput[]
    forSaleIncentives?: ForSaleIncentiveItem[]
  }

  // Interface for loaded pro forma inputs (deserialized with Date objects)
  interface SavedProFormaInputs {
    proFormaMode?: ProFormaMode
    contractValue: number
    paymentMilestones: PaymentMilestone[]
    monthlyOverhead: number
    overheadMethod: 'proportional' | 'flat' | 'none'
    projectionMonths: 6 | 12 | 24 | 36 | 60 | 120
    startDate: string
    totalProjectSquareFootage?: number
    includeRentalIncome: boolean
    rentalUnits: RentalUnit[]
    includeOperatingExpenses: boolean
    operatingExpenses: OperatingExpenses
    includeDebtService: boolean
    debtService: DebtService
    constructionCompletionDate: string
    useDevelopmentProforma?: boolean
    landCost?: number
    siteWorkCost?: number
    softCostPercent?: number
    contingencyPercent?: number
    constructionMonths?: number
    loanToCostPercent?: number
    exitCapRate?: number
    refinanceLTVPercent?: number
    lpEquityPercent?: number
    lpPreferredReturnPercent?: number
    lpAbovePrefProfitSharePercent?: number
    taxRatePercent?: number
    annualDepreciation?: number
    annualAppreciationPercent?: number
    valueMethod?: ValueMethod
    underwritingEstimatedConstructionCost?: number
    dealSummaryInputs?: DealSummaryInputs
    forSaleTotalUnits?: number
    forSaleAverageSalePrice?: number
    forSalePresaleDepositPercent?: number
    forSaleTriggerUsesPresales?: boolean
    forSaleSalesPaceUnitsPerMonth?: number
    forSaleDepositUsageMode?: ForSaleDepositUsageMode
    forSaleDepositUsablePercent?: number
    forSaleConstructionSpendCurve?: ForSaleSpendCurve
    forSaleInfrastructureCost?: number
    forSaleTotalHardBudget?: number
    forSaleTotalSoftBudget?: number
    forSaleTifReduction?: number
    forSaleFixedLocLimit?: number
    forSaleLtcPercent?: number
    forSaleBondFinancingEnabled?: boolean
    forSaleBondLtcOverridePercent?: number
    forSaleBondRatePercent?: number
    forSaleBondCapacity?: number
    forSaleSalesBuckets?: SalesAllocationBuckets
    forSalePhases?: ForSalePhaseInput[]
    forSaleIncentives?: ForSaleIncentiveItem[]
  }

  const buildSavedInputs = (): SavedProFormaInputsSerialized => ({
    proFormaMode,
    contractValue,
    paymentMilestones: paymentMilestones.map(m => ({
      ...m,
      date: m.date instanceof Date ? m.date.toISOString() : (m.date as any).toISOString(),
    })),
    monthlyOverhead,
    overheadMethod,
    projectionMonths,
    startDate,
    totalProjectSquareFootage,
    includeRentalIncome,
    rentalUnits: rentalUnits.map(u => ({
      ...u,
      occupancyStartDate: u.occupancyStartDate instanceof Date
        ? u.occupancyStartDate.toISOString()
        : u.occupancyStartDate,
      occupancyEndDate: u.occupancyEndDate instanceof Date
        ? u.occupancyEndDate.toISOString()
        : u.occupancyEndDate,
      leaseTerms: Array.isArray(u.leaseTerms)
        ? u.leaseTerms.map((term) => ({
            ...term,
            startDate: term.startDate instanceof Date ? term.startDate.toISOString() : term.startDate,
            endDate: term.endDate instanceof Date ? term.endDate.toISOString() : term.endDate,
          }))
        : undefined,
    })),
    includeOperatingExpenses,
    operatingExpenses,
    includeDebtService,
    debtService: {
      ...debtService,
      startDate: debtService.startDate instanceof Date
        ? debtService.startDate.toISOString()
        : (debtService.startDate as any).toISOString(),
    },
    constructionCompletionDate,
    useDevelopmentProforma,
    landCost,
    siteWorkCost,
    softCostPercent,
    contingencyPercent,
    constructionMonths: constructionMonthsInput || undefined,
    loanToCostPercent,
    exitCapRate,
    refinanceLTVPercent,
    lpEquityPercent,
    lpPreferredReturnPercent,
    lpAbovePrefProfitSharePercent,
    taxRatePercent,
    annualDepreciation,
    annualAppreciationPercent,
    valueMethod,
    underwritingEstimatedConstructionCost: isDealUnderwriting ? underwritingEstimatedConstructionCost : undefined,
    dealSummaryInputs: isDealUnderwriting ? dealSummaryInputs : undefined,
    forSaleTotalUnits,
    forSaleAverageSalePrice,
    forSalePresaleDepositPercent,
    forSaleTriggerUsesPresales,
    forSaleSalesPaceUnitsPerMonth: forSaleSalesPaceUnitsPerMonth || undefined,
    forSaleDepositUsageMode,
    forSaleDepositUsablePercent,
    forSaleConstructionSpendCurve,
    forSaleInfrastructureCost,
    forSaleTotalHardBudget,
    forSaleTotalSoftBudget,
    forSaleTifReduction,
    forSaleFixedLocLimit,
    forSaleLtcPercent,
    forSaleBondFinancingEnabled,
    forSaleBondLtcOverridePercent: forSaleBondLtcOverridePercent || undefined,
    forSaleBondRatePercent: forSaleBondRatePercent || undefined,
    forSaleBondCapacity: forSaleBondCapacity || undefined,
    forSaleSalesBuckets,
    forSalePhases,
    forSaleIncentives,
  })

  const refreshDealVersions = async () => {
    if (!isDealUnderwriting || !dealIdForUnderwriting || !isOnlineMode()) return
    const versions = await listDealProFormaVersions(dealIdForUnderwriting)
    setDealProFormaVersions(versions)
  }

  const refreshProjectVersions = async () => {
    if (isDealUnderwriting || !isOnlineMode()) return
    const versions = await listProjectProFormaVersions(project.id)
    setProjectProFormaVersions(versions)
  }

  // Save pro forma inputs to database or localStorage
  const saveProFormaInputs = async () => {
    try {
      const savedInputs = buildSavedInputs()

      // Try database first if online, fallback to localStorage
      if (isOnlineMode()) {
        const success =
          isDealUnderwriting && dealIdForUnderwriting
            ? await saveDealProFormaDraft(dealIdForUnderwriting, savedInputs as any)
            : await saveProFormaInputsDB(project.id, savedInputs as any)
        if (!success) {
          // Fallback to localStorage if database save fails
          localStorage.setItem(storageKey, JSON.stringify(savedInputs))
        } else if (isDealUnderwriting) {
          await refreshDealVersions()
        }
      } else {
        localStorage.setItem(storageKey, JSON.stringify(savedInputs))
      }
    } catch (error) {
      console.error('Error saving pro forma inputs:', error)
      // Fallback to localStorage on error
      try {
        const savedInputs = buildSavedInputs()
        localStorage.setItem(storageKey, JSON.stringify(savedInputs))
      } catch (localError) {
        console.error('Error saving to localStorage fallback:', localError)
      }
    }
  }

  // Load saved pro forma inputs from database or localStorage
  const loadProFormaInputs = async (): Promise<SavedProFormaInputs | null> => {
    try {
      // Try database first if online
      if (isOnlineMode()) {
        const dbData =
          isDealUnderwriting && dealIdForUnderwriting
            ? await loadDealProFormaInputs(
                dealIdForUnderwriting,
                selectedDealVersionId !== 'latest' ? selectedDealVersionId : undefined,
              )
            : !isDealUnderwriting && selectedProjectVersionId !== 'latest'
            ? await loadProjectProFormaVersionInputs(project.id, selectedProjectVersionId)
            : await loadProFormaInputsDB(project.id)
        if (dbData) {
          // Convert date strings back to Date objects
          const loaded: SavedProFormaInputs = {
            proFormaMode: dbData.proFormaMode as ProFormaMode | undefined,
            contractValue: dbData.contractValue,
            paymentMilestones: dbData.paymentMilestones.map((m: any) => ({
              ...m,
              date: new Date(m.date),
            })),
            monthlyOverhead: dbData.monthlyOverhead,
            overheadMethod: dbData.overheadMethod,
            projectionMonths: dbData.projectionMonths,
            startDate: dbData.startDate,
            totalProjectSquareFootage: dbData.totalProjectSquareFootage,
            includeRentalIncome: dbData.includeRentalIncome,
            rentalUnits: dbData.rentalUnits.map((u: any) => ({
              ...u,
              occupancyStartDate: u.occupancyStartDate 
                ? new Date(u.occupancyStartDate)
                : undefined,
              occupancyEndDate: u.occupancyEndDate
                ? new Date(u.occupancyEndDate)
                : undefined,
              leaseTerms: Array.isArray(u.leaseTerms)
                ? u.leaseTerms.map((term: any) => ({
                    ...term,
                    startDate: term.startDate ? new Date(term.startDate) : undefined,
                    endDate: term.endDate ? new Date(term.endDate) : undefined,
                  }))
                : undefined,
            })),
            includeOperatingExpenses: dbData.includeOperatingExpenses,
            operatingExpenses: dbData.operatingExpenses,
            includeDebtService: dbData.includeDebtService,
            debtService: {
              ...dbData.debtService,
              startDate: new Date(dbData.debtService.startDate),
            },
            constructionCompletionDate: dbData.constructionCompletionDate,
            useDevelopmentProforma: dbData.useDevelopmentProforma,
            landCost: dbData.landCost,
            siteWorkCost: dbData.siteWorkCost,
            softCostPercent: dbData.softCostPercent,
            contingencyPercent: dbData.contingencyPercent,
            constructionMonths: dbData.constructionMonths,
            loanToCostPercent: dbData.loanToCostPercent,
            exitCapRate: dbData.exitCapRate,
            refinanceLTVPercent: dbData.refinanceLTVPercent,
            lpEquityPercent: dbData.lpEquityPercent,
            lpPreferredReturnPercent: dbData.lpPreferredReturnPercent,
            lpAbovePrefProfitSharePercent: dbData.lpAbovePrefProfitSharePercent,
            taxRatePercent: dbData.taxRatePercent,
            annualDepreciation: dbData.annualDepreciation,
            annualAppreciationPercent: dbData.annualAppreciationPercent,
            valueMethod: dbData.valueMethod as ValueMethod | undefined,
            underwritingEstimatedConstructionCost: dbData.underwritingEstimatedConstructionCost,
            dealSummaryInputs: dbData.dealSummaryInputs,
            forSaleTotalUnits: dbData.forSaleTotalUnits,
            forSaleAverageSalePrice: dbData.forSaleAverageSalePrice,
            forSalePresaleDepositPercent: dbData.forSalePresaleDepositPercent,
            forSaleTriggerUsesPresales: dbData.forSaleTriggerUsesPresales,
            forSaleSalesPaceUnitsPerMonth: dbData.forSaleSalesPaceUnitsPerMonth,
            forSaleDepositUsageMode: dbData.forSaleDepositUsageMode,
            forSaleDepositUsablePercent: dbData.forSaleDepositUsablePercent,
            forSaleConstructionSpendCurve: dbData.forSaleConstructionSpendCurve,
            forSaleInfrastructureCost: dbData.forSaleInfrastructureCost,
            forSaleTotalHardBudget: dbData.forSaleTotalHardBudget,
            forSaleTotalSoftBudget: dbData.forSaleTotalSoftBudget,
            forSaleTifReduction: dbData.forSaleTifReduction,
            forSaleFixedLocLimit: dbData.forSaleFixedLocLimit,
            forSaleLtcPercent: dbData.forSaleLtcPercent,
            forSaleBondFinancingEnabled: dbData.forSaleBondFinancingEnabled,
            forSaleBondLtcOverridePercent: dbData.forSaleBondLtcOverridePercent,
            forSaleBondRatePercent: dbData.forSaleBondRatePercent,
            forSaleBondCapacity: dbData.forSaleBondCapacity,
            forSaleSalesBuckets: dbData.forSaleSalesBuckets,
            forSalePhases: dbData.forSalePhases,
            forSaleIncentives: dbData.forSaleIncentives,
          }
          return loaded
        }
      }

      // Fallback to localStorage
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved) as SavedProFormaInputsSerialized
        // Convert date strings back to Date objects
        const loaded: SavedProFormaInputs = {
          ...parsed,
          proFormaMode: parsed.proFormaMode,
          paymentMilestones: parsed.paymentMilestones.map(m => ({
            ...m,
            date: new Date(m.date),
          })),
          rentalUnits: parsed.rentalUnits.map(u => ({
            ...u,
            occupancyStartDate: u.occupancyStartDate 
              ? new Date(u.occupancyStartDate)
              : undefined,
            occupancyEndDate: u.occupancyEndDate
              ? new Date(u.occupancyEndDate)
              : undefined,
            leaseTerms: Array.isArray((u as any).leaseTerms)
              ? (u as any).leaseTerms.map((term: any) => ({
                  ...term,
                  startDate: term.startDate ? new Date(term.startDate) : undefined,
                  endDate: term.endDate ? new Date(term.endDate) : undefined,
                }))
              : undefined,
          })),
          debtService: {
            ...parsed.debtService,
            startDate: new Date(parsed.debtService.startDate),
          },
          useDevelopmentProforma: parsed.useDevelopmentProforma,
          landCost: parsed.landCost,
          siteWorkCost: parsed.siteWorkCost,
          softCostPercent: parsed.softCostPercent,
          contingencyPercent: parsed.contingencyPercent,
          constructionMonths: parsed.constructionMonths,
          loanToCostPercent: parsed.loanToCostPercent,
          exitCapRate: parsed.exitCapRate,
          refinanceLTVPercent: parsed.refinanceLTVPercent,
          lpEquityPercent: parsed.lpEquityPercent,
          lpPreferredReturnPercent: parsed.lpPreferredReturnPercent,
          lpAbovePrefProfitSharePercent: parsed.lpAbovePrefProfitSharePercent,
          taxRatePercent: parsed.taxRatePercent,
          annualDepreciation: parsed.annualDepreciation,
          annualAppreciationPercent: parsed.annualAppreciationPercent,
          valueMethod: parsed.valueMethod,
          underwritingEstimatedConstructionCost: parsed.underwritingEstimatedConstructionCost,
          dealSummaryInputs: parsed.dealSummaryInputs,
          forSaleTotalUnits: parsed.forSaleTotalUnits,
          forSaleAverageSalePrice: parsed.forSaleAverageSalePrice,
          forSalePresaleDepositPercent: parsed.forSalePresaleDepositPercent,
          forSaleTriggerUsesPresales: parsed.forSaleTriggerUsesPresales,
          forSaleSalesPaceUnitsPerMonth: parsed.forSaleSalesPaceUnitsPerMonth,
          forSaleDepositUsageMode: parsed.forSaleDepositUsageMode,
          forSaleDepositUsablePercent: parsed.forSaleDepositUsablePercent,
          forSaleConstructionSpendCurve: parsed.forSaleConstructionSpendCurve,
          forSaleInfrastructureCost: parsed.forSaleInfrastructureCost,
          forSaleTotalHardBudget: parsed.forSaleTotalHardBudget,
          forSaleTotalSoftBudget: parsed.forSaleTotalSoftBudget,
          forSaleTifReduction: parsed.forSaleTifReduction,
          forSaleFixedLocLimit: parsed.forSaleFixedLocLimit,
          forSaleLtcPercent: parsed.forSaleLtcPercent,
          forSaleBondFinancingEnabled: parsed.forSaleBondFinancingEnabled,
          forSaleBondLtcOverridePercent: parsed.forSaleBondLtcOverridePercent,
          forSaleBondRatePercent: parsed.forSaleBondRatePercent,
          forSaleBondCapacity: parsed.forSaleBondCapacity,
          forSaleSalesBuckets: parsed.forSaleSalesBuckets,
          forSalePhases: parsed.forSalePhases,
          forSaleIncentives: parsed.forSaleIncentives,
        }
        return loaded
      }
    } catch (error) {
      console.error('Error loading pro forma inputs:', error)
    }
    return null
  }

  const computeUnderwritingFallbackContractValue = (params: {
    underwritingEstimatedConstructionCost?: number
    landCost?: number
    softCostPercent?: number
    contingencyPercent?: number
  }): number => {
    const hardCost = Math.max(0, params.underwritingEstimatedConstructionCost || 0)
    if (hardCost <= 0) return 0

    const land = Math.max(0, params.landCost || 0)
    const softPct = Math.max(0, params.softCostPercent || 0)
    const contingencyPct = Math.max(0, params.contingencyPercent || 0)
    const soft = hardCost * (softPct / 100)
    const contingency = hardCost * (contingencyPct / 100)

    // Underwriting fallback should represent full project total cost when available.
    return hardCost + land + soft + contingency
  }

  const deriveContractValueFromEstimate = (estimateTrades: Trade[]): number => {
    let estimateTotal = project.estimate.totalEstimate || project.estimate.totals?.totalEstimated || 0

    if (estimateTotal === 0 && estimateTrades.length > 0) {
      const basePriceTotal = estimateTrades.reduce((sum, t) => sum + t.totalCost, 0)
      const storedContingency = project.estimate.contingency || 0
      const storedProfit = project.estimate.profit || 0

      if (storedContingency > 0 || storedProfit > 0) {
        estimateTotal = basePriceTotal + storedContingency + storedProfit
      } else {
        const contingencyPercent = 10
        const contingency = basePriceTotal * (contingencyPercent / 100)
        const grossProfitTotal = estimateTrades.reduce((sum, trade) => {
          const itemMarkup = trade.markupPercent || 20
          const markup = trade.totalCost * (itemMarkup / 100)
          return sum + markup
        }, 0)
        estimateTotal = basePriceTotal + contingency + grossProfitTotal
      }
    }

    return estimateTotal > 0
      ? estimateTotal
      : estimateTrades.reduce((sum, t) => sum + t.totalCost, 0)
  }

  // Load trades and saved inputs
  useEffect(() => {
    const loadTradesAndInputs = async () => {
      let loadedTrades: Trade[] = []

      if (isDealUnderwriting) {
        // Underwriting mode: no backing estimate trades expected; keep trades empty and rely on direct inputs.
        setTrades([])
        await refreshDealVersions()
      } else {
        loadedTrades = await getTradesForEstimate_Hybrid(project.estimate.id)
        setTrades(loadedTrades)
        await refreshProjectVersions()
      }

      // Try to load saved pro forma inputs (DB or localStorage)
      const savedInputs = await loadProFormaInputs()

      if (savedInputs) {
        // Restore saved inputs
        if (isDealUnderwriting) {
          // Deal / underwriting mode: prefer saved contract value, otherwise
          // derive from full project total cost (hard + land + soft + contingency),
          // then fall back to hard cost if needed.
          const fallbackContractValue = computeUnderwritingFallbackContractValue({
            underwritingEstimatedConstructionCost: savedInputs.underwritingEstimatedConstructionCost,
            landCost: savedInputs.landCost,
            softCostPercent: savedInputs.softCostPercent,
            contingencyPercent: savedInputs.contingencyPercent,
          })
          const contractValueToUse =
            savedInputs.contractValue > 0
              ? savedInputs.contractValue
              : fallbackContractValue > 0
                ? fallbackContractValue
                : Math.max(0, savedInputs.underwritingEstimatedConstructionCost || 0)
          setContractValue(contractValueToUse)
          lastSyncedTotalRef.current = contractValueToUse
        } else {
          // Project mode: if saved contract is 0, fall back to estimate total
          const estimateTotal = deriveContractValueFromEstimate(loadedTrades)
          const contractValueToUse =
            savedInputs.contractValue > 0 ? savedInputs.contractValue : estimateTotal
          setContractValue(contractValueToUse)
          lastSyncedTotalRef.current = contractValueToUse
        }

        setPaymentMilestones(savedInputs.paymentMilestones)
        setMonthlyOverhead(savedInputs.monthlyOverhead)
        setOverheadMethod(savedInputs.overheadMethod)
        setProjectionMonths(savedInputs.projectionMonths)
        setStartDate(savedInputs.startDate)
        setIncludeRentalIncome(savedInputs.includeRentalIncome)
        setRentalUnits(savedInputs.rentalUnits)
        setIncludeOperatingExpenses(savedInputs.includeOperatingExpenses)
        setOperatingExpenses(savedInputs.operatingExpenses)
        setIncludeDebtService(savedInputs.includeDebtService)
        setDebtService(savedInputs.debtService)
        setConstructionCompletionDate(savedInputs.constructionCompletionDate)
        setTotalProjectSquareFootage(savedInputs.totalProjectSquareFootage || 0)
        setUseDevelopmentProforma(savedInputs.useDevelopmentProforma ?? false)
        setLandCost(savedInputs.landCost ?? 0)
        setSiteWorkCost(savedInputs.siteWorkCost ?? 0)
        setSoftCostPercent(savedInputs.softCostPercent ?? 0)
        setContingencyPercent(savedInputs.contingencyPercent ?? 0)
        setConstructionMonthsInput(savedInputs.constructionMonths ?? 0)
        setLoanToCostPercent(savedInputs.loanToCostPercent ?? 0)
        setExitCapRate(savedInputs.exitCapRate ?? 0)
        setRefinanceLTVPercent(savedInputs.refinanceLTVPercent ?? 0)
        setLpEquityPercent(savedInputs.lpEquityPercent ?? 50)
        setLpPreferredReturnPercent(savedInputs.lpPreferredReturnPercent ?? 8)
        setLpAbovePrefProfitSharePercent(savedInputs.lpAbovePrefProfitSharePercent ?? 70)
        setTaxRatePercent(savedInputs.taxRatePercent ?? 0)
        setAnnualDepreciation(savedInputs.annualDepreciation ?? 0)
        setAnnualAppreciationPercent(savedInputs.annualAppreciationPercent ?? 0)
        setValueMethod(savedInputs.valueMethod ?? 'stabilized')
        setProFormaMode(savedInputs.proFormaMode ?? 'general-development')
        setForSaleTotalUnits(savedInputs.forSaleTotalUnits ?? 39)
        setForSaleAverageSalePrice(savedInputs.forSaleAverageSalePrice ?? 250000)
        setForSalePresaleDepositPercent(savedInputs.forSalePresaleDepositPercent ?? 5)
        setForSaleTriggerUsesPresales(savedInputs.forSaleTriggerUsesPresales ?? true)
        setForSaleSalesPaceUnitsPerMonth(savedInputs.forSaleSalesPaceUnitsPerMonth ?? 0)
        setForSaleDepositUsageMode(savedInputs.forSaleDepositUsageMode ?? 'full')
        setForSaleDepositUsablePercent(savedInputs.forSaleDepositUsablePercent ?? 100)
        setForSaleConstructionSpendCurve(savedInputs.forSaleConstructionSpendCurve ?? 'linear')
        setForSaleInfrastructureCost(savedInputs.forSaleInfrastructureCost ?? 0)
        setForSaleTotalHardBudget(savedInputs.forSaleTotalHardBudget ?? 0)
        setForSaleTotalSoftBudget(savedInputs.forSaleTotalSoftBudget ?? 0)
        setForSaleTifReduction(savedInputs.forSaleTifReduction ?? 0)
        setForSaleFixedLocLimit(savedInputs.forSaleFixedLocLimit ?? 0)
        setForSaleLtcPercent(savedInputs.forSaleLtcPercent ?? 85)
        setForSaleBondFinancingEnabled(savedInputs.forSaleBondFinancingEnabled ?? false)
        setForSaleBondLtcOverridePercent(savedInputs.forSaleBondLtcOverridePercent ?? 0)
        setForSaleBondRatePercent(savedInputs.forSaleBondRatePercent ?? 0)
        setForSaleBondCapacity(savedInputs.forSaleBondCapacity ?? 0)
        setForSaleIncentives(
          (savedInputs.forSaleIncentives ?? []).map((item) => ({
            ...item,
            sourceType: item.sourceType ?? 'equity',
          })),
        )
        setForSaleSalesBuckets(savedInputs.forSaleSalesBuckets ?? {
          locPaydownPercent: 70,
          reinvestPercent: 20,
          reservePercent: 10,
          distributionPercent: 0,
        })
        setForSalePhases(savedInputs.forSalePhases?.length ? savedInputs.forSalePhases : [{
          id: uuidv4(),
          name: 'Phase 1',
          unitCount: 10,
          buildMonths: 12,
          presaleStartMonthOffset: 2,
          closeStartMonthOffset: 8,
          presaleTriggerPercent: 50,
          infrastructureAllocationPercent: undefined,
          landAllocationPercent: 0,
          siteWorkAllocationPercent: 0,
        }])
        if (savedInputs.underwritingEstimatedConstructionCost != null) {
          setUnderwritingEstimatedConstructionCost(
            savedInputs.underwritingEstimatedConstructionCost,
          )
        }
        if (savedInputs.dealSummaryInputs) {
          setDealSummaryInputs(savedInputs.dealSummaryInputs)
        }
        setHasLoadedSavedData(true)
      } else if (!isDealUnderwriting) {
        // No saved inputs in project mode, use estimate-based defaults
        const contractValue = deriveContractValueFromEstimate(loadedTrades)
        setContractValue(contractValue)
        lastSyncedTotalRef.current = contractValue
      }

      setLoading(false)
      initialLoadCompleteRef.current = true
    }

    loadTradesAndInputs().catch((error) => {
      if (!isDealUnderwriting) {
        console.error('Error loading trades or pro forma inputs:', error)
      }
      setLoading(false)
      initialLoadCompleteRef.current = true
    })
  }, [project, isDealUnderwriting, selectedDealVersionId, selectedProjectVersionId])

  // Auto-update contract value when estimate changes (after initial load)
  // Only updates if contract value is 0, or if it matches the last synced total (meaning estimate changed)
  useEffect(() => {
    // Only run after initial load is complete to avoid interfering with initialization
    if (!isDealUnderwriting && initialLoadCompleteRef.current && !loading) {
      const currentTotal = deriveContractValueFromEstimate(trades)
      
      // Only auto-update if:
      // 1. Contract value is 0, OR
      // 2. Contract value matches the last synced total (within $1 for rounding)
      // This allows auto-sync when estimate changes, but preserves manual edits
      if (currentTotal > 0) {
        // Use a function to get the current contract value to avoid stale closure
        setContractValue(prevValue => {
          if (prevValue === 0 || Math.abs(prevValue - lastSyncedTotalRef.current) < 1) {
            lastSyncedTotalRef.current = currentTotal
            return currentTotal
          }
          return prevValue
        })
      }
    }
  }, [project.estimate.totalEstimate, project.estimate.totals?.totalEstimated, trades, loading, isDealUnderwriting]) // Watch estimate total and trades

  // Auto-fill contingency % for development proforma when possible
  useEffect(() => {
    if (!useDevelopmentProforma) return
    if (isDealUnderwriting) return
    if (contingencyPercent !== 0) return
    if (trades.length === 0) return

    const constructionCost = trades.reduce((sum, t) => sum + t.totalCost, 0)
    // Derive contingency dollars from estimate:
    // 1) Prefer totals.contingency if present
    // 2) Otherwise use totalEstimate - (subtotal + overhead + profit)
    const totalsContingency = (project.estimate.totals as any)?.contingency
    let estimateContingency = typeof totalsContingency === 'number' ? totalsContingency : 0
    if (!estimateContingency && project.estimate.totalEstimate != null) {
      const { subtotal, overhead, profit } = project.estimate
      const derived = project.estimate.totalEstimate - (subtotal + overhead + profit)
      if (derived > 0) {
        estimateContingency = derived
      }
    }

    if (constructionCost > 0 && estimateContingency > 0) {
      const pct = (estimateContingency / constructionCost) * 100
      setContingencyPercent(parseFloat(pct.toFixed(1)))
    }
  }, [useDevelopmentProforma, contingencyPercent, trades, project.estimate.totals, project.estimate.contingency, isDealUnderwriting])

  // Generate default milestones when contract value or months change
  // Only if milestones are empty AND loading is complete
  // Generate even if saved data exists but has no milestones
  // Use construction completion date to determine project duration, or estimate from projection months
  useEffect(() => {
    if (!initialLoadCompleteRef.current || loading || contractValue <= 0 || !startDate) {
      return
    }

    const start = new Date(startDate)

    // Case 1: no milestones yet – generate defaults
    if (paymentMilestones.length === 0) {
      // Calculate construction duration in months
      let constructionMonths: number = projectionMonths

      if (constructionCompletionDate) {
        // Use explicit construction completion date
        const end = new Date(constructionCompletionDate)
        const monthsDiff = Math.max(
          1,
          Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30)),
        )
        constructionMonths = monthsDiff
      } else {
        // Default to 80% of projection period for construction (same logic as in service)
        constructionMonths = Math.ceil(projectionMonths * 0.8)
      }

      let defaults = generateDefaultMilestones(contractValue, start, constructionMonths)

      // If a construction completion date is provided, anchor the final milestone
      // to that exact date and interpolate earlier milestones proportionally.
      if (constructionCompletionDate) {
        const end = new Date(constructionCompletionDate)
        const startMs = start.getTime()
        const endMs = end.getTime()
        const span = endMs - startMs

        defaults = defaults.map((m) => {
          const pct = (m.percentComplete || 0) / 100
          const dateMs = startMs + span * pct
          const anchoredDate = new Date(dateMs)
          return {
            ...m,
            date: anchoredDate,
          }
        })
      }

      setPaymentMilestones(defaults)
      return
    }

    // Case 2: milestones already exist and completion date changed – re-anchor dates only
    if (constructionCompletionDate && paymentMilestones.length > 0) {
      const end = new Date(constructionCompletionDate)
      const startMs = start.getTime()
      const endMs = end.getTime()
      const span = endMs - startMs

      const reAnchored = paymentMilestones.map((m) => {
        const pct = (m.percentComplete || 0) / 100
        const dateMs = startMs + span * pct
        const anchoredDate = new Date(dateMs)
        return {
          ...m,
          date: anchoredDate,
        }
      })

      setPaymentMilestones(reAnchored)
    }
  }, [contractValue, projectionMonths, startDate, constructionCompletionDate, paymentMilestones.length, loading])

  // Save inputs to database/localStorage whenever they change (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveProFormaInputs()
    }, 1000) // Debounce by 1000ms to avoid excessive database writes

    return () => clearTimeout(timeoutId)
  }, [
    contractValue,
    paymentMilestones,
    monthlyOverhead,
    overheadMethod,
    projectionMonths,
    startDate,
    includeRentalIncome,
    rentalUnits,
    includeOperatingExpenses,
    operatingExpenses,
    includeDebtService,
    debtService,
    constructionCompletionDate,
    totalProjectSquareFootage,
    useDevelopmentProforma,
    landCost,
    siteWorkCost,
    softCostPercent,
    contingencyPercent,
    constructionMonthsInput,
    loanToCostPercent,
    exitCapRate,
    refinanceLTVPercent,
    lpEquityPercent,
    lpPreferredReturnPercent,
    lpAbovePrefProfitSharePercent,
    taxRatePercent,
    annualDepreciation,
    annualAppreciationPercent,
    valueMethod,
    underwritingEstimatedConstructionCost,
    dealSummaryInputs,
    proFormaMode,
    forSaleTotalUnits,
    forSaleAverageSalePrice,
    forSalePresaleDepositPercent,
    forSaleTriggerUsesPresales,
    forSaleSalesPaceUnitsPerMonth,
    forSaleDepositUsageMode,
    forSaleDepositUsablePercent,
    forSaleConstructionSpendCurve,
    forSaleInfrastructureCost,
    forSaleTotalHardBudget,
    forSaleTotalSoftBudget,
    forSaleTifReduction,
    forSaleFixedLocLimit,
    forSaleLtcPercent,
    forSaleBondFinancingEnabled,
    forSaleBondLtcOverridePercent,
    forSaleBondRatePercent,
    forSaleBondCapacity,
    forSaleSalesBuckets,
    forSalePhases,
    forSaleIncentives,
  ])

  const handleAddMilestone = () => {
    const newMilestone: PaymentMilestone = {
      id: uuidv4(),
      name: '',
      date: new Date(startDate),
      amount: 0,
      percentComplete: 0,
    }
    setPaymentMilestones([...paymentMilestones, newMilestone])
    setValidationErrors([])
  }

  const handleRemoveMilestone = (id: string) => {
    setPaymentMilestones(paymentMilestones.filter(m => m.id !== id))
    setValidationErrors([])
  }

  const handleMilestoneChange = (id: string, field: keyof PaymentMilestone, value: any) => {
    setPaymentMilestones(
      paymentMilestones.map(m =>
        m.id === id ? { ...m, [field]: value } : m
      )
    )
    setValidationErrors([])
  }

  const handleAddRentalUnit = () => {
    const newUnit: RentalUnit = {
      id: uuidv4(),
      name: '',
      unitType: 'residential',
      rentType: 'fixed',
      monthlyRent: 0,
      occupancyRate: 95,
    }
    setRentalUnits([...rentalUnits, newUnit])
  }

  const handleRemoveRentalUnit = (id: string) => {
    setRentalUnits(rentalUnits.filter(u => u.id !== id))
  }

  const getLeaseEndDateFromDuration = (startDate: Date, durationYears: number): Date => {
    const endDate = new Date(startDate)
    endDate.setFullYear(endDate.getFullYear() + durationYears)
    endDate.setDate(endDate.getDate() - 1)
    return endDate
  }

  const handleRentalUnitChange = (id: string, field: keyof RentalUnit, value: any) => {
    setRentalUnits(
      rentalUnits.map(u => {
        if (u.id !== id) return u

        const next: RentalUnit = { ...u, [field]: value }

        // If start date changes and a duration exists, keep end date synced.
        if (field === 'occupancyStartDate' && value && next.leaseDurationYears) {
          next.occupancyEndDate = getLeaseEndDateFromDuration(new Date(value), next.leaseDurationYears)
        }

        // If duration changes and start date exists, auto-calculate end date.
        if (field === 'leaseDurationYears') {
          const years = Number(value) || 0
          if (years > 0 && next.occupancyStartDate) {
            next.occupancyEndDate = getLeaseEndDateFromDuration(new Date(next.occupancyStartDate), years)
          } else if (years <= 0) {
            next.leaseDurationYears = undefined
          }
        }

        // If user manually edits end date, clear duration helper to avoid ambiguity.
        if (field === 'occupancyEndDate') {
          next.leaseDurationYears = undefined
        }

        return next
      }),
    )
    setValidationErrors([])
  }

  const handleEnableLeaseTerms = (unitId: string) => {
    setRentalUnits(
      rentalUnits.map((unit) => {
        if (unit.id !== unitId) return unit
        if (Array.isArray(unit.leaseTerms) && unit.leaseTerms.length > 0) return unit
        const seedTerm: RentalLeaseTerm = {
          id: uuidv4(),
          name: 'Term 1',
          startDate: unit.occupancyStartDate,
          endDate: unit.occupancyEndDate,
          rentType: unit.rentType,
          monthlyRent: unit.monthlyRent,
          squareFootage: unit.squareFootage,
          rentPerSqft: unit.rentPerSqft,
          occupancyRate: unit.occupancyRate,
        }
        return { ...unit, leaseTerms: [seedTerm] }
      }),
    )
    setValidationErrors([])
  }

  const handleAddLeaseTerm = (unitId: string) => {
    setRentalUnits(
      rentalUnits.map((unit) => {
        if (unit.id !== unitId) return unit
        const existingTerms = Array.isArray(unit.leaseTerms) ? unit.leaseTerms : []
        const defaultStart = unit.occupancyStartDate
        const newTerm: RentalLeaseTerm = {
          id: uuidv4(),
          name: `Term ${existingTerms.length + 1}`,
          startDate: defaultStart,
          rentType: unit.rentType,
          monthlyRent: unit.monthlyRent,
          squareFootage: unit.squareFootage,
          rentPerSqft: unit.rentPerSqft,
          occupancyRate: unit.occupancyRate,
        }
        return { ...unit, leaseTerms: [...existingTerms, newTerm] }
      }),
    )
    setValidationErrors([])
  }

  const handleRemoveLeaseTerm = (unitId: string, termId: string) => {
    setRentalUnits(
      rentalUnits.map((unit) => {
        if (unit.id !== unitId) return unit
        const nextTerms = (unit.leaseTerms || []).filter((term) => term.id !== termId)
        return { ...unit, leaseTerms: nextTerms.length > 0 ? nextTerms : undefined }
      }),
    )
    setValidationErrors([])
  }

  const handleLeaseTermChange = (
    unitId: string,
    termId: string,
    field: keyof RentalLeaseTerm,
    value: any,
  ) => {
    setRentalUnits(
      rentalUnits.map((unit) => {
        if (unit.id !== unitId) return unit
        const nextTerms = (unit.leaseTerms || []).map((term) =>
          term.id === termId ? { ...term, [field]: value } : term,
        )
        return { ...unit, leaseTerms: nextTerms }
      }),
    )
    setValidationErrors([])
  }

  const getSortedLeaseTerms = (unit: RentalUnit): RentalLeaseTerm[] =>
    [...(unit.leaseTerms || [])].sort((a, b) => {
      const aTime = a.startDate ? new Date(a.startDate).getTime() : 0
      const bTime = b.startDate ? new Date(b.startDate).getTime() : 0
      return aTime - bTime
    })

  const getLeaseTermWarnings = (unit: RentalUnit): string[] => {
    const warnings: string[] = []
    const terms = getSortedLeaseTerms(unit)
    if (terms.length <= 1) return warnings

    for (let i = 1; i < terms.length; i++) {
      const prev = terms[i - 1]
      const curr = terms[i]
      if (!prev.endDate || !curr.startDate) continue
      const prevEnd = new Date(prev.endDate)
      const currStart = new Date(curr.startDate)
      prevEnd.setHours(0, 0, 0, 0)
      currStart.setHours(0, 0, 0, 0)

      if (currStart <= prevEnd) {
        warnings.push(
          `${curr.name || `Term ${i + 1}`} overlaps with ${prev.name || `Term ${i}`}.`,
        )
      } else {
        const expectedNext = new Date(prevEnd)
        expectedNext.setDate(expectedNext.getDate() + 1)
        if (currStart.getTime() > expectedNext.getTime()) {
          warnings.push(
            `Gap detected between ${prev.name || `Term ${i}`} and ${curr.name || `Term ${i + 1}`}.`,
          )
        }
      }
    }

    return warnings
  }

  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const forSaleDerivedContractValue = useMemo(
    () =>
      forSalePhases.reduce((sum, phase) => sum + (phase.unitCount || 0), 0) * (forSaleAverageSalePrice || 0),
    [forSalePhases, forSaleAverageSalePrice],
  )
  const forSalePhaseRowErrors = useMemo(() => {
    const map: Record<string, string[]> = {}
    forSalePhases.forEach((phase) => {
      const errs: string[] = []
      if ((phase.buildMonths || 0) < 1) errs.push('Build months must be at least 1.')
      if ((phase.presaleTriggerPercent || 0) < 0 || (phase.presaleTriggerPercent || 0) > 100) {
        errs.push('Trigger % must be between 0 and 100.')
      }
      if ((phase.presaleStartMonthOffset || 0) < 0 || (phase.closeStartMonthOffset || 0) < 0) {
        errs.push('Start offsets cannot be negative.')
      }
      if ((phase.closeStartMonthOffset || 0) < (phase.presaleStartMonthOffset || 0)) {
        errs.push('Close start month should be at or after presale start month.')
      }
      if ((phase.infrastructureAllocationPercent || 0) < 0) errs.push('Infrastructure % cannot be negative.')
      if ((phase.landAllocationPercent || 0) < 0) errs.push('Land % cannot be negative.')
      if ((phase.siteWorkAllocationPercent || 0) < 0) errs.push('Site % cannot be negative.')
      map[phase.id] = errs
    })
    return map
  }, [forSalePhases])
  useEffect(() => {
    const units = dealSummaryInputs.totalUnits ?? 0
    const mapped = forSaleIncentives
      .filter((i) => i.name.trim().length > 0 || (i.amount || 0) > 0)
      .map((i) => ({
        id: i.id,
        label: i.name,
        totalAmount: i.amount || undefined,
        perUnitAmount: units > 0 && (i.amount || 0) > 0 ? i.amount / units : undefined,
        applyTo: i.applyTo,
        sourceType: i.sourceType,
      }))
    setDealSummaryInputs((prev) => ({ ...prev, incentives: mapped }))
  }, [forSaleIncentives, dealSummaryInputs.totalUnits])

  const handleSaveDealVersion = async () => {
    if (!isDealUnderwriting || !dealIdForUnderwriting) return
    const payload = buildSavedInputs()
    const success = await saveDealProFormaVersion(
      dealIdForUnderwriting,
      payload as any,
      newVersionLabel || undefined,
    )
    if (success) {
      setNewVersionLabel('')
      await refreshDealVersions()
      setSelectedDealVersionId('latest')
    } else {
      setValidationErrors((prev) => [
        ...prev,
        'Unable to save deal pro forma version to Supabase. Saved locally as fallback.',
      ])
      localStorage.setItem(storageKey, JSON.stringify(payload))
    }
  }

  const handleSaveProjectVersion = async () => {
    if (isDealUnderwriting) return
    const payload = buildSavedInputs()
    const success = await saveProjectProFormaVersion(
      project.id,
      payload as any,
      newVersionLabel || undefined,
    )
    if (success) {
      setNewVersionLabel('')
      await refreshProjectVersions()
      setSelectedProjectVersionId('latest')
    } else {
      setValidationErrors((prev) => [
        ...prev,
        'Unable to save project pro forma version to Supabase.',
      ])
    }
  }

  const handleGenerate = () => {
    const errors: string[] = []

    const effectiveContractValue = isForSaleLocMode ? forSaleDerivedContractValue : contractValue

    if (!effectiveContractValue) {
      errors.push(isDealUnderwriting ? 'Enter a Deal Value / Contract Value.' : 'Enter a Contract Value.')
    }

    // Underwriting-mode guidance: require construction cost assumption when there are no trades
    if (isDealUnderwriting && trades.length === 0 && underwritingEstimatedConstructionCost <= 0) {
      errors.push('Enter an Estimated Construction Cost for underwriting when no detailed estimate exists.')
    }

    if (!isForSaleLocMode && paymentMilestones.length === 0) {
      errors.push('Add at least one funding milestone to model construction inflows.')
    }

    // Validate cumulative percent-complete milestones:
    // - must start at 0
    // - must end at 100
    // - must be strictly increasing
    if (!isForSaleLocMode && paymentMilestones.length > 0) {
      const sorted = [...paymentMilestones].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      )
      const firstPct = sorted[0].percentComplete ?? 0
      const lastPct = sorted[sorted.length - 1].percentComplete ?? 0
      if (firstPct !== 0) {
        errors.push('First funding milestone must be 0% complete.')
      }
      if (lastPct !== 100) {
        errors.push('Final funding milestone must be 100% complete.')
      }
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1].percentComplete ?? 0
        const curr = sorted[i].percentComplete ?? 0
        if (curr <= prev) {
          errors.push('Funding milestone percent complete values must be strictly increasing.')
          break
        }
      }
    }

    if (isForSaleLocMode) {
      const bucketTotal =
        (forSaleSalesBuckets.locPaydownPercent || 0) +
        (forSaleSalesBuckets.reinvestPercent || 0) +
        (forSaleSalesBuckets.reservePercent || 0) +
        (forSaleSalesBuckets.distributionPercent || 0)
      if (Math.abs(bucketTotal - 100) > 0.01) {
        errors.push('For-sale sales allocation buckets must total 100%.')
      }
      if (!forSalePhases.length) {
        errors.push('Add at least one phase in For-Sale Phased (LOC) mode.')
      }
      forSalePhases.forEach((phase) => {
        const rowErrors = forSalePhaseRowErrors[phase.id] || []
        rowErrors.forEach((msg: string) => errors.push(`${phase.name || 'Phase'}: ${msg}`))
      })
    }

    if (proFormaMode === 'rental-hold' && includeRentalIncome && rentalUnits.length === 0) {
      errors.push('Add at least one rental unit if rental income is enabled.')
    }
    if (proFormaMode === 'rental-hold' && includeRentalIncome) {
      rentalUnits.forEach((unit, idx) => {
        if (unit.occupancyStartDate && unit.occupancyEndDate) {
          const start = new Date(unit.occupancyStartDate)
          const end = new Date(unit.occupancyEndDate)
          start.setHours(0, 0, 0, 0)
          end.setHours(0, 0, 0, 0)
          if (end < start) {
            errors.push(
              `Rental unit ${idx + 1}${unit.name ? ` (${unit.name})` : ''}: End Date cannot be earlier than Start Date.`,
            )
          }
        }
        if (Array.isArray(unit.leaseTerms)) {
          const sortedTerms = getSortedLeaseTerms(unit)
          sortedTerms.forEach((term, termIdx) => {
            if (term.startDate && term.endDate) {
              const start = new Date(term.startDate)
              const end = new Date(term.endDate)
              start.setHours(0, 0, 0, 0)
              end.setHours(0, 0, 0, 0)
              if (end < start) {
                errors.push(
                  `Rental unit ${idx + 1}${unit.name ? ` (${unit.name})` : ''}, term ${termIdx + 1}: End Date cannot be earlier than Start Date.`,
                )
              }
            }
          })
          for (let i = 1; i < sortedTerms.length; i++) {
            const prev = sortedTerms[i - 1]
            const curr = sortedTerms[i]
            if (!prev.endDate || !curr.startDate) continue
            const prevEnd = new Date(prev.endDate)
            const currStart = new Date(curr.startDate)
            prevEnd.setHours(0, 0, 0, 0)
            currStart.setHours(0, 0, 0, 0)
            if (currStart <= prevEnd) {
              errors.push(
                `Rental unit ${idx + 1}${unit.name ? ` (${unit.name})` : ''}: lease terms cannot overlap (${prev.name || `Term ${i}`} and ${curr.name || `Term ${i + 1}`}).`,
              )
            }
          }
        }
      })
    }

    if (errors.length > 0) {
      setValidationErrors(errors)
      return
    }

    setValidationErrors([])

    const fundingBase = effectiveContractValue || 0

    // Build milestones with derived incremental percent and amounts
    const sortedMilestones = [...paymentMilestones].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    )
    let previousPct = 0
    const milestonesWithIncremental = sortedMilestones.map((m) => {
      const currentPct = m.percentComplete || 0
      const incrementalPct = currentPct - previousPct
      previousPct = currentPct
      const amount = fundingBase * (incrementalPct / 100)
      return {
        ...m,
        percentIncremental: incrementalPct,
        amount,
      }
    })

    const input: ProFormaInput = {
      projectId: project.id,
      proFormaMode,
      contractValue: effectiveContractValue,
      // Derive milestone dollar amounts from funding base and incremental percentage
      paymentMilestones: milestonesWithIncremental,
      monthlyOverhead,
      overheadAllocationMethod: overheadMethod,
      projectionMonths,
      startDate: new Date(startDate),
      totalProjectSquareFootage: totalProjectSquareFootage > 0 ? totalProjectSquareFootage : undefined,
      underwritingEstimatedConstructionCost: isForSaleLocMode
        ? (forSaleTotalHardBudget + forSaleTotalSoftBudget) || undefined
        : isDealUnderwriting && underwritingEstimatedConstructionCost > 0
          ? underwritingEstimatedConstructionCost
          : undefined,
      rentalUnits: proFormaMode === 'rental-hold' ? rentalUnits : [],
      includeRentalIncome: proFormaMode === 'rental-hold' ? includeRentalIncome : false,
      operatingExpenses,
      includeOperatingExpenses: proFormaMode === 'rental-hold' ? includeOperatingExpenses : false,
      debtService: {
        ...debtService,
        startDate: debtService.startDate || new Date(startDate),
      },
      includeDebtService: proFormaMode === 'rental-hold' ? includeDebtService : false,
      constructionCompletionDate: constructionCompletionDate 
        ? new Date(constructionCompletionDate)
        : undefined,
      useDevelopmentProforma: useDevelopmentProforma || undefined,
      landCost: useDevelopmentProforma || isForSaleLocMode ? landCost : undefined,
      siteWorkCost: useDevelopmentProforma || isForSaleLocMode ? siteWorkCost : undefined,
      softCostPercent: useDevelopmentProforma ? softCostPercent : undefined,
      contingencyPercent: useDevelopmentProforma ? contingencyPercent : undefined,
      constructionMonths: useDevelopmentProforma && constructionMonthsInput > 0 ? constructionMonthsInput : undefined,
      loanToCostPercent: useDevelopmentProforma ? loanToCostPercent : undefined,
      exitCapRate: useDevelopmentProforma && exitCapRate > 0 ? exitCapRate : undefined,
      refinanceLTVPercent: useDevelopmentProforma && refinanceLTVPercent > 0 ? refinanceLTVPercent : undefined,
      lpEquityPercent,
      lpPreferredReturnPercent,
      lpAbovePrefProfitSharePercent,
      taxRatePercent,
      annualDepreciation,
      annualAppreciationPercent,
      valueMethod,
      forSalePhasedLoc: isForSaleLocMode
        ? {
            enabled: true,
            totalUnits: forSaleTotalUnits,
            averageSalePrice: forSaleAverageSalePrice,
            presaleDepositPercent: forSalePresaleDepositPercent,
            depositUsageMode: forSaleDepositUsageMode,
            depositUsablePercent: forSaleDepositUsageMode === 'percent' ? forSaleDepositUsablePercent : undefined,
            salesPaceUnitsPerMonth: forSaleSalesPaceUnitsPerMonth > 0 ? forSaleSalesPaceUnitsPerMonth : undefined,
            constructionSpendCurve: forSaleConstructionSpendCurve,
            infrastructureCost: forSaleInfrastructureCost,
            tifInfrastructureReduction: effectiveInfrastructureReduction,
            incentiveCostReduction,
            incentiveEquitySource,
            fixedLocLimit: forSaleFixedLocLimit,
            ltcPercent: forSaleLtcPercent,
            triggerUsesPresales: forSaleTriggerUsesPresales,
            bondFinancingEnabled: forSaleBondFinancingEnabled,
            bondLtcOverridePercent: forSaleBondFinancingEnabled ? forSaleBondLtcOverridePercent : undefined,
            bondRatePercent: forSaleBondFinancingEnabled ? forSaleBondRatePercent : undefined,
            bondCapacity: forSaleBondFinancingEnabled ? forSaleBondCapacity : undefined,
            salesAllocationBuckets: forSaleSalesBuckets,
            phases: forSalePhases,
          }
        : undefined,
    }
    if ((globalThis as any).__HSH_DEBUG_FOR_SALE_LOC__ === true && input.forSalePhasedLoc) {
      console.log('[FOR-SALE LOC] mapped input payload', input.forSalePhasedLoc)
    }

    const result = calculateProForma(project, trades, input)

    // Attach display-only underwriting metadata for exports/reporting when in deal mode
    if (isDealUnderwriting && underwritingEstimatedConstructionCost > 0) {
      result.underwritingExportMeta = {
        underwritingEstimatedConstructionCost,
        landCost,
        softCostPercent,
        contingencyPercent,
        loanToCostPercent,
        exitCapRate,
        refinanceLTVPercent,
        valueMethod,
        annualAppreciationPercent,
      }
    }

    // Attach attainable housing deal summary (display-only)
    const summary = isDealUnderwriting
      ? buildDealSummary(result, dealSummaryInputs)
      : undefined

    setProjection(summary ? { ...result, dealSummary: summary } : result)
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const formatPercent = (value: number) => `${value.toFixed(1)}%`
  const parseCommaNumber = (raw: string): number => {
    const cleaned = raw.replace(/,/g, '').trim()
    if (!cleaned) return 0
    const parsed = parseFloat(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
  }
  const formatCommaNumber = (value: number, fractionDigits = 0): string =>
    value
      ? value.toLocaleString('en-US', {
          minimumFractionDigits: 0,
          maximumFractionDigits: fractionDigits,
        })
      : ''
  const normalizeIncentiveApplyTo = (applyTo: string | undefined): string => {
    const normalized = (applyTo || '').trim().toLowerCase().replace(/_/g, '-')
    if (normalized === 'project-cost-reduction') return 'cost-reduction'
    if (normalized === 'infrastructure-reduction') return 'infrastructure-reduction'
    if (normalized === 'equity-source') return 'equity-source'
    if (normalized === 'debt-service') return 'debt-service'
    return normalized
  }

  const incentiveInfrastructureReduction = useMemo(
    () =>
      forSaleIncentives
        .filter((i) => normalizeIncentiveApplyTo(i.applyTo) === 'infrastructure-reduction')
        .reduce((sum, i) => sum + (i.amount || 0), 0),
    [forSaleIncentives],
  )
  const incentiveCostReduction = useMemo(
    () =>
      forSaleIncentives
        .filter((i) => normalizeIncentiveApplyTo(i.applyTo) === 'cost-reduction')
        .reduce((sum, i) => sum + (i.amount || 0), 0),
    [forSaleIncentives],
  )
  const incentiveEquitySource = useMemo(
    () =>
      forSaleIncentives
        .filter((i) => normalizeIncentiveApplyTo(i.applyTo) === 'equity-source')
        .reduce((sum, i) => sum + (i.amount || 0), 0),
    [forSaleIncentives],
  )
  const effectiveInfrastructureReduction = (forSaleTifReduction || 0) + incentiveInfrastructureReduction

  // Helper: roll monthly cash flows up to yearly summary (for 10-year style view)
  const getYearlySummary = (projection: ProFormaProjection) => {
    if (!projection || !projection.monthlyCashFlows.length) return []
    const byYear: Record<string, {
      year: number
      rent: number
      expenses: number
      debt: number
      cashFlow: number
    }> = {}

    projection.monthlyCashFlows.forEach((m) => {
      const [yearStr] = m.month.split('-') // YYYY-MM
      const year = parseInt(yearStr, 10)
      if (!byYear[yearStr]) {
        byYear[yearStr] = { year, rent: 0, expenses: 0, debt: 0, cashFlow: 0 }
      }
      // Only include operating (post-construction) months in the annual cash flow view
      if (m.phase === 'post-construction') {
        const operatingCashFlow = m.rentalIncome - m.operatingExpenses - m.debtService
        byYear[yearStr].rent += m.rentalIncome
        byYear[yearStr].expenses += m.operatingExpenses
        byYear[yearStr].debt += m.debtService
        byYear[yearStr].cashFlow += operatingCashFlow
      }
    })

    const rows = Object.values(byYear).sort((a, b) => a.year - b.year)
    return rows
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-100 flex items-center justify-center">
        <Card className="w-full max-w-2xl shadow-sm">
          <CardContent className="p-8 text-center">
            <p>Loading project data...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-100">
      <div className="flex h-full flex-col">
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white">
          <div className="mx-auto flex w-full max-w-[1800px] items-center justify-between gap-3 px-3 py-2.5 md:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <CardTitle className="truncate text-base font-semibold md:text-lg">
                Pro Forma Generator — {project.name}
              </CardTitle>
              {isDealUnderwriting && (
                <span className="inline-flex shrink-0 items-center rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                  Underwriting
                </span>
              )}
            </div>
            <Button variant="ghost" size="sm" className="shrink-0" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1800px] px-3 py-2 pb-28 md:px-4 md:py-2.5">
          {!projection ? (
            <>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
                {/* Main modeling workspace */}
                <div className="min-w-0 flex-1 lg:basis-[73%]">
              <div className="rounded-sm border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-3 py-2 md:px-3 md:py-2.5">
                <FormSection title="Global Assumptions" className="[&_h3]:text-base [&_h3]:font-semibold [&_h3]:tracking-tight">
                  {isDealUnderwriting && (
                    <p className="text-[13px] leading-snug text-slate-500">Core inputs for this underwriting model.</p>
                  )}
                  <FormRow>
                    <FormField width="growLarge">
                      <Label htmlFor="contractValue" className={WORKSHEET_LABEL}>
                        {isDealUnderwriting ? 'Deal Value / Contract Value *' : 'Contract Value *'}
                      </Label>
                      <Input
                        className={DENSE_INPUT}
                        id="contractValue"
                        type="text"
                        inputMode="decimal"
                        value={(isForSaleLocMode ? forSaleDerivedContractValue : contractValue)
                          ? (isForSaleLocMode ? forSaleDerivedContractValue : contractValue).toLocaleString('en-US')
                          : ''}
                        readOnly={isForSaleLocMode}
                        onChange={(e) => {
                          if (isForSaleLocMode) return
                          const raw = e.target.value.replace(/,/g, '')
                          const next = raw === '' ? 0 : parseFloat(raw)
                          setContractValue(isNaN(next) ? 0 : next)
                          setValidationErrors([])
                        }}
                        placeholder="0.00"
                      />
                      <FieldHelperSlot>
                        {isDealUnderwriting ? (
                          'Deal underwriting basis.'
                        ) : isForSaleLocMode ? (
                          'Derived from phases.'
                        ) : (
                          <>
                            Est.{' '}
                            {formatCurrency(
                              project.estimate.totalEstimate ||
                                project.estimate.totals?.totalEstimated ||
                                trades.reduce((s, t) => s + t.totalCost, 0),
                            )}
                          </>
                        )}
                      </FieldHelperSlot>
                    </FormField>
                    {isDealUnderwriting && (
                      <FormField width="growLarge">
                        <Label htmlFor="underwritingEstimatedConstructionCost" className={WORKSHEET_LABEL}>
                          Estimated Construction Cost
                        </Label>
                        <Input
                          className={DENSE_INPUT}
                          id="underwritingEstimatedConstructionCost"
                          type="text"
                          inputMode="decimal"
                          value={underwritingEstimatedConstructionCost ? underwritingEstimatedConstructionCost.toLocaleString('en-US') : ''}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/,/g, '')
                            const next = raw === '' ? 0 : parseFloat(raw)
                            setUnderwritingEstimatedConstructionCost(isNaN(next) ? 0 : next)
                            setValidationErrors([])
                          }}
                          placeholder="0.00"
                        />
                        <FieldHelperSlot>When no detailed estimate.</FieldHelperSlot>
                      </FormField>
                    )}
                    <FormField width="date">
                      <Label htmlFor="startDate" className={WORKSHEET_LABEL}>
                        Project Start Date *
                      </Label>
                      <Input className={DATE_INPUT} id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                      <FieldHelperSlot />
                    </FormField>
                    <FormField width="selectMonths">
                      <Label htmlFor="projectionMonths" className={WORKSHEET_LABEL}>
                        Projection Period *
                      </Label>
                      <Select
                        value={projectionMonths.toString()}
                        onValueChange={(v) => setProjectionMonths(parseInt(v) as 6 | 12 | 24 | 36 | 60 | 120)}
                      >
                        <SelectTrigger className={cn(DENSE_INPUT, 'tabular-nums')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="6">6 Months</SelectItem>
                          <SelectItem value="12">12 Months</SelectItem>
                          <SelectItem value="24">24 Months (2 Years)</SelectItem>
                          <SelectItem value="36">36 Months (3 Years)</SelectItem>
                          <SelectItem value="60">60 Months (5 Years)</SelectItem>
                          <SelectItem value="120">120 Months (10 Years)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FieldHelperSlot />
                    </FormField>
                    <FormField width="date">
                      <Label htmlFor="constructionCompletionDate" className={WORKSHEET_LABEL}>
                        Construction Completion Date
                      </Label>
                      <Input
                        className={DATE_INPUT}
                        id="constructionCompletionDate"
                        type="date"
                        value={constructionCompletionDate}
                        onChange={(e) => setConstructionCompletionDate(e.target.value)}
                      />
                      <FieldHelperSlot>Optional.</FieldHelperSlot>
                    </FormField>
                  </FormRow>

                  <FormRow>
                    <FormField width="compact">
                      <Label htmlFor="totalProjectSquareFootage" className={WORKSHEET_LABEL}>
                        Total Project Square Footage
                      </Label>
                      <Input
                        className={DENSE_INPUT}
                        id="totalProjectSquareFootage"
                        type="number"
                        step="0.01"
                        value={totalProjectSquareFootage}
                        onChange={(e) => setTotalProjectSquareFootage(parseFloat(e.target.value) || 0)}
                        placeholder="0"
                      />
                      <FieldHelperSlot />
                    </FormField>
                    <FormField width="growMedium">
                      <Label htmlFor="monthlyOverhead" className={WORKSHEET_LABEL}>
                        Monthly Overhead
                      </Label>
                      <Input
                        className={DENSE_INPUT}
                        id="monthlyOverhead"
                        type="text"
                        inputMode="decimal"
                        value={monthlyOverhead ? monthlyOverhead.toLocaleString('en-US') : ''}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/,/g, '')
                          const next = raw === '' ? 0 : parseFloat(raw)
                          setMonthlyOverhead(isNaN(next) ? 0 : next)
                        }}
                        placeholder="0.00"
                      />
                      <FieldHelperSlot />
                    </FormField>
                    <FormField width={isDealUnderwriting ? 'medium' : 'growWide'}>
                      <Label htmlFor="overheadMethod" className={WORKSHEET_LABEL}>
                        Overhead Allocation Method
                      </Label>
                      <Select value={overheadMethod} onValueChange={(v: 'proportional' | 'flat' | 'none') => setOverheadMethod(v)}>
                        <SelectTrigger className={cn(DENSE_INPUT, 'text-left')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="proportional">Proportional (based on monthly costs)</SelectItem>
                          <SelectItem value="flat">Flat Rate (same amount each month)</SelectItem>
                          <SelectItem value="none">None</SelectItem>
                        </SelectContent>
                      </Select>
                      <FieldHelperSlot />
                    </FormField>
                    {isDealUnderwriting && (
                      <>
                        <FormField width="compact">
                          <Label htmlFor="dealSummaryUnits" className={WORKSHEET_LABEL}>
                            Total Units (optional)
                          </Label>
                          <Input
                            className={DENSE_INPUT}
                            id="dealSummaryUnits"
                            type="number"
                            value={dealSummaryInputs.totalUnits ?? ''}
                            onChange={(e) =>
                              setDealSummaryInputs({
                                ...dealSummaryInputs,
                                totalUnits: parseInt(e.target.value || '0', 10) || undefined,
                              })
                            }
                          />
                          <FieldHelperSlot />
                        </FormField>
                        <FormField width="compact">
                          <Label htmlFor="dealSummaryAvgSize" className={WORKSHEET_LABEL}>
                            Avg Unit Size (SF)
                          </Label>
                          <Input
                            className={DENSE_INPUT}
                            id="dealSummaryAvgSize"
                            type="number"
                            step="0.01"
                            value={dealSummaryInputs.averageUnitSize ?? ''}
                            onChange={(e) =>
                              setDealSummaryInputs({
                                ...dealSummaryInputs,
                                averageUnitSize: parseFloat(e.target.value || '0') || undefined,
                              })
                            }
                          />
                          <FieldHelperSlot />
                        </FormField>
                        <FormField width="growLarge">
                          <Label htmlFor="dealSummaryTargetPricePerUnit" className={WORKSHEET_LABEL}>
                            Target Sale Price / Unit ($)
                          </Label>
                          <Input
                            className={DENSE_INPUT}
                            id="dealSummaryTargetPricePerUnit"
                            type="text"
                            inputMode="decimal"
                            value={
                              dealSummaryInputs.targetSalePricePerUnit != null
                                ? dealSummaryInputs.targetSalePricePerUnit.toLocaleString('en-US')
                                : ''
                            }
                            onChange={(e) => {
                              const raw = e.target.value.replace(/,/g, '')
                              const next = raw === '' ? NaN : parseFloat(raw)
                              setDealSummaryInputs({
                                ...dealSummaryInputs,
                                targetSalePricePerUnit: isNaN(next) ? undefined : next,
                              })
                            }}
                          />
                          <FieldHelperSlot />
                        </FormField>
                        <FormField width="compact">
                          <Label htmlFor="dealSummaryMarketPricePerSF" className={WORKSHEET_LABEL}>
                            Mkt Price / SF (opt.)
                          </Label>
                          <Input
                            className={DENSE_INPUT}
                            id="dealSummaryMarketPricePerSF"
                            type="number"
                            step="0.01"
                            value={dealSummaryInputs.marketPricePerSF ?? ''}
                            onChange={(e) =>
                              setDealSummaryInputs({
                                ...dealSummaryInputs,
                                marketPricePerSF: parseFloat(e.target.value || '0') || undefined,
                              })
                            }
                          />
                          <FieldHelperSlot />
                        </FormField>
                      </>
                    )}
                  </FormRow>

                  {isDealUnderwriting && (
                    <div className="mt-2 space-y-1.5 border-t border-slate-200 pt-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-semibold text-slate-800">Cap stack</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 shrink-0 px-2 text-[13px]"
                          onClick={() =>
                            setForSaleIncentives((prev) => [
                              ...prev,
                              {
                                id: uuidv4(),
                                name: '',
                                amount: 0,
                                applyTo: 'infrastructure-reduction',
                                sourceType: 'equity',
                              },
                            ])
                          }
                        >
                          <Plus className="mr-0.5 h-3 w-3" />
                          Add
                        </Button>
                      </div>
                      <p className="text-[13px] text-slate-500">Applies across modes. Source type supports Option 1: Debt or Equity.</p>
                      {forSaleIncentives.length === 0 ? (
                        <p className="text-[13px] text-slate-500">No cap stack sources yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {forSaleIncentives.map((inc) => (
                            <div
                              key={inc.id}
                              className="space-y-2 rounded-md border border-slate-200 bg-slate-50/80 p-2 md:flex md:flex-wrap md:items-end md:gap-x-3 md:gap-y-2 md:space-y-0"
                            >
                              <FormField width="growMedium" className="min-w-[140px] md:max-w-[220px]">
                                <Label className={WORKSHEET_LABEL}>Name</Label>
                                <Input
                                  className={DENSE_INPUT}
                                  value={inc.name}
                                  onChange={(e) =>
                                    setForSaleIncentives((prev) =>
                                      prev.map((x) => (x.id === inc.id ? { ...x, name: e.target.value } : x)),
                                    )
                                  }
                                  placeholder="TIF, grant…"
                                />
                                <FieldHelperSlot />
                              </FormField>
                              <FormField width="medium">
                                <Label className={WORKSHEET_LABEL}>Amount ($)</Label>
                                <Input
                                  className={DENSE_INPUT}
                                  type="text"
                                  inputMode="decimal"
                                  value={formatCommaNumber(inc.amount)}
                                  onChange={(e) =>
                                    setForSaleIncentives((prev) =>
                                      prev.map((x) =>
                                        x.id === inc.id ? { ...x, amount: parseCommaNumber(e.target.value) } : x,
                                      ),
                                    )
                                  }
                                />
                                <FieldHelperSlot />
                              </FormField>
                              <FormField width="medium">
                                <Label className={WORKSHEET_LABEL}>Source Type</Label>
                                <Select
                                  value={inc.sourceType}
                                  onValueChange={(v) =>
                                    setForSaleIncentives((prev) =>
                                      prev.map((x) =>
                                        x.id === inc.id
                                          ? {
                                              ...x,
                                              sourceType: v as ForSaleIncentiveSourceType,
                                              applyTo:
                                                v === 'debt' && normalizeIncentiveApplyTo(x.applyTo) === 'equity-source'
                                                  ? 'debt-service'
                                                  : x.applyTo,
                                            }
                                          : x,
                                      ),
                                    )
                                  }
                                >
                                  <SelectTrigger className={DENSE_INPUT}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="equity">Equity</SelectItem>
                                    <SelectItem value="debt">Debt</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FieldHelperSlot />
                              </FormField>
                              <FormField width="growWide" className="min-w-[200px] md:max-w-[280px]">
                                <Label className={WORKSHEET_LABEL}>Apply to</Label>
                                <Select
                                  value={
                                    inc.sourceType === 'debt' &&
                                    normalizeIncentiveApplyTo(inc.applyTo) === 'equity-source'
                                      ? 'debt-service'
                                      : inc.applyTo
                                  }
                                  onValueChange={(v) =>
                                    setForSaleIncentives((prev) =>
                                      prev.map((x) =>
                                        x.id === inc.id ? { ...x, applyTo: v as ForSaleIncentiveApplyTo } : x,
                                      ),
                                    )
                                  }
                                >
                                  <SelectTrigger className={DENSE_INPUT}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="infrastructure-reduction">Infrastructure reduction</SelectItem>
                                    <SelectItem value="cost-reduction">Project cost reduction</SelectItem>
                                    {inc.sourceType === 'debt' ? (
                                      <SelectItem value="debt-service">Debt service</SelectItem>
                                    ) : (
                                      <SelectItem value="equity-source">Equity source</SelectItem>
                                    )}
                                  </SelectContent>
                                </Select>
                                <FieldHelperSlot />
                              </FormField>
                              <div className="flex min-w-0 flex-col justify-end gap-0.5 md:shrink-0">
                                <span className="h-[2.625rem] min-h-[2.625rem] shrink-0" aria-hidden />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-full text-red-600 hover:text-red-700 md:w-auto"
                                  onClick={() => setForSaleIncentives((prev) => prev.filter((x) => x.id !== inc.id))}
                                >
                                  <Trash2 className="mr-1 h-4 w-4" />
                                  Remove
                                </Button>
                                <FieldHelperSlot />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {isForSaleLocMode && (
                    <div className="mt-2 space-y-1.5 border-t border-slate-200 pt-2">
                      <div className="flex items-center gap-2">
                        <input
                          id="forSaleBondFinancingEnabled"
                          type="checkbox"
                          checked={forSaleBondFinancingEnabled}
                          onChange={(e) => setForSaleBondFinancingEnabled(e.target.checked)}
                          className="h-4 w-4"
                        />
                        <Label htmlFor="forSaleBondFinancingEnabled" className="text-[13px] font-semibold text-slate-800">
                          Bond Financing (optional)
                        </Label>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Captured for financing scenario planning; not yet applied to LOC math.
                      </p>
                      {forSaleBondFinancingEnabled && (
                        <FormRow>
                          <FormField width="percent">
                            <Label className={WORKSHEET_LABEL}>Bond LTC override (%)</Label>
                            <Input
                              className={DENSE_INPUT}
                              type="number"
                              step="0.1"
                              value={forSaleBondLtcOverridePercent || ''}
                              onChange={(e) => setForSaleBondLtcOverridePercent(parseFloat(e.target.value) || 0)}
                            />
                            <FieldHelperSlot />
                          </FormField>
                          <FormField width="percent">
                            <Label className={WORKSHEET_LABEL}>Bond rate (%)</Label>
                            <Input
                              className={DENSE_INPUT}
                              type="number"
                              step="0.01"
                              value={forSaleBondRatePercent || ''}
                              onChange={(e) => setForSaleBondRatePercent(parseFloat(e.target.value) || 0)}
                            />
                            <FieldHelperSlot />
                          </FormField>
                          <FormField width="growMedium">
                            <Label className={WORKSHEET_LABEL}>Bond capacity ($)</Label>
                            <Input
                              className={DENSE_INPUT}
                              type="text"
                              inputMode="decimal"
                              value={formatCommaNumber(forSaleBondCapacity)}
                              onChange={(e) => setForSaleBondCapacity(parseCommaNumber(e.target.value))}
                            />
                            <FieldHelperSlot />
                          </FormField>
                        </FormRow>
                      )}
                    </div>
                  )}
                </FormSection>
                </div>

                {isForSaleLocMode && (
                  <>
                    <div className="border-b border-slate-200 px-3 py-2 md:px-3 md:py-2.5">
                    <FormSection className="[&_h3]:text-base [&_h3]:font-semibold [&_h3]:tracking-tight">
                      <h3 className="text-base font-semibold leading-tight tracking-tight text-slate-900">For-Sale Phased (LOC)</h3>
                      <p className="text-[13px] leading-snug text-slate-500">Mode-specific assumptions and phase-level modeling.</p>
                      <FormRow>
                        <FormField width="compact">
                          <Label className={WORKSHEET_LABEL}>Total units</Label>
                          <Input className={DENSE_INPUT} type="number" value={forSaleTotalUnits} onChange={(e) => setForSaleTotalUnits(parseInt(e.target.value, 10) || 0)} />
                          <FieldHelperSlot />
                        </FormField>
                        <FormField width="growLarge">
                          <Label className={WORKSHEET_LABEL}>Avg sale price / unit ($)</Label>
                          <Input className={DENSE_INPUT} type="text" inputMode="decimal" value={formatCommaNumber(forSaleAverageSalePrice)} onChange={(e) => setForSaleAverageSalePrice(parseCommaNumber(e.target.value))} />
                          <FieldHelperSlot />
                        </FormField>
                        <FormField width="compact">
                          <Label className={WORKSHEET_LABEL}>Presale dep. (%)</Label>
                          <Input className={DENSE_INPUT} type="number" step="0.1" value={forSalePresaleDepositPercent} onChange={(e) => setForSalePresaleDepositPercent(parseFloat(e.target.value) || 0)} />
                          <FieldHelperSlot />
                        </FormField>
                        <FormField width="compact">
                          <Label className={WORKSHEET_LABEL}>LOC LTC cap (%)</Label>
                          <Input className={DENSE_INPUT} type="number" step="0.1" value={forSaleLtcPercent} onChange={(e) => setForSaleLtcPercent(parseFloat(e.target.value) || 0)} />
                          <FieldHelperSlot />
                        </FormField>
                        <FormField width="growMedium">
                          <Label className={WORKSHEET_LABEL}>Infrastructure ($)</Label>
                          <Input className={DENSE_INPUT} type="text" inputMode="decimal" value={formatCommaNumber(forSaleInfrastructureCost)} onChange={(e) => setForSaleInfrastructureCost(parseCommaNumber(e.target.value))} />
                          <FieldHelperSlot />
                        </FormField>
                        <FormField width="growMedium">
                          <Label className={WORKSHEET_LABEL}>Land ($)</Label>
                          <Input
                            className={DENSE_INPUT}
                            type="text"
                            inputMode="decimal"
                            value={formatCommaNumber(landCost)}
                            onChange={(e) => setLandCost(parseCommaNumber(e.target.value))}
                          />
                          <FieldHelperSlot>Split across phases with Land % (0 = all in phase 1).</FieldHelperSlot>
                        </FormField>
                        <FormField width="growMedium">
                          <Label className={WORKSHEET_LABEL}>Site work ($)</Label>
                          <Input
                            className={DENSE_INPUT}
                            type="text"
                            inputMode="decimal"
                            value={formatCommaNumber(siteWorkCost)}
                            onChange={(e) => setSiteWorkCost(parseCommaNumber(e.target.value))}
                          />
                          <FieldHelperSlot>Split with Site % (0 = all in phase 1).</FieldHelperSlot>
                        </FormField>
                      </FormRow>
                      <FormRow>
                        <FormField width="growMedium">
                          <Label className={WORKSHEET_LABEL}>Hard budget ($)</Label>
                          <Input className={DENSE_INPUT} type="text" inputMode="decimal" value={formatCommaNumber(forSaleTotalHardBudget)} onChange={(e) => setForSaleTotalHardBudget(parseCommaNumber(e.target.value))} />
                          <FieldHelperSlot>Vertical construction; split by phase unit count.</FieldHelperSlot>
                        </FormField>
                        <FormField width="growMedium">
                          <Label className={WORKSHEET_LABEL}>Soft budget ($)</Label>
                          <Input className={DENSE_INPUT} type="text" inputMode="decimal" value={formatCommaNumber(forSaleTotalSoftBudget)} onChange={(e) => setForSaleTotalSoftBudget(parseCommaNumber(e.target.value))} />
                          <FieldHelperSlot>Added to hard for total construction in this mode.</FieldHelperSlot>
                        </FormField>
                      </FormRow>
                      <div className="rounded border border-slate-200 bg-slate-50/70 px-2 py-1.5">
                        <p className="text-[13px] font-semibold leading-tight text-slate-800">Advanced controls</p>
                        <FormRow className="mt-1">
                            <FormField width="selectWide">
                              <Label className={WORKSHEET_LABEL}>Trigger based on</Label>
                              <Select value={forSaleTriggerUsesPresales ? 'presales' : 'closings'} onValueChange={(v) => setForSaleTriggerUsesPresales(v === 'presales')}>
                                <SelectTrigger className={DENSE_INPUT}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="presales">Presales (default)</SelectItem>
                                  <SelectItem value="closings">Closings</SelectItem>
                                </SelectContent>
                              </Select>
                              <FieldHelperSlot />
                            </FormField>
                            <FormField width="medium">
                              <Label className={WORKSHEET_LABEL}>Sales pace (units / mo)</Label>
                              <Input
                                className={DENSE_INPUT}
                                type="number"
                                step="0.1"
                                value={forSaleSalesPaceUnitsPerMonth || ''}
                                onChange={(e) => setForSaleSalesPaceUnitsPerMonth(parseFloat(e.target.value) || 0)}
                                placeholder="auto"
                              />
                              <FieldHelperSlot>Blank/0 keeps current behavior.</FieldHelperSlot>
                            </FormField>
                            <FormField width="selectWide">
                              <Label className={WORKSHEET_LABEL}>Presale deposit usage</Label>
                              <Select value={forSaleDepositUsageMode} onValueChange={(v) => setForSaleDepositUsageMode(v as ForSaleDepositUsageMode)}>
                                <SelectTrigger className={DENSE_INPUT}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="full">Fully usable (default)</SelectItem>
                                  <SelectItem value="percent">% usable</SelectItem>
                                  <SelectItem value="at-closing">Not usable until closing</SelectItem>
                                </SelectContent>
                              </Select>
                              <FieldHelperSlot />
                            </FormField>
                            {forSaleDepositUsageMode === 'percent' && (
                              <FormField width="percent">
                                <Label className={WORKSHEET_LABEL}>Usable %</Label>
                                <Input
                                  className={DENSE_INPUT}
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="1"
                                  value={forSaleDepositUsablePercent}
                                  onChange={(e) => setForSaleDepositUsablePercent(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                                />
                                <FieldHelperSlot />
                              </FormField>
                            )}
                            <FormField width="selectWide">
                              <Label className={WORKSHEET_LABEL}>Construction spend curve</Label>
                              <Select value={forSaleConstructionSpendCurve} onValueChange={(v) => setForSaleConstructionSpendCurve(v as ForSaleSpendCurve)}>
                                <SelectTrigger className={DENSE_INPUT}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="linear">Linear (default)</SelectItem>
                                  <SelectItem value="front-loaded">Front-loaded</SelectItem>
                                  <SelectItem value="back-loaded">Back-loaded</SelectItem>
                                </SelectContent>
                              </Select>
                              <FieldHelperSlot />
                            </FormField>
                        </FormRow>
                      </div>
                      <p className="text-[13px] font-semibold leading-tight text-slate-800">
                        Manual adjustments & sales allocation (%)
                      </p>
                      <FormRow className="rounded border border-slate-200 bg-slate-50/80 px-2 py-1.5">
                        <FormField width="growMedium">
                          <Label className={WORKSHEET_LABEL}>Manual infra reduction ($)</Label>
                          <Input className={DENSE_INPUT} type="text" inputMode="decimal" value={formatCommaNumber(forSaleTifReduction)} onChange={(e) => setForSaleTifReduction(parseCommaNumber(e.target.value))} />
                          <FieldHelperSlot />
                        </FormField>
                        <FormField width="growMedium">
                          <Label className={WORKSHEET_LABEL}>Fixed LOC cap ($)</Label>
                          <Input className={DENSE_INPUT} type="text" inputMode="decimal" value={formatCommaNumber(forSaleFixedLocLimit)} onChange={(e) => setForSaleFixedLocLimit(parseCommaNumber(e.target.value))} />
                          <FieldHelperSlot />
                        </FormField>
                        <FormField width="percent">
                          <Label className={WORKSHEET_LABEL}>LOC paydown</Label>
                          <Input className={DENSE_INPUT} type="number" value={forSaleSalesBuckets.locPaydownPercent} onChange={(e) => setForSaleSalesBuckets((b) => ({ ...b, locPaydownPercent: parseFloat(e.target.value) || 0 }))} />
                          <FieldHelperSlot />
                        </FormField>
                        <FormField width="percent">
                          <Label className={WORKSHEET_LABEL}>Reinvest</Label>
                          <Input className={DENSE_INPUT} type="number" value={forSaleSalesBuckets.reinvestPercent} onChange={(e) => setForSaleSalesBuckets((b) => ({ ...b, reinvestPercent: parseFloat(e.target.value) || 0 }))} />
                          <FieldHelperSlot />
                        </FormField>
                        <FormField width="percent">
                          <Label className={WORKSHEET_LABEL}>Reserve</Label>
                          <Input className={DENSE_INPUT} type="number" value={forSaleSalesBuckets.reservePercent} onChange={(e) => setForSaleSalesBuckets((b) => ({ ...b, reservePercent: parseFloat(e.target.value) || 0 }))} />
                          <FieldHelperSlot />
                        </FormField>
                        <FormField width="percent">
                          <Label className={WORKSHEET_LABEL}>Distribution</Label>
                          <Input className={DENSE_INPUT} type="number" value={forSaleSalesBuckets.distributionPercent} onChange={(e) => setForSaleSalesBuckets((b) => ({ ...b, distributionPercent: parseFloat(e.target.value) || 0 }))} />
                          <FieldHelperSlot />
                        </FormField>
                      </FormRow>
                      <FormRow className="items-center justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-[13px]"
                          onClick={() =>
                            setForSalePhases((prev) => [
                              ...prev,
                              {
                                id: uuidv4(),
                                name: `Phase ${prev.length + 1}`,
                                unitCount: 10,
                                buildMonths: 12,
                                presaleStartMonthOffset: 2,
                                closeStartMonthOffset: 8,
                                presaleTriggerPercent: 50,
                                infrastructureAllocationPercent: undefined,
                                landAllocationPercent: 0,
                                siteWorkAllocationPercent: 0,
                              },
                            ])
                          }
                        >
                          <Plus className="mr-1 h-4 w-4" />
                          Add phase
                        </Button>
                      </FormRow>
                    </FormSection>
                    <div className="border-t border-slate-200 bg-slate-50/50 px-3 py-2.5 md:px-3">
                      <div className="mb-2">
                        <h4 className="text-sm font-semibold leading-tight text-slate-900">Phase modeling</h4>
                        <p className="text-[13px] leading-snug text-slate-500">
                          Per-phase timing. Construction splits by units from hard + soft budgets above; land/site/infra
                          use optional % (0 = auto: land & site on phase 1; infra front-loaded then by units).
                        </p>
                      </div>
                      <div className="space-y-1 overflow-x-auto">
                      {forSalePhases.map((phase) => (
                        <div
                          key={phase.id}
                          className="grid min-w-[900px] grid-cols-[minmax(112px,148px)_54px_96px_78px_78px_60px_52px_52px_52px_40px] items-stretch gap-x-1.5 gap-y-0 rounded border border-slate-200 bg-white p-1.5"
                        >
                          <div className={PHASE_CELL}>
                            <Label className={PHASE_LABEL}>Phase</Label>
                            <Input className={DENSE_INPUT} value={phase.name} onChange={(e) => setForSalePhases((prev) => prev.map((p) => p.id === phase.id ? { ...p, name: e.target.value } : p))} placeholder="Name" />
                          </div>
                          <div className={PHASE_CELL}>
                            <Label className={PHASE_LABEL}>Units</Label>
                            <Input className={DENSE_INPUT} type="number" value={phase.unitCount} onChange={(e) => setForSalePhases((prev) => prev.map((p) => p.id === phase.id ? { ...p, unitCount: parseInt(e.target.value, 10) || 0 } : p))} placeholder="0" />
                          </div>
                          <div className={PHASE_CELL}>
                            <Label className={PHASE_LABEL} title="Build months">
                              Build months
                            </Label>
                            <Input className={DENSE_INPUT} type="number" value={phase.buildMonths} onChange={(e) => setForSalePhases((prev) => prev.map((p) => p.id === phase.id ? { ...p, buildMonths: parseInt(e.target.value, 10) || 1 } : p))} placeholder="0" />
                          </div>
                          <div className={PHASE_CELL}>
                            <Label className={PHASE_LABEL} title="Presale start (phase month)">
                              Presale start
                            </Label>
                            <Input className={DENSE_INPUT} type="number" value={phase.presaleStartMonthOffset} onChange={(e) => setForSalePhases((prev) => prev.map((p) => p.id === phase.id ? { ...p, presaleStartMonthOffset: parseInt(e.target.value, 10) || 0 } : p))} placeholder="1" />
                          </div>
                          <div className={PHASE_CELL}>
                            <Label className={PHASE_LABEL} title="Closing start (phase month)">
                              Closing start
                            </Label>
                            <Input className={DENSE_INPUT} type="number" value={phase.closeStartMonthOffset} onChange={(e) => setForSalePhases((prev) => prev.map((p) => p.id === phase.id ? { ...p, closeStartMonthOffset: parseInt(e.target.value, 10) || 0 } : p))} placeholder="4" />
                          </div>
                          <div className={PHASE_CELL}>
                            <Label className={PHASE_LABEL}>Trigger %</Label>
                            <Input className={DENSE_INPUT} type="number" step="0.1" value={phase.presaleTriggerPercent} onChange={(e) => setForSalePhases((prev) => prev.map((p) => p.id === phase.id ? { ...p, presaleTriggerPercent: parseFloat(e.target.value) || 0 } : p))} placeholder="50" />
                          </div>
                          <div className={PHASE_CELL}>
                            <Label className={PHASE_LABEL}>Infra %</Label>
                            <Input className={DENSE_INPUT} type="number" step="0.1" value={phase.infrastructureAllocationPercent ?? ''} onChange={(e) => setForSalePhases((prev) => prev.map((p) => p.id === phase.id ? { ...p, infrastructureAllocationPercent: e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0) } : p))} placeholder="auto" />
                          </div>
                          <div className={PHASE_CELL}>
                            <Label className={PHASE_LABEL}>Land %</Label>
                            <Input
                              className={DENSE_INPUT}
                              type="number"
                              step="0.1"
                              value={phase.landAllocationPercent ?? ''}
                              onChange={(e) =>
                                setForSalePhases((prev) =>
                                  prev.map((p) =>
                                    p.id === phase.id
                                      ? { ...p, landAllocationPercent: e.target.value === '' ? undefined : parseFloat(e.target.value) || 0 }
                                      : p,
                                  ),
                                )
                              }
                              placeholder="0"
                            />
                          </div>
                          <div className={PHASE_CELL}>
                            <Label className={PHASE_LABEL}>Site %</Label>
                            <Input
                              className={DENSE_INPUT}
                              type="number"
                              step="0.1"
                              value={phase.siteWorkAllocationPercent ?? ''}
                              onChange={(e) =>
                                setForSalePhases((prev) =>
                                  prev.map((p) =>
                                    p.id === phase.id
                                      ? {
                                          ...p,
                                          siteWorkAllocationPercent: e.target.value === '' ? undefined : parseFloat(e.target.value) || 0,
                                        }
                                      : p,
                                  ),
                                )
                              }
                              placeholder="0"
                            />
                          </div>
                          <div className={PHASE_CELL}>
                            <Button type="button" size="sm" variant="ghost" className="h-8 w-8 shrink-0 p-0 self-center" onClick={() => setForSalePhases((prev) => prev.filter((p) => p.id !== phase.id))}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                          {(forSalePhaseRowErrors[phase.id] || []).length > 0 && (
                            <div className="col-span-full text-[13px] text-red-600 pt-1">
                              {(forSalePhaseRowErrors[phase.id] || []).join(' ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    </div>
                    </div>
                  </>
                )}

              {/* Full Development Proforma (Sources & Uses, Draw Schedule, IDC) */}
              {!isForSaleLocMode && (
              <WorkspacePanel>
                <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="useDevelopmentProforma"
                    checked={useDevelopmentProforma}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setUseDevelopmentProforma(checked)

                      if (checked) {
                        // Prefill contingency % from estimate if available and not already set
                        if (contingencyPercent === 0) {
                          const constructionCost = trades.reduce((sum, t) => sum + t.totalCost, 0)
                          const estimateContingency = project.estimate.contingency || 0
                          if (constructionCost > 0 && estimateContingency > 0) {
                            const pct = (estimateContingency / constructionCost) * 100
                            setContingencyPercent(parseFloat(pct.toFixed(1)))
                          }
                        }

                        // Prefill construction completion date from project if not already set
                        if (!constructionCompletionDate) {
                          const completion =
                            project.estimatedCompletionDate ||
                            project.endDate ||
                            project.actualCompletionDate ||
                            undefined
                          if (completion) {
                            const iso = new Date(completion).toISOString().split('T')[0]
                            setConstructionCompletionDate(iso)
                          }
                        }
                      }
                    }}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="useDevelopmentProforma" className="text-sm font-semibold cursor-pointer text-slate-800">
                    Full development proforma (Sources & Uses, construction draw schedule, interest during construction)
                  </Label>
                </div>
                {useDevelopmentProforma && (
                  <div className="space-y-1">
                      <h4 className="m-0 text-base font-semibold leading-tight tracking-tight text-slate-900">
                        Development cost and loan assumptions
                      </h4>
                      <FormRow>
                        <FormField width="growLarge">
                          <Label htmlFor="landCost" className={WORKSHEET_LABEL} title="Land cost ($)">
                            Land cost ($)
                          </Label>
                          <Input
                            className={DENSE_INPUT}
                            id="landCost"
                            type="text"
                            inputMode="decimal"
                            value={landCost ? landCost.toLocaleString('en-US') : ''}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/,/g, '')
                              const next = raw === '' ? 0 : parseFloat(raw)
                              setLandCost(isNaN(next) ? 0 : next)
                            }}
                            placeholder="0"
                          />
                          <FieldHelperSlot />
                        </FormField>
                        <FormField width="percent">
                          <Label
                            htmlFor="softCostPercent"
                            className={WORKSHEET_LABEL}
                            title="Soft cost % of construction"
                          >
                            Soft cost % (of construction)
                          </Label>
                          <Input
                            className={DENSE_INPUT}
                            id="softCostPercent"
                            type="number"
                            step="0.1"
                            value={softCostPercent || ''}
                            onChange={(e) => setSoftCostPercent(parseFloat(e.target.value) || 0)}
                            placeholder="e.g. 10"
                          />
                          <FieldHelperSlot>% of hard construction</FieldHelperSlot>
                        </FormField>
                        <FormField width="percent">
                          <Label
                            htmlFor="contingencyPercent"
                            className={WORKSHEET_LABEL}
                            title="Contingency % of construction"
                          >
                            Contingency % (of construction)
                          </Label>
                          <Input
                            className={DENSE_INPUT}
                            id="contingencyPercent"
                            type="number"
                            step="0.1"
                            value={contingencyPercent || ''}
                            onChange={(e) => setContingencyPercent(parseFloat(e.target.value) || 0)}
                            placeholder="e.g. 5"
                          />
                          <FieldHelperSlot />
                        </FormField>
                        <FormField width="medium">
                          <Label htmlFor="constructionMonthsInput" className={WORKSHEET_LABEL} title="Construction months">
                            Construction months
                          </Label>
                          <Input
                            className={DENSE_INPUT}
                            id="constructionMonthsInput"
                            type="number"
                            min="0"
                            value={constructionMonthsInput || ''}
                            onChange={(e) => setConstructionMonthsInput(parseInt(e.target.value, 10) || 0)}
                            placeholder="0 = auto"
                          />
                          <FieldHelperSlot>0 uses completion date vs start.</FieldHelperSlot>
                        </FormField>
                      </FormRow>
                      <FormRow>
                        <FormField width="percent">
                          <Label htmlFor="loanToCostPercent" className={WORKSHEET_LABEL} title="Loan-to-cost %">
                            Loan-to-cost %
                          </Label>
                          <Input
                            className={DENSE_INPUT}
                            id="loanToCostPercent"
                            type="number"
                            step="0.1"
                            value={loanToCostPercent || ''}
                            onChange={(e) => setLoanToCostPercent(parseFloat(e.target.value) || 0)}
                            placeholder="e.g. 75"
                          />
                          <FieldHelperSlot>Loan = total dev cost × %</FieldHelperSlot>
                        </FormField>
                        <FormField width="percent">
                          <Label htmlFor="exitCapRate" className={WORKSHEET_LABEL} title="Exit cap rate (%)">
                            Exit cap rate (%)
                          </Label>
                          <Input
                            className={DENSE_INPUT}
                            id="exitCapRate"
                            type="number"
                            step="0.1"
                            value={exitCapRate || ''}
                            onChange={(e) => setExitCapRate(parseFloat(e.target.value) || 0)}
                            placeholder="e.g. 5.5"
                          />
                          <FieldHelperSlot>Value = NOI ÷ cap</FieldHelperSlot>
                        </FormField>
                        <FormField width="percent">
                          <Label htmlFor="refinanceLTVPercent" className={WORKSHEET_LABEL} title="Refinance LTV (%)">
                            Refinance LTV (%)
                          </Label>
                          <Input
                            className={DENSE_INPUT}
                            id="refinanceLTVPercent"
                            type="number"
                            step="0.1"
                            value={refinanceLTVPercent || ''}
                            onChange={(e) => setRefinanceLTVPercent(parseFloat(e.target.value) || 0)}
                            placeholder="e.g. 75"
                          />
                          <FieldHelperSlot>Refinance loan = value × %</FieldHelperSlot>
                        </FormField>
                        <div className="hidden min-w-0 flex-1 sm:block" aria-hidden />
                      </FormRow>

                    <div className="space-y-1 border-t border-slate-200 pt-1">
                      <h4 className="m-0 text-base font-semibold leading-tight tracking-tight text-slate-900">LP–GP capital structure</h4>
                      <FormRow>
                        <FormField width="growMedium">
                          <Label htmlFor="lpEquityPercent" className={WORKSHEET_LABEL} title="LP equity %">
                            LP equity %
                          </Label>
                          <Input
                            className={DENSE_INPUT}
                            id="lpEquityPercent"
                            type="number"
                            step="0.1"
                            value={lpEquityPercent}
                            onChange={(e) => setLpEquityPercent(parseFloat(e.target.value) || 0)}
                          />
                          <FieldHelperSlot>GP equity % = 100 − LP %</FieldHelperSlot>
                        </FormField>
                        <FormField width="growMedium">
                          <Label
                            htmlFor="lpPreferredReturnPercent"
                            className={WORKSHEET_LABEL}
                            title="LP preferred return % (annual, simple)"
                          >
                            LP preferred return % (annual, simple)
                          </Label>
                          <Input
                            className={DENSE_INPUT}
                            id="lpPreferredReturnPercent"
                            type="number"
                            step="0.1"
                            value={lpPreferredReturnPercent}
                            onChange={(e) => setLpPreferredReturnPercent(parseFloat(e.target.value) || 0)}
                          />
                          <FieldHelperSlot>On LP equity balance.</FieldHelperSlot>
                        </FormField>
                        <FormField width="growMedium">
                          <Label
                            htmlFor="lpAbovePrefProfitSharePercent"
                            className={WORKSHEET_LABEL}
                            title="LP share of profit above pref %"
                          >
                            LP share of profit above pref %
                          </Label>
                          <Input
                            className={DENSE_INPUT}
                            id="lpAbovePrefProfitSharePercent"
                            type="number"
                            step="0.1"
                            value={lpAbovePrefProfitSharePercent}
                            onChange={(e) => setLpAbovePrefProfitSharePercent(parseFloat(e.target.value) || 0)}
                          />
                          <FieldHelperSlot>GP share = 100 − LP share.</FieldHelperSlot>
                        </FormField>
                      </FormRow>
                    </div>

                    <div className="space-y-1 border-t border-slate-200 pt-1">
                      <h4 className="m-0 text-base font-semibold leading-tight tracking-tight text-slate-900">
                        Stabilized value and annual display
                      </h4>
                      <FormRow>
                        <FormField width="selectWide">
                          <Label htmlFor="valueMethod" className={WORKSHEET_LABEL} title="Value method">
                            Value method
                          </Label>
                          <Select value={valueMethod} onValueChange={(v: ValueMethod) => setValueMethod(v)}>
                            <SelectTrigger id="valueMethod" className={cn(DENSE_INPUT, 'text-left')}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="stabilized">Stabilized (flat / appreciation-based)</SelectItem>
                              <SelectItem value="noi-based">NOI-based (NOI ÷ exit cap)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FieldHelperSlot />
                        </FormField>
                        {valueMethod === 'stabilized' ? (
                          <FormField width="growMedium">
                            <Label
                              htmlFor="annualAppreciationPercent"
                              className={WORKSHEET_LABEL}
                              title="Annual appreciation % (display only)"
                            >
                              Annual appreciation % (display only)
                            </Label>
                            <Input
                              className={DENSE_INPUT}
                              id="annualAppreciationPercent"
                              type="number"
                              step="0.1"
                              value={annualAppreciationPercent}
                              onChange={(e) => setAnnualAppreciationPercent(parseFloat(e.target.value) || 0)}
                              placeholder="e.g. 2.0"
                            />
                            <FieldHelperSlot>
                              Annual Proforma column only; refi / exit uses modeled stabilized value.
                            </FieldHelperSlot>
                          </FormField>
                        ) : (
                          <FormField width="growWide">
                            <Label className={WORKSHEET_LABEL} title="Annual column when NOI-based">
                              Annual column (NOI-based)
                            </Label>
                            <div className="flex min-h-8 items-center text-[13px] leading-snug text-slate-600">
                              Appreciation is not used. Annual display follows NOI ÷ exit cap rate.
                            </div>
                            <FieldHelperSlot />
                          </FormField>
                        )}
                      </FormRow>
                    </div>
                  </div>
                )}
                </div>
              </WorkspacePanel>
              )}

              {/* Funding Milestones (Draw Schedule) */}
              {!isForSaleLocMode && (
              <WorkspacePanel>
                <div className="flex items-center justify-between mb-1">
                  <Label>Funding Milestones (Draw Schedule) *</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      handleAddMilestone()
                      setValidationErrors([])
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Milestone
                  </Button>
                </div>
                {isDealUnderwriting && (
                  <p className="text-xs text-gray-500 mb-3">
                    Milestones are optional underwriting assumptions for modeling inflows during construction.
                  </p>
                )}
                <div className="space-y-2">
                  {(() => {
                    const fundingBase = contractValue || 0
                    const sorted = [...paymentMilestones].sort(
                      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
                    )
                    let prevPct = 0
                    return sorted.map((milestone) => {
                      const currentPct = milestone.percentComplete || 0
                      const incrementalPct = currentPct - prevPct
                      prevPct = currentPct
                      const computedAmount = fundingBase * (incrementalPct / 100)

                      return (
                      <div key={milestone.id} className="grid grid-cols-12 gap-1.5 p-2 border rounded-md">
                        <div className="col-span-12 md:col-span-4">
                          <Input
                            placeholder="Milestone name"
                            value={milestone.name}
                            onChange={(e) => handleMilestoneChange(milestone.id, 'name', e.target.value)}
                          />
                        </div>
                        <div className="col-span-6 md:col-span-2">
                          <Input
                            type="date"
                            value={new Date(milestone.date).toISOString().split('T')[0]}
                            onChange={(e) => handleMilestoneChange(milestone.id, 'date', new Date(e.target.value))}
                          />
                        </div>
                        <div className="col-span-6 md:col-span-2">
                          <div className="text-xs text-gray-500 mb-0.5">Funding Amount ($)</div>
                          <div className="text-sm font-semibold">
                            {fundingBase > 0 && incrementalPct > 0 ? formatCurrency(computedAmount) : '—'}
                            {incrementalPct > 0 && (
                              <span className="block text-[11px] text-gray-500">
                                {incrementalPct.toFixed(1)}% of funding base
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="col-span-6 md:col-span-2">
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="Percent Complete (%)"
                            value={milestone.percentComplete}
                            onChange={(e) => {
                              handleMilestoneChange(
                                milestone.id,
                                'percentComplete',
                                parseFloat(e.target.value) || 0,
                              )
                              setValidationErrors([])
                            }}
                          />
                        </div>
                        <div className="col-span-6 md:col-span-2 flex items-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveMilestone(milestone.id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    )
                    })
                  })()}
                </div>
              </WorkspacePanel>
              )}

              {/* Rental Income Section (Rental Hold only — operations / hold period) */}
              {proFormaMode === 'rental-hold' && (
              <WorkspacePanel>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="includeRentalIncome"
                      checked={includeRentalIncome}
                      onChange={(e) => setIncludeRentalIncome(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="includeRentalIncome" className="text-sm font-semibold cursor-pointer text-slate-800">
                      Rental Income
                    </Label>
                  </div>
                  {includeRentalIncome && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddRentalUnit}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Unit
                    </Button>
                  )}
                </div>
                
                {includeRentalIncome && (
                  <div className="space-y-2">
                    {rentalUnits.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">
                        No rental units added. Click "Add Unit" to start.
                      </p>
                    ) : (
                      rentalUnits.map((unit) => (
                        <div key={unit.id} className="grid grid-cols-12 gap-1.5 p-2 border rounded-md bg-gray-50">
                          <div className="col-span-12 md:col-span-3">
                            <Label className="text-xs">Unit Name *</Label>
                            <Input
                              placeholder="e.g., First Floor Store, Unit 2A"
                              value={unit.name}
                              onChange={(e) => handleRentalUnitChange(unit.id, 'name', e.target.value)}
                            />
                          </div>
                          <div className="col-span-6 md:col-span-2">
                            <Label className="text-xs">Rent Type *</Label>
                            <Select
                              value={unit.rentType}
                              onValueChange={(v: 'fixed' | 'perSqft') => handleRentalUnitChange(unit.id, 'rentType', v)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="fixed">Fixed Monthly</SelectItem>
                                <SelectItem value="perSqft">Per Sqft</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-6 md:col-span-2 flex items-end">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-full"
                              onClick={() => handleEnableLeaseTerms(unit.id)}
                              disabled={Array.isArray(unit.leaseTerms) && unit.leaseTerms.length > 0}
                            >
                              {Array.isArray(unit.leaseTerms) && unit.leaseTerms.length > 0
                                ? 'Lease Terms Enabled'
                                : 'Enable Lease Terms'}
                            </Button>
                          </div>

                          {Array.isArray(unit.leaseTerms) && unit.leaseTerms.length > 0 ? (
                            <>
                              <div className="col-span-12 border rounded-md p-2 bg-white">
                                <div className="flex items-center justify-between mb-2">
                                  <Label className="text-xs font-semibold">Lease Terms</Label>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleAddLeaseTerm(unit.id)}
                                  >
                                    <Plus className="w-3 h-3 mr-1" />
                                    Add Term
                                  </Button>
                                </div>
                                <div className="space-y-2">
                                  {(unit.leaseTerms || []).map((term) => (
                                    <div key={term.id} className="grid grid-cols-12 gap-1.5 p-1.5 border rounded">
                                      <div className="col-span-12 md:col-span-2">
                                        <Label className="text-xs">Term Name</Label>
                                        <Input
                                          value={term.name || ''}
                                          placeholder="e.g., Years 1-5"
                                          onChange={(e) =>
                                            handleLeaseTermChange(unit.id, term.id, 'name', e.target.value)
                                          }
                                        />
                                      </div>
                                      <div className="col-span-6 md:col-span-2">
                                        <Label className="text-xs">Start</Label>
                                        <Input
                                          type="date"
                                          value={term.startDate ? new Date(term.startDate).toISOString().split('T')[0] : ''}
                                          onChange={(e) =>
                                            handleLeaseTermChange(
                                              unit.id,
                                              term.id,
                                              'startDate',
                                              e.target.value ? new Date(e.target.value) : undefined,
                                            )
                                          }
                                        />
                                      </div>
                                      <div className="col-span-6 md:col-span-2">
                                        <Label className="text-xs">End</Label>
                                        <Input
                                          type="date"
                                          value={term.endDate ? new Date(term.endDate).toISOString().split('T')[0] : ''}
                                          onChange={(e) =>
                                            handleLeaseTermChange(
                                              unit.id,
                                              term.id,
                                              'endDate',
                                              e.target.value ? new Date(e.target.value) : undefined,
                                            )
                                          }
                                        />
                                      </div>
                                      <div className="col-span-6 md:col-span-2">
                                        <Label className="text-xs">Rent Type</Label>
                                        <Select
                                          value={term.rentType}
                                          onValueChange={(v: 'fixed' | 'perSqft') =>
                                            handleLeaseTermChange(unit.id, term.id, 'rentType', v)
                                          }
                                        >
                                          <SelectTrigger>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="fixed">Fixed Monthly</SelectItem>
                                            <SelectItem value="perSqft">Per Sqft</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      {term.rentType === 'fixed' ? (
                                        <div className="col-span-6 md:col-span-2">
                                          <Label className="text-xs">Monthly Rent</Label>
                                          <Input
                                            type="number"
                                            step="0.01"
                                            value={term.monthlyRent || ''}
                                            onChange={(e) =>
                                              handleLeaseTermChange(
                                                unit.id,
                                                term.id,
                                                'monthlyRent',
                                                parseFloat(e.target.value) || 0,
                                              )
                                            }
                                          />
                                        </div>
                                      ) : (
                                        <div className="col-span-6 md:col-span-2">
                                          <Label className="text-xs">Rent / Sqft / Month</Label>
                                          <Input
                                            type="number"
                                            step="0.01"
                                            value={term.rentPerSqft || ''}
                                            onChange={(e) =>
                                              handleLeaseTermChange(
                                                unit.id,
                                                term.id,
                                                'rentPerSqft',
                                                parseFloat(e.target.value) || 0,
                                              )
                                            }
                                          />
                                        </div>
                                      )}
                                      <div className="col-span-6 md:col-span-1">
                                        <Label className="text-xs">Sqft</Label>
                                        <Input
                                          type="number"
                                          step="0.01"
                                          value={term.squareFootage ?? unit.squareFootage ?? ''}
                                          onChange={(e) =>
                                            handleLeaseTermChange(
                                              unit.id,
                                              term.id,
                                              'squareFootage',
                                              parseFloat(e.target.value) || 0,
                                            )
                                          }
                                        />
                                      </div>
                                      <div className="col-span-6 md:col-span-1">
                                        <Label className="text-xs">Occ %</Label>
                                        <Input
                                          type="number"
                                          step="0.1"
                                          value={term.occupancyRate ?? unit.occupancyRate}
                                          onChange={(e) =>
                                            handleLeaseTermChange(
                                              unit.id,
                                              term.id,
                                              'occupancyRate',
                                              parseFloat(e.target.value) || 0,
                                            )
                                          }
                                        />
                                      </div>
                                      <div className="col-span-12 md:col-span-2 flex items-end">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleRemoveLeaseTerm(unit.id, term.id)}
                                        >
                                          <Trash2 className="w-4 h-4 text-red-500" />
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <p className="text-xs text-gray-500 mt-2">
                                  Lease terms model time-based rent changes for the same physical unit.
                                </p>
                                {getLeaseTermWarnings(unit).length > 0 && (
                                  <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1">
                                    {getLeaseTermWarnings(unit).map((warning, wIdx) => (
                                      <p key={wIdx} className="text-[11px] text-amber-700">
                                        {warning}
                                      </p>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            unit.rentType === 'fixed' ? (
                              <>
                                <div className="col-span-6 md:col-span-2">
                                  <Label className="text-xs">Monthly Rent *</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="750.00"
                                    value={unit.monthlyRent || ''}
                                    onChange={(e) => handleRentalUnitChange(unit.id, 'monthlyRent', parseFloat(e.target.value) || 0)}
                                  />
                                </div>
                                <div className="col-span-6 md:col-span-2">
                                  <Label className="text-xs">Square Feet (Optional)</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="1000"
                                    value={unit.squareFootage || ''}
                                    onChange={(e) => handleRentalUnitChange(unit.id, 'squareFootage', parseFloat(e.target.value) || 0)}
                                  />
                                </div>
                                <div className="col-span-6 md:col-span-2">
                                  <Label className="text-xs">Occupancy Rate (%)</Label>
                                  <Input
                                    type="number"
                                    step="0.1"
                                    placeholder="100"
                                    value={unit.occupancyRate}
                                    onChange={(e) => handleRentalUnitChange(unit.id, 'occupancyRate', parseFloat(e.target.value) || 0)}
                                  />
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="col-span-6 md:col-span-2">
                                  <Label className="text-xs">Square Feet *</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="1000"
                                    value={unit.squareFootage || ''}
                                    onChange={(e) => handleRentalUnitChange(unit.id, 'squareFootage', parseFloat(e.target.value) || 0)}
                                  />
                                </div>
                                <div className="col-span-6 md:col-span-2">
                                  <Label className="text-xs">Rent Per Sqft/Month *</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="10.00"
                                    value={unit.rentPerSqft || ''}
                                    onChange={(e) => handleRentalUnitChange(unit.id, 'rentPerSqft', parseFloat(e.target.value) || 0)}
                                  />
                                </div>
                                <div className="col-span-6 md:col-span-2">
                                  <Label className="text-xs">Occupancy Rate (%)</Label>
                                  <Input
                                    type="number"
                                    step="0.1"
                                    placeholder="100"
                                    value={unit.occupancyRate}
                                    onChange={(e) => handleRentalUnitChange(unit.id, 'occupancyRate', parseFloat(e.target.value) || 0)}
                                  />
                                </div>
                              </>
                            )
                          )}
                          
                          <div className="col-span-6 md:col-span-2 flex items-end">
                            <div className="w-full">
                              <Label className="text-xs">Start Date (Optional)</Label>
                              <Input
                                type="date"
                                value={unit.occupancyStartDate ? new Date(unit.occupancyStartDate).toISOString().split('T')[0] : ''}
                                onChange={(e) => handleRentalUnitChange(unit.id, 'occupancyStartDate', e.target.value ? new Date(e.target.value) : undefined)}
                              />
                            </div>
                          </div>

                          <div className="col-span-6 md:col-span-2 flex items-end">
                            <div className="w-full">
                              <Label className="text-xs">Duration (Years)</Label>
                              <Select
                                value={unit.leaseDurationYears ? String(unit.leaseDurationYears) : 'none'}
                                onValueChange={(v) =>
                                  handleRentalUnitChange(
                                    unit.id,
                                    'leaseDurationYears',
                                    v === 'none' ? undefined : parseInt(v, 10),
                                  )
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Optional" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Manual end date</SelectItem>
                                  {Array.from({ length: 15 }, (_, i) => i + 1).map((years) => (
                                    <SelectItem key={years} value={String(years)}>
                                      {years} year{years > 1 ? 's' : ''}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="col-span-6 md:col-span-2 flex items-end">
                            <div className="w-full">
                              <Label className="text-xs">End Date (Optional)</Label>
                              <Input
                                type="date"
                                value={unit.occupancyEndDate ? new Date(unit.occupancyEndDate).toISOString().split('T')[0] : ''}
                                onChange={(e) => handleRentalUnitChange(unit.id, 'occupancyEndDate', e.target.value ? new Date(e.target.value) : undefined)}
                              />
                            </div>
                          </div>
                          
                          <div className="col-span-6 md:col-span-1 flex items-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveRentalUnit(unit.id)}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                          
                          {!Array.isArray(unit.leaseTerms) || unit.leaseTerms.length === 0 ? (
                            unit.rentType === 'fixed' && unit.monthlyRent ? (
                              <div className="col-span-12 text-sm text-gray-600">
                                Monthly income: {formatCurrency((unit.monthlyRent || 0) * (unit.occupancyRate / 100))}
                              </div>
                            ) : unit.rentType === 'perSqft' && unit.squareFootage && unit.rentPerSqft ? (
                              <div className="col-span-12 text-sm text-gray-600">
                                Monthly income: {formatCurrency((unit.squareFootage || 0) * (unit.rentPerSqft || 0) * (unit.occupancyRate / 100))}
                              </div>
                            ) : null
                          ) : (
                            <div className="col-span-12 text-sm text-gray-600">
                              Lease terms active: {unit.leaseTerms.length}
                            </div>
                          )}
                          {unit.occupancyStartDate && unit.occupancyEndDate && new Date(unit.occupancyEndDate) < new Date(unit.occupancyStartDate) ? (
                            <div className="col-span-12 text-xs text-red-600">
                              End Date cannot be earlier than Start Date.
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </WorkspacePanel>
              )}

              {/* Operating Expenses Section (Rental Hold only) */}
              {proFormaMode === 'rental-hold' && (
              <WorkspacePanel>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id="includeOperatingExpenses"
                    checked={includeOperatingExpenses}
                    onChange={(e) => setIncludeOperatingExpenses(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="includeOperatingExpenses" className="text-sm font-semibold cursor-pointer text-slate-800">
                    Operating Expenses
                  </Label>
                </div>
                
                {includeOperatingExpenses && (
                  <FormGrid>
                    <GridField size="xs">
                      <Label htmlFor="propertyManagementPercent">Property Management (%)</Label>
                      <Input
                        className="w-full max-w-[120px]"
                        id="propertyManagementPercent"
                        type="number"
                        step="0.1"
                        value={operatingExpenses.propertyManagementPercent}
                        onChange={(e) => setOperatingExpenses({
                          ...operatingExpenses,
                          propertyManagementPercent: parseFloat(e.target.value) || 0,
                        })}
                        placeholder="0.0"
                      />
                      <p className="text-[10px] text-gray-500 leading-tight">% of rental income</p>
                    </GridField>
                    <GridField size="xs">
                      <Label htmlFor="capExPercent">Cap EX %</Label>
                      <Input
                        className="w-full max-w-[120px]"
                        id="capExPercent"
                        type="number"
                        step="0.1"
                        value={operatingExpenses.capExPercent || ''}
                        onChange={(e) => setOperatingExpenses({
                          ...operatingExpenses,
                          capExPercent: parseFloat(e.target.value) || undefined,
                        })}
                        placeholder="0.0"
                      />
                      <p className="text-[10px] text-gray-500 leading-tight">% of rental income</p>
                    </GridField>
                    <GridField size="xs">
                      <Label htmlFor="maintenanceReservePercent">Monthly Maintenance Reserve (%)</Label>
                      <Input
                        className="w-full max-w-[120px]"
                        id="maintenanceReservePercent"
                        type="number"
                        step="0.1"
                        value={operatingExpenses.maintenanceReservePercent}
                        onChange={(e) => setOperatingExpenses({
                          ...operatingExpenses,
                          maintenanceReservePercent: parseFloat(e.target.value) || 0,
                        })}
                        placeholder="0.0"
                      />
                      <p className="text-[10px] text-gray-500 leading-tight">% of rental income</p>
                    </GridField>
                    <GridField size="sm">
                      <Label htmlFor="monthlyPropertyInsurance">Monthly Property Insurance</Label>
                      <Input
                        className="w-full max-w-[180px]"
                        id="monthlyPropertyInsurance"
                        type="number"
                        step="0.01"
                        value={operatingExpenses.monthlyPropertyInsurance}
                        onChange={(e) => setOperatingExpenses({
                          ...operatingExpenses,
                          monthlyPropertyInsurance: parseFloat(e.target.value) || 0,
                        })}
                        placeholder="0.00"
                      />
                    </GridField>
                    <GridField size="sm">
                      <Label htmlFor="annualPropertyTax">Annual Property Tax</Label>
                      <Input
                        className="w-full max-w-[180px]"
                        id="annualPropertyTax"
                        type="number"
                        step="0.01"
                        value={operatingExpenses.annualPropertyTax}
                        onChange={(e) => setOperatingExpenses({
                          ...operatingExpenses,
                          annualPropertyTax: parseFloat(e.target.value) || 0,
                        })}
                        placeholder="0.00"
                      />
                      <p className="text-[10px] text-gray-500 leading-tight">Annual amount, prorated monthly.</p>
                    </GridField>
                    <GridField size="sm">
                      <Label htmlFor="monthlyUtilities">Monthly Utilities (Common Areas)</Label>
                      <Input
                        className="w-full max-w-[180px]"
                        id="monthlyUtilities"
                        type="number"
                        step="0.01"
                        value={operatingExpenses.monthlyUtilities || ''}
                        onChange={(e) => setOperatingExpenses({
                          ...operatingExpenses,
                          monthlyUtilities: parseFloat(e.target.value) || undefined,
                        })}
                        placeholder="0.00"
                      />
                    </GridField>
                    <GridField size="md">
                      <Label htmlFor="monthlyOther">Other Monthly Expenses</Label>
                      <Input
                        className="w-full max-w-[220px]"
                        id="monthlyOther"
                        type="number"
                        step="0.01"
                        value={operatingExpenses.monthlyOther || ''}
                        onChange={(e) => setOperatingExpenses({
                          ...operatingExpenses,
                          monthlyOther: parseFloat(e.target.value) || undefined,
                        })}
                        placeholder="0.00"
                      />
                    </GridField>
                  </FormGrid>
                )}
              </WorkspacePanel>
              )}

              {/* Debt Service Section — permanent loan after stabilization (Rental Hold only; gen dev uses full development proforma loan / refi) */}
              {proFormaMode === 'rental-hold' && (
              <WorkspacePanel>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id="includeDebtService"
                    checked={includeDebtService}
                    onChange={(e) => setIncludeDebtService(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="includeDebtService" className="text-sm font-semibold cursor-pointer text-slate-800">
                    Debt Service
                  </Label>
                </div>
                
                {includeDebtService && (
                  <FormGrid>
                    <GridField size="md">
                      <Label htmlFor="loanAmount">Loan Amount</Label>
                      <Input
                        className="w-full max-w-[220px]"
                        id="loanAmount"
                        type="number"
                        step="0.01"
                        value={debtService.loanAmount}
                        onChange={(e) => setDebtService({
                          ...debtService,
                          loanAmount: parseFloat(e.target.value) || 0,
                        })}
                        placeholder="0.00"
                      />
                    </GridField>
                    <GridField size="xs">
                      <Label htmlFor="interestRate">Interest Rate (%)</Label>
                      <Input
                        className="w-full max-w-[120px]"
                        id="interestRate"
                        type="number"
                        step="0.01"
                        value={debtService.interestRate}
                        onChange={(e) => setDebtService({
                          ...debtService,
                          interestRate: parseFloat(e.target.value) || 0,
                        })}
                        placeholder="5.5"
                      />
                      <p className="text-[10px] text-gray-500 leading-tight">Annual % rate</p>
                    </GridField>
                    <GridField size="xs">
                      <Label htmlFor="loanTermMonths">Loan Term (Months)</Label>
                      <Input
                        className="w-full max-w-[120px]"
                        id="loanTermMonths"
                        type="number"
                        value={debtService.loanTermMonths}
                        onChange={(e) => setDebtService({
                          ...debtService,
                          loanTermMonths: parseInt(e.target.value) || 360,
                        })}
                        placeholder="360"
                      />
                      <p className="text-[10px] text-gray-500 leading-tight">Amortization months (e.g., 360)</p>
                    </GridField>
                    <GridField size="sm">
                      <Label htmlFor="paymentType">Payment Type</Label>
                      <Select
                        value={debtService.paymentType}
                        onValueChange={(v: 'interest-only' | 'principal-interest') => setDebtService({
                          ...debtService,
                          paymentType: v,
                        })}
                      >
                        <SelectTrigger className="w-full max-w-[240px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="interest-only">Interest Only (Construction)</SelectItem>
                          <SelectItem value="principal-interest">Principal + Interest (Permanent)</SelectItem>
                        </SelectContent>
                      </Select>
                    </GridField>
                    {debtService.loanAmount > 0 && debtService.interestRate > 0 && (
                      <GridField size="lg">
                        <p className="text-sm text-gray-600">
                          Estimated monthly payment: <span className="font-semibold">
                            {formatCurrency(
                              debtService.paymentType === 'interest-only'
                                ? (debtService.loanAmount * debtService.interestRate / 100 / 12)
                                : (debtService.loanAmount * 
                                    (debtService.interestRate / 100 / 12 * Math.pow(1 + debtService.interestRate / 100 / 12, debtService.loanTermMonths)) /
                                    (Math.pow(1 + debtService.interestRate / 100 / 12, debtService.loanTermMonths) - 1))
                            )}
                          </span>
                        </p>
                      </GridField>
                    )}
                  </FormGrid>
                )}
              </WorkspacePanel>
              )}

              </div>
              </div>

              <aside className="w-full shrink-0 space-y-2.5 rounded-sm border border-slate-200 bg-slate-50/95 p-2.5 md:p-3 lg:sticky lg:top-[3.25rem] lg:max-h-[calc(100dvh-4.75rem)] lg:w-[min(30%,22rem)] lg:overflow-y-auto xl:w-[min(28%,380px)]">
                <div className="space-y-2">
                  <p className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">Mode</p>
                  <div className="flex flex-col gap-1">
                    <ModeTabButton
                      block
                      active={proFormaMode === 'rental-hold'}
                      label="Rental Hold"
                      onClick={() => setProFormaMode('rental-hold')}
                    />
                    <ModeTabButton
                      block
                      active={proFormaMode !== 'rental-hold'}
                      label="Development"
                      onClick={() => setProFormaMode('general-development')}
                    />
                  </div>
                </div>
                {proFormaMode !== 'rental-hold' && (
                  <div className="space-y-1.5 border-t border-slate-200 pt-2">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Development scenario
                    </Label>
                    <div className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1.5">
                      <input
                        id="enableForSaleLocMode"
                        type="checkbox"
                        checked={isForSaleLocMode}
                        onChange={(e) =>
                          setProFormaMode(e.target.checked ? 'for-sale-phased-loc' : 'general-development')
                        }
                        className="h-4 w-4"
                      />
                      <Label htmlFor="enableForSaleLocMode" className="text-[13px] text-slate-700">
                        Enable for-sale phased LOC assumptions
                      </Label>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 border-t border-slate-200 pt-2">
                  <p className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">Version</p>
                  <Select
                    value={isDealUnderwriting ? selectedDealVersionId : selectedProjectVersionId}
                    onValueChange={(v) =>
                      isDealUnderwriting ? setSelectedDealVersionId(v) : setSelectedProjectVersionId(v)
                    }
                  >
                    <SelectTrigger className="h-8 w-full text-sm">
                      <SelectValue placeholder="Load version" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="latest">
                        {isDealUnderwriting ? 'Latest (draft or newest)' : 'Latest saved inputs'}
                      </SelectItem>
                      {isDealUnderwriting
                        ? dealProFormaVersions.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.isDraft
                                ? `Draft${v.versionLabel ? ` - ${v.versionLabel}` : ''}`
                                : `V${v.versionNumber}${v.versionLabel ? ` - ${v.versionLabel}` : ''}`}
                            </SelectItem>
                          ))
                        : projectProFormaVersions.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {`V${v.versionNumber}${v.versionLabel ? ` - ${v.versionLabel}` : ''}`}
                            </SelectItem>
                          ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-8 w-full text-sm"
                    placeholder="Version label (optional)"
                    value={newVersionLabel}
                    onChange={(e) => setNewVersionLabel(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-full text-sm"
                    onClick={isDealUnderwriting ? handleSaveDealVersion : handleSaveProjectVersion}
                  >
                    Save Version
                  </Button>
                </div>

                {isDealUnderwriting && (
                  <div className="space-y-1.5 border-t border-slate-200 pt-2">
                    <SectionHeading
                      title="Narrative"
                      description="Used in underwriting exports and presentations."
                    />
                    <div>
                      <Label htmlFor="publicBenefits" className="text-xs text-slate-600">
                        Public benefit (bullets, optional)
                      </Label>
                      <textarea
                        id="publicBenefits"
                        className="mt-1 min-h-[88px] w-full rounded-md border border-slate-300 bg-white p-2 text-sm"
                        placeholder="One benefit per line"
                        value={publicBenefitsText}
                        onChange={(e) => {
                          const text = e.target.value
                          setPublicBenefitsText(text)
                          setDealSummaryInputs({
                            ...dealSummaryInputs,
                            publicBenefits: text
                              .split('\n')
                              .filter((s) => s.trim().length > 0),
                          })
                        }}
                      />
                    </div>
                    <div>
                      <Label htmlFor="conclusionText" className="text-xs text-slate-600">
                        Summary / conclusion (optional)
                      </Label>
                      <textarea
                        id="conclusionText"
                        className="mt-1 min-h-[88px] w-full rounded-md border border-slate-300 bg-white p-2 text-sm"
                        placeholder="Short narrative for banks, investors, or municipalities."
                        value={dealSummaryInputs.conclusionText ?? ''}
                        onChange={(e) =>
                          setDealSummaryInputs({
                            ...dealSummaryInputs,
                            conclusionText: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                )}

                {isForSaleLocMode && (
                  <div className="space-y-1.5 border-t border-slate-200 pt-2">
                    <p className="text-xs font-semibold text-slate-800">LOC mode checks</p>
                    <div className="rounded-md border border-slate-200 bg-white p-2.5 text-xs text-slate-700">
                      {(() => {
                        const totalPhaseUnits = forSalePhases.reduce((sum, p) => sum + (p.unitCount || 0), 0)
                        const totalConstructionBudget =
                          (forSaleTotalHardBudget || 0) + (forSaleTotalSoftBudget || 0)
                        const infraAllocPct = forSalePhases.reduce(
                          (sum, p) => sum + (p.infrastructureAllocationPercent || 0),
                          0,
                        )
                        const bucketTotal =
                          (forSaleSalesBuckets.locPaydownPercent || 0) +
                          (forSaleSalesBuckets.reinvestPercent || 0) +
                          (forSaleSalesBuckets.reservePercent || 0) +
                          (forSaleSalesBuckets.distributionPercent || 0)

                        return (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-slate-500">Phase units</span>
                                <p className="font-semibold text-slate-900">{totalPhaseUnits.toLocaleString()}</p>
                              </div>
                              <div>
                                <span className="text-slate-500">Construction (H+S)</span>
                                <p className="font-semibold text-slate-900">{formatCurrency(totalConstructionBudget)}</p>
                              </div>
                              <div>
                                <span className="text-slate-500">Infra alloc.</span>
                                <p className={`font-semibold ${infraAllocPct > 100 ? 'text-red-600' : 'text-slate-900'}`}>
                                  {infraAllocPct.toFixed(1)}%
                                </p>
                              </div>
                              <div>
                                <span className="text-slate-500">Bucket total</span>
                                <p
                                  className={`font-semibold ${Math.abs(bucketTotal - 100) > 0.01 ? 'text-red-600' : 'text-slate-900'}`}
                                >
                                  {bucketTotal.toFixed(1)}%
                                </p>
                              </div>
                            </div>
                            {infraAllocPct > 100 && (
                              <p className="text-red-600">
                                Infrastructure allocation exceeds 100%. Reduce per-phase infra allocation percentages.
                              </p>
                            )}
                            {infraAllocPct > 0 && infraAllocPct < 100 && (
                              <p className="text-amber-700">
                                Infrastructure allocation is below 100%. Remaining infrastructure uses phased auto
                                allocation (front-loaded to Phase 1 when no explicit shares are provided).
                              </p>
                            )}
                            {Math.abs(bucketTotal - 100) > 0.01 && (
                              <p className="text-red-600">Sales allocation buckets must total 100% for generation.</p>
                            )}
                            {(forSaleTotalHardBudget > 0 || forSaleTotalSoftBudget > 0) && (
                              <p className="text-slate-600">
                                Construction basis: hard {formatCurrency(forSaleTotalHardBudget)} + soft{' '}
                                {formatCurrency(forSaleTotalSoftBudget)}, allocated by phase units.
                              </p>
                            )}
                            <p className="text-slate-600">Land and site work use phase Land % / Site % (or default to phase 1).</p>
                            <p className="text-slate-600">Avg sale price / unit drives revenue and contract value.</p>
                            <p className="text-slate-600">
                              Presale/closing start = phase-relative month (1 = first month of that phase).
                            </p>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                )}
              </aside>

              </div>

              {validationErrors.length > 0 && (
                <div className="pt-2">
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
                    <p className="text-xs font-semibold text-red-700 mb-1">Please review these items before generating:</p>
                    <ul className="list-disc list-inside text-xs text-red-700 space-y-0.5">
                      {validationErrors.map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

            </>
          ) : (
            <>
              {/* Projection Results */}
              <div className="space-y-6">
                {/* Underwriting Assumptions Summary (deal mode only) */}
                {isDealUnderwriting && underwritingEstimatedConstructionCost > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Underwriting Assumptions Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">Deal Value / Contract Value</p>
                          <p className="font-semibold">{formatCurrency(contractValue)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Estimated Construction Cost</p>
                          <p className="font-semibold">
                            {formatCurrency(underwritingEstimatedConstructionCost)}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Land Cost</p>
                          <p className="font-semibold">{formatCurrency(landCost || 0)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Soft Cost % (of construction)</p>
                          <p className="font-semibold">
                            {softCostPercent != null ? `${softCostPercent.toFixed(1)}%` : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Contingency % (of construction)</p>
                          <p className="font-semibold">
                            {contingencyPercent != null ? `${contingencyPercent.toFixed(1)}%` : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Loan-to-Cost %</p>
                          <p className="font-semibold">
                            {loanToCostPercent != null ? `${loanToCostPercent.toFixed(1)}%` : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Exit Cap Rate</p>
                          <p className="font-semibold">
                            {exitCapRate != null && exitCapRate > 0 ? `${exitCapRate.toFixed(2)}%` : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Refinance LTV %</p>
                          <p className="font-semibold">
                            {refinanceLTVPercent != null && refinanceLTVPercent > 0
                              ? `${refinanceLTVPercent.toFixed(1)}%`
                              : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Value Method</p>
                          <p className="font-semibold">
                            {valueMethod === 'stabilized' ? 'Stabilized' : 'NOI-based'}
                          </p>
                        </div>
                        {valueMethod === 'stabilized' && (
                          <div>
                            <p className="text-gray-500">Annual Appreciation % (display-only)</p>
                            <p className="font-semibold">
                              {annualAppreciationPercent != null
                                ? `${annualAppreciationPercent.toFixed(1)}%`
                                : '—'}
                            </p>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-4">
                        Construction cost allocation defaults used: Labor 35% / Materials 40% / Subcontractors 25% when no detailed estimate exists.
                      </p>
                    </CardContent>
                  </Card>
                )}
                {/* Sources & Uses (full development proforma) */}
                {projection.sourcesAndUses && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Sources & Uses</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Uses</h4>
                          <ul className="space-y-1 text-sm">
                            <li className="flex justify-between"><span>Land</span><span>{formatCurrency(projection.sourcesAndUses.uses.landCost)}</span></li>
                            <li className="flex justify-between"><span>Construction</span><span>{formatCurrency(projection.sourcesAndUses.uses.constructionCost)}</span></li>
                            <li className="flex justify-between"><span>Soft costs</span><span>{formatCurrency(projection.sourcesAndUses.uses.softCost)}</span></li>
                            <li className="flex justify-between"><span>Contingency</span><span>{formatCurrency(projection.sourcesAndUses.uses.contingency)}</span></li>
                            <li className="flex justify-between font-semibold border-t pt-2 mt-2"><span>Total development cost</span><span>{formatCurrency(projection.sourcesAndUses.uses.totalDevelopmentCost)}</span></li>
                          </ul>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Sources</h4>
                          <ul className="space-y-1 text-sm">
                            <li className="flex justify-between"><span>Loan</span><span>{formatCurrency(projection.sourcesAndUses.sources.loanAmount)}</span></li>
                            <li className="flex justify-between font-semibold border-t pt-2 mt-2"><span>Equity required</span><span>{formatCurrency(projection.sourcesAndUses.sources.equityRequired)}</span></li>
                          </ul>
                        </div>
                      </div>
                      {projection.summary.totalInterestDuringConstruction != null && projection.summary.totalInterestDuringConstruction > 0 && (
                        <p className="text-sm text-gray-600 mt-4">
                          Total interest during construction: <span className="font-semibold">{formatCurrency(projection.summary.totalInterestDuringConstruction)}</span>
                        </p>
                      )}
                      {isDealUnderwriting && underwritingEstimatedConstructionCost > 0 && (
                        <p className="text-xs text-gray-500 mt-2">
                          Construction cost shown here is based on the underwriting estimated construction cost input.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Debt Schedule (modeled from permanent loan inputs) */}
                {projection.annualDebtSchedule && projection.annualDebtSchedule.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Debt Schedule</CardTitle>
                      <p className="text-sm text-gray-500">
                        Annual beginning balance, payment, interest, principal, and ending balance for the permanent loan
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="border-b bg-slate-100">
                              <th className="text-left p-2">Year</th>
                              <th className="text-right p-2">Beginning balance</th>
                              <th className="text-right p-2">Payment</th>
                              <th className="text-right p-2">Interest paid</th>
                              <th className="text-right p-2">Principal paid</th>
                              <th className="text-right p-2">Ending balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {projection.annualDebtSchedule.map((row) => (
                              <tr key={row.year} className="border-b">
                                <td className="p-2">{row.year}</td>
                                <td className="text-right p-2">{formatCurrency(row.beginningBalance)}</td>
                                <td className="text-right p-2">{formatCurrency(row.payment)}</td>
                                <td className="text-right p-2">{formatCurrency(row.interestPaid)}</td>
                                <td className="text-right p-2">{formatCurrency(row.principalPaid)}</td>
                                <td className="text-right p-2">{formatCurrency(row.endingBalance)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Construction Draw Schedule (full development proforma) */}
                {projection.constructionDrawSchedule && projection.constructionDrawSchedule.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Construction Draw Schedule</CardTitle>
                      <p className="text-sm text-gray-500">Monthly draws, cumulative draw, loan balance, and interest accrued</p>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="border-b bg-slate-100">
                              <th className="text-left p-2">Month</th>
                              <th className="text-right p-2">Draw</th>
                              <th className="text-right p-2">Cumulative draw</th>
                              <th className="text-right p-2">Loan balance</th>
                              <th className="text-right p-2">Interest accrued</th>
                            </tr>
                          </thead>
                          <tbody>
                            {projection.constructionDrawSchedule.map((row, idx) => (
                              <tr key={idx} className="border-b">
                                <td className="p-2">{row.monthLabel}</td>
                                <td className="text-right p-2">{formatCurrency(row.draw)}</td>
                                <td className="text-right p-2">{formatCurrency(row.cumulativeDraw)}</td>
                                <td className="text-right p-2">{formatCurrency(row.loanBalance)}</td>
                                <td className="text-right p-2">{formatCurrency(row.interestAccrued)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Refinance / Exit & Returns Summary (Phase 2 & 3) */}
                {(projection.summary.exitValue != null || projection.summary.irr != null || projection.summary.equityMultiple != null) && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Refinance / Exit & Returns</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Exit</h4>
                        <ul className="space-y-1 text-sm">
                            {projection.summary.exitValue != null && projection.summary.exitValue > 0 && (
                              <li className="flex justify-between"><span>Stabilized property value</span><span>{formatCurrency(projection.summary.exitValue)}</span></li>
                            )}
                            {projection.summary.refinanceLoanAmount != null && projection.summary.refinanceLoanAmount > 0 && (
                              <li className="flex justify-between"><span>Refinance loan (at stabilization)</span><span>{formatCurrency(projection.summary.refinanceLoanAmount)}</span></li>
                            )}
                            {projection.summary.cashOutRefinance != null && (
                              <li className="flex justify-between font-medium"><span>Cash-out at refinance</span><span>{formatCurrency(projection.summary.cashOutRefinance)}</span></li>
                            )}
                          </ul>
                          <p className="text-xs text-gray-500 mt-3">
                            Loan balance at exit shown below reflects amortization of the permanent loan after refinance.
                          </p>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Investor returns</h4>
                          <div className="space-y-3 text-sm">
                            <div>
                              <div className="flex justify-between mb-1">
                                <span className="font-medium">Overall equity</span>
                              </div>
                              <ul className="space-y-1">
                                {projection.summary.irr != null && (
                                  <li className="flex justify-between"><span>IRR</span><span>{projection.summary.irr.toFixed(1)}%</span></li>
                                )}
                                {projection.summary.equityMultiple != null && (
                                  <li className="flex justify-between"><span>Equity multiple</span><span>{projection.summary.equityMultiple.toFixed(2)}x</span></li>
                                )}
                                {projection.summary.cashOnCashReturn != null && (
                                  <li className="flex justify-between"><span>Cash-on-cash (annual)</span><span>{projection.summary.cashOnCashReturn.toFixed(1)}%</span></li>
                                )}
                              </ul>
                            </div>
                            {(projection.summary.lpIrr != null || projection.summary.gpIrr != null) && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                                <div>
                                  <div className="font-medium mb-1">LP</div>
                                  <ul className="space-y-1">
                                    {projection.summary.lpIrr != null && (
                                      <li className="flex justify-between"><span>IRR</span><span>{projection.summary.lpIrr.toFixed(1)}%</span></li>
                                    )}
                                    {projection.summary.lpEquityMultiple != null && (
                                      <li className="flex justify-between"><span>Equity multiple</span><span>{projection.summary.lpEquityMultiple.toFixed(2)}x</span></li>
                                    )}
                                    {projection.summary.lpCashOnCashReturn != null && (
                                      <li className="flex justify-between"><span>Cash-on-cash</span><span>{projection.summary.lpCashOnCashReturn.toFixed(1)}%</span></li>
                                    )}
                                  </ul>
                                </div>
                                <div>
                                  <div className="font-medium mb-1">GP</div>
                                  <ul className="space-y-1">
                                    {projection.summary.gpIrr != null && (
                                      <li className="flex justify-between"><span>IRR</span><span>{projection.summary.gpIrr.toFixed(1)}%</span></li>
                                    )}
                                    {projection.summary.gpEquityMultiple != null && (
                                      <li className="flex justify-between"><span>Equity multiple</span><span>{projection.summary.gpEquityMultiple.toFixed(2)}x</span></li>
                                    )}
                                    {projection.summary.gpCashOnCashReturn != null && (
                                      <li className="flex justify-between"><span>Cash-on-cash</span><span>{projection.summary.gpCashOnCashReturn.toFixed(1)}%</span></li>
                                    )}
                                  </ul>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Tax Modeling (based on 10-year proforma, if tax inputs provided) */}
                {taxRatePercent > 0 && annualDepreciation > 0 && projection.monthlyCashFlows.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Tax Modeling (Simplified)</CardTitle>
                      <p className="text-sm text-gray-500">
                        Based on average annual NOI, flat tax rate, and annual depreciation (similar to Bolindale tax sheet)
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="border-b bg-slate-100">
                              <th className="text-left p-2">Year</th>
                              <th className="text-right p-2">NOI</th>
                              <th className="text-right p-2">Depreciation</th>
                              <th className="text-right p-2">Taxable income</th>
                              <th className="text-right p-2">Tax rate</th>
                              <th className="text-right p-2">Tax due</th>
                            </tr>
                          </thead>
                          <tbody>
                            {getYearlySummary(projection).map((row) => {
                              const noi = row.rent - row.expenses
                              const taxableIncome = Math.max(0, noi - annualDepreciation)
                              const taxDue = taxableIncome * (taxRatePercent / 100)
                              return (
                                <tr key={row.year} className="border-b">
                                  <td className="p-2">{row.year}</td>
                                  <td className="text-right p-2">{formatCurrency(noi)}</td>
                                  <td className="text-right p-2">{formatCurrency(annualDepreciation)}</td>
                                  <td className="text-right p-2">{formatCurrency(taxableIncome)}</td>
                                  <td className="text-right p-2">{taxRatePercent.toFixed(1)}%</td>
                                  <td className="text-right p-2">{formatCurrency(taxDue)}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Annual Proforma (10-year style view) */}
                {projection.monthlyCashFlows.length > 0 && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <CardTitle>Annual Proforma</CardTitle>
                          <p className="text-sm text-gray-500">
                            Annual NOI, debt service, cash flow after debt, value, loan balance, equity, and ROI by year
                          </p>
                        </div>
                        <div className="text-xs text-gray-500 whitespace-nowrap">
                          Value Method: {valueMethod === 'stabilized' ? 'Stabilized' : 'NOI-based'}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="border-b bg-slate-100">
                              <th className="text-left p-2">Year</th>
                              <th className="text-right p-2">NOI</th>
                              <th className="text-right p-2">Debt Service</th>
                              <th className="text-right p-2">Cash Flow</th>
                              <th className="text-right p-2">Value</th>
                              <th className="text-right p-2">Loan Balance</th>
                              <th className="text-right p-2">Equity</th>
                              <th className="text-right p-2">ROI %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {getYearlySummary(projection).map((row, index) => {
                              const valueRow = projection.annualValueSchedule?.[index]
                              const value = valueRow?.value
                              const debtRow = projection.annualDebtSchedule?.find(
                                (d) => d.year === row.year
                              )
                              const loanBalance = debtRow?.endingBalance
                              const equity =
                                value != null && loanBalance != null
                                  ? value - loanBalance
                                  : undefined
                              const roi =
                                equity != null && equity > 0
                                  ? (row.cashFlow / equity) * 100
                                  : undefined

                              return (
                                <tr key={row.year} className="border-b">
                                  <td className="p-2">{row.year}</td>
                                  <td className="text-right p-2">{formatCurrency(row.rent - row.expenses)}</td>
                                  <td className="text-right p-2">{formatCurrency(row.debt)}</td>
                                  <td className="text-right p-2">{formatCurrency(row.cashFlow)}</td>
                                  <td className="text-right p-2">
                                    {value != null ? formatCurrency(value) : '–'}
                                  </td>
                                  <td className="text-right p-2">
                                    {loanBalance != null ? formatCurrency(loanBalance) : '–'}
                                  </td>
                                  <td className="text-right p-2">
                                    {equity != null ? formatCurrency(equity) : '–'}
                                  </td>
                                  <td className="text-right p-2">
                                    {roi != null ? `${roi.toFixed(1)}%` : '–'}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-gray-500 mt-3">
                        Value is shown only for stabilized/post-construction years. These annual values are for display in this schedule only and do not affect refinance proceeds, exit value used in returns, LP/GP waterfalls, IRR, or equity multiples.
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* LP–GP Annual Detail */}
                {projection.lpGpAnnual && projection.lpGpAnnual.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>LP–GP Annual Detail</CardTitle>
                      <p className="text-sm text-gray-500">
                        Annual capital, preferred return, and profit split between LP and GP
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="border-b bg-slate-100">
                              <th className="text-left p-2">Year</th>
                              <th className="text-right p-2">LP Capital Start</th>
                              <th className="text-right p-2">LP Pref Accrued</th>
                              <th className="text-right p-2">LP Pref Paid</th>
                              <th className="text-right p-2">LP Pref Balance End</th>
                              <th className="text-right p-2">Remaining After Pref</th>
                              <th className="text-right p-2">LP Capital Returned</th>
                              <th className="text-right p-2">LP Capital End</th>
                              <th className="text-right p-2">LP Share</th>
                              <th className="text-right p-2">GP Share</th>
                              <th className="text-right p-2">Total Distributed (cum.)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {projection.lpGpAnnual.map((row) => (
                              <tr key={row.year} className="border-b">
                                <td className="p-2">{row.year}</td>
                                <td className="text-right p-2">{formatCurrency(row.lpCapitalStart)}</td>
                                <td className="text-right p-2">{formatCurrency(row.lpPrefAccrued)}</td>
                                <td className="text-right p-2">{formatCurrency(row.lpPrefPaid)}</td>
                                <td className="text-right p-2">{formatCurrency(row.lpPrefBalanceEnd)}</td>
                                <td className="text-right p-2">{formatCurrency(row.remainingAfterPref)}</td>
                                <td className="text-right p-2">{formatCurrency(row.lpCapitalReturned)}</td>
                                <td className="text-right p-2">{formatCurrency(row.lpCapitalEnd)}</td>
                                <td className="text-right p-2">{formatCurrency(row.lpShare)}</td>
                                <td className="text-right p-2">{formatCurrency(row.gpShare)}</td>
                                <td className="text-right p-2">{formatCurrency(row.totalDistributed)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {/* Pref coverage indicator */}
                      {projection.lpGpAnnual.length > 0 && (
                        <div className="mt-3 text-xs text-gray-600">
                          {(() => {
                            const last = projection.lpGpAnnual[projection.lpGpAnnual.length - 1]
                            const fullyCovered = (last?.lpPrefBalanceEnd || 0) <= 1e-6
                            return (
                              <span>
                                Pref Coverage:{' '}
                                <span className={fullyCovered ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                                  {fullyCovered ? 'Fully Covered' : 'Not Fully Covered (Accruing)'}
                                </span>
                              </span>
                            )
                          })()}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* LP–GP Exit Detail */}
                {projection.lpGpExit && (
                  <Card>
                    <CardHeader>
                      <CardTitle>LP–GP Exit Detail</CardTitle>
                      <p className="text-sm text-gray-500">
                        Equity split at exit based on projected value and modeled loan balance at exit
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="border-b bg-slate-100">
                              <th className="text-left p-2">Exit year</th>
                              <th className="text-right p-2">Projected value</th>
                              <th className="text-right p-2">Loan balance at exit</th>
                              <th className="text-right p-2">Net equity</th>
                              <th className="text-right p-2">Unpaid LP pref at exit</th>
                              <th className="text-right p-2">LP capital returned at exit</th>
                              <th className="text-right p-2">Remaining profit after pref & capital</th>
                              <th className="text-right p-2">Cash to LP</th>
                              <th className="text-right p-2">Cash to GP</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b">
                              <td className="p-2">{projection.lpGpExit.exitYear}</td>
                              <td className="text-right p-2">{formatCurrency(projection.lpGpExit.projectedValue)}</td>
                              <td className="text-right p-2">{formatCurrency(projection.lpGpExit.loanBalance)}</td>
                              <td className="text-right p-2">{formatCurrency(projection.lpGpExit.netEquity)}</td>
                              <td className="text-right p-2">{formatCurrency(projection.lpGpExit.unpaidPrefAtExit)}</td>
                              <td className="text-right p-2">{formatCurrency(projection.lpGpExit.capitalReturnedAtExit)}</td>
                              <td className="text-right p-2">{formatCurrency(projection.lpGpExit.remainingProfitAfterPrefAndCapital)}</td>
                              <td className="text-right p-2">{formatCurrency(projection.lpGpExit.cashToLp)}</td>
                              <td className="text-right p-2">{formatCurrency(projection.lpGpExit.cashToGp)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {/* Attainable Housing Deal Summary (high-level narrative view) */}
                {isDealUnderwriting && projection.dealSummary && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Attainable Housing Deal Summary</CardTitle>
                      <p className="text-sm text-gray-500">
                        Stakeholder-friendly view of project cost, feasibility gap, incentives, and capital stack.
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* 1) Project Overview */}
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-1">Project overview</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <p className="text-gray-500">Total units</p>
                            <p className="font-semibold">{projection.dealSummary.totalUnits}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Average unit size</p>
                            <p className="font-semibold">
                              {projection.dealSummary.averageUnitSize
                                ? `${projection.dealSummary.averageUnitSize.toLocaleString()} SF`
                                : '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">Target sale price / unit</p>
                            <p className="font-semibold">
                              {formatCurrency(projection.dealSummary.targetSalePricePerUnit)}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">Target price / SF</p>
                            <p className="font-semibold">
                              {projection.dealSummary.targetPricePerSF
                                ? formatCurrency(projection.dealSummary.targetPricePerSF)
                                : '—'}
                            </p>
                            {projection.dealSummary.marketPricePerSF && (
                              <p className="text-[11px] text-gray-500">
                                Market: {formatCurrency(projection.dealSummary.marketPricePerSF)} / SF
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 2) Base Development Cost */}
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-1">Base development cost (no incentives)</h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                          <div>
                            <p className="text-gray-500">Total project cost</p>
                            <p className="font-semibold">
                              {formatCurrency(projection.dealSummary.baseProjectCost)}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">Cost per unit</p>
                            <p className="font-semibold">
                              {formatCurrency(projection.dealSummary.baseCostPerUnit)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* 3) Feasibility Gap */}
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-1">Feasibility gap</h4>
                        <p className="text-sm">
                          <span className="text-gray-500 mr-1">Gap vs. target sale price per unit:</span>
                          <span
                            className={
                              projection.dealSummary.gapPerUnit > 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'
                            }
                          >
                            {formatCurrency(Math.abs(projection.dealSummary.gapPerUnit))}{' '}
                            {projection.dealSummary.gapPerUnit > 0 ? 'Gap' : 'Margin before incentives'}
                          </span>
                        </p>
                      </div>

                      {/* 4) Incentive Stack */}
                      {projection.dealSummary.incentives.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-1">Cap stack incentives</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                              <thead>
                                <tr className="border-b bg-slate-100">
                                  <th className="text-left p-2">Incentive / Program</th>
                                  <th className="text-right p-2">Per unit ($)</th>
                                  <th className="text-right p-2">Total ($)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {projection.dealSummary.incentives.map((inc) => (
                                  <tr key={inc.label} className="border-b">
                                    <td className="p-2">{inc.label}</td>
                                    <td className="text-right p-2">
                                      {formatCurrency(inc.perUnitAmount)}
                                    </td>
                                    <td className="text-right p-2">
                                      {formatCurrency(inc.totalAmount)}
                                    </td>
                                  </tr>
                                ))}
                                <tr className="border-t font-semibold">
                                  <td className="p-2">Total incentives</td>
                                  <td className="text-right p-2">
                                    {formatCurrency(projection.dealSummary.totalIncentivesPerUnit)}
                                  </td>
                                  <td className="text-right p-2">
                                    {formatCurrency(projection.dealSummary.totalIncentives)}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* 5–6) Adjusted Cost & Final Alignment */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-1">
                            Adjusted cost after incentives
                          </h4>
                          <p className="text-sm">
                            <span className="text-gray-500 mr-1">Effective cost per unit:</span>
                            <span className="font-semibold">
                              {formatCurrency(projection.dealSummary.adjustedCostPerUnit)}
                            </span>
                          </p>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-1">Final alignment</h4>
                          <div className="space-y-1 text-sm">
                            <p>
                              <span className="text-gray-500 mr-1">Sale price per unit:</span>
                              <span className="font-semibold">
                                {formatCurrency(projection.dealSummary.targetSalePricePerUnit)}
                              </span>
                            </p>
                            <p>
                              <span className="text-gray-500 mr-1">Effective cost per unit:</span>
                              <span className="font-semibold">
                                {formatCurrency(projection.dealSummary.adjustedCostPerUnit)}
                              </span>
                            </p>
                            <p>
                              <span className="text-gray-500 mr-1">Profit per unit:</span>
                              <span
                                className={
                                  projection.dealSummary.profitPerUnit >= 0
                                    ? 'font-semibold text-green-600'
                                    : 'font-semibold text-red-600'
                                }
                              >
                                {formatCurrency(projection.dealSummary.profitPerUnit)}
                              </span>
                            </p>
                            <p>
                              <span className="text-gray-500 mr-1">Total project profit:</span>
                              <span
                                className={
                                  projection.dealSummary.totalProfit >= 0
                                    ? 'font-semibold text-green-600'
                                    : 'font-semibold text-red-600'
                                }
                              >
                                {formatCurrency(projection.dealSummary.totalProfit)}
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* 7) Capital Stack */}
                      {projection.dealSummary.capitalStack.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-1">Capital stack</h4>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                            {projection.dealSummary.capitalStack.map((item) => (
                              <div key={item.label}>
                                <p className="text-gray-500">{item.label}</p>
                                <p className="font-semibold">{formatCurrency(item.amount)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 8) Public Benefit */}
                      {(projection.dealSummary.publicBenefits?.length ?? 0) > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-1">Public benefit</h4>
                          <ul className="list-disc list-inside text-sm text-gray-700">
                            {projection.dealSummary.publicBenefits!.map((b, idx) => (
                              <li key={idx}>{b}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* 9) Summary / Conclusion */}
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-1">Summary / conclusion</h4>
                        <p className="text-sm text-gray-800">
                          {projection.dealSummary.conclusionText ||
                            'This project aligns private efficiency with public support to deliver attainable housing at scale.'}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Summary Card */}
                <Card>
                  <CardHeader>
                    <CardTitle>Financial Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Construction Summary */}
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Construction Summary</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <p className="text-sm text-gray-600">Contract Value</p>
                            <p className="text-lg font-semibold">{formatCurrency(projection.contractValue)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Total Estimated Cost</p>
                            <p className="text-lg font-semibold">{formatCurrency(projection.totalEstimatedCost)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Projected Profit</p>
                            <p className={`text-lg font-semibold ${projection.projectedProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {formatCurrency(projection.projectedProfit)}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Projected Margin</p>
                            <p className={`text-lg font-semibold ${projection.projectedMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {formatPercent(projection.projectedMargin)}
                            </p>
                          </div>
                        </div>
                        {isDealUnderwriting && underwritingEstimatedConstructionCost > 0 && (
                          <p className="text-xs text-gray-500 mt-2">
                            Construction cost is based on underwriting assumptions, not a detailed trade estimate.
                          </p>
                        )}
                      </div>

                      {isForSaleLocMode && (
                        <div className="border-t pt-4">
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">For-Sale Phased LOC Summary</h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <p className="text-sm text-gray-600">Base cost (before incentives)</p>
                              <p className="text-lg font-semibold">{formatCurrency(projection.summary.forSaleBaseCostBeforeIncentives || 0)}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Applied infra reduction</p>
                              <p className="text-lg font-semibold text-green-700">{formatCurrency(projection.summary.forSaleAppliedInfrastructureReduction || 0)}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Applied project cost reduction</p>
                              <p className="text-lg font-semibold text-green-700">{formatCurrency(projection.summary.forSaleAppliedProjectCostReduction || 0)}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Total sales revenue</p>
                              <p className="text-lg font-semibold text-green-600">
                                {formatCurrency(projection.summary.forSaleTotalRevenue || 0)}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">LOC limit</p>
                              <p className="text-lg font-semibold">{formatCurrency(projection.summary.forSaleLocLimit || 0)}</p>
                              <p className="text-xs text-gray-500">Sized off gross pre-incentive cost</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Peak LOC balance</p>
                              <p className="text-lg font-semibold">{formatCurrency(projection.summary.forSalePeakLocBalance || 0)}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Ending LOC balance</p>
                              <p className="text-lg font-semibold">{formatCurrency(projection.summary.forSaleEndingLocBalance || 0)}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Peak bond balance</p>
                              <p className="text-lg font-semibold">{formatCurrency(projection.summary.forSalePeakBondBalance || 0)}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Ending bond balance</p>
                              <p className="text-lg font-semibold">{formatCurrency(projection.summary.forSaleEndingBondBalance || 0)}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Bond drawn total (lifetime)</p>
                              <p className="text-lg font-semibold">{formatCurrency(projection.summary.forSaleBondDrawnTotal || 0)}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Reserve ending</p>
                              <p className="text-lg font-semibold">{formatCurrency(projection.summary.forSaleReserveEnding || 0)}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Total distributed</p>
                              <p className="text-lg font-semibold">{formatCurrency(projection.summary.forSaleDistributionTotal || 0)}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Developer equity deployed</p>
                              <p className="text-lg font-semibold">{formatCurrency(projection.summary.forSaleEquityDeployed || 0)}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Incentive equity used</p>
                              <p className="text-lg font-semibold">{formatCurrency(projection.summary.forSaleIncentiveEquityUsed || 0)}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Equity multiple</p>
                              <p className="text-lg font-semibold">
                                {projection.summary.forSaleEquityMultiple != null ? `${projection.summary.forSaleEquityMultiple.toFixed(2)}x` : '—'}
                              </p>
                            </div>
                          </div>
                          {projection.summary.forSalePhaseActivations && projection.summary.forSalePhaseActivations.length > 0 && (
                            <div className="mt-4 border-t pt-3">
                              <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Phase Activation Timing</h5>
                              <div className="mt-2 grid grid-cols-1 gap-1 text-sm md:grid-cols-2">
                                {projection.summary.forSalePhaseActivations.map((row, idx) => (
                                  <div key={`phase-activation-${idx}`} className="flex items-center justify-between rounded border bg-slate-50 px-2 py-1">
                                    <span className="text-gray-600">{row.phaseName}</span>
                                    <span className="font-semibold text-slate-900">{row.activationMonth}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {projection.summary.forSaleFundingAudit && (
                            <div className="mt-4 border-t pt-3">
                              <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Capital Sources (Project Total)</h5>
                              <div className="mt-2 grid grid-cols-1 gap-1 text-sm md:grid-cols-2">
                                <div className="flex items-center justify-between rounded border bg-slate-50 px-2 py-1">
                                  <span className="text-gray-600">Incentive equity used</span>
                                  <span className="font-semibold text-slate-900">{formatCurrency(projection.summary.forSaleFundingAudit.incentiveEquitySourceUsed || 0)}</span>
                                </div>
                                <div className="flex items-center justify-between rounded border bg-slate-50 px-2 py-1">
                                  <span className="text-gray-600">Reinvested cash used</span>
                                  <span className="font-semibold text-slate-900">{formatCurrency(projection.summary.forSaleFundingAudit.reinvestUsed || 0)}</span>
                                </div>
                                <div className="flex items-center justify-between rounded border bg-slate-50 px-2 py-1">
                                  <span className="text-gray-600">Reserve used</span>
                                  <span className="font-semibold text-slate-900">{formatCurrency(projection.summary.forSaleFundingAudit.reserveUsed || 0)}</span>
                                </div>
                                <div className="flex items-center justify-between rounded border bg-slate-50 px-2 py-1">
                                  <span className="text-gray-600">LOC drawn total (lifetime)</span>
                                  <span className="font-semibold text-slate-900">{formatCurrency(projection.summary.forSaleLocDrawnTotal || projection.summary.forSaleFundingAudit.locDrawn || 0)}</span>
                                </div>
                                <div className="flex items-center justify-between rounded border bg-slate-50 px-2 py-1 md:col-span-2">
                                  <span className="text-gray-600">Developer equity used</span>
                                  <span className="font-semibold text-slate-900">{formatCurrency(projection.summary.forSaleFundingAudit.developerEquityUsed || 0)}</span>
                                </div>
                              </div>
                            </div>
                          )}
                          {projection.summary.forSaleEngineVersion && (
                            <div className="mt-3 rounded border bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
                              <p>
                                Engine: <span className="font-semibold text-slate-800">{projection.summary.forSaleEngineVersion}</span>
                              </p>
                              <p>
                                Sweep executed: <span className="font-semibold text-slate-800">{projection.summary.forSaleSweepExecuted ? 'Yes' : 'No'}</span>
                                {' '}| Closed units:{' '}
                                <span className="font-semibold text-slate-800">
                                  {(projection.summary.forSaleClosedUnits || 0).toFixed(2)} / {(projection.summary.forSaleTotalUnits || 0).toFixed(2)}
                                </span>
                              </p>
                              <p>
                                Final LOC before/after sweep:{' '}
                                <span className="font-semibold text-slate-800">
                                  {formatCurrency(projection.summary.forSaleFinalLocBeforeSweep || 0)} / {formatCurrency(projection.summary.forSaleFinalLocAfterSweep || 0)}
                                </span>
                              </p>
                            </div>
                          )}
                          {projection.summary.forSaleDebtRepaymentWarning && (
                            <div className="mt-3 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[12px] text-amber-900">
                              <p className="font-semibold">LOC repayment warning</p>
                              <p>{projection.summary.forSaleDebtRepaymentWarning}</p>
                            </div>
                          )}
                          <p className="text-xs text-gray-500 mt-3">
                            Assumptions: trigger basis, deposit usability, sales pace, and spend curve use the LOC mode
                            controls. Infrastructure auto behavior is phase-aware.
                          </p>
                        </div>
                      )}

                      {isForSaleLocMode && projection.forSaleLocTimeline && projection.forSaleLocTimeline.length > 0 && (
                        <div className="border-t pt-4">
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">LOC Timeline</h4>
                          <div className="overflow-x-auto border rounded">
                            <table className="w-full text-xs">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="text-left px-2 py-1.5">Month</th>
                                  <th className="text-right px-2 py-1.5">Revenue</th>
                                  <th className="text-right px-2 py-1.5">Draw</th>
                                  <th className="text-right px-2 py-1.5">Paydown</th>
                                  <th className="text-right px-2 py-1.5">LOC Balance</th>
                                  <th className="text-right px-2 py-1.5">Avail Capacity</th>
                                </tr>
                              </thead>
                              <tbody>
                                {projection.forSaleLocTimeline.map((row) => (
                                  <tr key={`loc-${row.month}`} className="border-t">
                                    <td className="px-2 py-1.5">{row.monthLabel}</td>
                                    <td className="px-2 py-1.5 text-right">{formatCurrency(row.salesRevenue)}</td>
                                    <td className="px-2 py-1.5 text-right">{formatCurrency(row.locDraw)}</td>
                                    <td className="px-2 py-1.5 text-right">{formatCurrency(row.locPaydown)}</td>
                                    <td className="px-2 py-1.5 text-right">{formatCurrency(row.locBalance)}</td>
                                    <td className="px-2 py-1.5 text-right">{formatCurrency(row.availableLocCapacity)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Rental Income Summary */}
                      {projection.summary.monthlyRentalIncome > 0 && (
                        <div className="border-t pt-4">
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Rental Income Summary</h4>
                          {rentalUnits.some((u) => Array.isArray(u.leaseTerms) && u.leaseTerms.length > 0) && (
                            <p className="text-xs text-gray-500 mb-2">
                              Lease-term mode active: summary reflects physical units while rent changes are applied by term dates.
                            </p>
                          )}
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div>
                              <p className="text-sm text-gray-600">Total Units</p>
                              <p className="text-lg font-semibold">{projection.rentalSummary.totalUnits}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Total Square Footage</p>
                              <p className="text-lg font-semibold">
                                {projection.rentalSummary.totalProjectSquareFootage.toLocaleString()} sqft
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Monthly Rental Income</p>
                              <p className="text-lg font-semibold text-green-600">
                                {formatCurrency(projection.summary.monthlyRentalIncome)}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Annual Rental Income</p>
                              <p className="text-lg font-semibold text-green-600">
                                {formatCurrency(projection.summary.annualRentalIncome)}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Occupancy Rate</p>
                              <p className="text-lg font-semibold">
                                {formatPercent(projection.rentalSummary.stabilizedOccupancy)}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Financial Metrics */}
                      {projection.summary.monthlyRentalIncome > 0 && (
                        <div className="border-t pt-4">
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Financial Metrics</h4>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div>
                          <p className="text-sm text-gray-600">NOI (Net Operating Income)</p>
                              <p className="text-lg font-semibold text-green-600">
                                {formatCurrency(projection.summary.netOperatingIncome)}
                              </p>
                              <p className="text-xs text-gray-500">Annual</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Operating Expenses</p>
                              <p className="text-lg font-semibold text-red-600">
                                {formatCurrency(projection.summary.annualOperatingExpenses)}
                              </p>
                              <p className="text-xs text-gray-500">Annual</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Debt Service</p>
                              <p className="text-lg font-semibold text-red-600">
                                {formatCurrency(projection.summary.monthlyDebtService * 12)}
                              </p>
                              <p className="text-xs text-gray-500">Annual</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Cash Flow After Debt</p>
                              <p className={`text-lg font-semibold ${projection.summary.cashFlowAfterDebt >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatCurrency(projection.summary.cashFlowAfterDebt)}
                              </p>
                              <p className="text-xs text-gray-500">Annual</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">DSCR (Debt Service Coverage Ratio)</p>
                              <p className="text-lg font-semibold">
                                {projection.summary.monthlyDebtService > 0
                                  ? `${(projection.summary.netOperatingIncome / (projection.summary.monthlyDebtService * 12)).toFixed(2)}x`
                                  : '–'}
                              </p>
                              <p className="text-xs text-gray-500">NOI ÷ annual debt service</p>
                            </div>
                          </div>
                        </div>
                      )}
                      {/* Operating expense note */}
                      {projection.summary.annualOperatingExpenses > 0 && (
                        <p className="border-t pt-4 text-xs text-gray-500">
                          Operating expenses are based on the assumptions entered above.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Cash Flow Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>Monthly Cash Flow Projection</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-gray-500 mb-2">
                      Construction cash flow reflects timing of client funding milestones versus project costs. Operating cash flow begins at stabilization.
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">Month</th>
                            <th className="text-right p-2">Phase</th>
                            <th className="text-right p-2">Milestone</th>
                            <th className="text-right p-2">Rental</th>
                            <th className="text-right p-2">OpEx</th>
                            <th className="text-right p-2">Debt</th>
                            <th className="text-right p-2">Net Cash Flow</th>
                            <th className="text-right p-2">Total Expenses</th>
                            <th className="text-right p-2">Labor</th>
                            <th className="text-right p-2">Materials</th>
                            <th className="text-right p-2">Subs</th>
                            <th className="text-right p-2">Overhead</th>
                            <th className="text-right p-2">Total Inflow</th>
                            <th className="text-right p-2">Cumulative</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projection.monthlyCashFlows.map((month, idx) => {
                            const developmentCashFlow =
                              (month.milestonePayments || 0) -
                              ((month.laborCost || 0) +
                                (month.materialCost || 0) +
                                (month.subcontractorCost || 0) +
                                (month.overheadAllocation || 0) +
                                (month.interestDuringConstruction || 0))
                            const operatingCashFlow =
                              (month.rentalIncome || 0) -
                              (month.operatingExpenses || 0) -
                              (month.debtService || 0)
                            const displayNet =
                              month.phase === 'construction'
                                ? developmentCashFlow
                                : operatingCashFlow
                            const totalExpenses =
                              (month.operatingExpenses || 0) +
                              (month.debtService || 0)
                            return (
                              <tr
                                key={idx}
                                className={`border-b ${
                                  month.cumulativeBalance < 0
                                    ? 'bg-red-50'
                                    : month.phase === 'post-construction'
                                    ? 'bg-green-50'
                                    : ''
                                }`}
                              >
                                <td className="p-2">{month.monthLabel}</td>
                                <td className="text-right p-2">
                                  <span
                                    className={`text-xs px-2 py-1 rounded ${
                                      month.phase === 'construction'
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'bg-green-100 text-green-700'
                                    }`}
                                  >
                                  {month.phase === 'construction'
                                    ? 'Build'
                                    : isDealUnderwriting
                                    ? 'Exit'
                                    : 'Rent'}
                                  </span>
                                </td>
                                <td className="text-right p-2">
                                  {formatCurrency(month.milestonePayments)}
                                </td>
                                <td className="text-right p-2 text-green-600">
                                  {month.rentalIncome > 0
                                    ? formatCurrency(month.rentalIncome)
                                    : '-'}
                                </td>
                                <td className="text-right p-2 text-orange-600">
                                  {month.operatingExpenses > 0
                                    ? formatCurrency(month.operatingExpenses)
                                    : '-'}
                                </td>
                                <td className="text-right p-2 text-red-600">
                                  {month.debtService > 0
                                    ? formatCurrency(month.debtService)
                                    : '-'}
                                </td>
                                <td
                                  className={`text-right p-2 font-medium ${
                                    displayNet >= 0 ? 'text-green-600' : 'text-red-600'
                                  }`}
                                >
                                  {formatCurrency(displayNet)}
                                </td>
                                <td className="text-right p-2">
                                  {formatCurrency(totalExpenses)}
                                </td>
                                <td className="text-right p-2">
                                  {formatCurrency(month.laborCost)}
                                </td>
                                <td className="text-right p-2">
                                  {formatCurrency(month.materialCost)}
                                </td>
                                <td className="text-right p-2">
                                  {formatCurrency(month.subcontractorCost)}
                                </td>
                                <td className="text-right p-2">
                                  {formatCurrency(month.overheadAllocation)}
                                </td>
                                <td className="text-right p-2 font-medium">
                                  {formatCurrency(month.totalInflow)}
                                </td>
                                <td
                                  className={`text-right p-2 font-semibold ${
                                    month.cumulativeBalance >= 0
                                      ? 'text-green-600'
                                      : 'text-red-600'
                                  }`}
                                >
                                  {formatCurrency(month.cumulativeBalance)}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Action Buttons */}
                {(projection.summary.forSaleLocLimit ?? 0) > 0 && (
                  <p className="text-xs text-slate-500">
                    For-Sale Phased (LOC) exports include the LOC timeline and mode-specific assumptions in both PDF and Excel.
                  </p>
                )}
                <div className="flex gap-4">
                  <Button variant="outline" onClick={() => setProjection(null)} className="flex-1">
                    Edit Inputs
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      if (projection) {
                        console.log('[FOR-SALE LOC] exporting PDF from projection state', {
                          engineVersion: projection.summary.forSaleEngineVersion,
                          peakLoc: projection.summary.forSalePeakLocBalance,
                          endingLoc: projection.summary.forSaleEndingLocBalance,
                          sweepExecuted: projection.summary.forSaleSweepExecuted,
                          finalLocBeforeSweep: projection.summary.forSaleFinalLocBeforeSweep,
                          finalLocAfterSweep: projection.summary.forSaleFinalLocAfterSweep,
                          activations: projection.summary.forSalePhaseActivations,
                        })
                        exportProFormaToPDF(projection)
                      }
                    }} 
                    className="flex-1"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Export PDF
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      if (projection) {
                        exportProFormaToExcel(projection)
                      }
                    }} 
                    className="flex-1"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export Excel
                  </Button>
                  <Button onClick={onClose} className="flex-1">
                    Close
                  </Button>
                </div>
              </div>
            </>
          )}
            </div>
          </div>
        {!projection && (
          <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur">
            <div className="mx-auto flex w-full max-w-[1800px] gap-3 px-4 py-3 md:px-6">
              <Button variant="outline" onClick={onClose} className="h-9 min-w-[140px]">
                Cancel
              </Button>
              <Button onClick={handleGenerate} className="h-9 min-w-[200px]">
                Generate Pro Forma
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}



