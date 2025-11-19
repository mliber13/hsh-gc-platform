// ============================================================================
// HSH GC Platform - Type Definitions Index
// ============================================================================

// Export types from both project.ts and constants.ts
export type {
  // Core types
  Project,
  Client,
  
  // Estimate types
  Estimate,
  Trade,
  TakeoffItem,
} from './project'

export type {
  // Plan types
  Plan,
  PlanDocument,
  PlanOption,
  CreatePlanInput,
  UpdatePlanInput,
  PlanDocumentInput,
  PlanOptionInput,
  PlanSortField,
  PlanFilterStatus,
} from './plan'

export type {
  ProjectType,
  ProjectStatus,
  TradeCategory,
  CategoryGroup,
  UnitType,
  EstimateStatus,
} from './project'

export type {
  // Actuals types
  ProjectActuals,
  LaborEntry,
  CrewMember,
  MaterialEntry,
  SubcontractorEntry,
  Payment,
  
  // Daily logs
  DailyLog,
  Issue,
  Delay,
  Photo,
  
  // Change orders
  ChangeOrder,
  
  // Schedule
  ProjectSchedule,
  ScheduleItem,
  Milestone,
  
  // Documents
  ProjectDocument,
  DocumentType,
  
  // Historical data
  HistoricalRate,
  VarianceAnalysis,
  
  // Time tracking
  TimeClockEntry,
  
  // User
  User,
  UserPreferences,
  
  // Utility types
  DateRange,
  CostSummary,
  ProgressSummary,
} from './project'

// Export all form types
export type {
  // Project forms
  CreateProjectInput,
  UpdateProjectInput,
  ClientInput,
  
  // Estimate forms
  CreateEstimateInput,
  TradeInput,
  TakeoffInput,
  
  // Actuals forms
  LaborEntryInput,
  MaterialEntryInput,
  SubcontractorEntryInput,
  PaymentInput,
  
  // Daily log forms
  DailyLogInput,
  
  // Change order forms
  ChangeOrderInput,
  ChangeOrderApproval,
  
  // Schedule forms
  ScheduleItemInput,
  ScheduleItemUpdate,
  MilestoneInput,
  
  // Time clock forms
  ClockInInput,
  ClockOutInput,
  
  // Filters & search
  ProjectFilters,
  EstimateFilters,
  TradeFilters,
  ProjectSortField,
  SortDirection,
  SortOptions,
  
  // Bulk operations
  BulkTradeImport,
  BulkLaborImport,
  
  // Templates
  EstimateTemplate,
  ScheduleTemplate,
} from './forms'

// Export item template types
export type {
  ItemTemplate,
  ItemTemplateInput,
} from './itemTemplate'

export type {
  PartnerBase,
  Subcontractor,
  Supplier,
  SubcontractorInput,
  SupplierInput,
  PartnerDirectoryEntity,
} from './partners'

export type {
  PlanEstimateTemplate,
  CreatePlanEstimateTemplateInput,
  UpdatePlanEstimateTemplateInput,
} from './estimateTemplate'

export type {
  PaymentMilestone,
  MonthlyCashFlow,
  ProFormaInput,
  ProFormaProjection,
  ProFormaExportOptions,
} from './proforma'

export type {
  SOWTemplate,
  SOWTask,
  SOWMaterial,
  SOWSpecification,
  CreateSOWTemplateInput,
  UpdateSOWTemplateInput,
  FormattedSOW,
} from './sow'

// Export all API types
export type {
  // Generic responses
  ApiResponse,
  ApiError,
  PaginatedResponse,
  
  // Project responses
  ProjectResponse,
  ProjectListResponse,
  ProjectSummary,
  
  // Analytics responses
  DashboardData,
  VarianceReport,
  HistoricalRatesReport,
  ProfitabilityReport,
  ProductivityReport,
  
  // Intelligence responses
  EstimateRecommendations,
  SimilarProjectsResponse,
  
  // Export responses
  ExportOptions,
  ExportResponse,
  
  // Validation responses
  ValidationResult,
  ValidationError,
  ValidationWarning,
  
  // Batch operations
  BatchOperationResult,
} from './api'

// Export constants and helpers
export {
  TRADE_CATEGORIES,
  CATEGORY_GROUPS,
  CATEGORY_TO_GROUP,
  GROUP_TO_CATEGORIES,
  DEFAULT_CATEGORY_ITEMS,
  ESTIMATE_STATUS,
  UNIT_TYPES,
  PROJECT_TYPES,
  PROJECT_STATUS,
  DEFAULT_VALUES,
  LABOR_ROLES,
  WEATHER_CONDITIONS,
  ISSUE_SEVERITIES,
  DELAY_CATEGORIES,
  DOCUMENT_TYPES,
  PAYMENT_METHODS,
  USER_ROLES,
  CONFIDENCE_LEVELS,
  VALIDATION_RULES,
  formatCurrency,
  formatNumber,
  formatPercentage,
  getTradeLabel,
  getCategoryGroup,
  getGroupLabel,
  getEstimateStatusLabel,
  getEstimateStatusBadgeClass,
  getUnitLabel,
  getStatusColor,
  calculateTotalCost,
  calculateVariance,
  calculateVariancePercentage,
  calculateMargin,
  getConfidenceLevel,
} from './constants'

