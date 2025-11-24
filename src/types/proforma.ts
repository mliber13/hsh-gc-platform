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
  percentComplete: number // 0-100, when this milestone triggers
  description?: string
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

export interface MonthlyCashFlow {
  month: string // "YYYY-MM" format
  monthLabel: string // "January 2024"
  phase: 'construction' | 'post-construction' // Which phase this month is in
  
  // Inflows
  milestonePayments: number
  rentalIncome: number
  totalInflow: number
  
  // Outflows (Construction phase)
  laborCost: number
  materialCost: number
  subcontractorCost: number
  overheadAllocation: number
  
  // Outflows (Post-construction phase)
  operatingExpenses: number
  debtService: number
  
  totalOutflow: number
  
  // Net
  netCashFlow: number
  cumulativeBalance: number
}

export interface ProFormaInput {
  projectId: string
  contractValue: number
  paymentMilestones: PaymentMilestone[]
  monthlyOverhead: number
  overheadAllocationMethod: 'proportional' | 'flat' | 'none'
  projectionMonths: 6 | 12 | 24 | 36 | 60 // Extended to support longer projections
  startDate: Date
  
  // Project details
  totalProjectSquareFootage?: number // Total square footage of the project
  
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
  }
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
}

export interface ProFormaExportOptions {
  format: 'pdf' | 'excel'
  includeDetails: boolean
  includeCharts: boolean
}



