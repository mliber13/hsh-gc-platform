/**
 * Renders the real v3 PDF and reads the text back out of it.
 *
 * The duration section shipped broken twice in a row — first absent entirely,
 * then carrying an internal assumptions note that rendered as unwrapped garbage
 * off the right edge of the page. Neither was catchable by testing the math, so
 * this asserts against the document that actually gets sent.
 */
import { describe, expect, it } from 'vitest'
import { inflateSync } from 'node:zlib'
import { generateDrywallQuoteV3Pdf } from '@/lib/drywallQuotePdfV3'
import { createEmptyDrywallQuoteV3 } from './createEmptyDrywallQuoteV3'
import { createDefaultDrywallCatalogSeeds } from './catalogSeeds'
import type { QuoteLineItem } from '@/types/drywall'

/** Text drawn on the page, one entry per Tj operator, in draw order. */
async function pdfTextLines(blob: Blob): Promise<string[]> {
  const buf = Buffer.from(await blob.arrayBuffer())
  const out: string[] = []
  let i = 0
  for (;;) {
    const start = buf.indexOf('stream', i)
    if (start < 0) break
    let a = start + 'stream'.length
    if (buf[a] === 0x0d) a++
    if (buf[a] === 0x0a) a++
    const end = buf.indexOf('endstream', a)
    if (end < 0) break
    const raw = buf.subarray(a, end)
    let text = ''
    try {
      text = inflateSync(raw).toString('latin1')
    } catch {
      text = raw.toString('latin1')
    }
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/\((.*)\)\s*Tj/)
      // jsPDF escapes parens inside a PDF string literal; put them back. Then
      // drop the leading bullet glyph so assertions read as the visible text.
      if (m) out.push(m[1].replace(/\\([()\\])/g, '$1').replace(/^[^\x20-\x7e]*\s*/, '').trim())
    }
    i = end + 'endstream'.length
  }
  return out
}

function drywallLine(location: string, qty: number): QuoteLineItem {
  return {
    id: `l_${location}`,
    type: 'drywall',
    location,
    description: `${location} board`,
    quantity: qty,
    waste_pct: 10,
  } as unknown as QuoteLineItem
}

async function renderPdf(quotePatch: Record<string, unknown> = {}) {
  const quote = {
    ...createEmptyDrywallQuoteV3(),
    quoteNumber: 'DW-2026-113',
    ceiling_finish: 'Knockdown Texture',
    wall_finish: 'Level 4 Smooth',
    bead_sticks: '90',
    lineItems: [
      drywallLine('1st Floor', 6200),
      drywallLine('2nd Floor', 4800),
      drywallLine('Basement', 2600),
    ],
    pdf_settings: { document_options: { showDurationSummary: true } },
    ...quotePatch,
  }
  const blob = await generateDrywallQuoteV3Pdf({
    project: { id: 'p1', name: 'Chagrin Falls - Costello', client: 'Dino Costello' },
    quote: quote as never,
    catalogs: createDefaultDrywallCatalogSeeds(),
    company: {},
  } as never)
  return pdfTextLines(blob)
}

describe('duration summary on the rendered v3 PDF', () => {
  it('prints the section with every step and a total', async () => {
    const lines = await renderPdf()
    const start = lines.indexOf('DRYWALL DURATION SUMMARY')
    expect(start).toBeGreaterThan(-1)

    const section = lines.slice(start + 1, lines.indexOf('TERMS & CONDITIONS'))
    expect(section.some((l) => l.includes('Prep/Scaffold & Stock:'))).toBe(true)
    expect(section.some((l) => l.includes('Hang:'))).toBe(true)
    expect(section.some((l) => l.includes('Finish (Tape, Bed, Skim, Texture, Sand):'))).toBe(true)
    expect(section.some((l) => l.includes('Cleanout:'))).toBe(true)
    expect(section.some((l) => /Total: \d+ working days/.test(l))).toBe(true)
  })

  it('keeps the internal estimating assumptions off a customer document', async () => {
    const lines = await renderPdf()
    const doc = lines.join(' ')
    // This note names the crew assumption and the sqft texture threshold. It
    // belongs in the estimator's sidebar, not on the quote — and as a single
    // long unwrapped string it ran off the page.
    expect(doc).not.toContain('Single crew, no acceleration')
    expect(doc).not.toContain('Adjusted by the estimator')
  })

  it('prints the estimator adjusted days, not the calculated ones', async () => {
    const auto = await renderPdf()
    const autoHang = auto.find((l) => l.startsWith('Hang:'))
    expect(autoHang).not.toBe('Hang: 8 days')

    const adjusted = await renderPdf({ duration_overrides: { hang: 8, cleanout: 0 } })
    expect(adjusted).toContain('Hang: 8 days')
    expect(adjusted).toContain('Cleanout: 0 days')

    const total = adjusted.find((l) => l.startsWith('Total:'))
    const steps = adjusted
      .slice(
        adjusted.indexOf('DRYWALL DURATION SUMMARY') + 1,
        adjusted.findIndex((l) => l.startsWith('Total:')),
      )
      .map((l) => Number(l.match(/: (\d+) days?$/)?.[1] ?? 0))
    expect(total).toBe(`Total: ${steps.reduce((a, b) => a + b, 0)} working days`)
  })

  it('stays off the PDF when the option is not switched on', async () => {
    const lines = await renderPdf({ pdf_settings: { document_options: {} } })
    expect(lines).not.toContain('DRYWALL DURATION SUMMARY')
  })
})
