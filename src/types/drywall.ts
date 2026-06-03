// ============================================================================
// Drywall workspace types — mirrors metadata.legacy shape (JSONB retention locked)
// ============================================================================

/** Four workflow stages stored in projects.status for drywall-origin rows. */
export type DrywallProjectStatus =
  | 'project-info'
  | 'quote'
  | 'field-measurement'
  | 'order'
  | 'complete'

export const DRYWALL_PROJECT_STATUSES: DrywallProjectStatus[] = [
  'project-info',
  'quote',
  'field-measurement',
  'order',
  'complete',
]

export const DRYWALL_STATUS_LABELS: Record<DrywallProjectStatus, string> = {
  'project-info': 'Project Info',
  quote: 'Quote',
  'field-measurement': 'Field Measurement',
  order: 'Order',
  complete: 'Complete',
}

/** Minimal row for the /drywall list (narrow scalar projection + list surfacing filter). */
export interface DrywallProjectListItem {
  id: string
  name: string
  client: string
  address: string
  status: DrywallProjectStatus | string
  updatedAt: Date
  /** From metadata.legacy.quote.sqft when present. */
  sqft: number | null
  /** From metadata.legacy.quote.calculations.finalTotal when present. */
  quoteTotal: number | null
  /** List projection: metadata.legacy.fieldTakeoff.totalMeasuredSqft */
  fieldMeasuredSqft: number | null
  /** List projection: metadata.legacy.fieldTakeoff.updatedAt (activity without sqft yet). */
  fieldTakeoffUpdated: string | null
  /** List projection: first measurements[].id when present */
  fieldFirstMeasurementId: string | null
  /** List projection: first legacy.orders[].id when present */
  orderFirstId: string | null
}

/** Full project row for detail / Project Info editing. */
export interface DrywallProject {
  id: string
  name: string
  client: string
  address: string
  notes: string
  status: DrywallProjectStatus | string
  type: string
  organizationId: string
  createdAt: Date
  updatedAt: Date
  /** Wrapper metadata (app_scope, visibility, source). */
  metadata: Record<string, unknown>
  /** Full in-app project blob under metadata.legacy. */
  legacy: Record<string, unknown>
}

/** Editable Project Info fields — top-level columns + legacy mirror. */
export interface ProjectInfoForm {
  name: string
  client: string
  address: string
  notes: string
}

export interface CreateDrywallProjectInput {
  name?: string
}

// ============================================================================
// Drywall quote (metadata.legacy.quote) — v2 flat legacy-compatible shape
// ============================================================================

export type DrywallScope = 'hang_and_finish' | 'hang_only' | 'finish_only' | 'board_only'
export type QuoteIncludes = 'labor_and_material' | 'labor_only'

export interface RcChannelWallEntry {
  id: string
  linearFt?: string | number
  height?: string | number
}

export interface InsulationEntry {
  id: string
  type: string
  face?: string
  location?: string
  sqft?: string | number
  materialRate?: string | number
  notes?: string
}

export interface MetalStudEntry {
  id: string
  wallLf?: string | number
  wallHeight?: string | number
  spacing?: string | number
  tracksPerRun?: string | number
  size?: string
  gauge?: string
}

export interface QuoteBreakdown {
  id: string
  description?: string
  sqft?: string | number
  hangLayers?: string | number
  finishLayers?: string | number
  hangSqftOverride?: string | number | null
  finishSqftOverride?: string | number | null
  boardOnlyMaterialRate?: string | number | null
  rcChannelCeilingSqft?: string | number
  rcChannelWallLinearFt?: string | number
  rcChannelWallHeight?: string | number
  rcChannelWallEntries?: RcChannelWallEntry[]
  suspendedGridSqft?: string | number
  suspendedGridPerimeter?: string | number
  metalStudWallLf?: string | number
  metalStudWallHeight?: string | number
  metalStudSpacing?: string | number
  metalStudTracksPerRun?: string | number
  metalStudSize?: string
  metalStudGauge?: string
  metalStudEntries?: MetalStudEntry[]
  itemTotal?: number
  [key: string]: unknown
}

export type QuoteOptionPricingMethod = 'fixed' | 'totalSqft' | 'specificSqft'

export interface QuoteOption {
  id: string
  name?: string
  description?: string
  selected?: boolean
  price?: string | number
  sqft?: string | number
  rate?: string | number
  useTotalSqft?: boolean
  pricingMethod?: QuoteOptionPricingMethod
}

/** Stored quote payload — flat fields + version 2. */
export interface DrywallQuote {
  version?: number
  sqft?: string | number
  wastePercentage?: string | number
  drywallScope?: DrywallScope | string
  hangLayers?: string | number
  finishLayers?: string | number
  hangSqftOverride?: string | number | null
  finishSqftOverride?: string | number | null
  boardOnlyMaterialRate?: string | number
  materialRate?: string | number
  hangerRate?: string | number
  /** When false, hanger labor has no burden (e.g. 1099 sub). Default: include burden. */
  hangerIncludeLaborBurden?: boolean
  finisherRate?: string | number
  finisherIncludeLaborBurden?: boolean
  prepCleanRate?: string | number
  prepCleanIncludeLaborBurden?: boolean
  overheadPercentage?: string | number
  profitPercentage?: string | number
  salesTaxRate?: string | number
  quoteIncludes?: QuoteIncludes | string
  totalQuoteAmount?: string | number
  scopeOfWork?: string
  useCustomScopeOfWork?: boolean
  customScopeOfWork?: string
  breakdowns?: QuoteBreakdown[]
  options?: QuoteOption[]
  calculations?: DrywallQuoteCalculations
  includeSuspendedGrid?: boolean
  suspendedGridSqft?: string | number
  suspendedGridPerimeter?: string | number
  suspendedGridWastePercentage?: string | number
  carpenterRate?: string | number
  shiny90Count?: string | number
  shiny90Rate?: string | number
  mainsCount?: string | number
  mainsRate?: string | number
  tees4ftCount?: string | number
  tees4ftRate?: string | number
  wireLinearFt?: string | number
  wireRate?: string | number
  lagsCount?: string | number
  lagsRate?: string | number
  includeRcChannel?: boolean
  rcChannelCeilingSqft?: string | number
  rcChannelCeilingSpacing?: string | number
  rcChannelWallEntries?: RcChannelWallEntry[]
  rcChannelWallSpacing?: string | number
  rcChannelWastePercentage?: string | number
  rcChannelRate?: string | number
  rcChannelLaborRate?: string | number
  includeInsulation?: boolean
  insulationWastePercentage?: string | number
  insulationCeilingLaborRate?: string | number
  insulationWallLaborRate?: string | number
  insulationEntries?: InsulationEntry[]
  includeAcousticCeiling?: boolean
  acousticCeilingSqft?: string | number
  acousticCeilingTileSize?: string
  acousticCeilingWastePercentage?: string | number
  acousticCeilingTileRate?: string | number
  acousticCeilingLaborRate?: string | number
  acousticCeilingPerimeter?: string | number
  acousticWallAngleCount?: string | number
  acousticWallAngleRate?: string | number
  acousticMainsCount?: string | number
  acousticMainsRate?: string | number
  acousticTees4ftCount?: string | number
  acousticTees4ftRate?: string | number
  acousticTees2ftCount?: string | number
  acousticTees2ftRate?: string | number
  acousticWireLinearFt?: string | number
  acousticWireRate?: string | number
  acousticLagsCount?: string | number
  acousticLagsRate?: string | number
  includeMetalStudFraming?: boolean
  metalStudWastePercentage?: string | number
  metalStudLaborRate?: string | number
  metalStudStudRates?: Record<string, string | number>
  metalStudTrackRates?: Record<string, string | number>
  metalStudEntries?: MetalStudEntry[]
  includeFRP?: boolean
  frpWastePercentage?: string | number
  frpSqft?: string | number
  frpWallCount?: string | number
  frpWallHeight?: string | number
  frpInsideCorners?: string | number
  frpOutsideCorners?: string | number
  frpExposedEdgesLf?: string | number
  frpSheetRate?: string | number
  frpAdhesiveBucketRate?: string | number
  frpDivisionStickRate?: string | number
  frpIcStickRate?: string | number
  frpOcStickRate?: string | number
  frpJMoldStickRate?: string | number
  quoteStatus?: string
  [key: string]: unknown
}

/** Output of buildDrywallQuoteCalculations — large computed blob. */
export type DrywallQuoteCalculations = Record<string, number | boolean | string | undefined>

export interface DrywallQuoteTotals {
  gross?: number
  overhead?: number
  profit?: number
  salesTax?: number
  total?: number
  finalTotal?: number
  [key: string]: unknown
}

export interface UpdateDrywallProjectInfoPatch extends ProjectInfoForm {
  /** Optional explicit stage advance (e.g. project-info → quote). */
  status?: DrywallProjectStatus
}

// ============================================================================
// Field measurement (metadata.legacy.fieldTakeoff)
// ============================================================================

export interface FieldPhotoRef {
  id: string
  storagePath?: string
  uploadedAt?: string
  label?: string
  notes?: string
  /** Legacy BuilderTrend / external URL — no Storage object */
  url?: string
}

export interface FieldMeasurementBoard {
  id: string
  boardType?: string
  thickness?: string
  width?: string
  length?: string
  quantity?: string
}

export interface FieldMeasurementArea {
  id: string
  area?: string
  notes?: string
  boards: FieldMeasurementBoard[]
}

export interface FieldAccessoryEntry {
  id: string
  type?: string
  subtype?: string
  quantity?: string
  unit?: string
  autoCalculated?: boolean
  manuallyEdited?: boolean
  length?: string
  threadType?: string
}

export interface FieldChecklistItem {
  id: string
  label: string
  completed: boolean
}

export type FieldTakeoffReviewStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | null

/** Full field takeoff blob stored at metadata.legacy.fieldTakeoff */
export interface FieldTakeoff {
  siteContact?: string
  contactPhone?: string
  meetingLocation?: string
  accessNotes?: string
  hazards?: string
  materialsNeeded?: string
  notes?: string
  varianceNotes?: string
  measurements: FieldMeasurementArea[]
  photos: FieldPhotoRef[]
  accessories: FieldAccessoryEntry[]
  checklist: FieldChecklistItem[]
  totalMeasuredSqft?: number
  signedOffBy?: string
  signedOffDate?: string
  updatedAt?: string | null
  reviewStatus?: FieldTakeoffReviewStatus
  submittedForReviewAt?: string | null
  approvedAt?: string | null
  rejectedAt?: string | null
  rejectionNotes?: string | null
  reviewBaselineRates?: Record<string, unknown>
  reviewApprovedRates?: Record<string, unknown>
  [key: string]: unknown
}

/** Alias used in plan docs */
export type FieldMeasurement = FieldTakeoff

// ============================================================================
// Material orders (metadata.legacy.orders[])
// ============================================================================

export type DrywallOrderStatus =
  | 'draft'
  | 'sent'
  | 'confirmed'
  | 'partial'
  | 'complete'
  | 'cancelled'

export interface DrywallOrderItem {
  id: string
  description: string
  quantity: string
  unit: string
  notes?: string
}

/** Material supplier order — prod shape from legacy.orders[] */
export interface DrywallOrder {
  id: string
  orderNumber?: string
  supplier?: string
  supplierContact?: string
  deliveryDate?: string
  deliveryAddress?: string
  notes?: string
  items: DrywallOrderItem[]
  status?: DrywallOrderStatus | string
  createdAt?: string
  updatedAt?: string
}

export type DrywallChangeOrderStatus = 'draft' | 'submitted' | 'approved' | string

export interface DrywallChangeOrder {
  id: string
  changeOrderNumber?: string
  status?: DrywallChangeOrderStatus
  reason?: string
  scopeChanges?: string
  requestedAmount?: string
  notes?: string
  createdAt?: string
  updatedAt?: string
}
