import { DRYWALL_QUOTE_BASE_DEFAULTS } from './drywallQuoteDefaults'
import { DEFAULT_QUOTE_PDF_SETTINGS } from './quotePdfSettings'
import { generateQuoteId } from './drywallQuoteHelpers'
import type { DrywallQuote, QuoteBreakdown } from '@/types/drywall'

export function createEmptyBreakdown(description = ''): QuoteBreakdown {
  return {
    id: generateQuoteId(),
    description,
    sqft: '',
    hangLayers: DRYWALL_QUOTE_BASE_DEFAULTS.hangLayers,
    finishLayers: DRYWALL_QUOTE_BASE_DEFAULTS.finishLayers,
    rcChannelCeilingSqft: '',
    rcChannelWallLinearFt: '',
    rcChannelWallHeight: '',
    rcChannelWallEntries: [],
    suspendedGridSqft: '',
    suspendedGridPerimeter: '',
    metalStudWallLf: '',
    metalStudWallHeight: '',
    metalStudSpacing: '16',
    metalStudTracksPerRun: '2',
    metalStudSize: '3.625',
    metalStudGauge: '20',
    metalStudEntries: [],
  }
}

/** New quote with org-default rates; version 2. */
export function createEmptyDrywallQuote(): DrywallQuote {
  const d = DRYWALL_QUOTE_BASE_DEFAULTS
  return {
    version: 2,
    sqft: '',
    wastePercentage: d.wastePercentage,
    drywallScope: d.drywallScope,
    hangLayers: d.hangLayers,
    finishLayers: d.finishLayers,
    materialRate: d.materialRate,
    hangerRate: d.hangerRate,
    hangerIncludeLaborBurden: true,
    finisherRate: d.finisherRate,
    finisherIncludeLaborBurden: true,
    prepCleanRate: d.prepCleanRate,
    prepCleanIncludeLaborBurden: true,
    overheadPercentage: d.overheadPercentage,
    profitPercentage: d.profitPercentage,
    salesTaxRate: d.salesTaxRate,
    quoteIncludes: d.quoteIncludes,
    includeSuspendedGrid: false,
    suspendedGridWastePercentage: d.suspendedGridWastePercentage,
    carpenterRate: d.carpenterRate,
    shiny90Count: '',
    shiny90Rate: d.suspendedGridPricing.shiny90Rate,
    mainsCount: '',
    mainsRate: d.suspendedGridPricing.mainsRate,
    tees4ftCount: '',
    tees4ftRate: d.suspendedGridPricing.tees4ftRate,
    wireLinearFt: '',
    wireRate: d.suspendedGridPricing.wireRate,
    lagsCount: '',
    lagsRate: d.suspendedGridPricing.lagsRate,
    includeRcChannel: false,
    rcChannelCeilingSqft: '',
    rcChannelCeilingSpacing: '24',
    rcChannelWallEntries: [],
    rcChannelWallSpacing: '24',
    rcChannelWastePercentage: d.rcChannelWastePercentage,
    rcChannelRate: d.rcChannelRate,
    rcChannelLaborRate: d.rcChannelLaborRate,
    includeInsulation: false,
    insulationWastePercentage: d.insulationWastePercentage,
    insulationCeilingLaborRate: d.insulationCeilingLaborRate,
    insulationWallLaborRate: d.insulationWallLaborRate,
    insulationEntries: [],
    includeAcousticCeiling: false,
    acousticCeilingTileSize: '2x4',
    acousticCeilingWastePercentage: d.acousticCeilingWastePercentage,
    acousticCeilingTileRate: d.acousticCeilingTileRate,
    acousticCeilingLaborRate: d.acousticCeilingLaborRate,
    acousticCeilingPerimeter: '',
    acousticWallAngleCount: '',
    acousticWallAngleRate: d.acousticCeilingGridPricing.wallAngleRate,
    acousticMainsCount: '',
    acousticMainsRate: d.acousticCeilingGridPricing.mainsRate,
    acousticTees4ftCount: '',
    acousticTees4ftRate: d.acousticCeilingGridPricing.tees4ftRate,
    acousticTees2ftCount: '',
    acousticTees2ftRate: d.acousticCeilingGridPricing.tees2ftRate,
    acousticWireLinearFt: '',
    acousticWireRate: d.acousticCeilingGridPricing.wireRate,
    acousticLagsCount: '',
    acousticLagsRate: d.acousticCeilingGridPricing.lagsRate,
    includeMetalStudFraming: false,
    metalStudWastePercentage: d.metalStudWastePercentage,
    metalStudLaborRate: d.metalStudLaborRate,
    metalStudStudRates: { ...d.metalStudStudRates },
    metalStudTrackRates: { ...d.metalStudTrackRates },
    metalStudEntries: [],
    includeFRP: false,
    frpWastePercentage: d.frpWastePercentage,
    frpSqft: '',
    frpWallCount: '',
    frpWallHeight: '',
    frpInsideCorners: '',
    frpOutsideCorners: '',
    frpExposedEdgesLf: '',
    frpSheetRate: d.frpSheetRate,
    frpAdhesiveBucketRate: d.frpAdhesiveBucketRate,
    frpDivisionStickRate: d.frpDivisionStickRate,
    frpIcStickRate: d.frpIcStickRate,
    frpOcStickRate: d.frpOcStickRate,
    frpJMoldStickRate: d.frpJMoldStickRate,
    useCustomScopeOfWork: false,
    scopeOfWork: '',
    customScopeOfWork: '',
    ceilingThickness: '',
    wallThickness: '',
    hangExceptions: '',
    ceilingFinish: '',
    ceilingFinishOther: '',
    ceilingExceptions: '',
    wallFinish: '',
    wallFinishOther: '',
    wallExceptions: '',
    buildType: 'new_build',
    complexity: 'normal',
    paperFloorsRequired: false,
    beadSticks: '',
    breakdowns: [],
    options: [],
    totalQuoteAmount: '',
    pdfSettings: { ...DEFAULT_QUOTE_PDF_SETTINGS },
  }
}

/** Merge stored JSONB with defaults for missing keys. */
export function hydrateDrywallQuote(raw: unknown): DrywallQuote {
  const base = createEmptyDrywallQuote()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const q = raw as Record<string, unknown>
  return {
    ...base,
    ...q,
    version: 2,
    breakdowns: Array.isArray(q.breakdowns) ? (q.breakdowns as DrywallQuote['breakdowns']) : [],
    options: Array.isArray(q.options) ? (q.options as DrywallQuote['options']) : [],
    insulationEntries: Array.isArray(q.insulationEntries)
      ? (q.insulationEntries as DrywallQuote['insulationEntries'])
      : [],
    rcChannelWallEntries: Array.isArray(q.rcChannelWallEntries)
      ? (q.rcChannelWallEntries as DrywallQuote['rcChannelWallEntries'])
      : [],
    metalStudEntries: Array.isArray(q.metalStudEntries)
      ? (q.metalStudEntries as DrywallQuote['metalStudEntries'])
      : [],
    metalStudStudRates:
      q.metalStudStudRates && typeof q.metalStudStudRates === 'object'
        ? { ...base.metalStudStudRates, ...(q.metalStudStudRates as Record<string, string | number>) }
        : base.metalStudStudRates,
    metalStudTrackRates:
      q.metalStudTrackRates && typeof q.metalStudTrackRates === 'object'
        ? { ...base.metalStudTrackRates, ...(q.metalStudTrackRates as Record<string, string | number>) }
        : base.metalStudTrackRates,
    pdfSettings: {
      ...base.pdfSettings,
      ...(q.pdfSettings && typeof q.pdfSettings === 'object'
        ? (q.pdfSettings as DrywallQuote['pdfSettings'])
        : {}),
    },
  }
}

/** True when a hydrated v2 quote has user-entered content (not an empty new-project shell). */
export function hasRealDrywallV2QuoteData(quote: DrywallQuote): boolean {
  const positive = (value: unknown): boolean => {
    if (value == null || value === '') return false
    const n = typeof value === 'string' ? parseFloat(value) : Number(value)
    return Number.isFinite(n) && n > 0
  }

  if ((quote.breakdowns ?? []).some((b) => positive(b.sqft))) return true
  if (positive(quote.sqft)) return true
  if (positive(quote.totalQuoteAmount)) return true

  const calc = quote.calculations
  if (calc && typeof calc === 'object') {
    if (positive(calc.finalTotal)) return true
    if (positive(calc.calculatedTotal)) return true
  }

  if (quote.includeSuspendedGrid && positive(quote.suspendedGridSqft)) return true
  if (
    quote.includeRcChannel &&
    (positive(quote.rcChannelCeilingSqft) || (quote.rcChannelWallEntries?.length ?? 0) > 0)
  ) {
    return true
  }
  if (quote.includeInsulation && (quote.insulationEntries?.length ?? 0) > 0) return true
  if (quote.includeAcousticCeiling && positive(quote.acousticCeilingSqft)) return true
  if (quote.includeMetalStudFraming && (quote.metalStudEntries?.length ?? 0) > 0) return true
  if (quote.includeFRP && positive(quote.frpSqft)) return true
  if ((quote.options?.length ?? 0) > 0) return true

  return false
}
