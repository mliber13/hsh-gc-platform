// ============================================================================
// Form Types & Input Models
// ============================================================================

import type { 
  Project, 
  Estimate, 
  Trade, 
  TakeoffItem,
  LaborEntry,
  MaterialEntry,
  SubcontractorEntry,
  DailyLog,
  ChangeOrder,
  Client,
  ProjectType,
  TradeCategory,
  UnitType
} from './project'

// These types represent the shape of data when creating/editing
// They're similar to the main types but with optional IDs and timestamps

// ----------------------------------------------------------------------------
// Project Forms
// ----------------------------------------------------------------------------

export interface CreateProjectInput {
  name: string
  projectNumber?: string
  client: ClientInput
  type: ProjectType
  address?: {
    street: string
    city: string
    state: string
    zip: string
  }
  city?: string
  state?: string
  zipCode?: string
  startDate?: Date
  endDate?: Date
  estimatedCompletionDate?: Date
  metadata?: {
    planId?: string
    planOptions?: string[]
    [key: string]: any
  }
  notes?: string
}

export interface UpdateProjectInput extends Partial<CreateProjectInput> {
  id: string
  status?: Project['status']
}

export interface ClientInput {
  name: string
  email?: string
  phone?: string
  company?: string
  address?: string
}

// ----------------------------------------------------------------------------
// Estimate Forms
// ----------------------------------------------------------------------------

export interface CreateEstimateInput {
  projectId: string
  overhead: number
  profit: number
  contingency: number
  notes?: string
}

export interface TradeInput {
  category: TradeCategory
  name: string
  description?: string
  quantity: number
  unit: UnitType
  laborCost: number
  laborRate?: number
  laborHours?: number
  materialCost: number
  materialRate?: number
  subcontractorCost: number
  isSubcontracted: boolean
  wasteFactor: number
  notes?: string
}

export interface TakeoffInput {
  name: string
  description?: string
  category: string
  length?: number
  width?: number
  height?: number
  area?: number
  volume?: number
  count?: number
  unit: UnitType
  drawingReference?: string
  locationOnSite?: string
  notes?: string
}

// ----------------------------------------------------------------------------
// Actuals Forms
// ----------------------------------------------------------------------------

export interface LaborEntryInput {
  projectId: string
  tradeId?: string
  date: Date
  crew: {
    name: string
    role: string
    hours: number
    rate: number
  }[]
  trade: TradeCategory
  description: string
  phase?: string
  quantityCompleted?: number
  unit?: UnitType
  percentComplete?: number
  notes?: string
}

export interface MaterialEntryInput {
  projectId: string
  tradeId?: string
  date: Date
  materialName: string
  category: TradeCategory
  description?: string
  quantity: number
  unit: UnitType
  unitCost: number
  quantityUsed?: number
  quantityWasted?: number
  vendor?: string
  invoiceNumber?: string
  poNumber?: string
  notes?: string
}

export interface SubcontractorEntryInput {
  projectId: string
  tradeId?: string
  subcontractor: {
    name: string
    company: string
    email?: string
    phone?: string
  }
  trade: TradeCategory
  scopeOfWork: string
  contractAmount: number
  startDate?: Date
  completionDate?: Date
  notes?: string
}

export interface PaymentInput {
  subcontractorEntryId: string
  date: Date
  amount: number
  method: 'check' | 'ach' | 'wire' | 'credit-card'
  checkNumber?: string
  description?: string
  invoiceNumber?: string
}

// ----------------------------------------------------------------------------
// Daily Log Forms
// ----------------------------------------------------------------------------

export interface DailyLogInput {
  projectId: string
  date: Date
  crewPresent: string[]
  subsOnSite: string[]
  weather?: {
    condition: 'sunny' | 'cloudy' | 'rain' | 'snow' | 'wind'
    temperature?: number
    impactedWork: boolean
  }
  workCompleted: string[]
  hoursWorked: number
  issues?: {
    description: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    assignedTo?: string
  }[]
  delays?: {
    reason: string
    category: 'weather' | 'material' | 'labor' | 'equipment' | 'inspection' | 'client' | 'other'
    duration: number
    costImpact?: number
  }[]
  safetyIncidents?: string[]
  safetyMeetingHeld?: boolean
  visitors?: string[]
  notes?: string
  createdBy: string
}

// ----------------------------------------------------------------------------
// Change Order Forms
// ----------------------------------------------------------------------------

export interface ChangeOrderInput {
  projectId: string
  changeOrderNumber: string
  title: string
  description: string
  requestedBy: string
  requestDate: Date
  trades: TradeInput[]
  costImpact: number
  scheduleImpact: number
  notes?: string
}

export interface ChangeOrderApproval {
  changeOrderId: string
  approved: boolean
  approvedBy: string
  approvalDate: Date
  rejectionReason?: string
}

// ----------------------------------------------------------------------------
// Schedule Forms
// ----------------------------------------------------------------------------

export interface ScheduleItemInput {
  name: string
  description?: string
  trade: TradeCategory
  startDate: Date
  endDate: Date
  predecessorIds: string[]
  assignedTo?: string[]
  notes?: string
}

export interface ScheduleItemUpdate {
  id: string
  status?: 'not-started' | 'in-progress' | 'complete' | 'delayed'
  percentComplete?: number
  actualStartDate?: Date
  actualEndDate?: Date
}

export interface MilestoneInput {
  name: string
  targetDate: Date
  isCritical: boolean
}

// ----------------------------------------------------------------------------
// Time Clock Forms
// ----------------------------------------------------------------------------

export interface ClockInInput {
  projectId: string
  employeeId: string
  employeeName: string
  location: {
    lat: number
    lng: number
  }
  notes?: string
}

export interface ClockOutInput {
  timeClockEntryId: string
  location: {
    lat: number
    lng: number
  }
  notes?: string
}

// ----------------------------------------------------------------------------
// Search & Filter Types
// ----------------------------------------------------------------------------

export interface ProjectFilters {
  status?: Project['status'][]
  type?: ProjectType[]
  clientId?: string
  dateRange?: {
    from: Date
    to: Date
  }
  searchTerm?: string
}

export interface EstimateFilters {
  projectId?: string
  minAmount?: number
  maxAmount?: number
  dateRange?: {
    from: Date
    to: Date
  }
}

export interface TradeFilters {
  category?: TradeCategory[]
  isSubcontracted?: boolean
  minCost?: number
  maxCost?: number
}

// ----------------------------------------------------------------------------
// Sort Options
// ----------------------------------------------------------------------------

export type ProjectSortField = 'name' | 'createdAt' | 'startDate' | 'status' | 'totalEstimate'
export type SortDirection = 'asc' | 'desc'

export interface SortOptions {
  field: ProjectSortField
  direction: SortDirection
}

// ----------------------------------------------------------------------------
// Bulk Operations
// ----------------------------------------------------------------------------

export interface BulkTradeImport {
  trades: TradeInput[]
  estimateId: string
}

export interface BulkLaborImport {
  entries: LaborEntryInput[]
  projectId: string
}

// ----------------------------------------------------------------------------
// Template Types
// ----------------------------------------------------------------------------

export interface EstimateTemplate {
  id: string
  name: string
  description?: string
  projectType: ProjectType
  trades: TradeInput[]
  defaultOverhead: number
  defaultProfit: number
  defaultContingency: number
  createdAt: Date
  updatedAt: Date
  useCount: number
}

export interface ScheduleTemplate {
  id: string
  name: string
  description?: string
  projectType: ProjectType
  items: ScheduleItemInput[]  // High-level only, no sub-tasks per user preference
  estimatedDuration: number
  createdAt: Date
  updatedAt: Date
  useCount: number
}

