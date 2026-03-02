// ============================================================================
// Constants & Enums
// ============================================================================

// import { TradeCategory, UnitType, ProjectType, ProjectStatus } from './project'

// Temporary type definitions to avoid import issues
export type TradeCategory = 
  | 'planning'
  | 'site-prep'
  | 'excavation-foundation'
  | 'utilities'
  | 'water-sewer'
  | 'rough-framing'
  | 'windows-doors'
  | 'exterior-finishes'
  | 'roofing'
  | 'masonry-paving'
  | 'porches-decks'
  | 'insulation'
  | 'plumbing'
  | 'electrical'
  | 'hvac'
  | 'drywall'
  | 'interior-finishes'
  | 'kitchen'
  | 'bath'
  | 'appliances'
  | 'other'

export type CategoryGroup = 
  | 'admin'
  | 'exterior'
  | 'structure'
  | 'mep'
  | 'interior'
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
  | 'acre'
  | 'ton'
  | 'step'
  | 'sheet'
  | 'roll'

export type ProjectType = 'residential-renovation' | 'residential-new-build' | 'commercial-renovation' | 'commercial-new-build'

export type ProjectStatus = 
  | 'estimating'
  | 'in-progress'
  | 'complete'

// ----------------------------------------------------------------------------
// Trade Categories with Display Names
// ----------------------------------------------------------------------------

export const TRADE_CATEGORIES: Record<TradeCategory, { label: string; icon: string }> = {
  'planning': { label: 'Planning', icon: '📋' },
  'site-prep': { label: 'Site Prep', icon: '🚜' },
  'excavation-foundation': { label: 'Excavation/Foundation', icon: '🏗️' },
  'utilities': { label: 'Utilities', icon: '⚡' },
  'water-sewer': { label: 'Water + Sewer', icon: '🚰' },
  'rough-framing': { label: 'Rough Framing', icon: '🔨' },
  'windows-doors': { label: 'Windows + Doors', icon: '🚪' },
  'exterior-finishes': { label: 'Exterior Finishes', icon: '🏘️' },
  'roofing': { label: 'Roofing', icon: '🏠' },
  'masonry-paving': { label: 'Masonry/Paving', icon: '🧱' },
  'porches-decks': { label: 'Porches + Decks', icon: '🏡' },
  'insulation': { label: 'Insulation', icon: '🧊' },
  'plumbing': { label: 'Plumbing', icon: '🚰' },
  'electrical': { label: 'Electrical', icon: '⚡' },
  'hvac': { label: 'HVAC', icon: '❄️' },
  'drywall': { label: 'Drywall', icon: '📐' },
  'interior-finishes': { label: 'Interior Finishes', icon: '🎨' },
  'kitchen': { label: 'Kitchen', icon: '🍳' },
  'bath': { label: 'Bath', icon: '🛁' },
  'appliances': { label: 'Appliances', icon: '🔌' },
  'other': { label: 'Other', icon: '📦' },
}

export const CATEGORY_GROUPS: Record<CategoryGroup, { label: string; icon: string; color: string }> = {
  'admin': { label: 'Admin', icon: '📋', color: 'bg-gray-100' },
  'exterior': { label: 'Exterior', icon: '🏗️', color: 'bg-blue-100' },
  'structure': { label: 'Structure', icon: '🔨', color: 'bg-yellow-100' },
  'mep': { label: 'MEP', icon: '⚡', color: 'bg-green-100' },
  'interior': { label: 'Interior', icon: '🎨', color: 'bg-purple-100' },
  'other': { label: 'Other', icon: '📦', color: 'bg-gray-100' },
}

// ----------------------------------------------------------------------------
// Estimate Status
// ----------------------------------------------------------------------------

export type EstimateStatus = 'budget' | 'quoted' | 'approved'

export const ESTIMATE_STATUS: Record<EstimateStatus, { label: string; icon: string; color: string; badgeClass: string }> = {
  'budget': { 
    label: 'Budget', 
    icon: '📝', 
    color: 'bg-gray-100', 
    badgeClass: 'bg-gray-100 text-gray-700 border-gray-300' 
  },
  'quoted': { 
    label: 'Quoted', 
    icon: '💰', 
    color: 'bg-blue-100', 
    badgeClass: 'bg-blue-100 text-blue-700 border-blue-300' 
  },
  'approved': { 
    label: 'Approved', 
    icon: '✓', 
    color: 'bg-green-100', 
    badgeClass: 'bg-green-100 text-green-700 border-green-300' 
  },
}

// ----------------------------------------------------------------------------
// Category to Group Mapping
// ----------------------------------------------------------------------------

export const CATEGORY_TO_GROUP: Record<TradeCategory, CategoryGroup> = {
  'planning': 'admin',
  'site-prep': 'exterior',
  'excavation-foundation': 'exterior',
  'utilities': 'exterior',
  'water-sewer': 'exterior',
  'roofing': 'exterior',
  'masonry-paving': 'exterior',
  'porches-decks': 'exterior',
  'exterior-finishes': 'exterior',
  'rough-framing': 'structure',
  'windows-doors': 'structure',
  'insulation': 'mep',
  'plumbing': 'mep',
  'electrical': 'mep',
  'hvac': 'mep',
  'drywall': 'interior',
  'interior-finishes': 'interior',
  'kitchen': 'interior',
  'bath': 'interior',
  'appliances': 'interior',
  'other': 'other',
}

export const GROUP_TO_CATEGORIES: Record<CategoryGroup, TradeCategory[]> = {
  'admin': ['planning'],
  'exterior': ['site-prep', 'excavation-foundation', 'utilities', 'water-sewer', 'roofing', 'masonry-paving', 'porches-decks', 'exterior-finishes'],
  'structure': ['rough-framing', 'windows-doors'],
  'mep': ['insulation', 'plumbing', 'electrical', 'hvac'],
  'interior': ['drywall', 'interior-finishes', 'kitchen', 'bath', 'appliances'],
  'other': ['other'],
}

// ----------------------------------------------------------------------------
// Default Items for Each Category
// ----------------------------------------------------------------------------

export const DEFAULT_CATEGORY_ITEMS: Record<TradeCategory, string[]> = {
  'planning': [
    'Admin Fees',
    'Engineering',
    'Finance Costs',
    'Legal',
    'Permit - Building',
    'Permit - Environmental',
    'Permit - Zoning',
    'Plans + Specs',
    'Review',
    'Survey'
  ],
  'site-prep': [
    'Dumpster',
    'Equipment Rental',
    'Lot Clearing',
    'Portable Restrooms',
    'Site Security',
    'Site Storage',
    'Temporary Heat',
    'Temporary Power',
    'Tool Rental'
  ],
  'excavation-foundation': [
    'Backfill',
    'Dig and Install Sanitary Sewer',
    'Dig and Install Water Line',
    'Dig and Install Downspouts',
    'Form and Pour Foundation Walls',
    'Gravel Work',
    'Finish Grade',
    'Foundation-Excavation',
    'Retaining Walls',
    'Flat Work - Porch, Garage, Patio, Crawl',
    'Flat Work - Driveway',
    'Dig and Install Driveway'
  ],
  'utilities': [
    'Electrical-Connections',
    'Electrical - Install',
    'Electrical -Permit',
    'Gas-Connection',
    'Gas-Hookup',
    'Gas-Permit',
    'Sewer-Tap Fees & Hookup',
    'Water -Tap Fees & Hookup'
  ],
  'water-sewer': [
    'High Water Table Detwatering',
    'Perc Test',
    'Plumbing to House',
    'Pressure Tank',
    'Pump',
    'Septic-Design',
    'Septic-Fees',
    'Septic-Inspection',
    'Septic-Permits',
    'Septic-Tie to House',
    'Soil Test',
    'Well',
    'Well-Fees',
    'Well-Permits'
  ],
  'rough-framing': [
    'Wood Framing',
    'Metal Framing'
  ],
  'windows-doors': [
    'Interior Doors',
    'Exterior Doors',
    'Garage Doors',
    'Sliding Doors/French Door',
    'Windows',
    'Front Door'
  ],
  'exterior-finishes': [
    'Siding',
    'Soffit/Fascia',
    'Exterior Paint'
  ],
  'roofing': [
    'Full Scope'
  ],
  'masonry-paving': [],
  'porches-decks': [],
  'insulation': [
    'Full Scope'
  ],
  'plumbing': [
    'Full Scope'
  ],
  'electrical': [
    'Rough',
    'Finishes'
  ],
  'hvac': [
    'Full Scope'
  ],
  'drywall': [
    'Full Scope'
  ],
  'interior-finishes': [
    'Closet Hardware',
    'Closet Shelving',
    'Flooring',
    'Interior Paint'
  ],
  'kitchen': [
    'Backsplash',
    'Cabinets',
    'Countertops',
    'Kitchen Faucet',
    'Accessories'
  ],
  'bath': [
    'Accessories',
    'Cabinets',
    'Cabinets-Hardware',
    'Countertops',
    'Medicine Cabinets',
    'Mirrors',
    'Tub/Shower Enclosure',
    'Toilet',
    'Bath Faucet'
  ],
  'appliances': [
    'Cooktop',
    'Dishwasher',
    'Microwave Oven',
    'Oven',
    'Range Hood',
    'Refrigerator',
    'Washer+Dryer'
  ],
  'other': [],
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
  'acre': { label: 'Acre', abbreviation: 'Acre' },
  'ton': { label: 'Ton', abbreviation: 'Ton' },
  'step': { label: 'Step', abbreviation: 'Step' },
  'sheet': { label: 'Sheet', abbreviation: 'Sheet' },
  'roll': { label: 'Roll', abbreviation: 'Roll' },
}

// ----------------------------------------------------------------------------
// Project Types
// ----------------------------------------------------------------------------

export const PROJECT_TYPES: Record<ProjectType, { label: string; description: string }> = {
  'residential-renovation': { 
    label: 'Residential - Renovation', 
    description: 'Residential remodeling and renovation projects' 
  },
  'residential-new-build': { 
    label: 'Residential - New Build', 
    description: 'New residential construction from the ground up' 
  },
  'commercial-renovation': { 
    label: 'Commercial - Renovation', 
    description: 'Commercial remodeling and renovation projects' 
  },
  'commercial-new-build': { 
    label: 'Commercial - New Build', 
    description: 'New commercial construction from the ground up' 
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
  'in-progress': {
    label: 'In Progress',
    color: 'orange',
    description: 'Active construction'
  },
  'complete': {
    label: 'Complete',
    color: 'green',
    description: 'Project finished'
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

export const getCategoryGroup = (category: TradeCategory): CategoryGroup => {
  return CATEGORY_TO_GROUP[category] || 'other'
}

export const getGroupLabel = (group: CategoryGroup): string => {
  return CATEGORY_GROUPS[group]?.label || group
}

export const getEstimateStatusLabel = (status: EstimateStatus): string => {
  return ESTIMATE_STATUS[status]?.label || status
}

export const getEstimateStatusBadgeClass = (status: EstimateStatus): string => {
  return ESTIMATE_STATUS[status]?.badgeClass || ''
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

