// ============================================================================
// Pro Forma Generator
// ============================================================================
//
// Component for generating construction loan pro forma financial projections
//

import React, { useState, useEffect, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Project, Trade } from '@/types'
import {
  ProFormaInput,
  ProFormaProjection,
  PaymentMilestone,
  RentalUnit,
  OperatingExpenses,
  DebtService,
  DealSummaryInputs,
} from '@/types/proforma'
import { calculateProForma, generateDefaultMilestones } from '@/services/proformaService'
import { getTradesForEstimate_Hybrid } from '@/services/hybridService'
import { exportProFormaToPDF, exportProFormaToExcel } from '@/services/proformaExportService'
import { saveProFormaInputs as saveProFormaInputsDB, loadProFormaInputs as loadProFormaInputsDB } from '@/services/supabaseService'
import { isOnlineMode } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { X, Plus, Trash2, Download, FileText, Calendar, DollarSign } from 'lucide-react'
import { buildDealSummary } from '@/services/proformaSummaryService'

interface ProFormaGeneratorProps {
  project: Project
  onClose: () => void
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

  const isDealUnderwriting =
    project.id.startsWith('deal-') || project.metadata?.source === 'deal-pipeline'

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
  
  // Track if we've loaded saved data (to prevent overwriting with defaults)
  const [hasLoadedSavedData, setHasLoadedSavedData] = useState<boolean>(false)
  // Track if initial load is complete to prevent auto-update from interfering
  const initialLoadCompleteRef = useRef<boolean>(false)

  // Storage key for this project's pro forma inputs
  const storageKey = `hsh_gc_proforma_${project.id}`

  // Interface for saved pro forma inputs (serialized to JSON)
  interface SavedProFormaInputsSerialized {
    contractValue: number
    paymentMilestones: Array<Omit<PaymentMilestone, 'date'> & { date: string }>
    monthlyOverhead: number
    overheadMethod: 'proportional' | 'flat' | 'none'
    projectionMonths: 6 | 12 | 24 | 36 | 60 | 120
    startDate: string
    totalProjectSquareFootage?: number
    includeRentalIncome: boolean
    rentalUnits: Array<Omit<RentalUnit, 'occupancyStartDate'> & { occupancyStartDate?: string }>
    includeOperatingExpenses: boolean
    operatingExpenses: OperatingExpenses
    includeDebtService: boolean
    debtService: Omit<DebtService, 'startDate'> & { startDate: string }
    constructionCompletionDate: string
    useDevelopmentProforma?: boolean
    landCost?: number
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
  }

  // Interface for loaded pro forma inputs (deserialized with Date objects)
  interface SavedProFormaInputs {
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
  }

  // Save pro forma inputs to database or localStorage
  const saveProFormaInputs = async () => {
    try {
      const savedInputs: SavedProFormaInputsSerialized = {
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
      }

      // Try database first if online, fallback to localStorage
      if (isOnlineMode()) {
        const success = await saveProFormaInputsDB(project.id, savedInputs as any)
        if (!success) {
          // Fallback to localStorage if database save fails
          localStorage.setItem(storageKey, JSON.stringify(savedInputs))
        }
      } else {
        localStorage.setItem(storageKey, JSON.stringify(savedInputs))
      }
    } catch (error) {
      console.error('Error saving pro forma inputs:', error)
      // Fallback to localStorage on error
      try {
        const savedInputs: SavedProFormaInputsSerialized = {
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
        }
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
            const dbData = await loadProFormaInputsDB(project.id)
        if (dbData) {
          // Convert date strings back to Date objects
          const loaded: SavedProFormaInputs = {
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
          paymentMilestones: parsed.paymentMilestones.map(m => ({
            ...m,
            date: new Date(m.date),
          })),
          rentalUnits: parsed.rentalUnits.map(u => ({
            ...u,
            occupancyStartDate: u.occupancyStartDate 
              ? new Date(u.occupancyStartDate)
              : undefined,
          })),
          debtService: {
            ...parsed.debtService,
            startDate: new Date(parsed.debtService.startDate),
          },
          useDevelopmentProforma: parsed.useDevelopmentProforma,
          landCost: parsed.landCost,
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
        }
        return loaded
      }
    } catch (error) {
      console.error('Error loading pro forma inputs:', error)
    }
    return null
  }

  // Load trades and saved inputs
  useEffect(() => {
    const loadTradesAndInputs = async () => {
      let loadedTrades: Trade[] = []

      if (isDealUnderwriting) {
        // Underwriting mode: no backing estimate trades expected; keep trades empty and rely on direct inputs.
        setTrades([])
      } else {
        loadedTrades = await getTradesForEstimate_Hybrid(project.estimate.id)
        setTrades(loadedTrades)
      }

      // Try to load saved pro forma inputs (DB or localStorage)
      const savedInputs = await loadProFormaInputs()

      if (savedInputs) {
        // Restore saved inputs
        if (isDealUnderwriting) {
          // Deal / underwriting mode: trust saved contract value as-is
          const contractValueToUse =
            savedInputs.contractValue > 0 ? savedInputs.contractValue : 0
          setContractValue(contractValueToUse)
          lastSyncedTotalRef.current = contractValueToUse
        } else {
          // Project mode: if saved contract is 0, fall back to estimate total
          let estimateTotal =
            project.estimate.totalEstimate || project.estimate.totals?.totalEstimated || 0

          if (estimateTotal === 0 && loadedTrades.length > 0) {
            const basePriceTotal = loadedTrades.reduce((sum, t) => sum + t.totalCost, 0)
            const storedContingency = project.estimate.contingency || 0
            const storedProfit = project.estimate.profit || 0

            if (storedContingency > 0 || storedProfit > 0) {
              estimateTotal = basePriceTotal + storedContingency + storedProfit
            } else {
              const contingencyPercent = 10 // Default contingency
              const contingency = basePriceTotal * (contingencyPercent / 100)
              const grossProfitTotal = loadedTrades.reduce((sum, trade) => {
                const itemMarkup = trade.markupPercent || 20 // Default markup
                const markup = trade.totalCost * (itemMarkup / 100)
                return sum + markup
              }, 0)
              estimateTotal = basePriceTotal + contingency + grossProfitTotal
            }
          }

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
        let estimateTotal =
          project.estimate.totalEstimate || project.estimate.totals?.totalEstimated || 0

        if (estimateTotal === 0 && loadedTrades.length > 0) {
          const basePriceTotal = loadedTrades.reduce((sum, t) => sum + t.totalCost, 0)
          const storedContingency = project.estimate.contingency || 0
          const storedProfit = project.estimate.profit || 0

          if (storedContingency > 0 || storedProfit > 0) {
            estimateTotal = basePriceTotal + storedContingency + storedProfit
          } else {
            const contingencyPercent = 10 // Default contingency
            const contingency = basePriceTotal * (contingencyPercent / 100)
            const grossProfitTotal = loadedTrades.reduce((sum, trade) => {
              const itemMarkup = trade.markupPercent || 20 // Default markup
              const markup = trade.totalCost * (itemMarkup / 100)
              return sum + markup
            }, 0)
            estimateTotal = basePriceTotal + contingency + grossProfitTotal
          }
        }

        const contractValue =
          estimateTotal > 0
            ? estimateTotal
            : loadedTrades.reduce((sum, t) => sum + t.totalCost, 0)
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
  }, [project, isDealUnderwriting])

  // Auto-update contract value when estimate changes (after initial load)
  // Only updates if contract value is 0, or if it matches the last synced total (meaning estimate changed)
  useEffect(() => {
    // Only run after initial load is complete to avoid interfering with initialization
    if (!isDealUnderwriting && initialLoadCompleteRef.current && !loading) {
      // Use estimate total (includes profit, overhead, contingency) as the contract value
      let estimateTotal = project.estimate.totalEstimate || project.estimate.totals?.totalEstimated || 0
      
      // If estimate total is 0 or not set, try using stored profit/contingency amounts
      if (estimateTotal === 0 && trades.length > 0) {
        const basePriceTotal = trades.reduce((sum, t) => sum + t.totalCost, 0)
        const storedContingency = project.estimate.contingency || 0
        const storedProfit = project.estimate.profit || 0
        
        // If we have stored amounts, use them
        if (storedContingency > 0 || storedProfit > 0) {
          estimateTotal = basePriceTotal + storedContingency + storedProfit
        } else {
          // Otherwise calculate it the same way EstimateBuilder does
          const contingencyPercent = 10 // Default contingency
          const contingency = basePriceTotal * (contingencyPercent / 100)
          // Calculate gross profit from markup on each trade (same as EstimateBuilder)
          const grossProfitTotal = trades.reduce((sum, trade) => {
            const itemMarkup = trade.markupPercent || 20 // Default markup
            const markup = trade.totalCost * (itemMarkup / 100)
            return sum + markup
          }, 0)
          estimateTotal = basePriceTotal + contingency + grossProfitTotal
        }
      }
      
      // Fallback to sum of trades if estimate total is still not available
      const currentTotal = estimateTotal > 0 
        ? estimateTotal 
        : trades.reduce((sum, t) => sum + t.totalCost, 0)
      
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

  const handleRentalUnitChange = (id: string, field: keyof RentalUnit, value: any) => {
    setRentalUnits(
      rentalUnits.map(u =>
        u.id === id ? { ...u, [field]: value } : u
      )
    )
    setValidationErrors([])
  }

  const [validationErrors, setValidationErrors] = useState<string[]>([])

  const handleGenerate = () => {
    const errors: string[] = []

    if (!contractValue) {
      errors.push(isDealUnderwriting ? 'Enter a Deal Value / Contract Value.' : 'Enter a Contract Value.')
    }

    // Underwriting-mode guidance: require construction cost assumption when there are no trades
    if (isDealUnderwriting && trades.length === 0 && underwritingEstimatedConstructionCost <= 0) {
      errors.push('Enter an Estimated Construction Cost for underwriting when no detailed estimate exists.')
    }

    if (paymentMilestones.length === 0) {
      errors.push('Add at least one funding milestone to model construction inflows.')
    }

    // Validate cumulative percent-complete milestones:
    // - must start at 0
    // - must end at 100
    // - must be strictly increasing
    if (paymentMilestones.length > 0) {
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

    if (includeRentalIncome && rentalUnits.length === 0) {
      errors.push('Add at least one rental unit if rental income is enabled.')
    }

    if (errors.length > 0) {
      setValidationErrors(errors)
      return
    }

    setValidationErrors([])

    const fundingBase = contractValue || 0

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
      contractValue,
      // Derive milestone dollar amounts from funding base and incremental percentage
      paymentMilestones: milestonesWithIncremental,
      monthlyOverhead,
      overheadAllocationMethod: overheadMethod,
      projectionMonths,
      startDate: new Date(startDate),
      totalProjectSquareFootage: totalProjectSquareFootage > 0 ? totalProjectSquareFootage : undefined,
      underwritingEstimatedConstructionCost: isDealUnderwriting && underwritingEstimatedConstructionCost > 0
        ? underwritingEstimatedConstructionCost
        : undefined,
      rentalUnits,
      includeRentalIncome,
      operatingExpenses,
      includeOperatingExpenses,
      debtService: {
        ...debtService,
        startDate: debtService.startDate || new Date(startDate),
      },
      includeDebtService,
      constructionCompletionDate: constructionCompletionDate 
        ? new Date(constructionCompletionDate)
        : undefined,
      useDevelopmentProforma: useDevelopmentProforma || undefined,
      landCost: useDevelopmentProforma ? landCost : undefined,
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
      underwritingEstimatedConstructionCost,
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
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-8 text-center">
            <p>Loading project data...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <Card className="w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-2xl">Pro Forma Generator - {project.name}</CardTitle>
                {isDealUnderwriting && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800 border border-amber-200">
                    Deal Pipeline / Underwriting Mode
                  </span>
                )}
              </div>
              {isDealUnderwriting && (
                <p className="text-xs text-gray-500">
                  Underwriting Assumptions: deal-level inputs for early analysis. No detailed estimate is required in this mode.
                </p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {!projection ? (
            <>
              {/* Input Form */}
              <div className={isDealUnderwriting ? 'space-y-4 p-4 bg-amber-50 border border-amber-100 rounded-lg' : ''}>
                {isDealUnderwriting && (
                  <div className="mb-2">
                    <p className="text-xs text-amber-900 font-medium">
                      Underwriting Assumptions
                    </p>
                    <p className="text-xs text-amber-800">
                      Enter high-level deal assumptions for early go/no-go analysis. Detailed estimate trades are not required in this mode.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="contractValue">
                      {isDealUnderwriting ? 'Deal Value / Contract Value *' : 'Contract Value *'}
                    </Label>
                    <Input
                      id="contractValue"
                      type="text"
                      inputMode="decimal"
                      value={contractValue ? contractValue.toLocaleString('en-US') : ''}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/,/g, '')
                        const next = raw === '' ? 0 : parseFloat(raw)
                        setContractValue(isNaN(next) ? 0 : next)
                        setValidationErrors([])
                      }}
                      placeholder="0.00"
                    />
                    {isDealUnderwriting ? (
                      <p className="text-xs text-gray-500 mt-1">
                        Deal Value / Contract Value is an underwriting assumption in deal mode.
                      </p>
                    ) : (
                      <p className="text-xs text-gray-500 mt-1">
                        Estimate total: {formatCurrency(
                          project.estimate.totalEstimate || project.estimate.totals?.totalEstimated || 
                          trades.reduce((sum, t) => sum + t.totalCost, 0)
                        )} | 
                        Estimated cost: {formatCurrency(
                          trades.reduce((sum, t) => sum + t.totalCost, 0)
                        )}
                      </p>
                    )}
                  </div>

                  {isDealUnderwriting && (
                    <div>
                      <Label htmlFor="underwritingEstimatedConstructionCost">Estimated Construction Cost</Label>
                      <Input
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
                      <p className="text-xs text-gray-500 mt-1">
                        Underwriting assumption used as the construction cost basis when no detailed estimate exists.
                      </p>
                    </div>
                  )}

                  <div>
                    <Label htmlFor="startDate">Project Start Date *</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="projectionMonths">Projection Period *</Label>
                    <Select
                      value={projectionMonths.toString()}
                      onValueChange={(v) => setProjectionMonths(parseInt(v) as 6 | 12 | 24 | 36 | 60 | 120)}
                    >
                      <SelectTrigger>
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
                  </div>

                  <div>
                    <Label htmlFor="constructionCompletionDate">Construction Completion Date</Label>
                    <Input
                      id="constructionCompletionDate"
                      type="date"
                      value={constructionCompletionDate}
                      onChange={(e) => setConstructionCompletionDate(e.target.value)}
                      placeholder="Optional - defaults to 80% of projection period"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      When construction ends and rental income begins (if applicable)
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="totalProjectSquareFootage">Total Project Square Footage</Label>
                    <Input
                      id="totalProjectSquareFootage"
                      type="number"
                      step="0.01"
                      value={totalProjectSquareFootage}
                      onChange={(e) => setTotalProjectSquareFootage(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Total square footage of the project (auto-filled from project specs if available)
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="monthlyOverhead">Monthly Overhead</Label>
                    <Input
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
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="overheadMethod">Overhead Allocation Method</Label>
                    <Select
                      value={overheadMethod}
                      onValueChange={(v: 'proportional' | 'flat' | 'none') => setOverheadMethod(v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="proportional">Proportional (based on monthly costs)</SelectItem>
                        <SelectItem value="flat">Flat Rate (same amount each month)</SelectItem>
                        <SelectItem value="none">None</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {isDealUnderwriting && (
                  <div className="mt-4 space-y-4">
                    <h3 className="text-sm font-semibold text-amber-900">
                      Attainable Housing Deal Summary Inputs (optional)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="dealSummaryUnits">Total Units</Label>
                        <Input
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
                      </div>
                      <div>
                        <Label htmlFor="dealSummaryAvgSize">Average Unit Size (SF)</Label>
                        <Input
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
                      </div>
                      <div>
                        <Label htmlFor="dealSummaryTargetPricePerUnit">Target Sale Price per Unit ($)</Label>
                      <Input
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
                      </div>
                      <div>
                        <Label htmlFor="dealSummaryMarketPricePerSF">Market Price per SF (optional)</Label>
                        <Input
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
                      </div>
                    </div>

                    <div>
                      <Label>Incentive Stack (optional)</Label>
                      <p className="text-xs text-gray-500 mb-1">
                        Add incentives/programs such as TIF, capital lease savings, grants, or other public support.
                      </p>
                      <div className="space-y-2">
                        {(dealSummaryInputs.incentives ?? []).map((row, idx) => (
                          <div key={row.id ?? idx} className="grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-4">
                              <Input
                                placeholder="Incentive label"
                                value={row.label}
                                onChange={(e) => {
                                  const next = [...(dealSummaryInputs.incentives ?? [])]
                                  next[idx] = { ...row, label: e.target.value }
                                  setDealSummaryInputs({ ...dealSummaryInputs, incentives: next })
                                }}
                              />
                            </div>
                            <div className="col-span-3">
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="Per unit ($)"
                                value={row.perUnitAmount ?? ''}
                                onChange={(e) => {
                                  const next = [...(dealSummaryInputs.incentives ?? [])]
                                  const units = dealSummaryInputs.totalUnits ?? 0
                                  const per = parseFloat(e.target.value || '0')
                                  const perUnitAmount = isNaN(per) ? undefined : per
                                  const totalAmount =
                                    !isNaN(per) && units > 0
                                      ? per * units
                                      : row.totalAmount
                                  next[idx] = {
                                    ...row,
                                    perUnitAmount,
                                    totalAmount,
                                  }
                                  setDealSummaryInputs({ ...dealSummaryInputs, incentives: next })
                                }}
                              />
                            </div>
                            <div className="col-span-3">
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="Total ($)"
                                value={row.totalAmount ?? ''}
                                onChange={(e) => {
                                  const next = [...(dealSummaryInputs.incentives ?? [])]
                                  const units = dealSummaryInputs.totalUnits ?? 0
                                  const total = parseFloat(e.target.value || '0')
                                  const totalAmount = isNaN(total) ? undefined : total
                                  const perUnitAmount =
                                    !isNaN(total) && units > 0
                                      ? total / units
                                      : row.perUnitAmount
                                  next[idx] = {
                                    ...row,
                                    totalAmount,
                                    perUnitAmount,
                                  }
                                  setDealSummaryInputs({ ...dealSummaryInputs, incentives: next })
                                }}
                              />
                            </div>
                            <div className="col-span-2 flex justify-end">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  const next = (dealSummaryInputs.incentives ?? []).filter((_, i) => i !== idx)
                                  setDealSummaryInputs({ ...dealSummaryInputs, incentives: next })
                                }}
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const next = [...(dealSummaryInputs.incentives ?? [])]
                            next.push({
                              id: uuidv4(),
                              label: '',
                            })
                            setDealSummaryInputs({ ...dealSummaryInputs, incentives: next })
                          }}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add Incentive
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="publicBenefits">Public Benefit (bullets, optional)</Label>
                        <textarea
                          id="publicBenefits"
                          className="w-full border rounded-md p-2 text-sm min-h-[80px]"
                          placeholder="One benefit per line, e.g.&#10;- New attainable homes delivered&#10;- Below-market workforce housing"
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
                        <Label htmlFor="conclusionText">Summary / Conclusion (optional)</Label>
                        <textarea
                          id="conclusionText"
                          className="w-full border rounded-md p-2 text-sm min-h-[80px]"
                          placeholder="Short narrative suitable for banks, investors, or municipalities."
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
                  </div>
                )}
              </div>

              {/* Full Development Proforma (Sources & Uses, Draw Schedule, IDC) */}
              <div className="border-t pt-6">
                <div className="flex items-center gap-2 mb-4">
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
                  <Label htmlFor="useDevelopmentProforma" className="text-lg font-semibold cursor-pointer">
                    Full development proforma (Sources & Uses, construction draw schedule, interest during construction)
                  </Label>
                </div>
                {useDevelopmentProforma && (
                  <div className="space-y-4 p-4 bg-slate-50 rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="landCost">Land cost ($)</Label>
                      <Input
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
                    </div>
                    <div>
                      <Label htmlFor="softCostPercent">Soft cost % (of construction)</Label>
                      <Input
                        id="softCostPercent"
                        type="number"
                        step="0.1"
                        value={softCostPercent || ''}
                        onChange={(e) => setSoftCostPercent(parseFloat(e.target.value) || 0)}
                        placeholder="e.g. 10"
                      />
                    </div>
                    <div>
                      <Label htmlFor="contingencyPercent">Contingency % (of construction)</Label>
                      <Input
                        id="contingencyPercent"
                        type="number"
                        step="0.1"
                        value={contingencyPercent || ''}
                        onChange={(e) => setContingencyPercent(parseFloat(e.target.value) || 0)}
                        placeholder="e.g. 5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="constructionMonthsInput">Construction months</Label>
                      <Input
                        id="constructionMonthsInput"
                        type="number"
                        min="1"
                        value={constructionMonthsInput || ''}
                        onChange={(e) => setConstructionMonthsInput(parseInt(e.target.value, 10) || 0)}
                        placeholder="Leave 0 to use completion date"
                      />
                      <p className="text-xs text-gray-500 mt-1">0 = derive from completion date</p>
                    </div>
                    <div>
                      <Label htmlFor="loanToCostPercent">Loan-to-cost %</Label>
                      <Input
                        id="loanToCostPercent"
                        type="number"
                        step="0.1"
                        value={loanToCostPercent || ''}
                        onChange={(e) => setLoanToCostPercent(parseFloat(e.target.value) || 0)}
                        placeholder="e.g. 75"
                      />
                      <p className="text-xs text-gray-500 mt-1">Loan = total dev cost × this %</p>
                    </div>
                    <div>
                      <Label htmlFor="exitCapRate">Exit cap rate (%)</Label>
                      <Input
                        id="exitCapRate"
                        type="number"
                        step="0.1"
                        value={exitCapRate || ''}
                        onChange={(e) => setExitCapRate(parseFloat(e.target.value) || 0)}
                        placeholder="e.g. 5.5"
                      />
                      <p className="text-xs text-gray-500 mt-1">Stabilized value = annual NOI ÷ cap rate</p>
                    </div>
                    <div>
                      <Label htmlFor="refinanceLTVPercent">Refinance LTV (%)</Label>
                      <Input
                        id="refinanceLTVPercent"
                        type="number"
                        step="0.1"
                        value={refinanceLTVPercent || ''}
                        onChange={(e) => setRefinanceLTVPercent(parseFloat(e.target.value) || 0)}
                        placeholder="e.g. 75"
                      />
                        <p className="text-xs text-gray-500 mt-1">Refinance loan = property value × this %</p>
                      </div>
                    </div>

                    {/* LP–GP structure */}
                  <div className="border-t pt-4 mt-2">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">LP–GP capital structure</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="lpEquityPercent">LP equity %</Label>
                        <Input
                          id="lpEquityPercent"
                          type="number"
                          step="0.1"
                          value={lpEquityPercent}
                          onChange={(e) => setLpEquityPercent(parseFloat(e.target.value) || 0)}
                        />
                        <p className="text-xs text-gray-500 mt-1">GP equity % = 100 − LP equity %</p>
                      </div>
                      <div>
                        <Label htmlFor="lpPreferredReturnPercent">LP preferred return % (simple, annual)</Label>
                        <Input
                          id="lpPreferredReturnPercent"
                          type="number"
                          step="0.1"
                          value={lpPreferredReturnPercent}
                          onChange={(e) => setLpPreferredReturnPercent(parseFloat(e.target.value) || 0)}
                        />
                        <p className="text-xs text-gray-500 mt-1">Simple pref on original LP equity (non-compounding)</p>
                      </div>
                      <div>
                        <Label htmlFor="lpAbovePrefProfitSharePercent">LP share of profit above pref %</Label>
                        <Input
                          id="lpAbovePrefProfitSharePercent"
                          type="number"
                          step="0.1"
                          value={lpAbovePrefProfitSharePercent}
                          onChange={(e) => setLpAbovePrefProfitSharePercent(parseFloat(e.target.value) || 0)}
                        />
                        <p className="text-xs text-gray-500 mt-1">GP share = 100 − LP share (e.g. 70/30)</p>
                      </div>
                    </div>
                  </div>

                  {/* Value method & annual appreciation (display-only) */}
                  <div className="border-t pt-4 mt-2 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="valueMethod">Value Method</Label>
                        <Select
                          value={valueMethod}
                          onValueChange={(v: ValueMethod) => setValueMethod(v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="stabilized">Stabilized (flat / appreciation-based)</SelectItem>
                            <SelectItem value="noi-based">NOI-based (NOI ÷ exit cap)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {valueMethod === 'stabilized' && (
                        <div>
                          <Label htmlFor="annualAppreciationPercent">Annual appreciation % (display-only)</Label>
                          <Input
                            id="annualAppreciationPercent"
                            type="number"
                            step="0.1"
                            value={annualAppreciationPercent}
                            onChange={(e) => setAnnualAppreciationPercent(parseFloat(e.target.value) || 0)}
                            placeholder="e.g. 2.0"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Applies only to the Annual Proforma value column; refinance/exit math still uses the modeled stabilized value.
                          </p>
                        </div>
                      )}
                      {valueMethod === 'noi-based' && (
                        <div className="flex items-center text-xs text-gray-500">
                          Annual appreciation is not used with NOI-based value; annual values are derived from NOI ÷ exit cap rate.
                        </div>
                      )}
                    </div>
                  </div>
                  </div>
                )}
              </div>

              {/* Funding Milestones (Draw Schedule) */}
              <div>
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
                <div className="space-y-3">
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
                      <div key={milestone.id} className="grid grid-cols-12 gap-2 p-3 border rounded-lg">
                        <div className="col-span-4">
                          <Input
                            placeholder="Milestone name"
                            value={milestone.name}
                            onChange={(e) => handleMilestoneChange(milestone.id, 'name', e.target.value)}
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            type="date"
                            value={new Date(milestone.date).toISOString().split('T')[0]}
                            onChange={(e) => handleMilestoneChange(milestone.id, 'date', new Date(e.target.value))}
                          />
                        </div>
                        <div className="col-span-2">
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
                        <div className="col-span-2">
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
                        <div className="col-span-2 flex items-center">
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
              </div>

              {/* Rental Income Section */}
              <div className="border-t pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="includeRentalIncome"
                      checked={includeRentalIncome}
                      onChange={(e) => setIncludeRentalIncome(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="includeRentalIncome" className="text-lg font-semibold cursor-pointer">
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
                  <div className="space-y-3">
                    {rentalUnits.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">
                        No rental units added. Click "Add Unit" to start.
                      </p>
                    ) : (
                      rentalUnits.map((unit) => (
                        <div key={unit.id} className="grid grid-cols-12 gap-2 p-4 border rounded-lg bg-gray-50">
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
                          
                          {unit.rentType === 'fixed' ? (
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
                          
                          {unit.rentType === 'fixed' && unit.monthlyRent ? (
                            <div className="col-span-12 text-sm text-gray-600">
                              Monthly income: {formatCurrency((unit.monthlyRent || 0) * (unit.occupancyRate / 100))}
                            </div>
                          ) : unit.rentType === 'perSqft' && unit.squareFootage && unit.rentPerSqft ? (
                            <div className="col-span-12 text-sm text-gray-600">
                              Monthly income: {formatCurrency((unit.squareFootage || 0) * (unit.rentPerSqft || 0) * (unit.occupancyRate / 100))}
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Operating Expenses Section */}
              <div className="border-t pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <input
                    type="checkbox"
                    id="includeOperatingExpenses"
                    checked={includeOperatingExpenses}
                    onChange={(e) => setIncludeOperatingExpenses(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="includeOperatingExpenses" className="text-lg font-semibold cursor-pointer">
                    Operating Expenses
                  </Label>
                </div>
                
                {includeOperatingExpenses && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="propertyManagementPercent">Property Management (%)</Label>
                      <Input
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
                      <p className="text-xs text-gray-500 mt-1">% of rental income</p>
                    </div>
                    <div>
                      <Label htmlFor="capExPercent">Cap EX %</Label>
                      <Input
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
                      <p className="text-xs text-gray-500 mt-1">% of rental income</p>
                    </div>
                    <div>
                      <Label htmlFor="maintenanceReservePercent">Monthly Maintenance Reserve (%)</Label>
                      <Input
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
                      <p className="text-xs text-gray-500 mt-1">% of rental income</p>
                    </div>
                    <div>
                      <Label htmlFor="monthlyPropertyInsurance">Monthly Property Insurance</Label>
                      <Input
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
                    </div>
                    <div>
                      <Label htmlFor="annualPropertyTax">Annual Property Tax</Label>
                      <Input
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
                      <p className="text-xs text-gray-500 mt-1">Annual amount (will be prorated monthly)</p>
                    </div>
                    <div>
                      <Label htmlFor="monthlyUtilities">Monthly Utilities (Common Areas)</Label>
                      <Input
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
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="monthlyOther">Other Monthly Expenses</Label>
                      <Input
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
                    </div>
                  </div>
                )}
              </div>

              {/* Debt Service Section */}
              <div className="border-t pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <input
                    type="checkbox"
                    id="includeDebtService"
                    checked={includeDebtService}
                    onChange={(e) => setIncludeDebtService(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="includeDebtService" className="text-lg font-semibold cursor-pointer">
                    Debt Service
                  </Label>
                </div>
                
                {includeDebtService && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="loanAmount">Loan Amount</Label>
                      <Input
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
                    </div>
                    <div>
                      <Label htmlFor="interestRate">Interest Rate (%)</Label>
                      <Input
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
                      <p className="text-xs text-gray-500 mt-1">Annual percentage rate</p>
                    </div>
                    <div>
                      <Label htmlFor="loanTermMonths">Loan Term (Months)</Label>
                      <Input
                        id="loanTermMonths"
                        type="number"
                        value={debtService.loanTermMonths}
                        onChange={(e) => setDebtService({
                          ...debtService,
                          loanTermMonths: parseInt(e.target.value) || 360,
                        })}
                        placeholder="360"
                      />
                      <p className="text-xs text-gray-500 mt-1">Amortization period (e.g., 360 = 30 years)</p>
                    </div>
                    <div>
                      <Label htmlFor="paymentType">Payment Type</Label>
                      <Select
                        value={debtService.paymentType}
                        onValueChange={(v: 'interest-only' | 'principal-interest') => setDebtService({
                          ...debtService,
                          paymentType: v,
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="interest-only">Interest Only (Construction)</SelectItem>
                          <SelectItem value="principal-interest">Principal + Interest (Permanent)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {debtService.loanAmount > 0 && debtService.interestRate > 0 && (
                      <div className="md:col-span-2">
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
                      </div>
                    )}
                  </div>
                )}
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

              <div className="flex gap-4 pt-4">
                <Button variant="outline" onClick={onClose} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleGenerate} className="flex-1">
                  Generate Pro Forma
                </Button>
              </div>
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
                          <h4 className="text-sm font-semibold text-gray-700 mb-1">Incentive stack</h4>
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

                      {/* Rental Income Summary */}
                      {projection.summary.monthlyRentalIncome > 0 && (
                        <div className="border-t pt-4">
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Rental Income Summary</h4>
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
                <div className="flex gap-4">
                  <Button variant="outline" onClick={() => setProjection(null)} className="flex-1">
                    Edit Inputs
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      if (projection) {
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
        </CardContent>
      </Card>
    </div>
  )
}



