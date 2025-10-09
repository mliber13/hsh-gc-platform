// ============================================================================
// Constants & Enums
// ============================================================================

// import { TradeCategory, UnitType, ProjectType, ProjectStatus } from './project'

// Temporary type definitions to avoid import issues
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
  | 'sqft'
  | 'linear_ft'
  | 'cubic_yd'
  | 'each'
  | 'lot'
  | 'hour'
  | 'day'
  | 'load'

export type ProjectType = 'residential' | 'commercial' | 'remodel' | 'new-build' | 'addition'

export type ProjectStatus = 
  | 'estimating'
  | 'bidding'
  | 'awarded'
  | 'in-progress'
  | 'complete'
  | 'archived'

// ----------------------------------------------------------------------------
// Trade Categories with Display Names
// ----------------------------------------------------------------------------

export const TRADE_CATEGORIES: Record<TradeCategory, { label: string; icon: string }> = {
  'sitework': { label: 'Sitework', icon: '🚜' },
  'concrete': { label: 'Concrete', icon: '🏗️' },
  'masonry': { label: 'Masonry', icon: '🧱' },
  'framing': { label: 'Framing', icon: '🔨' },
  'roofing': { label: 'Roofing', icon: '🏠' },
  'siding': { label: 'Siding', icon: '🏘️' },
  'windows-doors': { label: 'Windows & Doors', icon: '🚪' },
  'insulation': { label: 'Insulation', icon: '🧊' },
  'drywall': { label: 'Drywall', icon: '📐' },
  'painting': { label: 'Painting', icon: '🎨' },
  'flooring': { label: 'Flooring', icon: '📏' },
  'tile': { label: 'Tile', icon: '⬜' },
  'cabinets': { label: 'Cabinets', icon: '🗄️' },
  'countertops': { label: 'Countertops', icon: '▪️' },
  'electrical': { label: 'Electrical', icon: '⚡' },
  'plumbing': { label: 'Plumbing', icon: '🚰' },
  'hvac': { label: 'HVAC', icon: '❄️' },
  'landscaping': { label: 'Landscaping', icon: '🌳' },
  'cleanup': { label: 'Cleanup', icon: '🧹' },
  'other': { label: 'Other', icon: '📦' },
}

// ----------------------------------------------------------------------------
// Unit Types with Display Names
// ----------------------------------------------------------------------------

export const UNIT_TYPES: Record<UnitType, { label: string; abbreviation: string }> = {
  'sqft': { label: 'Square Feet', abbreviation: 'SF' },
  'linear_ft': { label: 'Linear Feet', abbreviation: 'LF' },
  'cubic_yd': { label: 'Cubic Yards', abbreviation: 'CY' },
  'each': { label: 'Each', abbreviation: 'EA' },
  'lot': { label: 'Lump Sum', abbreviation: 'LOT' },
  'hour': { label: 'Hours', abbreviation: 'HR' },
  'day': { label: 'Days', abbreviation: 'DAY' },
  'load': { label: 'Loads', abbreviation: 'LOAD' },
}

// ----------------------------------------------------------------------------
// Project Types
// ----------------------------------------------------------------------------

export const PROJECT_TYPES: Record<ProjectType, { label: string; description: string }> = {
  'residential': { 
    label: 'Residential', 
    description: 'Single-family homes and residential properties' 
  },
  'commercial': { 
    label: 'Commercial', 
    description: 'Office buildings, retail, and commercial spaces' 
  },
  'remodel': { 
    label: 'Remodel', 
    description: 'Renovation and remodeling projects' 
  },
  'new-build': { 
    label: 'New Build', 
    description: 'Ground-up construction projects' 
  },
  'addition': { 
    label: 'Addition', 
    description: 'Room additions and expansions' 
  },
}

// ----------------------------------------------------------------------------
// Project Status
// ----------------------------------------------------------------------------

export const PROJECT_STATUS: Record<ProjectStatus, { 
  label: string
  color: string
  description: string 
}> = {
  'estimating': {
    label: 'Estimating',
    color: 'blue',
    description: 'Building estimate and preparing bid'
  },
  'bidding': {
    label: 'Bidding',
    color: 'yellow',
    description: 'Bid submitted, awaiting decision'
  },
  'awarded': {
    label: 'Awarded',
    color: 'green',
    description: 'Project awarded, preparing to start'
  },
  'in-progress': {
    label: 'In Progress',
    color: 'orange',
    description: 'Active construction'
  },
  'complete': {
    label: 'Complete',
    color: 'gray',
    description: 'Project finished'
  },
  'archived': {
    label: 'Archived',
    color: 'slate',
    description: 'Historical project'
  },
}

// ----------------------------------------------------------------------------
// Default Values
// ----------------------------------------------------------------------------

export const DEFAULT_VALUES = {
  // Financial defaults
  OVERHEAD_PERCENTAGE: 10,
  PROFIT_PERCENTAGE: 15,
  CONTINGENCY_PERCENTAGE: 5,
  WASTE_FACTOR: 10,
  
  // Time clock defaults
  GEOFENCE_RADIUS_METERS: 100,
  
  // Pagination
  PAGE_SIZE: 25,
  
  // Currency
  CURRENCY_SYMBOL: '$',
  CURRENCY_CODE: 'USD',
  
  // Date formats
  DATE_FORMAT: 'MM/dd/yyyy',
  DATE_TIME_FORMAT: 'MM/dd/yyyy h:mm a',
  
  // File upload
  MAX_FILE_SIZE_MB: 25,
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
}

// ----------------------------------------------------------------------------
// Labor Roles
// ----------------------------------------------------------------------------

export const LABOR_ROLES = [
  'Foreman',
  'Carpenter',
  'Laborer',
  'Apprentice',
  'Helper',
  'Operator',
  'Supervisor',
] as const

// ----------------------------------------------------------------------------
// Weather Conditions
// ----------------------------------------------------------------------------

export const WEATHER_CONDITIONS = [
  { value: 'sunny', label: 'Sunny ☀️' },
  { value: 'cloudy', label: 'Cloudy ☁️' },
  { value: 'rain', label: 'Rain 🌧️' },
  { value: 'snow', label: 'Snow ❄️' },
  { value: 'wind', label: 'Windy 💨' },
] as const

// ----------------------------------------------------------------------------
// Issue Severities
// ----------------------------------------------------------------------------

export const ISSUE_SEVERITIES = [
  { value: 'low', label: 'Low', color: 'green' },
  { value: 'medium', label: 'Medium', color: 'yellow' },
  { value: 'high', label: 'High', color: 'orange' },
  { value: 'critical', label: 'Critical', color: 'red' },
] as const

// ----------------------------------------------------------------------------
// Delay Categories
// ----------------------------------------------------------------------------

export const DELAY_CATEGORIES = [
  { value: 'weather', label: 'Weather', icon: '🌧️' },
  { value: 'material', label: 'Material Delay', icon: '📦' },
  { value: 'labor', label: 'Labor Issue', icon: '👷' },
  { value: 'equipment', label: 'Equipment', icon: '🚜' },
  { value: 'inspection', label: 'Inspection', icon: '📋' },
  { value: 'client', label: 'Client Delay', icon: '👤' },
  { value: 'other', label: 'Other', icon: '❓' },
] as const

// ----------------------------------------------------------------------------
// Document Types
// ----------------------------------------------------------------------------

export const DOCUMENT_TYPES = [
  { value: 'contract', label: 'Contract', icon: '📄' },
  { value: 'plan', label: 'Plan/Drawing', icon: '📐' },
  { value: 'specification', label: 'Specification', icon: '📝' },
  { value: 'permit', label: 'Permit', icon: '✅' },
  { value: 'invoice', label: 'Invoice', icon: '💵' },
  { value: 'change-order', label: 'Change Order', icon: '🔄' },
  { value: 'rfi', label: 'RFI', icon: '❓' },
  { value: 'submittal', label: 'Submittal', icon: '📤' },
  { value: 'inspection', label: 'Inspection Report', icon: '🔍' },
  { value: 'warranty', label: 'Warranty', icon: '🛡️' },
  { value: 'photo', label: 'Photo', icon: '📷' },
  { value: 'other', label: 'Other', icon: '📎' },
] as const

// ----------------------------------------------------------------------------
// Payment Methods
// ----------------------------------------------------------------------------

export const PAYMENT_METHODS = [
  { value: 'check', label: 'Check' },
  { value: 'ach', label: 'ACH Transfer' },
  { value: 'wire', label: 'Wire Transfer' },
  { value: 'credit-card', label: 'Credit Card' },
] as const

// ----------------------------------------------------------------------------
// User Roles
// ----------------------------------------------------------------------------

export const USER_ROLES = [
  { value: 'admin', label: 'Administrator', description: 'Full system access' },
  { value: 'project-manager', label: 'Project Manager', description: 'Manage projects and teams' },
  { value: 'estimator', label: 'Estimator', description: 'Create and manage estimates' },
  { value: 'field', label: 'Field Personnel', description: 'Enter daily logs and time' },
  { value: 'readonly', label: 'Read Only', description: 'View-only access' },
] as const

// ----------------------------------------------------------------------------
// Confidence Levels
// ----------------------------------------------------------------------------

export const CONFIDENCE_LEVELS = [
  { 
    value: 'high', 
    label: 'High Confidence', 
    description: 'Based on 5+ similar projects',
    color: 'green',
    minProjects: 5
  },
  { 
    value: 'medium', 
    label: 'Medium Confidence', 
    description: 'Based on 2-4 similar projects',
    color: 'yellow',
    minProjects: 2
  },
  { 
    value: 'low', 
    label: 'Low Confidence', 
    description: 'Based on limited data',
    color: 'red',
    minProjects: 0
  },
] as const

// ----------------------------------------------------------------------------
// Helper Functions
// ----------------------------------------------------------------------------

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: DEFAULT_VALUES.CURRENCY_CODE,
  }).format(amount)
}

export const formatNumber = (num: number, decimals: number = 2): string => {
  return num.toFixed(decimals)
}

export const formatPercentage = (decimal: number): string => {
  return `${(decimal * 100).toFixed(1)}%`
}

export const getTradeLabel = (category: TradeCategory): string => {
  return TRADE_CATEGORIES[category]?.label || category
}

export const getUnitLabel = (unit: UnitType): string => {
  return UNIT_TYPES[unit]?.abbreviation || unit
}

export const getStatusColor = (status: ProjectStatus): string => {
  return PROJECT_STATUS[status]?.color || 'gray'
}

export const calculateTotalCost = (labor: number, material: number, sub: number): number => {
  return labor + material + sub
}

export const calculateVariance = (estimated: number, actual: number): number => {
  return actual - estimated
}

export const calculateVariancePercentage = (estimated: number, actual: number): number => {
  if (estimated === 0) return 0
  return ((actual - estimated) / estimated) * 100
}

export const calculateMargin = (revenue: number, cost: number): number => {
  if (revenue === 0) return 0
  return ((revenue - cost) / revenue) * 100
}

export const getConfidenceLevel = (projectCount: number): 'high' | 'medium' | 'low' => {
  if (projectCount >= 5) return 'high'
  if (projectCount >= 2) return 'medium'
  return 'low'
}

// ----------------------------------------------------------------------------
// Validation Rules
// ----------------------------------------------------------------------------

export const VALIDATION_RULES = {
  project: {
    nameMinLength: 3,
    nameMaxLength: 100,
  },
  estimate: {
    minOverhead: 0,
    maxOverhead: 50,
    minProfit: 0,
    maxProfit: 50,
    minContingency: 0,
    maxContingency: 25,
  },
  trade: {
    minQuantity: 0,
    minCost: 0,
    maxWasteFactor: 100,
  },
  file: {
    maxSizeMB: 25,
    maxPhotosPerLog: 20,
  },
  geofence: {
    minRadiusMeters: 10,
    maxRadiusMeters: 500,
  },
}

