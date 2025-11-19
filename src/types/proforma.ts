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

export interface MonthlyCashFlow {
  month: string // "YYYY-MM" format
  monthLabel: string // "January 2024"
  
  // Inflows
  milestonePayments: number
  totalInflow: number
  
  // Outflows
  laborCost: number
  materialCost: number
  subcontractorCost: number
  overheadAllocation: number
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
  projectionMonths: 6 | 12
  startDate: Date
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
  }
  costBreakdown: {
    laborPercent: number
    materialPercent: number
    subcontractorPercent: number
    overheadPercent: number
  }
}

export interface ProFormaExportOptions {
  format: 'pdf' | 'excel'
  includeDetails: boolean
  includeCharts: boolean
}



