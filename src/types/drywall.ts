// ============================================================================
// Drywall workspace types — mirrors metadata.legacy shape (JSONB retention locked)
// ============================================================================

/** Workflow stages stored in projects.status for drywall-origin rows. */
export type DrywallProjectStatus =
  | 'project-info'
  | 'quote'
  | 'field-measurement'
  | 'order'
  | 'production'
  | 'production-complete'
  | 'closed'
  /** @deprecated Legacy DB value — normalized to `closed` on read. */
  | 'complete'

export const DRYWALL_PROJECT_STATUSES: Array<Exclude<DrywallProjectStatus, 'complete'>> = [
  'project-info',
  'quote',
  'field-measurement',
  'order',
  'production',
  'production-complete',
  'closed',
]

export const DRYWALL_STATUS_LABELS: Record<Exclude<DrywallProjectStatus, 'complete'>, string> = {
  'project-info': 'Project Info',
  quote: 'Quote',
  'field-measurement': 'Field Measurement',
  order: 'Order',
  production: 'Production',
  'production-complete': 'Production Complete',
  closed: 'Closed',
}

/** Short labels for list filter + header badge. */
export const DRYWALL_STATUS_BADGE_LABELS: Record<
  Exclude<DrywallProjectStatus, 'complete'>,
  string
> = {
  'project-info': 'Setup',
  quote: 'Quote',
  'field-measurement': 'Field',
  order: 'Order',
  production: 'Production',
  'production-complete': 'Production Complete',
  closed: 'Closed',
}

export const DRYWALL_LIST_STATUS_FILTER_OPTIONS: {
  value: 'all' | 'active' | Exclude<DrywallProjectStatus, 'complete'>
  label: string
}[] = [
  { value: 'active', label: 'All Active' },
  { value: 'all', label: 'All (incl. closed)' },
  { value: 'project-info', label: 'Setup' },
  { value: 'quote', label: 'Quote' },
  { value: 'field-measurement', label: 'Field' },
  { value: 'order', label: 'Order' },
  { value: 'production', label: 'Production' },
  { value: 'production-complete', label: 'Production Complete' },
  { value: 'closed', label: 'Closed' },
]

export type DrywallStageRouteKey =
  | 'info'
  | 'quote'
  | 'field'
  | 'schedule'
  | 'order'
  | 'production'
  | 'closeout'

/** Maps legacy `complete` → `closed` on read; does not write back to DB. */
export function normalizeDrywallProjectStatus(
  status: string | null | undefined,
): Exclude<DrywallProjectStatus, 'complete'> {
  const s = (status ?? 'project-info').trim()
  if (s === 'complete') return 'closed'
  if ((DRYWALL_PROJECT_STATUSES as readonly string[]).includes(s)) {
    return s as Exclude<DrywallProjectStatus, 'complete'>
  }
  return 'project-info'
}

export function isDrywallProjectClosed(status: string | null | undefined): boolean {
  const s = (status ?? '').trim()
  return s === 'closed' || s === 'complete'
}

export function drywallStatusBadgeLabel(status: string | null | undefined): string {
  return DRYWALL_STATUS_BADGE_LABELS[normalizeDrywallProjectStatus(status)]
}

// ============================================================================
// metadata.legacy foundations (D.1.1 — hydrated with defaults when missing)
// ============================================================================

export type DrywallIntakeSource = 'quote' | 'po'

export interface BelowFloorApproval {
  approvedAt: string
  approvedBy: string
  approvedByName?: string
  trigger: 'quote_send' | 'field_measurement_to_order'
  marginAtApproval: number
  bidTotal: number
  estimatedCost: number
  floorTarget: number
  reason: string
}

export type CommsLogAuthorRole = 'operator' | 'crew' | 'sub'

export interface DrywallCommsLogEntry {
  id: string
  at: string
  author: string
  authorUserId?: string
  authorRole?: CommsLogAuthorRole
  body: string
}

export interface ProductionTimestamps {
  productionStartedAt?: string
  productionCompletedAt?: string
  closedAt?: string
}

export type DrywallQuoteOutcome = 'drafted' | 'sent' | 'approved' | 'lost'

export interface QuoteOutcomeTimestamps {
  sentAt?: string
  approvedAt?: string
  lostAt?: string
}

export interface BidSnapshotPayload {
  routineSubtotal: number
  cleanupTotal: number
  overhead: number
  profit: number
  salesTax: number
  bidTotal: number
  lineItems: Array<{
    id: string
    type: string
    description: string
    location?: string
    computed_line_total: number
  }>
  alternates: Array<{
    id: string
    name: string
    totalAdd: number
    selected: boolean
  }>
}

export interface BidSnapshot {
  total: number
  at: string
  payload: BidSnapshotPayload
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

export interface DrywallPoData {
  poReference: string
  customerSqft: number
  agreedUnitRate: number
  scopeText: string
  expectedStartDate?: string
  customerContact?: string
  intakeAt: string
  lastEditedAt?: string
}

export interface CreateDrywallProjectFromPoInput {
  name: string
  client: string
  address?: string
  poData: Omit<DrywallPoData, 'intakeAt' | 'lastEditedAt'>
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

export type DrywallQuotePaymentTerms =
  | 'none'
  | 'net_30'
  | 'net_15'
  | 'due_on_completion'
  | 'fifty_fifty'
  | 'progress_billing'

/** Toggles for quote PDF export (saved with the quote). */
export interface DrywallQuotePdfSettings {
  showCostBreakdown?: boolean
  showDurationSummary?: boolean
  showValidityPeriod?: boolean
  quoteValidityDays?: number
  showTaxesSeparately?: boolean
  paymentTerms?: DrywallQuotePaymentTerms
  includeGcDumpster?: boolean
  includeGcWater?: boolean
  includeGcPower?: boolean
  includeGcClimateControl?: boolean
  includeTwoPointUpTrips?: boolean
  includeSignatureLines?: boolean
  /** @deprecated Use includeTradeCostBreakdown */
  includeDrywallSubBreakdown?: boolean
  /** Per-trade material / labor sell-side lines under each trade in PRICING. */
  includeTradeCostBreakdown?: boolean
}

/** Stored quote payload — flat fields + version 2. */
export interface DrywallQuote {
  version?: number
  /** Customer-facing quote id — DW-YYYY-NNN (assigned on first save or PDF export). */
  quoteNumber?: string
  /** Quote outcome discriminator — default `drafted` when missing (D.1.2). */
  outcome?: DrywallQuoteOutcome
  outcomeTimestamps?: QuoteOutcomeTimestamps
  bidSnapshot?: BidSnapshot
  /** Free-text reason when outcome is `lost` — cleared on unlock. */
  outcomeReason?: string
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
  /** Duration estimator inputs (legacy quote scope). */
  buildType?: string
  complexity?: string
  paperFloorsRequired?: boolean
  beadSticks?: string | number
  pdfSettings?: DrywallQuotePdfSettings
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

// ============================================================================
// Drywall quote v3 — unified line-item model (Phase Q.B)
// ============================================================================

export type DrywallQuoteVersion = 2 | 3

export type QuoteLineItemType =
  | 'drywall'
  | 'rc_channel'
  | 'suspended_grid'
  | 'insulation'
  | 'acoustic'
  | 'metal_stud'
  | 'frp'

export interface QuoteLineItem {
  id: string
  type: QuoteLineItemType
  description: string
  location: string
  quantity: number
  catalog_id: string
  finish_scope_id?: string
  custom_material_rate?: number
  /** Finisher pay override ($/sqft); default from finish scope catalog. */
  custom_finisher_rate?: number
  /** Hanger pay override ($/sqft); default from board catalog. */
  custom_hanger_rate?: number
  /** Component trade labor override; unit matches catalog (sqft, lf, piece, each). */
  custom_labor_rate?: number
  /** Applies when material and/or hanger/finisher rates are overridden on a drywall line. */
  override_reason?: string
  waste_pct?: number
  /** Per-line accessory toggles (firetape no-compound, corner bead LF, etc.). */
  accessoryOverrides?: {
    joint_compound?: boolean
    tape?: boolean
    screws?: boolean
    corner_bead?: boolean
    /** Manual corner bead linear feet for accessory cost. */
    corner_bead_lf?: number
    /** Firetape product that needs no joint compound. */
    no_joint_compound?: boolean
  }
  /**
   * v2 materialRate blends board + accessories; suppress explicit accessory costs on
   * converted lines until Mark decomposes to catalog board rate + accessories (Q.C.4).
   */
  accessories_in_material_rate?: boolean
  computed_material_total?: number
  computed_labor_total?: number
  computed_accessories_total?: number
  computed_line_total?: number
  notes?: string
}

export interface QuoteAlternate {
  id: string
  name: string
  description: string
  lineItems: QuoteLineItem[]
  totalAdd?: number
  selected?: boolean
}

/** Customer-facing PDF options on v3 quotes (Q.D). */
export interface DrywallQuoteV3PdfSettings {
  /** v2-compatible toggles: taxes, payment terms, GC assumptions, signatures, etc. */
  document_options?: DrywallQuotePdfSettings
  /** Free-form note appended to TERMS & CONDITIONS. */
  notes_for_customer?: string
  /** @deprecated Prefer document_options — kept for quotes converted before document_options existed. */
  payment_terms?: string
  /** @deprecated Prefer document_options.quoteValidityDays */
  validity_days?: number
  /** @deprecated Prefer document_options.includeSignatureLines */
  signature_lines?: boolean
}

export interface DrywallQuoteV3 {
  version: 3
  /** Customer-facing quote id — carried from v2 on convert. */
  quoteNumber?: string
  outcome?: DrywallQuoteOutcome
  outcomeTimestamps?: QuoteOutcomeTimestamps
  bidSnapshot?: BidSnapshot
  outcomeReason?: string
  scope_of_work?: string
  /** Hang specifications */
  ceiling_thickness?: string
  wall_thickness?: string
  hang_exceptions?: string
  /** Finish specifications */
  ceiling_finish?: string
  ceiling_finish_other?: string
  ceiling_exceptions?: string
  wall_finish?: string
  wall_finish_other?: string
  wall_exceptions?: string
  /** Duration estimator inputs */
  build_type?: string
  complexity?: string
  paper_floors_required?: boolean
  bead_sticks?: string | number
  /** Custom scope override — replaces structured scope on PDF when true */
  use_custom_scope_of_work?: boolean
  custom_scope_of_work?: string
  /** Project-level prep/clean labor rate per drywall sqft (no waste). */
  prep_clean_rate: number
  /** Project-level hanger pay per drywall sqft (before waste). */
  project_hanger_rate?: number
  /** Project-level finisher pay per drywall sqft (before waste). */
  project_finisher_rate?: number
  overhead_pct: number
  profit_pct: number
  sales_tax_pct: number
  /** v2 labor burden toggles — default on when unset (matches v2 includeLaborBurden). */
  hanger_include_labor_burden?: boolean
  finisher_include_labor_burden?: boolean
  prep_clean_include_labor_burden?: boolean
  lineItems: QuoteLineItem[]
  alternates: QuoteAlternate[]
  legacyV2Snapshot?: unknown
  pdf_settings?: DrywallQuoteV3PdfSettings
  notes?: string
  updatedAt: string
}

export type DrywallQuoteV2V3 = DrywallQuote | DrywallQuoteV3

export function isDrywallQuoteV3(quote: DrywallQuoteV2V3): quote is DrywallQuoteV3 {
  return quote.version === 3
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
