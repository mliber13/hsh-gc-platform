/**
 * Q.C.4 parity harness — run via:
 *   PARITY_PAYLOAD_PATH=scripts/.parity-payload.tmp.json npm test -- --run scripts/quote-v3-parity.harness.test.ts
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { parseOrgDrywallCatalogs } from '../src/lib/drywall/catalogUtils'
import { computeQuoteV3Totals } from '../src/lib/drywall/quoteV3Math'
import { hydrateDrywallQuote } from '../src/lib/drywall/createEmptyDrywallQuote'
import { hydrateDrywallQuoteV3 } from '../src/lib/drywall/createEmptyDrywallQuoteV3'
import { buildV3FromV2 } from '../src/lib/drywall/convertQuoteV2ToV3'
import { stripQuantityFromCustomerPdfDescription } from '../src/lib/drywall/quoteV3PdfModel'
import { generateDrywallQuoteV3Pdf } from '../src/lib/drywallQuotePdfV3'
import {
  assertParityResults,
  printParityReport,
  runNativeV3AccessorySmoke,
  runParitySuite,
  type ParityProjectInput,
} from './lib/quoteV3ParityEngine'

const payloadPath = process.env.PARITY_PAYLOAD_PATH
if (!payloadPath) {
  throw new Error('Set PARITY_PAYLOAD_PATH to a JSON payload file')
}

const payload = JSON.parse(readFileSync(payloadPath, 'utf8')) as {
  projects: ParityProjectInput[]
  catalogsPayload: unknown
}

describe('quote v3 parity harness', () => {
  it('Path A and Path B match v2 baseline for all projects', () => {
    expect(payload.projects.length).toBeGreaterThan(0)
    const catalogs = parseOrgDrywallCatalogs(payload.catalogsPayload)
    const results = runParitySuite(payload.projects, payload.catalogsPayload)
    printParityReport(results)
    expect(results.length).toBe(payload.projects.length)
    assertParityResults(results)
    runNativeV3AccessorySmoke(catalogs)
  })

  it('hydrate round-trips pdf_settings', () => {
    const quote = hydrateDrywallQuoteV3({
      version: 3,
      pdf_settings: {
        payment_terms: 'Net 30 from invoice date',
        validity_days: 45,
        signature_lines: false,
        notes_for_customer: 'Call before ordering materials.',
      },
      lineItems: [],
      alternates: [],
    })
    expect(quote.pdf_settings?.payment_terms).toBe('Net 30 from invoice date')
    expect(quote.pdf_settings?.validity_days).toBe(45)
    expect(quote.pdf_settings?.signature_lines).toBe(false)
    expect(quote.pdf_settings?.notes_for_customer).toBe('Call before ordering materials.')
  })

  it('strips quantity prefixes from customer PDF line descriptions', () => {
    expect(
      stripQuantityFromCustomerPdfDescription(
        '5,000 sqft of 5/8" Type X — Level 4 Smooth',
      ),
    ).toBe('5/8" Type X — Level 4 Smooth')
    expect(stripQuantityFromCustomerPdfDescription('1200 LF RC Channel')).toBe('RC Channel')
    expect(stripQuantityFromCustomerPdfDescription('Basement Office')).toBe('Basement Office')
  })

  it('generates customer PDF blob for parity fixture project', async () => {
    const project = payload.projects.find((p) => p.name === 'McCamon')
    if (!project) return
    const catalogs = parseOrgDrywallCatalogs(payload.catalogsPayload)
    const quote = buildV3FromV2(hydrateDrywallQuote(project.v2Quote))
    const blob = await generateDrywallQuoteV3Pdf({
      project: {
        id: project.id,
        name: project.name,
        client: 'Test Client',
        address: '123 Main St',
      },
      quote,
      catalogs,
      company: {
        name: 'HSH Drywall',
        address: 'PO Box 102 Lisbon, OH 44432',
        phone: '330-614-1127',
        email: 'mark@hshdrywall.com',
      },
    })
    expect(blob.type).toBe('application/pdf')
    expect(blob.size).toBeGreaterThan(4000)
  })

  it('Stangl live DB envelope hydrates to v2 parity total', () => {
    const stanglPath = resolve(__dirname, 'fixtures/stangl-live-envelope.json')
    let raw: string
    try {
      raw = readFileSync(stanglPath, 'utf8')
    } catch {
      return // optional fixture from live diag
    }
    const catalogs = parseOrgDrywallCatalogs(payload.catalogsPayload)
    const quote = hydrateDrywallQuoteV3(JSON.parse(raw))
    const total = computeQuoteV3Totals(quote, catalogs).routine.total
    expect(total).toBeCloseTo(17957.5, 2)
  })
})
