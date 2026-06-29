import type {
  DrywallQuote,
  DrywallQuoteV3,
  QuoteAlternate,
  QuoteBreakdown,
  QuoteLineItem,
  QuoteOption,
} from '@/types/drywall'
import { hydrateDrywallQuote } from './createEmptyDrywallQuote'
import { createEmptyDrywallQuoteV3 } from './createEmptyDrywallQuoteV3'
import { generateQuoteId } from './drywallQuoteHelpers'
import { mapV2PdfSettingsToV3 } from './quoteV3PdfSettings'
import { formatQuoteMoney } from './quoteV3Math'

export const V3_LINE_MIGRATION_OVERRIDE_REASON =
  'Migrated from v2; review hanger + finisher rates and catalog picks before finalizing.'

const MIGRATION_OVERRIDE = V3_LINE_MIGRATION_OVERRIDE_REASON
const MIGRATION_NOTES =
  'Auto-created from v2 conversion. Review board, finish, and rates before saving.'

type MigratedLineOverrides = {
  materialRate?: number
  hangerRate?: number
  finisherRate?: number
  description?: string
  skipOverrideReason?: boolean
}

function mapV2StructuredScopeFields(v2: DrywallQuote): Partial<DrywallQuoteV3> {
  return {
    ceiling_thickness: strOrUndef(v2.ceilingThickness),
    wall_thickness: strOrUndef(v2.wallThickness),
    hang_exceptions: strOrUndef(v2.hangExceptions),
    ceiling_finish: strOrUndef(v2.ceilingFinish),
    ceiling_finish_other: strOrUndef(v2.ceilingFinishOther),
    ceiling_exceptions: strOrUndef(v2.ceilingExceptions),
    wall_finish: strOrUndef(v2.wallFinish),
    wall_finish_other: strOrUndef(v2.wallFinishOther),
    wall_exceptions: strOrUndef(v2.wallExceptions),
    build_type: strOrUndef(v2.buildType),
    complexity: strOrUndef(v2.complexity),
    paper_floors_required: v2.paperFloorsRequired === true ? true : undefined,
    bead_sticks:
      v2.beadSticks != null && String(v2.beadSticks).trim() !== '' ? v2.beadSticks : undefined,
    use_custom_scope_of_work: v2.useCustomScopeOfWork === true,
    custom_scope_of_work: strOrUndef(v2.customScopeOfWork),
  }
}

function strOrUndef(v: unknown): string | undefined {
  if (v == null) return undefined
  const t = String(v).trim()
  return t || undefined
}

/** Build v3 from v2 — explicit per-project upgrade with carried-over starter data. */
export function buildV3FromV2(v2: DrywallQuote): DrywallQuoteV3 {
  const v3 = createEmptyDrywallQuoteV3()
  const lineItems = buildStarterLineItems(v2)
  const alternates = mapV2OptionsToAlternates(v2)
  const structuredScope = mapV2StructuredScopeFields(v2)

  return {
    ...v3,
    quoteNumber: v2.quoteNumber,
    scope_of_work: v2.useCustomScopeOfWork
      ? ''
      : String(v2.scopeOfWork ?? '').trim(),
    ...structuredScope,
    prep_clean_rate: parseNum(v2.prepCleanRate, v3.prep_clean_rate),
    project_hanger_rate: parseNum(v2.hangerRate, v3.project_hanger_rate),
    project_finisher_rate: parseNum(v2.finisherRate, v3.project_finisher_rate),
    overhead_pct: parsePct(v2.overheadPercentage, v3.overhead_pct),
    profit_pct: parsePct(v2.profitPercentage, v3.profit_pct),
    sales_tax_pct: parsePct(v2.salesTaxRate, v3.sales_tax_pct),
    hanger_include_labor_burden: v2.hangerIncludeLaborBurden !== false,
    finisher_include_labor_burden: v2.finisherIncludeLaborBurden !== false,
    prep_clean_include_labor_burden: v2.prepCleanIncludeLaborBurden !== false,
    lineItems,
    alternates,
    pdf_settings: mapV2PdfSettingsToV3(v2.pdfSettings),
    legacyV2Snapshot: { ...v2, version: 2 },
    notes: lineItems.length
      ? 'Converted from v2 — review migrated lines, board picks, and rates before finalizing.'
      : v3.notes,
    updatedAt: new Date().toISOString(),
  }
}

export function getV2QuoteGrandTotal(v2: DrywallQuote): number | null {
  const calc = v2.calculations
  if (calc && typeof calc === 'object') {
    const finalTotal = parseNum(calc.finalTotal, 0)
    if (finalTotal > 0) return finalTotal
    const calculatedTotal = parseNum(calc.calculatedTotal, 0)
    if (calculatedTotal > 0) return calculatedTotal
  }
  const manual = parseNum(v2.totalQuoteAmount, 0)
  if (manual > 0) return manual
  return null
}

function resolveV2ScopeText(v2: DrywallQuote): string {
  if (v2.useCustomScopeOfWork) {
    return String(v2.customScopeOfWork ?? '').trim()
  }
  return String(v2.scopeOfWork ?? '').trim()
}

const RC_CHANNEL_PIECE_FT = 12
const COMPONENT_MIGRATION_NOTES = 'Migrated from v2 component section — review catalog pick and quantity.'

function buildStarterLineItems(v2: DrywallQuote): QuoteLineItem[] {
  const drywallLines = buildDrywallStarterLines(v2)
  const componentLines = buildComponentStarterLines(v2)
  return [...drywallLines, ...componentLines]
}

function buildDrywallStarterLines(v2: DrywallQuote): QuoteLineItem[] {
  const breakdowns = (v2.breakdowns ?? []).filter((b) => parseNum(b.sqft, 0) > 0)
  if (breakdowns.length > 0) {
    return breakdowns.map((b) =>
      buildMigratedDrywallLine(v2, {
        breakdown: b,
        quantity: parseNum(b.sqft, 0),
        location: String(b.description ?? '').trim() || 'Main',
      }),
    )
  }
  const sqft = parseNum(v2.sqft, 0)
  if (sqft <= 0) return []
  return [
    buildMigratedDrywallLine(v2, {
      quantity: sqft,
      location: 'Main',
    }),
  ]
}

function buildComponentStarterLines(v2: DrywallQuote): QuoteLineItem[] {
  const lines: QuoteLineItem[] = []

  if (v2.includeRcChannel) {
    const qty = estimateRcChannelLinearFt(v2)
    const laborPerLf = rcLaborPerLfFromV2(v2)
    const materialPerPiece = parseNum(v2.rcChannelRate)
    if (qty > 0 || laborPerLf != null || materialPerPiece > 0) {
      lines.push(
        buildComponentLine('rc_channel', {
          location: 'RC Channel',
          quantity: qty,
          custom_labor_rate: laborPerLf,
          custom_material_rate: materialPerPiece > 0 ? materialPerPiece : undefined,
          description: 'Migrated RC channel — review LF and rates',
        }),
      )
    }
  }

  if (v2.includeInsulation) {
    const entries = Array.isArray(v2.insulationEntries) ? v2.insulationEntries : []
    if (entries.length > 0) {
      for (const entry of entries) {
        const sqft = parseNum(entry.sqft, 0)
        if (sqft <= 0) continue
        const isCeiling = String(entry.location ?? '').toLowerCase() === 'ceiling'
        const laborRate = parseNum(
          isCeiling ? v2.insulationCeilingLaborRate : v2.insulationWallLaborRate,
        )
        lines.push(
          buildComponentLine('insulation', {
            location: String(entry.location ?? 'Insulation').trim() || 'Insulation',
            quantity: sqft,
            custom_labor_rate: laborRate > 0 ? laborRate : undefined,
            description: `Migrated insulation — ${entry.location ?? 'area'}`,
          }),
        )
      }
    }
  }

  if (v2.includeAcousticCeiling) {
    const sqft = parseNum(v2.acousticCeilingPerimeter, 0) // fallback: use tile area if stored elsewhere
    const tileSqft = parseNum((v2 as Record<string, unknown>).acousticCeilingSqft, 0)
    const qty = tileSqft > 0 ? tileSqft : sqft
    const laborRate = parseNum(v2.acousticCeilingLaborRate)
    if (qty > 0 || laborRate > 0) {
      lines.push(
        buildComponentLine('acoustic', {
          location: 'Acoustic ceiling',
          quantity: qty,
          custom_labor_rate: laborRate > 0 ? laborRate : undefined,
          description: 'Migrated acoustic ceiling',
        }),
      )
    }
  }

  if (v2.includeMetalStudFraming) {
    const entries = Array.isArray(v2.metalStudEntries) ? v2.metalStudEntries : []
    let totalLf = 0
    for (const entry of entries) {
      totalLf += parseNum(entry.wallLf, 0)
    }
    const laborRate = parseNum(v2.metalStudLaborRate)
    if (totalLf > 0 || laborRate > 0) {
      lines.push(
        buildComponentLine('metal_stud', {
          location: 'Metal stud',
          quantity: totalLf,
          custom_labor_rate: laborRate > 0 ? laborRate : undefined,
          description: 'Migrated metal stud framing',
        }),
      )
    }
  }

  if (v2.includeSuspendedGrid) {
    const sqft = parseNum((v2 as Record<string, unknown>).suspendedGridSqft, parseNum(v2.sqft, 0))
    const laborRate = parseNum(v2.carpenterRate)
    if (sqft > 0 || laborRate > 0) {
      lines.push(
        buildComponentLine('suspended_grid', {
          location: 'Suspended grid',
          quantity: sqft,
          custom_labor_rate: laborRate > 0 ? laborRate : undefined,
          description: 'Migrated suspended grid (carpenter labor)',
        }),
      )
    }
  }

  if (v2.includeFRP) {
    const sqft = parseNum(v2.frpSqft, 0)
    if (sqft > 0) {
      lines.push(
        buildComponentLine('frp', {
          location: 'FRP',
          quantity: sqft,
          custom_material_rate: parseNum(v2.frpSheetRate) > 0 ? parseNum(v2.frpSheetRate) : undefined,
          description: 'Migrated FRP — material only (v2 had no FRP labor rate)',
        }),
      )
    }
  }

  return lines
}

function buildComponentLine(
  type: QuoteLineItem['type'],
  params: {
    location: string
    quantity: number
    description: string
    custom_labor_rate?: number
    custom_material_rate?: number
  },
): QuoteLineItem {
  return {
    id: generateQuoteId(),
    type,
    description: params.description,
    location: params.location,
    quantity: params.quantity,
    catalog_id: '',
    custom_labor_rate: params.custom_labor_rate,
    custom_material_rate: params.custom_material_rate,
    override_reason: MIGRATION_OVERRIDE,
    notes: COMPONENT_MIGRATION_NOTES,
  }
}

function estimateRcChannelLinearFt(v2: DrywallQuote): number {
  let lf = 0
  const ceilingSqft = parseNum(v2.rcChannelCeilingSqft, 0)
  const ceilingSpacing = parseNum(v2.rcChannelCeilingSpacing, 24) || 24
  if (ceilingSqft > 0 && ceilingSpacing > 0) {
    lf += ceilingSqft / (ceilingSpacing / 12)
  }

  const wallEntries = Array.isArray(v2.rcChannelWallEntries) ? v2.rcChannelWallEntries : []
  for (const entry of wallEntries) {
    const raw = entry as unknown as Record<string, unknown>
    const wallLf = parseNum(entry.linearFt ?? raw.wallLf ?? raw.rcChannelWallLf, 0)
    const wallHeight = parseNum(entry.height ?? raw.wallHeight ?? raw.rcChannelWallHeight, 0)
    const spacing = parseNum(raw.spacing ?? v2.rcChannelWallSpacing, 24) || 24
    if (wallLf > 0 && wallHeight > 0 && spacing > 0) {
      lf += Math.ceil(wallHeight / (spacing / 12)) * wallLf
    } else if (wallLf > 0) {
      lf += wallLf
    }
  }

  return Math.round(lf * 100) / 100
}

function rcLaborPerLfFromV2(v2: DrywallQuote): number | undefined {
  const pieceRate = parseNum(v2.rcChannelLaborRate, 0)
  if (pieceRate <= 0) return undefined
  return pieceRate / RC_CHANNEL_PIECE_FT
}

function buildMigratedDrywallLine(
  v2: DrywallQuote,
  params: {
    breakdown?: QuoteBreakdown
    quantity: number
    location: string
    overrides?: MigratedLineOverrides
  },
): QuoteLineItem {
  const { breakdown, quantity, location, overrides } = params
  const description =
    overrides?.description ??
    (truncateText(resolveV2ScopeText(v2), 120) ||
      'Migrated from v2 — review and refine')
  const wastePct =
    v2.wastePercentage === '' || v2.wastePercentage == null
      ? 10
      : parseNum(v2.wastePercentage, 10)

  return {
    id: generateQuoteId(),
    type: 'drywall',
    description,
    location,
    quantity,
    catalog_id: guessBoardCatalogId(v2),
    finish_scope_id: guessFinishScopeId(v2),
    custom_material_rate: overrides?.materialRate ?? resolveMaterialRate(v2, breakdown),
    custom_hanger_rate:
      overrides?.hangerRate !== undefined ? overrides.hangerRate : undefined,
    custom_finisher_rate:
      overrides?.finisherRate !== undefined ? overrides.finisherRate : undefined,
    override_reason: overrides?.skipOverrideReason ? undefined : MIGRATION_OVERRIDE,
    waste_pct: wastePct,
    accessories_in_material_rate: true,
    notes: MIGRATION_NOTES,
  }
}

function resolveMaterialRate(v2: DrywallQuote, breakdown?: QuoteBreakdown): number {
  if (
    breakdown?.boardOnlyMaterialRate != null &&
    breakdown.boardOnlyMaterialRate !== '' &&
    v2.drywallScope === 'board_only'
  ) {
    return parseNum(breakdown.boardOnlyMaterialRate, parseNum(v2.boardOnlyMaterialRate))
  }
  return parseNum(v2.materialRate, parseNum(v2.boardOnlyMaterialRate))
}

function hangerRateFromV2(v2: DrywallQuote): number | undefined {
  const scope = String(v2.drywallScope ?? 'hang_and_finish')
  if (scope === 'finish_only' || scope === 'board_only') return undefined
  const hanger = parseNum(v2.hangerRate)
  return hanger > 0 ? hanger : undefined
}

function finisherRateFromV2(v2: DrywallQuote): number | undefined {
  const scope = String(v2.drywallScope ?? 'hang_and_finish')
  if (scope === 'hang_only' || scope === 'board_only') return undefined
  const finisher = parseNum(v2.finisherRate)
  return finisher > 0 ? finisher : undefined
}

function guessBoardCatalogId(v2: DrywallQuote): string {
  const haystack = [
    v2.boardType,
    v2.hangExceptions,
    v2.ceilingExceptions,
    v2.wallExceptions,
    v2.ceilingThickness,
    v2.wallThickness,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const thickness = primaryThicknessPrefix(v2)
  const isTypeX = /type x|type-x|typex/.test(haystack)
  const isMr = /moisture|mr\b|wet wall/.test(haystack)
  const isCement = /cement/.test(haystack)
  const isSound = /sound/.test(haystack)
  const isDens = /densglass|dens glass/.test(haystack)

  if (isTypeX) return `${thickness}_type_x`
  if (isMr) return `${thickness}_mr`
  if (isCement) return `${thickness}_cement`
  if (isSound) return `${thickness}_sound`
  if (isDens) return `${thickness}_densglass`
  return `${thickness}_regular`
}

function primaryThicknessPrefix(v2: DrywallQuote): '5_8' | '1_2' | '3_8' | '1_4' {
  const raw = String(v2.wallThickness ?? v2.ceilingThickness ?? '5/8"').toLowerCase()
  if (raw.includes('1/4')) return '1_4'
  if (raw.includes('3/8')) return '3_8'
  if (raw.includes('1/2')) return '1_2'
  return '5_8'
}

function resolveFinishLabel(raw?: string, other?: string): string {
  const label = raw === 'Other' ? String(other ?? '') : String(raw ?? '')
  return label.trim()
}

function guessFinishScopeId(v2: DrywallQuote): string | undefined {
  const scope = String(v2.drywallScope ?? 'hang_and_finish')
  if (scope === 'hang_only' || scope === 'board_only') return 'hang_only'

  const ceiling = resolveFinishLabel(
    String(v2.ceilingFinish ?? ''),
    String(v2.ceilingFinishOther ?? ''),
  )
  const wall = resolveFinishLabel(
    String(v2.wallFinish ?? ''),
    String(v2.wallFinishOther ?? ''),
  )
  const label = `${wall} ${ceiling}`.toLowerCase()

  if (/firetape|fire tape/.test(label)) return 'firetape_only'
  if (/level 5|level5/.test(label)) return 'level_5'
  if (/level 4|level4/.test(label)) return 'level_4'
  if (/level 3|level3/.test(label)) return 'level_3'
  if (/stomp/.test(label)) return 'stomp_knockdown'
  if (/splatter knockdown/.test(label)) return 'splatter_knockdown'
  if (/splatter/.test(label)) return 'splatter'
  if (/knockdown/.test(label)) return 'knockdown'
  if (/roll texture/.test(label)) return 'roll_texture'
  return undefined
}

function mapV2OptionsToAlternates(v2: DrywallQuote): QuoteAlternate[] {
  return (v2.options ?? [])
    .filter((opt) => Boolean(opt.name?.trim() || opt.description?.trim() || opt.price || opt.sqft))
    .map((opt) => mapV2OptionToAlternate(v2, opt))
}

function mapV2OptionToAlternate(v2: DrywallQuote, opt: QuoteOption): QuoteAlternate {
  const name = String(opt.name ?? 'Alternate').trim() || 'Alternate'
  const description = String(opt.description ?? '').trim()
  const projectSqft = parseNum(v2.sqft, 0)
  const sqft =
    opt.pricingMethod === 'totalSqft' || opt.useTotalSqft
      ? projectSqft
      : parseNum(opt.sqft, 0)
  const rate = parseNum(opt.rate, 0)
  const price = parseNum(opt.price, 0)

  let lineItems: QuoteLineItem[] = []
  if (sqft > 0 && rate > 0) {
    lineItems = [
      buildMigratedDrywallLine(v2, {
        quantity: sqft,
        location: name,
        overrides: {
          materialRate: rate,
          hangerRate: 0,
          finisherRate: 0,
          description: description || `${name} — migrated alternate`,
        },
      }),
    ]
  } else if (sqft > 0 && price > 0) {
    lineItems = [
      buildMigratedDrywallLine(v2, {
        quantity: sqft,
        location: name,
        overrides: {
          materialRate: price / sqft,
          hangerRate: 0,
          finisherRate: 0,
          description: description || `${name} — ${formatQuoteMoney(price)} fixed`,
        },
      }),
    ]
  } else if (price > 0) {
    lineItems = [
      buildMigratedDrywallLine(v2, {
        quantity: 1,
        location: name,
        overrides: {
          materialRate: price,
          hangerRate: 0,
          finisherRate: 0,
          description: description || `${name} — ${formatQuoteMoney(price)} lump sum`,
        },
      }),
    ]
  }

  return {
    id: generateQuoteId(),
    name,
    description,
    lineItems,
  }
}

function truncateText(text: string, maxLen: number): string {
  const t = text.trim()
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen - 1)}…`
}

function parseNum(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function parsePct(v: unknown, fallback: number): number {
  return parseNum(v, fallback)
}

function parseSnapshotNum(v: unknown): number {
  return parseFloat(String(v ?? '')) || 0
}

/** True when the stored v2 rollback snapshot has real quote content (not an empty shell). */
export function v2SnapshotHasSubstantiveWork(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false
  const v2 = hydrateDrywallQuote(snapshot)
  if (parseSnapshotNum(v2.sqft) > 0) return true
  if ((v2.breakdowns?.length ?? 0) > 0) return true
  if ((v2.options?.length ?? 0) > 0) return true
  if (parseSnapshotNum(v2.acousticCeilingSqft) > 0) return true
  if (parseSnapshotNum(v2.acousticCeilingPerimeter) > 0) return true
  if (parseSnapshotNum(v2.suspendedGridSqft) > 0) return true
  if (parseSnapshotNum(v2.frpSqft) > 0) return true
  if (Array.isArray(v2.insulationEntries) && v2.insulationEntries.length > 0) return true
  if (Array.isArray(v2.metalStudEntries) && v2.metalStudEntries.length > 0) return true
  return false
}

/** v2 fetch for field/order pages when project is on v3. */
export function v2QuoteFromV3Snapshot(snapshot: unknown): DrywallQuote {
  if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
    return hydrateDrywallQuote(snapshot)
  }
  return hydrateDrywallQuote({ version: 2 })
}
