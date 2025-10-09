// ============================================================================
// HSH GC Platform - Core Data Model
// ============================================================================

// ----------------------------------------------------------------------------
// Project & Core Types
// ----------------------------------------------------------------------------

export type ProjectType = 'residential' | 'commercial' | 'remodel' | 'new-build' | 'addition'

export type ProjectStatus = 
  | 'estimating'      // Building estimate/bid
  | 'bidding'         // Submitted, waiting for award
  | 'awarded'         // Won the bid
  | 'in-progress'     // Active construction
  | 'complete'        // Project finished
  | 'archived'        // Historical project

export interface Project {
  id: string
  name: string
  projectNumber?: string
  client: Client
  type: ProjectType
  status: ProjectStatus
  
  // Location
  address?: {
    street: string
    city: string
    state: string
    zip: string
    coordinates?: {
      lat: number
      lng: number
    }
  }
  
  // Estimate phase
  estimate: Estimate
  
  // Execution phase (populated when project is awarded)
  actuals?: ProjectActuals
  
  // Schedule
  schedule?: ProjectSchedule
  
  // Documents
  documents?: ProjectDocument[]
  
  // Metadata
  createdAt: Date
  updatedAt: Date
  startDate?: Date
  estimatedCompletionDate?: Date
  actualCompletionDate?: Date
  
  // Notes
  notes?: string
}

export interface Client {
  id: string
  name: string
  email?: string
  phone?: string
  company?: string
  address?: string
}

// ----------------------------------------------------------------------------
// Estimate Types
// ----------------------------------------------------------------------------

export interface Estimate {
  id: string
  projectId: string
  version: number  // Track estimate revisions
  
  // Cost breakdown structure
  trades: Trade[]
  
  // Takeoff/quantities
  takeoff?: TakeoffItem[]
  
  // Summary calculations
  subtotal: number           // Sum of all trades
  overhead: number           // $ amount or %
  profit: number            // $ amount or %
  contingency: number       // $ amount or %
  totalEstimate: number     // Final bid amount
  
  // Metadata
  createdAt: Date
  updatedAt: Date
  createdBy?: string
  notes?: string
}

export type TradeCategory = 
  | 'sitework'
  | 'concrete'
  | 'masonry'
  | 'framing'
  | 'roofing'
  | 'siding'
  | 'windows-doors'
  | 'insulation'
  | 'drywall'
  | 'painting'
  | 'flooring'
  | 'tile'
  | 'cabinets'
  | 'countertops'
  | 'electrical'
  | 'plumbing'
  | 'hvac'
  | 'landscaping'
  | 'cleanup'
  | 'other'

export type UnitType = 
  | 'sqft'          // Square feet
  | 'linear_ft'     // Linear feet
  | 'cubic_yd'      // Cubic yards
  | 'each'          // Per item/unit
  | 'lot'           // Lump sum
  | 'hour'          // Labor hours
  | 'day'           // Days
  | 'load'          // Truck loads

export interface Trade {
  id: string
  estimateId: string
  category: TradeCategory
  name: string              // e.g., "Frame exterior walls"
  description?: string
  
  // Quantities
  quantity: number
  unit: UnitType
  
  // Costs
  laborCost: number         // Total labor cost
  laborRate?: number        // $/unit for reference
  laborHours?: number       // Estimated hours
  
  materialCost: number      // Total material cost
  materialRate?: number     // $/unit for reference
  
  subcontractorCost: number // If using sub
  isSubcontracted: boolean
  
  // Waste factors
  wasteFactor: number       // Percentage (e.g., 10 = 10%)
  
  // Total for this trade
  totalCost: number         // labor + material + sub
  
  // Historical reference
  historicalRate?: number   // From past projects
  confidenceLevel?: 'high' | 'medium' | 'low' // Based on data points
  
  // Order/grouping
  sortOrder: number
  
  // Notes
  notes?: string
}

export interface TakeoffItem {
  id: string
  estimateId: string
  tradeId?: string          // Link to specific trade
  
  // Identification
  name: string
  description?: string
  category: string          // e.g., "Wall", "Floor", "Roof"
  
  // Measurements
  length?: number
  width?: number
  height?: number
  area?: number             // Calculated or manual
  volume?: number
  count?: number
  
  unit: UnitType
  
  // Reference
  drawingReference?: string // e.g., "Sheet A-101"
  locationOnSite?: string   // e.g., "Master Bedroom"
  
  // Notes
  notes?: string
}

// ----------------------------------------------------------------------------
// Project Actuals (Execution Phase)
// ----------------------------------------------------------------------------

export interface ProjectActuals {
  projectId: string
  
  // Cost tracking
  laborEntries: LaborEntry[]
  materialEntries: MaterialEntry[]
  subcontractorEntries: SubcontractorEntry[]
  
  // Summary totals
  totalLaborCost: number
  totalMaterialCost: number
  totalSubcontractorCost: number
  totalActualCost: number
  
  // Variance from estimate
  variance: number          // Positive = over budget
  variancePercentage: number
  
  // Daily logs
  dailyLogs: DailyLog[]
  
  // Change orders
  changeOrders: ChangeOrder[]
}

export interface LaborEntry {
  id: string
  projectId: string
  tradeId?: string          // Link to estimated trade
  
  // When
  date: Date
  
  // Who
  crew: CrewMember[]
  
  // What
  trade: TradeCategory
  description: string
  phase?: string            // e.g., "Rough-in", "Finish"
  
  // How much
  totalHours: number        // Sum of all crew hours
  laborRate: number         // Blended rate or individual
  totalCost: number
  
  // Progress
  quantityCompleted?: number
  unit?: UnitType
  percentComplete?: number  // For the phase/trade
  
  // Notes
  notes?: string
  createdAt: Date
}

export interface CrewMember {
  name: string
  role: string              // e.g., "Foreman", "Carpenter", "Laborer"
  hours: number
  rate: number
  cost: number
}

export interface MaterialEntry {
  id: string
  projectId: string
  tradeId?: string          // Link to estimated trade
  
  // When
  date: Date
  deliveryDate?: Date
  
  // What
  materialName: string
  category: TradeCategory
  description?: string
  
  // How much
  quantity: number
  unit: UnitType
  unitCost: number
  totalCost: number
  
  // Waste tracking
  quantityUsed?: number
  quantityWasted?: number
  wastePercentage?: number
  
  // Vendor info
  vendor?: string
  invoiceNumber?: string
  poNumber?: string
  
  // Notes
  notes?: string
  createdAt: Date
}

export interface SubcontractorEntry {
  id: string
  projectId: string
  tradeId?: string          // Link to estimated trade
  
  // Who
  subcontractor: {
    name: string
    company: string
    email?: string
    phone?: string
  }
  
  // What
  trade: TradeCategory
  scopeOfWork: string
  
  // Contract
  contractAmount: number
  
  // Payment tracking
  payments: Payment[]
  totalPaid: number
  balance: number
  
  // Schedule
  startDate?: Date
  completionDate?: Date
  
  // Documents
  contractDocumentUrl?: string
  insuranceCertUrl?: string
  
  // Notes
  notes?: string
  createdAt: Date
}

export interface Payment {
  id: string
  date: Date
  amount: number
  method: 'check' | 'ach' | 'wire' | 'credit-card'
  checkNumber?: string
  description?: string
  invoiceNumber?: string
}

// ----------------------------------------------------------------------------
// Daily Logs & Progress Tracking
// ----------------------------------------------------------------------------

export interface DailyLog {
  id: string
  projectId: string
  
  // When
  date: Date
  
  // Who
  crewPresent: string[]     // Names of workers on site
  subsOnSite: string[]      // Subcontractors present
  
  // Weather
  weather?: {
    condition: 'sunny' | 'cloudy' | 'rain' | 'snow' | 'wind'
    temperature?: number
    impactedWork: boolean
  }
  
  // Work performed
  workCompleted: string[]   // List of activities
  
  // Progress
  hoursWorked: number
  
  // Issues & delays
  issues?: Issue[]
  delays?: Delay[]
  
  // Safety
  safetyIncidents?: string[]
  safetyMeetingHeld?: boolean
  
  // Photos
  photos?: Photo[]
  
  // Visitors
  visitors?: string[]       // Inspectors, clients, etc.
  
  // Notes
  notes?: string
  
  // Metadata
  createdBy: string
  createdAt: Date
}

export interface Issue {
  id: string
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'in-progress' | 'resolved'
  assignedTo?: string
  resolvedDate?: Date
  resolution?: string
}

export interface Delay {
  id: string
  reason: string
  category: 'weather' | 'material' | 'labor' | 'equipment' | 'inspection' | 'client' | 'other'
  duration: number          // Hours
  costImpact?: number
  resolved: boolean
}

export interface Photo {
  id: string
  url: string
  thumbnail?: string
  caption?: string
  category?: 'progress' | 'issue' | 'safety' | 'quality' | 'general'
  takenAt: Date
  takenBy?: string
}

// ----------------------------------------------------------------------------
// Change Orders
// ----------------------------------------------------------------------------

export interface ChangeOrder {
  id: string
  projectId: string
  
  // Identification
  changeOrderNumber: string // e.g., "CO-001"
  title: string
  description: string
  
  // Status
  status: 'draft' | 'pending-approval' | 'approved' | 'rejected' | 'implemented'
  
  // Requestor
  requestedBy: string       // Client, architect, contractor, etc.
  requestDate: Date
  
  // Impact
  trades: Trade[]           // New or modified trades
  costImpact: number        // Positive or negative
  scheduleImpact: number    // Days added or reduced
  
  // Approval
  approvedBy?: string
  approvalDate?: Date
  rejectionReason?: string
  
  // Implementation
  implementedDate?: Date
  actualCost?: number
  
  // Documents
  documentUrls?: string[]
  
  // Notes
  notes?: string
  
  // Metadata
  createdAt: Date
  updatedAt: Date
}

// ----------------------------------------------------------------------------
// Schedule Types
// ----------------------------------------------------------------------------

export interface ProjectSchedule {
  projectId: string
  
  // Overall timeline
  startDate: Date
  endDate: Date
  duration: number          // Days
  
  // Schedule items (templates without sub-tasks per user preference)
  items: ScheduleItem[]
  
  // Milestones
  milestones: Milestone[]
  
  // Tracking
  percentComplete: number
  daysElapsed: number
  daysRemaining: number
  isOnSchedule: boolean
  daysAheadBehind: number   // Positive = ahead, negative = behind
}

export interface ScheduleItem {
  id: string
  scheduleId: string
  
  // What
  name: string
  description?: string
  trade: TradeCategory
  
  // When
  startDate: Date
  endDate: Date
  duration: number          // Days
  
  // Dependencies
  predecessorIds: string[]  // Must complete before this starts
  
  // Progress
  status: 'not-started' | 'in-progress' | 'complete' | 'delayed'
  percentComplete: number
  actualStartDate?: Date
  actualEndDate?: Date
  
  // Resources
  assignedTo?: string[]     // Crew or subs
  
  // Notes
  notes?: string
}

export interface Milestone {
  id: string
  scheduleId: string
  name: string
  targetDate: Date
  actualDate?: Date
  isComplete: boolean
  isCritical: boolean       // On critical path
}

// ----------------------------------------------------------------------------
// Documents
// ----------------------------------------------------------------------------

export type DocumentType = 
  | 'contract'
  | 'plan'
  | 'specification'
  | 'permit'
  | 'invoice'
  | 'change-order'
  | 'rfi'
  | 'submittal'
  | 'inspection'
  | 'warranty'
  | 'photo'
  | 'other'

export interface ProjectDocument {
  id: string
  projectId: string
  
  // File info
  name: string
  type: DocumentType
  fileUrl: string
  fileSize: number          // Bytes
  mimeType: string
  
  // Organization
  category?: string
  tags?: string[]
  
  // Metadata
  uploadedBy: string
  uploadedAt: Date
  description?: string
  
  // Version control
  version?: number
  replacesDocumentId?: string
}

// ----------------------------------------------------------------------------
// Historical Data & Intelligence
// ----------------------------------------------------------------------------

export interface HistoricalRate {
  id: string
  
  // What
  trade: TradeCategory
  name: string
  description?: string
  
  // Rates
  averageLaborRate: number
  averageMaterialRate: number
  averageTotalRate: number
  unit: UnitType
  
  // Productivity
  averageLaborHoursPerUnit?: number
  averageWastePercentage?: number
  
  // Confidence
  projectCount: number      // How many projects in sample
  confidenceLevel: 'high' | 'medium' | 'low'
  
  // Context
  projectTypes: ProjectType[] // Which types this applies to
  dateRange: {
    from: Date
    to: Date
  }
  
  // Variance
  standardDeviation?: number
  minRate: number
  maxRate: number
  
  // Metadata
  lastUpdated: Date
}

export interface VarianceAnalysis {
  projectId: string
  tradeId: string
  
  // Comparison
  estimatedCost: number
  actualCost: number
  variance: number
  variancePercentage: number
  
  // Breakdown
  laborVariance: number
  materialVariance: number
  
  // Causes (can be tagged manually)
  causes?: string[]
  
  // Learning
  lesson?: string           // What to do differently next time
  adjustmentFactor?: number // Multiplier for future estimates
}

// ----------------------------------------------------------------------------
// Time Clock & Location Tracking (per user preference)
// ----------------------------------------------------------------------------

export interface TimeClockEntry {
  id: string
  projectId: string
  employeeId: string
  employeeName: string
  
  // Clock in/out
  clockInTime: Date
  clockInLocation: {
    lat: number
    lng: number
    address?: string
  }
  clockOutTime?: Date
  clockOutLocation?: {
    lat: number
    lng: number
    address?: string
  }
  
  // Validation
  isWithinGeofence: boolean // Within allowed distance from job site
  geofenceRadius: number    // Meters
  
  // Total
  totalHours?: number
  
  // Notes
  notes?: string
}

// ----------------------------------------------------------------------------
// User & Settings
// ----------------------------------------------------------------------------

export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'project-manager' | 'estimator' | 'field' | 'readonly'
  
  // Settings
  preferences?: UserPreferences
  
  // Metadata
  createdAt: Date
  lastLogin?: Date
}

export interface UserPreferences {
  defaultOverheadPercentage: number
  defaultProfitPercentage: number
  defaultContingencyPercentage: number
  defaultWasteFactor: number
  defaultGeofenceRadius: number  // Meters for time clock
  
  // Display
  theme?: 'light' | 'dark' | 'system'
  dateFormat?: string
  currencyFormat?: string
}

// ----------------------------------------------------------------------------
// Utility Types
// ----------------------------------------------------------------------------

export interface DateRange {
  from: Date
  to: Date
}

export interface CostSummary {
  labor: number
  material: number
  subcontractor: number
  total: number
}

export interface ProgressSummary {
  percentComplete: number
  estimatedCost: number
  actualCost: number
  costToComplete: number
  projectedFinalCost: number
  projectedVariance: number
}


