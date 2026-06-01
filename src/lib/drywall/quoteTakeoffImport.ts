// @ts-nocheck — ported from QuoteStage.jsx Excel/CSV import helpers
import * as XLSX from 'xlsx'
import { generateQuoteId } from './drywallQuoteHelpers'
import type { QuoteBreakdown } from '@/types/drywall'

export type ImportPreviewRow = {
  row: number
  floor: string
  classification: string
  qtySf: number
  qtyFt: number
  kind: string
  mapped: Record<string, unknown>
  source: string
}

const normalizeHeader = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '_')
const toNum = (v) => {
  if (v == null || v === '') return 0
  const n = parseFloat(String(v).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}
const firstMatch = (obj, keys) => {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k]
  }
  return ''
}
const parseSizeGaugeHeight = (classification) => {
  const raw = String(classification || '')
  const s = raw.toLowerCase()
  let size = '3.625'
  if (s.includes('6"') || s.includes('6 in')) size = '6'
  else if (s.includes('3 5/8') || s.includes('3-5/8')) size = '3.625'
  else if (s.includes('2 1/2') || s.includes('2-1/2')) size = '2.5'
  let gauge = '20'
  if (s.includes('18')) gauge = '18'
  else if (s.includes('25')) gauge = '25'
  const hMatch = raw.match(/(\d+(\.\d+)?)\s*'/)
  const height = hMatch ? hMatch[1] : ''
  return { size, gauge, height }
}
const parseQuantitiesFromText = (text) => {
  const s = String(text || '')
  const out = { sf: 0, ft: 0 }
  const re = /([0-9][0-9,]*\.?[0-9]*)\s*(SF|FT)\b/gi
  let m
  while ((m = re.exec(s)) !== null) {
    const n = toNum(m[1])
    const u = String(m[2] || '').toUpperCase()
    if (u === 'SF') out.sf += n
    if (u === 'FT') out.ft += n
  }
  return out
}
const isSqftUom = (uom) => {
  const s = String(uom || '').trim().toUpperCase().replace(/\s+/g, '')
  return s === 'SF' || s === 'SQFT' || s === 'S.F.' || s === 'S.F'
}
const isFtUom = (uom) => {
  const s = String(uom || '').trim().toUpperCase().replace(/\s+/g, '')
  return s === 'FT' || s === 'LF' || s === 'LINFT' || s === 'L.F.' || s === 'L.F'
}
const nearlyEqual = (a, b, tolerance = 0.001) => {
  const x = toNum(a)
  const y = toNum(b)
  if (x <= 0 || y <= 0) return false
  const scale = Math.max(1, Math.abs(x), Math.abs(y))
  return Math.abs(x - y) <= tolerance * scale
}
const dedupeSummedQty = (values) => {
  const positives = (Array.isArray(values) ? values : []).map((v) => toNum(v)).filter((v) => v > 0)
  if (positives.length === 0) return 0
  if (positives.length === 1) return positives[0]
  if (positives.every((v) => nearlyEqual(v, positives[0]))) return positives[0]
  return positives.reduce((sum, v) => sum + v, 0)
}
const classifyRow = (classification, qtySf, qtyFt) => {
  const c = String(classification || '').toLowerCase()
  const mapped = {}
  if (c.includes('ceiling assembly')) {
    mapped.sqft = qtySf > 0 ? qtySf : 0
    mapped.rcChannelCeilingSqft = qtySf > 0 ? qtySf : 0
    mapped._kind = 'drywall_sqft'
  } else if (c.includes('suspended drywall grid')) {
    mapped.sqft = qtySf > 0 ? qtySf : 0
    mapped.suspendedGridSqft = qtySf > 0 ? qtySf : 0
    mapped.suspendedGridPerimeter = qtyFt > 0 ? qtyFt : ''
    mapped._kind = 'suspended_grid'
  } else if (c.includes('metal stud')) {
    const info = parseSizeGaugeHeight(classification)
    mapped.metalStudWallLf = qtyFt > 0 ? qtyFt : 0
    mapped.metalStudWallHeight = info.height
    mapped.metalStudSize = info.size
    mapped.metalStudGauge = info.gauge
    mapped._kind = 'metal_stud'
  } else if (c.includes('rc channel')) {
    mapped.rcChannelWallLinearFt = qtyFt > 0 ? qtyFt : 0
    const hMatch = String(classification || '').match(/(\d+(\.\d+)?)\s*'/)
    mapped.rcChannelWallHeight = hMatch ? hMatch[1] : ''
    mapped._kind = 'rc_channel'
  } else if (c.includes('type x') || c.includes(' mr') || c.startsWith('mr ')) {
    mapped.sqft = qtySf > 0 ? qtySf : 0
    mapped._kind = 'drywall_sqft'
  } else if (c.includes('total')) {
    mapped._kind = 'floor_total'
  } else {
    mapped._kind = 'unknown'
  }
  return mapped
}

function parsePreviewRows(rows, source = 'objects') {
  const previewRows = []
  const warnings = []
  let currentFloor = ''
  rows.forEach((r, idx) => {
    const floor = firstMatch(r, ['floor_name', 'floor', 'section', 'level'])
    const classification = firstMatch(r, ['classification', 'item', 'description', 'name'])
    const qty1 = toNum(firstMatch(r, ['quantity_1', 'quantity1', 'qty_1', 'qty1', 'quantity']))
    const uom1 = String(firstMatch(r, ['quantity1_uom', 'quantity_1_uom', 'uom_1', 'uom1', 'uom'])).toUpperCase()
    const qty2 = toNum(firstMatch(r, ['quantity_2', 'quantity2', 'qty_2', 'qty2']))
    const uom2 = String(firstMatch(r, ['quantity2_uom', 'quantity_2_uom', 'uom_2', 'uom2'])).toUpperCase()
    if (floor) currentFloor = String(floor).trim()
    if (!currentFloor || !classification) return
    const txtParsed = parseQuantitiesFromText(
      [classification, qty1, uom1, qty2, uom2, r?._text_sf, r?._text_ft].join(' '),
    )
    const qtySf = dedupeSummedQty([
      isSqftUom(uom1) ? qty1 : 0,
      isSqftUom(uom2) ? qty2 : 0,
      toNum(r?._text_sf),
      txtParsed.sf,
    ])
    const qtyFt = dedupeSummedQty([
      isFtUom(uom1) ? qty1 : 0,
      isFtUom(uom2) ? qty2 : 0,
      toNum(r?._text_ft),
      txtParsed.ft,
    ])
    const mapped = classifyRow(classification, qtySf, qtyFt)
    previewRows.push({
      row: idx + 2,
      floor: currentFloor,
      classification: String(classification),
      qtySf,
      qtyFt,
      kind: mapped._kind,
      mapped,
      source,
    })
    if (mapped._kind === 'unknown') warnings.push(`Row ${idx + 2}: Unmapped classification "${classification}"`)
  })
  return { previewRows, warnings }
}

export async function parseTakeoffFile(
  file: File,
): Promise<{ previewRows: ImportPreviewRow[]; warnings: string[] }> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('No worksheet found.')
  const ws = workbook.Sheets[sheetName]
  const isFloorHeader = (txt) => {
    const t = String(txt || '').trim().toLowerCase()
    if (!t) return false
    return /\b(floor|mezzanine|basement|roof|penthouse|podium)\b/.test(t)
  }

  const rowsRaw = XLSX.utils.sheet_to_json(ws, { defval: '' })
  const normalizedRows = Array.isArray(rowsRaw)
    ? rowsRaw.map((row) => {
        const n = {}
        Object.entries(row).forEach(([k, v]) => {
          n[normalizeHeader(k)] = v
        })
        return n
      })
    : []
  let { previewRows, warnings } = parsePreviewRows(normalizedRows, 'headered')

  if (previewRows.length === 0) {
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    const fallbackRows = []
    let currentFloor = ''
    ;(Array.isArray(aoa) ? aoa : []).forEach((row) => {
      const cells = Array.isArray(row) ? row.map((c) => String(c ?? '').trim()) : []
      if (cells.length === 0) return
      const textCells = cells.filter(Boolean)
      if (textCells.length === 0) return
      const c0 = textCells[0] || ''
      if (isFloorHeader(c0) && textCells.length <= 2) {
        currentFloor = c0
        return
      }
      if (!currentFloor) return
      const classification = c0
      const q1 = toNum(cells[1])
      const u1 = String(cells[2] || '').toUpperCase()
      const q2 = toNum(cells[3])
      const u2 = String(cells[4] || '').toUpperCase()
      const txtParsed = parseQuantitiesFromText(cells.join(' '))
      fallbackRows.push({
        floor_name: currentFloor,
        classification,
        quantity_1: q1 || txtParsed.sf || txtParsed.ft || 0,
        uom_1: u1,
        quantity_2: q2,
        uom_2: u2,
        _text_sf: txtParsed.sf,
        _text_ft: txtParsed.ft,
      })
    })
    const parsedFallback = parsePreviewRows(fallbackRows, 'fallback')
    previewRows = parsedFallback.previewRows
    warnings = parsedFallback.warnings
  }

  if (previewRows.length === 0) throw new Error('No mappable rows found. Check columns and data.')
  return { previewRows, warnings }
}

export function applyImportPreviewToBreakdowns(
  previewRows: ImportPreviewRow[],
  replaceExisting: boolean,
  existing: QuoteBreakdown[],
): {
  breakdowns: QuoteBreakdown[]
  flags: { includeSuspendedGrid: boolean; includeMetalStudFraming: boolean; includeRcChannel: boolean }
} {
  const byFloor = new Map()
  previewRows.forEach((r) => {
    if (!byFloor.has(r.floor)) {
      byFloor.set(r.floor, {
        id: generateQuoteId(),
        description: r.floor,
        sqft: '',
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
      })
    }
    const b = byFloor.get(r.floor)
    const m = r.mapped || {}
    if (m._kind === 'drywall_sqft') {
      b.sqft = String((toNum(b.sqft) || 0) + (toNum(m.sqft) || 0))
      if (toNum(m.rcChannelCeilingSqft) > 0) {
        b.rcChannelCeilingSqft = String((toNum(b.rcChannelCeilingSqft) || 0) + toNum(m.rcChannelCeilingSqft))
      }
    } else if (m._kind === 'suspended_grid') {
      if (toNum(m.sqft) > 0) b.sqft = String((toNum(b.sqft) || 0) + toNum(m.sqft))
      b.suspendedGridSqft = String((toNum(b.suspendedGridSqft) || 0) + (toNum(m.suspendedGridSqft) || 0))
      b.suspendedGridPerimeter = String((toNum(b.suspendedGridPerimeter) || 0) + (toNum(m.suspendedGridPerimeter) || 0))
    } else if (m._kind === 'metal_stud') {
      const wallLf = toNum(m.metalStudWallLf)
      const wallHeight = m.metalStudWallHeight ? String(m.metalStudWallHeight) : ''
      const size = m.metalStudSize ? String(m.metalStudSize) : '3.625'
      const gauge = m.metalStudGauge ? String(m.metalStudGauge) : '20'
      const spacing = String(b.metalStudSpacing || '16')
      const tracksPerRun = String(b.metalStudTracksPerRun || '2')
      if (wallLf > 0) {
        if (!Array.isArray(b.metalStudEntries)) b.metalStudEntries = []
        const existingEntry = b.metalStudEntries.find(
          (e) =>
            String(e.size || '') === size &&
            String(e.gauge || '') === gauge &&
            String(e.wallHeight || '') === wallHeight &&
            String(e.spacing || spacing) === spacing &&
            String(e.tracksPerRun || tracksPerRun) === tracksPerRun,
        )
        if (existingEntry) {
          existingEntry.wallLf = String((toNum(existingEntry.wallLf) || 0) + wallLf)
        } else {
          b.metalStudEntries.push({
            id: generateQuoteId(),
            wallLf: String(wallLf),
            wallHeight,
            spacing,
            tracksPerRun,
            size,
            gauge,
          })
        }
        const totalImportedWallLf = (b.metalStudEntries || []).reduce((sum, e) => sum + (toNum(e.wallLf) || 0), 0)
        const first = b.metalStudEntries[0]
        if (first) {
          b.metalStudWallLf = String(totalImportedWallLf || '')
          b.metalStudWallHeight = String(first.wallHeight || '')
          b.metalStudSize = String(first.size || '3.625')
          b.metalStudGauge = String(first.gauge || '20')
        }
      }
    } else if (m._kind === 'rc_channel') {
      b.rcChannelWallLinearFt = String((toNum(b.rcChannelWallLinearFt) || 0) + (toNum(m.rcChannelWallLinearFt) || 0))
      if (!b.rcChannelWallHeight && m.rcChannelWallHeight) b.rcChannelWallHeight = String(m.rcChannelWallHeight)
    }
  })

  const imported = Array.from(byFloor.values())
  const breakdowns = replaceExisting ? imported : [...existing, ...imported]
  return {
    breakdowns,
    flags: {
      includeSuspendedGrid: previewRows.some((r) => r.kind === 'suspended_grid'),
      includeMetalStudFraming: previewRows.some((r) => r.kind === 'metal_stud'),
      includeRcChannel: previewRows.some((r) => r.kind === 'rc_channel'),
    },
  }
}
