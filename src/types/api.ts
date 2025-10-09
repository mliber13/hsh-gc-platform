// ============================================================================
// API Response Types
// ============================================================================

import type { 
  Project, 
  Estimate,
  ProjectActuals,
  HistoricalRate,
  VarianceAnalysis,
  ProgressSummary,
  CostSummary
} from './project'

// ----------------------------------------------------------------------------
// Generic API Response Wrappers
// ----------------------------------------------------------------------------

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: ApiError
  message?: string
}

export interface ApiError {
  code: string
  message: string
  details?: Record<string, any>
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    pageSize: number
    totalPages: number
    totalItems: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
}

// ----------------------------------------------------------------------------
// Project Responses
// ----------------------------------------------------------------------------

export interface ProjectResponse {
  project: Project
  summary: ProjectSummary
}

export interface ProjectListResponse {
  projects: Project[]
  summary: {
    total: number
    byStatus: Record<Project['status'], number>
    totalEstimatedValue: number
    totalActiveValue: number
  }
}

export interface ProjectSummary {
  projectId: string
  
  // Financial
  estimatedCost: number
  actualCost: number
  variance: number
  variancePercentage: number
  projectedFinalCost: number
  
  // Progress
  percentComplete: number
  isOnSchedule: boolean
  daysRemaining: number
  
  // Activity
  lastActivityDate: Date
  recentActivities: string[]
  
  // Issues
  openIssuesCount: number
  criticalIssuesCount: number
}

// ----------------------------------------------------------------------------
// Analytics & Reporting Responses
// ----------------------------------------------------------------------------

export interface DashboardData {
  // Overview
  activeProjectsCount: number
  totalProjectValue: number
  averageMargin: number
  
  // Performance
  onTimePercentage: number
  onBudgetPercentage: number
  averageVariance: number
  
  // Recent activity
  recentProjects: Project[]
  pendingApprovals: any[]
  upcomingMilestones: any[]
  
  // Charts data
  projectsByStatus: Array<{
    status: string
    count: number
    value: number
  }>
  
  costTrends: Array<{
    month: string
    estimated: number
    actual: number
  }>
  
  tradeProfitability: Array<{
    trade: string
    averageMargin: number
    projectCount: number
  }>
}

export interface VarianceReport {
  projectId: string
  projectName: string
  
  // Overall
  totalEstimated: number
  totalActual: number
  totalVariance: number
  variancePercentage: number
  
  // By category
  byTrade: Array<{
    trade: string
    estimated: number
    actual: number
    variance: number
    variancePercentage: number
  }>
  
  // Top variances
  topOverruns: VarianceAnalysis[]
  topSavings: VarianceAnalysis[]
  
  // Insights
  insights: string[]
  recommendations: string[]
}

export interface HistoricalRatesReport {
  rates: HistoricalRate[]
  
  // Summary
  summary: {
    totalDataPoints: number
    dateRange: {
      from: Date
      to: Date
    }
    mostReliableTrades: string[]
    highVarianceTrades: string[]
  }
  
  // Trends
  trends: Array<{
    trade: string
    direction: 'increasing' | 'decreasing' | 'stable'
    changePercentage: number
  }>
}

export interface ProfitabilityReport {
  projectId?: string  // Optional - can be company-wide
  
  // Revenue
  totalRevenue: number
  
  // Costs
  costs: {
    labor: number
    materials: number
    subcontractors: number
    overhead: number
    total: number
  }
  
  // Profit
  grossProfit: number
  grossMargin: number
  netProfit: number
  netMargin: number
  
  // By project type
  byProjectType: Array<{
    type: string
    revenue: number
    cost: number
    margin: number
  }>
  
  // By trade
  byTrade: Array<{
    trade: string
    revenue: number
    cost: number
    margin: number
  }>
}

export interface ProductivityReport {
  // Labor efficiency
  averageHoursPerUnit: Record<string, number>
  
  // Top performers
  topTradesByEfficiency: Array<{
    trade: string
    hoursPerUnit: number
    benchmark: number
    variance: number
  }>
  
  // Material efficiency
  averageWastePercentage: Record<string, number>
  
  // Trends over time
  productivityTrends: Array<{
    month: string
    efficiency: number
  }>
}

// ----------------------------------------------------------------------------
// Estimate Intelligence Responses
// ----------------------------------------------------------------------------

export interface EstimateRecommendations {
  estimateId: string
  
  recommendations: Array<{
    tradeId: string
    tradeName: string
    currentRate: number
    suggestedRate: number
    confidence: 'high' | 'medium' | 'low'
    reason: string
    historicalData: {
      averageRate: number
      projectCount: number
      dateRange: {
        from: Date
        to: Date
      }
    }
  }>
  
  warnings: Array<{
    tradeId: string
    tradeName: string
    severity: 'high' | 'medium' | 'low'
    message: string
  }>
  
  overallAssessment: {
    isCompetitive: boolean
    isRealistic: boolean
    riskLevel: 'high' | 'medium' | 'low'
    confidenceScore: number
    summary: string
  }
}

export interface SimilarProjectsResponse {
  projects: Array<{
    project: Project
    similarity: number
    relevantMetrics: {
      costPerSqFt?: number
      duration?: number
      margin?: number
    }
  }>
}

// ----------------------------------------------------------------------------
// Export Responses
// ----------------------------------------------------------------------------

export interface ExportOptions {
  format: 'pdf' | 'excel' | 'csv' | 'json'
  includeCharts?: boolean
  includeSummary?: boolean
  dateRange?: {
    from: Date
    to: Date
  }
}

export interface ExportResponse {
  fileUrl: string
  fileName: string
  fileSize: number
  expiresAt: Date
}

// ----------------------------------------------------------------------------
// Validation Responses
// ----------------------------------------------------------------------------

export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

export interface ValidationError {
  field: string
  message: string
  code: string
}

export interface ValidationWarning {
  field: string
  message: string
  suggestion?: string
}

// ----------------------------------------------------------------------------
// Batch Operation Responses
// ----------------------------------------------------------------------------

export interface BatchOperationResult<T> {
  successful: T[]
  failed: Array<{
    item: T
    error: string
  }>
  summary: {
    total: number
    succeeded: number
    failed: number
  }
}

