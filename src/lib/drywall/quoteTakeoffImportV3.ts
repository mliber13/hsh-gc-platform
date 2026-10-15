// ============================================================================
// v3 quote takeoff import — parse a Togal-style takeoff export (assembly
// classifications + SF/LF quantities) into proposed v3 QuoteLineItems.
// ============================================================================
//
// Unlike the legacy v2 importer (quoteTakeoffImport.ts), this does NOT require
// a floor column — Togal commercial exports are often a flat classification
// list. Every parsed row becomes one or two proposed v3 line items (an RC row
// yields a drywall line + an rc_channel line). Quantities come from the sheet;
// dollars come from the catalog at compute time. Nothing here writes a quote —
// the caller reviews the proposals and merges the included ones.

import * as XLSX from 'xlsx'
import { createQuoteLineItem } from './createEmptyDrywallQuoteV3'
import { withCeilingHeights } from './ceilingHeights'
import type { QuoteLineItem } from '@/types/drywall'

/** Default board when the classification doesn't name a type (owner decision: 5/8" Type X). */
const DEFAULT_BOARD_CATALOG_ID = '5_8_type_x'
/** Default finish scope for imported drywall lines (commercial norm). */
const DEFAULT_FINISH_SCOPE_ID = 'level_4'

export interface ImportedTakeoffLine {
  /** Same id as `line.id` — stable key for the review table. */
  id: string
  sourceRow: number
  sourceClassification: string
  /** Whether this proposed line is included when the user applies the import. */
  include: boolean
  /** Non-blocking note surfaced in the review UI (e.g. 2-layer qty, unknown type). */
  warning?: string
  line: QuoteLineItem
}

export interface TakeoffParseResultV3 {
  lines: ImportedTakeoffLine[]
  warnings: string[]
  sheetName: string
}

// ── small parsing helpers (mirrors quoteTakeoffImport.ts) ───────────────────

const normalizeHeader = (s: unknown): string =>
  String(s ?? '').trim().toLowerCase().replace(/\s+/g, '_')

const toNum = (v: unknown): number => {
  if (v == null || v === '') return 0
  const n = parseFloat(String(v).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

const firstMatch = (obj: Record<string, unknown>, keys: string[]): unknown => {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k]
  }
  return ''
}

const isSqftUom = (uom: unknown): boolean => {
  const s = String(uom ?? '').trim().toUpperCase().replace(/\s+/g, '')
  return s === 'SF' || s === 'SQFT' || s === 'S.F.' || s === 'S.F' || s.includes('SQUAREFEET')
}
const isFtUom = (uom: unknown): boolean => {
  const s = String(uom ?? '').trim().toUpperCase().replace(/\s+/g, '')
  return s === 'FT' || s === 'LF' || s === 'LINFT' || s === 'L.F.' || s === 'L.F' || s.includes('FEET')
}

/**
 * Parse the leading height in feet from a classification: "10' - Type X" → 10, and
 * "10' 6" 5/8" Walls" → 10.5. Inches only count when they follow the feet directly, so the
 * 5/8" board thickness after them is never read as a height.
 */
function parseHeightFt(classification: string): number | undefined {
  const m = classification.match(/(\d+(?:\.\d+)?)\s*'(?:\s*(\d+(?:\.\d+)?)\s*")?/)
  if (!m) return undefined
  const inches = m[2] ? toNum(m[2]) : 0
  return toNum(m[1]) + (inches > 0 && inches < 12 ? inches / 12 : 0)
}

/** RC spacing from a classification, e.g. 'RC 24" OC' → 24. */
function parseRcSpacingIn(classification: string): number | undefined {
  const m = classification.match(/(\d+(?:\.\d+)?)\s*(?:"|in\b|inch(?:es)?)\s*o\.?\s*c/i)
  return m ? toNum(m[1]) : undefined
}

/** Metal stud size (inches) + gauge from a classification. */
function parseStudSizeGauge(classification: string): { size: string; gauge: string } {
  const s = classification.toLowerCase()
  let size = '3.625'
  if (s.includes('6"') || s.includes('6 in')) size = '6'
  else if (s.includes('3 5/8') || s.includes('3-5/8')) size = '3.625'
  else if (s.includes('2 1/2') || s.includes('2-1/2')) size = '2.5'
  let gauge = '20'
  if (s.includes('18')) gauge = '18'
  else if (s.includes('25')) gauge = '25'
  return { size, gauge }
}

/** Guess the board catalog id from the classification text (default 5/8" Type X). */
function guessBoardCatalogId(classification: string): string {
  const s = classification.toLowerCase()
  let thickness = '5_8'
  if (s.includes('1/4')) thickness = '1_4'
  else if (s.includes('3/8')) thickness = '3_8'
  else if (s.includes('1/2')) thickness = '1_2'

  if (/type\s*-?\s*x/.test(s)) return `${thickness}_type_x`
  if (/moisture|\bmr\b|wet wall/.test(s)) return `${thickness}_mr`
  if (/cement/.test(s)) return `${thickness}_cement`
  if (/sound/.test(s)) return `${thickness}_sound`
  if (/densglass|dens glass/.test(s)) return `${thickness}_densglass`
  // Owner default: unspecified board type → 5/8" Type X.
  if (thickness === '5_8') return DEFAULT_BOARD_CATALOG_ID
  return `${thickness}_regular`
}

const hasRc = (s: string) => /\bw\/?\s*rc\b|\brc\b|resilient channel/i.test(s)
const isCeiling = (s: string) => /ceiling/i.test(s)

// ── classification → proposed v3 lines ──────────────────────────────────────

/**
 * Turn one takeoff row into 1–2 proposed v3 line items.
 * RC rows (name contains "RC" / "w/RC", or a "Ceiling Assembly") yield a drywall
 * line PLUS an rc_channel line — a ceiling uses SF, a wall uses LF + height.
 */
/** Location for rows that come before any area header, or under Togal's "Unassigned". */
const DEFAULT_LOCATION = 'Imported takeoff'

/** Words that mean a row includes board, not just channel. "10' RC 24" OC" has none. */
const BOARD_WORDS =
  /drywall|gyp|board|walls?\b|ceilings?\b|soffit|type\s*-?\s*x|\bmr\b|moisture|cement|sound|densglass|\d\/\d/

interface RowContext {
  /** The Togal area header above this row ("1st Floor"), else DEFAULT_LOCATION. */
  location: string
  /**
   * Quantity 2 in SF. On a Togal 2-layer row this is the second layer — Quantity 1 is the
   * first. Zero when the row has no second SF quantity.
   */
  layer2Sf: number
  /** RC product to preselect: the catalog's only RC entry, when it has exactly one. */
  defaultRcCatalogId?: string
}

function classifyToImportedLines(
  classification: string,
  qtySf: number,
  qtyFt: number,
  sourceRow: number,
  ctx: RowContext = { location: DEFAULT_LOCATION, layer2Sf: 0 },
): ImportedTakeoffLine[] {
  const raw = classification.trim()
  const s = raw.toLowerCase()
  const heightFt = parseHeightFt(raw)
  const out: ImportedTakeoffLine[] = []

  const wrap = (line: QuoteLineItem, warning?: string): ImportedTakeoffLine => ({
    id: line.id,
    sourceRow,
    sourceClassification: raw,
    include: true,
    warning,
    line,
  })

  const location = ctx.location

  // Metal stud framing — LF driven, with size/gauge/height parsed from the classification.
  if (/metal stud|stud framing/.test(s)) {
    const { size, gauge } = parseStudSizeGauge(raw)
    const line = createQuoteLineItem('metal_stud', { location })
    line.quantity = qtyFt > 0 ? qtyFt : qtySf
    line.ms_size = size
    line.ms_gauge = gauge
    if (heightFt) line.ms_wall_height = heightFt
    line.description = raw
    out.push(
      wrap(
        line,
        qtyFt > 0
          ? heightFt
            ? undefined
            : 'No wall height in the name — set height so studs price.'
          : 'No LF quantity — verify metal stud length.',
      ),
    )
    return out
  }

  // Suspended drywall grid — two lines: the grid, plus the drywall hung & finished
  // on it (same area). Mirrors the RC drywall + component pattern.
  if (/suspend.*grid|drywall grid/.test(s)) {
    const grid = createQuoteLineItem('suspended_grid', { location })
    grid.quantity = qtySf
    if (qtyFt > 0) grid.grid_perimeter = qtyFt
    grid.description = raw
    out.push(wrap(grid))

    const drywall = createQuoteLineItem('drywall', { location })
    drywall.quantity = qtySf
    drywall.catalog_id = DEFAULT_BOARD_CATALOG_ID
    drywall.finish_scope_id = DEFAULT_FINISH_SCOPE_ID
    drywall.description = `Drywall on suspended grid — ${raw}`
    out.push(wrap(drywall))
    return out
  }

  // Acoustical ceiling tile (ACT-x / acoustic / ceiling tile).
  if (/\bact\b|\bact-\d|acoustic|ceiling tile/.test(s)) {
    const line = createQuoteLineItem('acoustic', { location })
    line.quantity = qtySf
    if (qtyFt > 0) line.grid_perimeter = qtyFt
    line.description = raw
    // Read the tile size when the name gives it. Left unset, the acoustic section treats the
    // ceiling as 2x4 — so "2x2 ACT" priced as 2x4 tiles until someone noticed.
    if (/2\s*[x×]\s*2/.test(s)) line.acst_tile_size = '2x2'
    else if (/2\s*[x×]\s*4/.test(s)) line.acst_tile_size = '2x4'
    out.push(wrap(line, line.acst_tile_size ? undefined : 'Verify tile size (2x2 vs 2x4).'))
    return out
  }

  // Insulation.
  if (/insulation|\bbatt\b/.test(s)) {
    const line = createQuoteLineItem('insulation', { location })
    line.quantity = qtySf > 0 ? qtySf : qtyFt
    line.description = raw
    out.push(wrap(line, 'Select insulation catalog item.'))
    return out
  }

  // FRP.
  if (/\bfrp\b/.test(s)) {
    const line = createQuoteLineItem('frp', { location })
    line.quantity = qtySf > 0 ? qtySf : qtyFt
    line.description = raw
    out.push(wrap(line, 'Select FRP catalog item.'))
    return out
  }

  // Everything else is drywall (walls or ceilings). Emit an RC line alongside
  // when the assembly calls for resilient channel.
  const twoLayer = /2\s*layers?|two layers?|double layer|2-layer/.test(s)
  // "10' RC 24" OC" is channel only. It used to produce a phantom drywall line too, with the
  // channel's LF entered as board SF.
  const rcOnly = hasRc(s) && !BOARD_WORDS.test(s)

  // A Togal 2-layer row carries the second layer in Quantity 2, which the caller has already
  // added into qtySf. One layer is the face, finished as usual; the other is the base, hung
  // and never finished. When Togal gave only one number, both layers are that number.
  const baseSf = twoLayer ? (ctx.layer2Sf > 0 ? ctx.layer2Sf : qtySf) : 0
  const faceSf = twoLayer && ctx.layer2Sf > 0 ? qtySf - ctx.layer2Sf : qtySf
  const board = guessBoardCatalogId(raw)

  if (!rcOnly) {
    const drywall = createQuoteLineItem('drywall', { location })
    drywall.quantity = faceSf > 0 ? faceSf : qtyFt
    drywall.catalog_id = board
    drywall.finish_scope_id = DEFAULT_FINISH_SCOPE_ID
    // "9' 1/2" walls" → 9 (ceilingHeights.ts). A ceiling has none; it takes its area's below.
    if (heightFt) drywall.height_ft = heightFt
    drywall.description = twoLayer ? `Face layer — ${raw}` : raw
    out.push(wrap(drywall))
  }

  if (twoLayer && !rcOnly && baseSf > 0) {
    // Hang Only, and the line's own finisher rate set to 0: a project finisher rate otherwise
    // outranks the scope, and the base layer would be priced as finished.
    const base = createQuoteLineItem('drywall', { location })
    base.quantity = baseSf
    base.catalog_id = board
    if (heightFt) base.height_ft = heightFt
    base.finish_scope_id = 'hang_only'
    base.custom_finisher_rate = 0
    base.override_reason = 'Base layer of a 2-layer assembly — hung, not finished'
    base.description = `Base layer — ${raw}`
    out.push(
      wrap(
        base,
        'Base layer added as Hang Only, finisher rate 0. If it gets fire-taped, switch it to Firetape Only and set the fire-tape rate.',
      ),
    )
  }

  if (hasRc(s) || /ceiling assembly/.test(s)) {
    const rc = createQuoteLineItem('rc_channel', { location })
    const warnings: string[] = []
    // One layer of channel, however many layers of board hang on it.
    const oneLayerSf = twoLayer ? faceSf : qtySf
    if (isCeiling(s)) {
      rc.rc_surface = 'ceiling'
      rc.quantity = oneLayerSf > 0 ? oneLayerSf : qtyFt // ceiling area drives channel LF internally
    } else {
      rc.rc_surface = 'wall'
      rc.quantity = qtyFt > 0 ? qtyFt : heightFt ? oneLayerSf / heightFt : oneLayerSf // wall LF
      if (heightFt) rc.rc_wall_height = heightFt
      if (qtyFt <= 0) warnings.push('RC wall LF derived from SF ÷ height — verify.')
    }
    const spacing = parseRcSpacingIn(raw)
    if (spacing) rc.rc_spacing_in = spacing
    if (ctx.defaultRcCatalogId) {
      rc.catalog_id = ctx.defaultRcCatalogId
    } else {
      warnings.push('Pick the RC product — labor and material are $0 until you do.')
    }
    rc.description = `RC channel — ${raw}`
    out.push(wrap(rc, warnings.length ? warnings.join(' ') : undefined))
  }

  return out
}

// ── file parsing ─────────────────────────────────────────────────────────────

const SKIP_CLASSIFICATION = /^(total|unassigned|grand total|subtotal)$/i

export interface ParseTakeoffOptionsV3 {
  /** Preselect this RC product on RC lines (the caller passes the catalog's only RC entry). */
  defaultRcCatalogId?: string
}

export async function parseTakeoffFileV3(
  file: File,
  options: ParseTakeoffOptionsV3 = {},
): Promise<TakeoffParseResultV3> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('No worksheet found in the file.')
  const ws = workbook.Sheets[sheetName]

  const rowsRaw = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[]
  const lines: ImportedTakeoffLine[] = []
  const warnings: string[] = []

  // Togal groups items under area header rows — a name with no quantities ("1st Floor") —
  // and closes each group with a Total row. The header becomes the location for the rows
  // below it; "Unassigned" means no area.
  let currentArea = DEFAULT_LOCATION

  rowsRaw.forEach((row, idx) => {
    const norm: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(row)) norm[normalizeHeader(k)] = v

    const classification = String(
      firstMatch(norm, ['classification', 'item', 'description', 'name', 'assembly']),
    ).trim()
    if (!classification) return

    const rawQty1 = firstMatch(norm, ['quantity_1', 'quantity1', 'qty_1', 'qty1', 'quantity'])
    const rawQty2 = firstMatch(norm, ['quantity_2', 'quantity2', 'qty_2', 'qty2'])
    const isHeader = String(rawQty1).trim() === '' && String(rawQty2).trim() === ''
    if (isHeader) {
      if (/^unassigned$/i.test(classification)) currentArea = DEFAULT_LOCATION
      else if (!SKIP_CLASSIFICATION.test(classification)) currentArea = classification
      return
    }
    if (SKIP_CLASSIFICATION.test(classification)) return

    const qty1 = toNum(rawQty1)
    const uom1 = firstMatch(norm, ['quantity1_uom', 'quantity_1_uom', 'uom_1', 'uom1', 'uom'])
    const qty2 = toNum(rawQty2)
    const uom2 = firstMatch(norm, ['quantity2_uom', 'quantity_2_uom', 'uom_2', 'uom2'])

    // Assign SF/LF by unit of measure; if a UOM is missing, infer (qty1 tends to be area).
    let qtySf = 0
    let qtyFt = 0
    if (isSqftUom(uom1)) qtySf += qty1
    else if (isFtUom(uom1)) qtyFt += qty1
    else if (qty1 > 0) qtySf += qty1 // default a bare qty1 to SF
    if (isSqftUom(uom2)) qtySf += qty2
    else if (isFtUom(uom2)) qtyFt += qty2

    if (qtySf <= 0 && qtyFt <= 0) return // nothing to price

    const rowLines = classifyToImportedLines(classification, qtySf, qtyFt, idx + 2, {
      location: currentArea,
      layer2Sf: isSqftUom(uom2) ? qty2 : 0,
      defaultRcCatalogId: options.defaultRcCatalogId,
    })
    lines.push(...rowLines)
    for (const l of rowLines) {
      if (l.warning) warnings.push(`"${classification}": ${l.warning}`)
    }
  })

  // Ceilings carry no height in their label; each takes its Togal area's wall height. Mark
  // breaks tall rooms out as their own area (2026-10-15), so an area's walls share one height.
  const heightened = withCeilingHeights(lines.map((l) => l.line))
  lines.forEach((l, i) => {
    l.line = heightened[i]!
  })

  if (lines.length === 0) {
    throw new Error(
      'No priced rows found. Expected a Classification column with SF/LF quantities (e.g. a Togal export).',
    )
  }

  return { lines, warnings, sheetName }
}
