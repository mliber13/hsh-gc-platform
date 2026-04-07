// ============================================================================
// HSH GC Platform - Pro Forma Types
// ============================================================================
//
// Types for construction loan pro forma financial projections
//

export interface PaymentMilestone {
  id: string
  name: string
  date: Date
  amount: number // Dollar amount
  percentComplete: number // 0-100 cumulative percent complete when this milestone triggers
  /** Optional derived incremental percent for this milestone (cumulative delta) */
  percentIncremental?: number
  description?: string
}

export interface RentalLeaseTerm {
  id: string
  name?: string
  startDate?: Date
  endDate?: Date
  rentType: 'fixed' | 'perSqft'
  monthlyRent?: number
  squareFootage?: number
  rentPerSqft?: number
  occupancyRate?: number // Optional override; falls back to unit occupancy if omitted
}

export interface RentalUnit {
  id: string
  name: string // e.g., "First Floor Store", "Unit 2A", etc.
  unitType: 'residential' | 'commercial' | 'mixed'
  
  // Rent calculation method
  rentType: 'fixed' | 'perSqft'
  
  // For fixed rent
  monthlyRent?: number // Fixed monthly amount
  
  // For per sqft rent
  squareFootage?: number // Square feet of this unit
  rentPerSqft?: number // $ per square foot per month
  
  // Occupancy
  occupancyRate: number // 0-100, percentage occupied
  occupancyStartDate?: Date // When unit becomes available for rent
  occupancyEndDate?: Date // Optional lease/rent end date (unit no longer contributes after this)
  leaseDurationYears?: number // Optional helper to auto-calculate end date from start date
  leaseTerms?: RentalLeaseTerm[] // Optional phased lease terms for this same physical unit
  
  // Notes
  notes?: string
}

export interface OperatingExpenses {
  propertyManagementPercent: number // % of rental income
  capExPercent?: number // Capital Expenditures % of rental income
  maintenanceReservePercent: number // % of rental income for maintenance reserve
  monthlyPropertyInsurance: number
  annualPropertyTax: number // Annual property tax (will be prorated monthly)
  monthlyUtilities?: number // Common area utilities
  monthlyOther?: number // Miscellaneous expenses
  annualExpenses?: { // Annual expenses that can be prorated monthly
    insurance: number
    propertyTax: number
    other: number
  }
}

export interface DebtService {
  loanAmount: number
  interestRate: number // Annual percentage rate (e.g., 5.5 = 5.5%)
  loanTermMonths: number // Amortization period in months
  startDate: Date // When loan payments begin (typically after construction)
  paymentType: 'interest-only' | 'principal-interest' // During construction vs. permanent loan
}

export interface DealSummaryIncentiveInput {
  id: string
  label: string
  perUnitAmount?: number
  totalAmount?: number
  /** Optional source classification from UI stack (infra/cost/equity/financing-term, etc.) */
  applyTo?: string
  /** Capital source type used for cap stack classification */
  sourceType?: 'debt' | 'equity'
}

export interface DealSummaryInputs {
  totalUnits?: number
  averageUnitSize?: number
  targetSalePricePerUnit?: number
  marketPricePerSF?: number
  incentives?: DealSummaryIncentiveInput[]
  publicBenefits?: string[]
  conclusionText?: string
}

export interface DealSummaryIncentive {
  label: string
  perUnitAmount: number
  totalAmount: number
}

export interface DealSummaryCapitalStackItem {
  label: string
  amount: number
}

export interface DealSummary {
  totalUnits: number
  averageUnitSize: number
  targetSalePricePerUnit: number
  targetPricePerSF?: number
  marketPricePerSF?: number
  baseProjectCost: number
  baseCostPerUnit: number
  gapPerUnit: number
  incentives: DealSummaryIncentive[]
  totalIncentivesPerUnit: number
  totalIncentives: number
  adjustedCostPerUnit: number
  profitPerUnit: number
  totalProfit: number
  capitalStack: DealSummaryCapitalStackItem[]
  publicBenefits?: string[]
  conclusionText?: string
}

export interface MonthlyCashFlow {
  month: string // "YYYY-MM" format
  monthLabel: string // "January 2024"
  phase: 'construction' | 'post-construction' // Which phase this month is in
  
  // Inflows
  milestonePayments: number
  rentalIncome: number
  /** Loan draw during construction (full development proforma) */
  constructionDraw?: number
  totalInflow: number
  
  // Outflows (Construction phase)
  laborCost: number
  materialCost: number
  subcontractorCost: number
  overheadAllocation: number
  /** Interest accrued during construction (full development proforma) */
  interestDuringConstruction?: number
  
  // Outflows (Post-construction phase)
  operatingExpenses: number
  debtService: number
  
  totalOutflow: number
  
  // Net
  netCashFlow: number
  cumulativeBalance: number
}

/** Sources & Uses (full development proforma) */
export interface SourcesAndUses {
  uses: {
    landCost: number
    constructionCost: number
    softCost: number
    contingency: number
    totalDevelopmentCost: number
  }
  sources: {
    loanAmount: number
    equityRequired: number
  }
}

/** One row of the construction draw schedule */
export interface ConstructionDrawRow {
  month: string
  monthLabel: string
  draw: number
  cumulativeDraw: number
  loanBalance: number
  interestAccrued: number
}

export type ProFormaMode = 'rental-hold' | 'general-development' | 'for-sale-phased-loc'

export interface ForSalePhaseInput {
  id: string
  name: string
  unitCount: number
  buildMonths: number
  presaleStartMonthOffset: number
  closeStartMonthOffset: number
  presaleTriggerPercent: number
  infrastructureAllocationPercent?: number
  avgSalePrice?: number
  /** Optional total hard cost budget for this phase (used before proportional fallback) */
  hardCostBudget?: number
  /** Optional total soft cost budget for this phase (used before proportional fallback) */
  softCostBudget?: number
  /** Auto derives costs from total budgets unless set to manual */
  costEntryMode?: 'auto' | 'manual'
}

export interface SalesAllocationBuckets {
  locPaydownPercent: number
  reinvestPercent: number
  reservePercent: number
  distributionPercent: number
}

export interface ForSalePhasedLocInput {
  enabled: boolean
  totalUnits: number
  averageSalePrice: number
  presaleDepositPercent: number
  /** How much of presale deposits can be used as active project cash before closing */
  depositUsageMode?: 'full' | 'percent' | 'at-closing'
  depositUsablePercent?: number
  /** Optional global pace cap used to limit combined phase presales/closings per month */
  salesPaceUnitsPerMonth?: number
  /** Optional pacing behavior: cap combined activity, presales only, or closings only */
  salesPaceMode?: 'combined' | 'presales' | 'closings'
  /** Optional phase draw profile (defaults to linear if omitted) */
  constructionSpendCurve?: 'linear' | 'front-loaded' | 'back-loaded'
  infrastructureCost: number
  tifInfrastructureReduction: number
  /** Additional incentives that reduce total project cost but are not infra-specific */
  incentiveCostReduction?: number
  /** Incentive/partner capital available before LOC/equity draws */
  incentiveEquitySource?: number
  /** Optional bond scaffolding for financing scenario capture (not yet applied to debt math) */
  bondFinancingEnabled?: boolean
  bondLtcOverridePercent?: number
  bondRatePercent?: number
  bondCapacity?: number
  fixedLocLimit: number
  ltcPercent: number
  /** If true (default), presales count toward phase trigger; if false, use executed closings only */
  triggerUsesPresales?: boolean
  salesAllocationBuckets: SalesAllocationBuckets
  phases: ForSalePhaseInput[]
}

export interface ProFormaInput {
  projectId: string
  proFormaMode?: ProFormaMode
  contractValue: number
  paymentMilestones: PaymentMilestone[]
  monthlyOverhead: number
  overheadAllocationMethod: 'proportional' | 'flat' | 'none'
  projectionMonths: 6 | 12 | 24 | 36 | 60 | 120 // Extended to support longer projections (up to 10 years)
  startDate: Date
  
  // Project details
  totalProjectSquareFootage?: number // Total square footage of the project
  /** Optional estimated construction cost used for deal underwriting when no detailed trades exist */
  underwritingEstimatedConstructionCost?: number
  
  // --- Full development proforma (Sources & Uses, Draw Schedule, IDC) ---
  useDevelopmentProforma?: boolean // When true, compute total dev cost, LTC, draw schedule, interest during construction
  landCost?: number
  softCostPercent?: number // % of construction cost
  contingencyPercent?: number // % of construction cost
  constructionMonths?: number // Number of months to spread construction draws (default from dates)
  loanToCostPercent?: number // Loan-to-cost %; loan = totalDevCost * this / 100

  // --- Capital structure & LP-GP waterfall (Phase 3) ---
  /** LP equity share as a percentage of total equity (e.g. 50 for 50/50 LP/GP) */
  lpEquityPercent?: number
  /** Simple (non-compounding) annual preferred return to LP on original equity (e.g. 8 for 8%) */
  lpPreferredReturnPercent?: number
  /** LP share of above-pref profit (remaining cash after pref) as a percentage (e.g. 70 for 70/30) */
  lpAbovePrefProfitSharePercent?: number

  // --- Tax modeling (optional, for after-tax view) ---
  /** Flat marginal tax rate applied to taxable income (%), e.g. 25 for 25% */
  taxRatePercent?: number
  /** Annual depreciation amount used to reduce taxable income (from basis / schedule in spreadsheet) */
  annualDepreciation?: number
  
  // Rental income
  rentalUnits: RentalUnit[]
  includeRentalIncome: boolean
  
  // Operating expenses
  operatingExpenses: OperatingExpenses
  includeOperatingExpenses: boolean
  
  // Debt service
  debtService: DebtService
  includeDebtService: boolean
  
  // Construction completion
  constructionCompletionDate?: Date // When construction ends and rental income begins

  // --- Refinance / Exit (Phase 2) ---
  exitCapRate?: number // %; stabilized property value = annual NOI / exit cap rate
  refinanceLTVPercent?: number // %; refinance loan = property value × this

  // --- Display-only annual value growth (optional) ---
  /** Optional annual appreciation rate used only for annual value schedule display (% per year) */
  annualAppreciationPercent?: number
  /** Display-only value method for annual proforma (stabilized vs NOI-based) */
  valueMethod?: 'stabilized' | 'noi-based'

  // --- For-sale phased development (revolving LOC) ---
  forSalePhasedLoc?: ForSalePhasedLocInput
}

export interface ProFormaProjection {
  projectId: string
  projectName: string
  contractValue: number
  totalEstimatedCost: number
  projectedProfit: number
  projectedMargin: number
  monthlyCashFlows: MonthlyCashFlow[]
  summary: {
    totalInflow: number
    totalOutflow: number
    netCashFlow: number
    peakCashNeeded: number
    monthsNegative: number
    
    // Full development proforma
    totalInterestDuringConstruction?: number
    
    // Rental income summary
    totalRentalIncome: number
    annualRentalIncome: number
    monthlyRentalIncome: number // Average monthly after stabilization
    
    // Operating expenses summary
    totalOperatingExpenses: number
    annualOperatingExpenses: number
    
    // Debt service summary
    totalDebtService: number
    monthlyDebtService: number
    
    // Financial metrics
    netOperatingIncome: number // NOI (rental income - operating expenses)
    cashFlowAfterDebt: number // NOI - debt service
    capRate?: number // NOI / property value (if available)
    cashOnCashReturn?: number // Annual cash flow / initial investment

    // Refinance / Exit (Phase 2)
    exitValue?: number // Stabilized value = annual NOI / exit cap rate
    refinanceLoanAmount?: number // Property value × refinance LTV %
    cashOutRefinance?: number // Refinance proceeds − construction loan balance
    irr?: number // Internal rate of return on equity cash flows (%)
    equityMultiple?: number // Total cash distributed ÷ initial equity
    /** After-tax IRR using simple tax/depreciation model (if configured) */
    afterTaxIrr?: number

    // LP-GP waterfall metrics (Phase 3)
    lpIrr?: number
    lpEquityMultiple?: number
    lpCashOnCashReturn?: number
    gpIrr?: number
    gpEquityMultiple?: number
    gpCashOnCashReturn?: number

    // For-sale phased LOC metrics
    forSaleTotalRevenue?: number
    forSaleBaseCostBeforeIncentives?: number
    forSaleAppliedInfrastructureReduction?: number
    forSaleAppliedProjectCostReduction?: number
    forSaleLtcSizingBase?: number
    forSaleLocLimit?: number
    forSaleLocDrawnTotal?: number
    forSaleEndingLocBalance?: number
    forSalePeakLocBalance?: number
    forSaleEndingBondBalance?: number
    forSalePeakBondBalance?: number
    forSaleBondDrawnTotal?: number
    forSaleReserveEnding?: number
    forSaleDistributionTotal?: number
    forSaleReinvestedTotal?: number
    forSaleEquityDeployed?: number
    forSaleIncentiveEquityUsed?: number
    forSaleEquityMultiple?: number
    forSaleProjectIrr?: number
    forSaleReserveUsedTotal?: number
    forSalePhaseActivations?: Array<{ phaseName: string; activationMonth: string }>
    forSaleFundingAudit?: {
      incentiveEquitySourceUsed: number
      remainingEquityIncentive?: number
      reinvestUsed: number
      reserveUsed: number
      locDrawn: number
      developerEquityUsed: number
    }
    forSaleSweepExecuted?: boolean
    forSaleFinalLocBeforeSweep?: number
    forSaleFinalLocAfterSweep?: number
    forSaleClosedUnits?: number
    forSaleTotalUnits?: number
    forSaleEngineVersion?: string
    forSaleDebtRepaymentWarning?: string
    proFormaModeUsed?: ProFormaMode
  }
  /** Full development proforma: sources & uses */
  sourcesAndUses?: SourcesAndUses
  /** Full development proforma: construction draw schedule with loan balance and IDC */
  constructionDrawSchedule?: ConstructionDrawRow[]
  /** LP-GP annual waterfall detail (Phase 3) */
  lpGpAnnual?: Array<{
    year: number
    /** LP capital at start of year */
    lpCapitalStart: number
    /** LP capital returned this year */
    lpCapitalReturned: number
    /** LP capital at end of year */
    lpCapitalEnd: number
    /** LP preferred return accrued for this year (on beginning capital) */
    lpPrefAccrued: number
    /** LP preferred return actually paid this year */
    lpPrefPaid: number
    /** LP preferred return balance carried forward after this year */
    lpPrefBalanceEnd: number
    /** Cash remaining after pref but before capital return (for legacy table column) */
    remainingAfterPref: number
    /** Total LP cash for the year (pref + capital + profit share) */
    lpShare: number
    /** Total GP cash for the year */
    gpShare: number
    /** Cumulative LP+GP cash distributed through this year */
    totalDistributed: number
  }>
  /** LP-GP exit detail (Phase 3) */
  lpGpExit?: {
    exitYear: number
    projectedValue: number
    /** Modeled loan balance at exit (amortized if applicable) */
    loanBalance: number
    netEquity: number
    unpaidPrefAtExit: number
    capitalReturnedAtExit: number
    remainingProfitAfterPrefAndCapital: number
    cashToLp: number
    cashToGp: number
  }
  /** Annual debt schedule for permanent loan */
  annualDebtSchedule?: Array<{
    year: number
    beginningBalance: number
    payment: number
    interestPaid: number
    principalPaid: number
    endingBalance: number
  }>
  /** Annual value schedule for display in Annual Proforma (may apply optional appreciation) */
  annualValueSchedule?: Array<{ year: number; value: number }>
  costBreakdown: {
    laborPercent: number
    materialPercent: number
    subcontractorPercent: number
    overheadPercent: number
  }
  rentalSummary: {
    totalUnits: number
    totalSquareFootage: number // Total from rental units
    totalProjectSquareFootage: number // Total project square footage
    averageRentPerUnit: number
    averageRentPerSqft: number
    stabilizedOccupancy: number // Average occupancy rate
  }
  /** Display-only underwriting metadata for exports / reporting (deal pipeline mode) */
  underwritingExportMeta?: {
    underwritingEstimatedConstructionCost?: number
    landCost?: number
    softCostPercent?: number
    contingencyPercent?: number
    loanToCostPercent?: number
    exitCapRate?: number
    refinanceLTVPercent?: number
    valueMethod?: 'stabilized' | 'noi-based'
    annualAppreciationPercent?: number
  }
  /** Optional deal-level attainable housing summary (display/reporting only) */
  dealSummary?: DealSummary

  /** Optional phased for-sale LOC timeline for mode-specific reporting */
  forSaleLocTimeline?: Array<{
    month: string
    monthLabel: string
    phaseName: string
    activeUnits: number
    presalesThisMonth: number
    closingsThisMonth: number
    salesRevenue: number
      bondDraw: number
      bondPaydown: number
      bondBalance: number
    locDraw: number
    locPaydown: number
    locBalance: number
    availableLocCapacity: number
    reserveBalance: number
    reinvestBalance: number
    distributedCash: number
  }>
}

export interface ProFormaExportOptions {
  format: 'pdf' | 'excel'
  includeDetails: boolean
  includeCharts: boolean
}



