// ============================================================================
// Drywall quote v3 PDF — independent from drywallQuotePdf.ts (Section 0 rule)
// Customer-friendly detail level (a): line total only, no internal breakdown.
// ============================================================================

import { addDays, format } from 'date-fns'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  AUTO_TABLE_BASE,
  AUTO_TABLE_FOOT,
  AUTO_TABLE_HEAD,
  DW_BLUE,
  DW_GRAY,
  DW_LIGHT_GRAY,
  DW_PAGE,
  DW_RED,
  DW_TABLE_STRIPE,
  DW_TEXT,
  loadDrywallPdfLogo,
  setDrawRgb,
  setTextRgb,
  type DrywallPdfLogo,
} from '@/lib/drywall/drywallQuotePdfTheme'
import { drywallQuoteNumberLabel } from '@/lib/drywall/drywallQuoteNumber'
import { formatQuoteMoney } from '@/lib/drywall/quoteV3Math'
import {
  buildQuoteV3PdfAlternateBlocks,
  buildQuoteV3PdfLineRows,
  groupPdfRowsByLocationForDisplay,
  groupPdfRowsByTrade,
  sanitizePdfFilenamePart,
  type QuoteV3PdfLineRow,
} from '@/lib/drywall/quoteV3PdfModel'
import { resolveQuoteV3PdfSettings, buildQuoteV3PdfTermsLines } from '@/lib/drywall/quoteV3PdfSettings'
import { resolveQuotePdfSettings } from '@/lib/drywall/quotePdfSettings'
import { computeQuoteV3Totals, type QuoteV3MarkupBreakdown } from '@/lib/drywall/quoteV3Math'
import { drawMarkdownScope } from '@/lib/drywall/markdownToPdf'
import { quoteScopeBlocksFromV3, type ScopePdfBlock } from '@/lib/drywall/structuredScopePdf'
import type { DrywallQuoteV3 } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'

export interface QuoteV3PdfInput {
  project: {
    id: string
    name: string
    client: string
    address: string
  }
  quote: DrywallQuoteV3
  catalogs: OrgDrywallCatalogs
  company: {
    name: string
    address: string
    phone: string
    email: string
  }
}

const DEFAULT_COMPANY = {
  name: 'HSH Drywall',
  address: 'PO Box 102 Lisbon, OH 44432',
  phone: '330-614-1127',
  email: 'mark@hshdrywall.com',
}

const SP = {
  sectionTop: 20,
  sectionBottom: 15,
  tableTop: 10,
  signatureTop: 24,
  signatureColGap: 28,
  specLine: 13,
  specIndent: 10,
  bulletIndent: 10,
  subsectionTop: 8,
  subsectionAfterHeading: 10,
  addonBlockTop: 12,
  addonLine: 14,
} as const

const SUBSECTION_SIZE = 11
const BODY_SIZE = 10

type PdfCtx = {
  doc: jsPDF
  y: number
  pageW: number
  pageH: number
  maxW: number
  margin: number
  marginY: number
  logo: DrywallPdfLogo | null
  footerLabel: string
}

function ensureRoom(ctx: PdfCtx, h: number) {
  if (ctx.y + h <= ctx.pageH - DW_PAGE.bottomReserve) return
  ctx.doc.addPage()
  ctx.y = ctx.marginY
}

function drawHeaderBand(ctx: PdfCtx, company: QuoteV3PdfInput['company']) {
  const { doc } = ctx
  const top = ctx.y
  if (ctx.logo) {
    const w = 120
    const h = (w / ctx.logo.naturalW) * ctx.logo.naturalH
    try {
      doc.addImage(ctx.logo.dataUrl, 'PNG', ctx.margin, top, w, h)
    } catch {
      /* ignore */
    }
  }
  const contactX = ctx.pageW - ctx.margin
  let ty = top + 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  setTextRgb(doc, DW_BLUE)
  doc.text(company.name, contactX, ty, { align: 'right' })
  ty += 18
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setTextRgb(doc, DW_GRAY)
  doc.text(company.address, contactX, ty, { align: 'right' })
  ty += 12
  doc.text(`Phone: ${company.phone} | Email: ${company.email}`, contactX, ty, {
    align: 'right',
  })
  setTextRgb(doc, DW_TEXT)
  const bandBottom = Math.max(
    top + (ctx.logo ? (120 / ctx.logo.naturalW) * ctx.logo.naturalH : 0),
    ty + 4,
  )
  ctx.y = bandBottom + 8
  setDrawRgb(doc, DW_RED)
  doc.setLineWidth(3)
  doc.line(ctx.margin, ctx.y, ctx.pageW - ctx.margin, ctx.y)
  ctx.y += 16
}

function drawMetadataBar(
  ctx: PdfCtx,
  quoteNumber: string,
  projectName: string,
  validUntil: Date | null,
) {
  const { doc } = ctx
  const issue = new Date()
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setTextRgb(doc, DW_TEXT)
  doc.text(`Quote Number: ${quoteNumber}`, ctx.margin, ctx.y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const centerX = ctx.pageW / 2
  doc.text(`Issue Date: ${format(issue, 'MMM d, yyyy')}`, centerX, ctx.y, {
    align: 'center',
  })
  if (validUntil) {
    doc.text(`Valid Until: ${format(validUntil, 'MMM d, yyyy')}`, ctx.pageW - ctx.margin, ctx.y, {
      align: 'right',
    })
  }
  ctx.y += 16
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  setTextRgb(doc, DW_BLUE)
  doc.text('PROJECT', ctx.margin, ctx.y)
  ctx.y += 14
  doc.setFont('helvetica', 'normal')
  setTextRgb(doc, DW_TEXT)
  const projectLines = [projectName].filter(Boolean)
  const wrapped = doc.splitTextToSize(projectLines.join('\n'), ctx.maxW)
  doc.text(wrapped, ctx.margin, ctx.y)
  ctx.y += wrapped.length * 12 + 8
}

function drawPreparedFor(ctx: PdfCtx, client: string) {
  ensureRoom(ctx, 60)
  docSetSectionLabel(ctx, 'PREPARED FOR')
  const body = client.trim() || '[Not yet specified]'
  ctx.doc.setFont('helvetica', client.trim() ? 'normal' : 'italic')
  ctx.doc.setFontSize(10)
  setTextRgb(ctx.doc, client.trim() ? DW_TEXT : DW_GRAY)
  const lines = ctx.doc.splitTextToSize(body, ctx.maxW / 2)
  ctx.doc.text(lines, ctx.margin, ctx.y)
  ctx.y += lines.length * 12 + 8
  setTextRgb(ctx.doc, DW_TEXT)
}

function docSetSectionLabel(ctx: PdfCtx, label: string) {
  ctx.doc.setFont('helvetica', 'bold')
  ctx.doc.setFontSize(9)
  setTextRgb(ctx.doc, DW_BLUE)
  ctx.doc.text(label, ctx.margin, ctx.y)
  ctx.y += 14
}

function drawSectionTitle(
  ctx: PdfCtx,
  title: string,
  opts?: { skipTopGap?: boolean; keepWithNext?: number },
) {
  if (!opts?.skipTopGap) ctx.y += SP.sectionTop
  const keepWith = opts?.keepWithNext ?? 0
  ensureRoom(ctx, 28 + keepWith)
  ctx.doc.setFont('helvetica', 'bold')
  ctx.doc.setFontSize(12)
  setTextRgb(ctx.doc, DW_RED)
  ctx.doc.text(title, ctx.margin, ctx.y)
  ctx.y += 16
}

function drawWrappedLines(ctx: PdfCtx, wrapped: string | string[], x: number, lineStep: number) {
  const lines = Array.isArray(wrapped) ? wrapped : [wrapped]
  for (const line of lines) {
    ensureRoom(ctx, lineStep + 2)
    ctx.doc.text(line, x, ctx.y)
    ctx.y += lineStep
  }
}

function drawScopeBlock(ctx: PdfCtx, block: ScopePdfBlock) {
  if (block.plain) {
    ctx.y += SP.addonBlockTop
  } else if (block.heading) {
    ctx.y += SP.subsectionTop
  }

  const lineStep = block.plain ? SP.addonLine : SP.specLine

  if (block.heading) {
    ensureRoom(ctx, 20 + lineStep)
    ctx.doc.setFont('helvetica', 'bold')
    ctx.doc.setFontSize(SUBSECTION_SIZE)
    setTextRgb(ctx.doc, DW_BLUE)
    ctx.doc.text(block.heading, ctx.margin + SP.specIndent, ctx.y)
    ctx.y += SUBSECTION_SIZE + SP.subsectionAfterHeading
  }

  ctx.doc.setFont('helvetica', 'normal')
  ctx.doc.setFontSize(BODY_SIZE)
  setTextRgb(ctx.doc, DW_TEXT)

  const textIndent = block.plain ? SP.specIndent : SP.specIndent + SP.bulletIndent

  for (const raw of block.lines) {
    const prefix = block.plain ? '' : '• '
    const wrapped = ctx.doc.splitTextToSize(`${prefix}${raw}`, ctx.maxW - textIndent - 4)
    drawWrappedLines(ctx, wrapped, ctx.margin + textIndent, lineStep)
    if (block.plain) ctx.y += 4
  }
}

function drawStructuredScopeOfWork(ctx: PdfCtx, quote: DrywallQuoteV3) {
  drawSectionTitle(ctx, 'SCOPE OF WORK', { skipTopGap: true, keepWithNext: 48 })
  ctx.y += 4

  const customText = String(quote.custom_scope_of_work ?? '').trim()
  if (quote.use_custom_scope_of_work && customText) {
    drawMarkdownScope(
      ctx,
      String(quote.custom_scope_of_work ?? ''),
      {
        specLine: SP.specLine,
        specIndent: SP.specIndent,
        bulletIndent: SP.bulletIndent,
        subsectionTop: SP.subsectionTop,
        subsectionAfterHeading: SP.subsectionAfterHeading,
        bottomReserve: DW_PAGE.bottomReserve,
      },
      {
        bodySize: BODY_SIZE,
        h1Size: 12,
        h2Size: SUBSECTION_SIZE,
        h3Size: BODY_SIZE,
      },
    )
    ctx.y += SP.sectionBottom
    return
  }

  for (const block of quoteScopeBlocksFromV3(quote)) {
    drawScopeBlock(ctx, block)
  }
  ctx.y += SP.sectionBottom
}

function drawTradeSection(
  ctx: PdfCtx,
  label: string,
  rows: ReturnType<typeof buildQuoteV3PdfLineRows>,
  subtotal: number,
) {
  ensureRoom(ctx, 48)
  ctx.doc.setFont('helvetica', 'bold')
  ctx.doc.setFontSize(11)
  setTextRgb(ctx.doc, DW_BLUE)
  ctx.doc.text(label, ctx.margin, ctx.y)
  ctx.y += 10

  drawLocationLineTotalTable(ctx, rows, {
    footLabel: `${label} subtotal`,
    footTotal: subtotal,
  })
}

function drawLocationLineTotalTable(
  ctx: PdfCtx,
  rows: QuoteV3PdfLineRow[],
  opts: { footLabel: string; footTotal: number },
) {
  const displayRows = groupPdfRowsByLocationForDisplay(rows)
  const body = displayRows.map((r) => [r.location, formatQuoteMoney(r.sellTotal)])

  autoTable(ctx.doc, {
    startY: ctx.y,
    head: [['Location', 'Line Total']],
    body,
    foot: [[opts.footLabel, formatQuoteMoney(opts.footTotal)]],
    theme: 'striped',
    showHead: 'everyPage',
    headStyles: AUTO_TABLE_HEAD,
    footStyles: AUTO_TABLE_FOOT,
    styles: AUTO_TABLE_BASE,
    alternateRowStyles: { fillColor: DW_TABLE_STRIPE },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 96 },
    },
    margin: { left: ctx.margin, right: ctx.margin },
  })
  const last = (ctx.doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
  ctx.y = (last?.finalY ?? ctx.y) + SP.tableTop
  setTextRgb(ctx.doc, DW_TEXT)
}

function drawBaseBidTotals(
  ctx: PdfCtx,
  routine: QuoteV3MarkupBreakdown,
  documentOptions: ReturnType<typeof resolveQuotePdfSettings>,
) {
  drawSectionTitle(ctx, 'BASE BID TOTALS')

  type TableCell = string | { content: string; styles?: Record<string, unknown> }
  const body: TableCell[][] = []

  if (documentOptions.showTaxesSeparately && routine.salesTaxAmount > 0) {
    body.push(['Subtotal (before tax):', formatQuoteMoney(routine.total - routine.salesTaxAmount)])
    body.push(['Sales Tax:', formatQuoteMoney(routine.salesTaxAmount)])
  }

  if (documentOptions.showCostBreakdown && !documentOptions.includeTradeCostBreakdown) {
    const materialsTotal = routine.materialSubtotal + routine.accessoriesSubtotal
    const laborTotal =
      routine.hangerLaborSubtotal +
      routine.finisherLaborSubtotal +
      routine.componentLaborSubtotal +
      routine.cleanupTotal
    body.push([
      { content: 'Materials:', styles: { cellPadding: { top: 4, right: 6, bottom: 4, left: 12 } } },
      { content: formatQuoteMoney(materialsTotal), styles: { halign: 'right' } },
    ])
    body.push([
      { content: 'Labor:', styles: { cellPadding: { top: 4, right: 6, bottom: 4, left: 12 } } },
      { content: formatQuoteMoney(laborTotal), styles: { halign: 'right' } },
    ])
  }

  autoTable(ctx.doc, {
    startY: ctx.y,
    body: body.length > 0 ? body : undefined,
    foot: [['Total Base Bid', formatQuoteMoney(routine.total)]],
    theme: body.length > 0 ? 'striped' : 'plain',
    footStyles: { ...AUTO_TABLE_FOOT, fontSize: 12 },
    styles: { ...AUTO_TABLE_BASE, fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 110 },
    },
    margin: { left: ctx.margin, right: ctx.margin },
  })
  const last = (ctx.doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
  ctx.y = (last?.finalY ?? ctx.y) + 16
}

function drawAlternatesSection(
  ctx: PdfCtx,
  quote: DrywallQuoteV3,
  catalogs: OrgDrywallCatalogs,
  totals: ReturnType<typeof computeQuoteV3Totals>,
) {
  if (!quote.alternates.length) return
  const blocks = buildQuoteV3PdfAlternateBlocks(quote, catalogs, totals)

  drawSectionTitle(ctx, 'CUSTOMER ALTERNATES')
  ctx.doc.setFont('helvetica', 'normal')
  ctx.doc.setFontSize(9)
  setTextRgb(ctx.doc, DW_GRAY)
  const hasDeduct = blocks.some((b) => b.pricingMode === 'deduct')
  const intro = hasDeduct
    ? "The following options are available at customer's request. Each option adds to or deducts from the base bid as noted."
    : "The following options are available at customer's request. Pricing additive to base bid."
  const introLines = ctx.doc.splitTextToSize(intro, ctx.maxW)
  ctx.doc.text(introLines, ctx.margin, ctx.y)
  ctx.y += introLines.length * 11 + 10
  setTextRgb(ctx.doc, DW_TEXT)

  for (const block of blocks) {
    const { alternate: alt, totalAdd, pricingMode, rows } = block
    const deltaVerb = pricingMode === 'deduct' ? 'Deduct' : 'Add'
    const deltaAmount = Math.abs(totalAdd)
    ensureRoom(ctx, 56)
    ctx.doc.setFont('helvetica', 'bold')
    ctx.doc.setFontSize(11)
    setTextRgb(ctx.doc, DW_TEXT)
    ctx.doc.text(`${alt.name || 'Alternate'} (${deltaVerb})`, ctx.margin, ctx.y)
    ctx.y += 14
    if (alt.description?.trim()) {
      ctx.doc.setFont('helvetica', 'normal')
      ctx.doc.setFontSize(10)
      setTextRgb(ctx.doc, DW_GRAY)
      const desc = ctx.doc.splitTextToSize(alt.description.trim(), ctx.maxW)
      ctx.doc.text(desc, ctx.margin, ctx.y)
      ctx.y += desc.length * 12 + 4
      setTextRgb(ctx.doc, DW_TEXT)
    }
    if (rows.length > 0) {
      drawLocationLineTotalTable(ctx, rows, {
        footLabel: `${alt.name || 'Alternate'} ${deltaVerb.toLowerCase()}`,
        footTotal: pricingMode === 'deduct' ? -deltaAmount : deltaAmount,
      })
    } else {
      ctx.doc.setFont('helvetica', 'bold')
      ctx.doc.setFontSize(10)
      ctx.doc.text(
        `${deltaVerb}: ${formatQuoteMoney(deltaAmount)}`,
        ctx.pageW - ctx.margin,
        ctx.y,
        { align: 'right' },
      )
      ctx.y += 16
    }
    ctx.y += 8
  }
  ctx.y += SP.sectionBottom
}

function drawFooterTerms(
  ctx: PdfCtx,
  pdfSettings: ReturnType<typeof resolveQuoteV3PdfSettings>,
  validUntil: Date | null,
) {
  drawSectionTitle(ctx, 'TERMS & CONDITIONS')
  const lines = buildQuoteV3PdfTermsLines(pdfSettings, validUntil)

  ctx.doc.setFont('helvetica', 'normal')
  ctx.doc.setFontSize(10)
  setTextRgb(ctx.doc, DW_TEXT)
  for (const item of lines) {
    const wrapped = ctx.doc.splitTextToSize(`• ${item}`, ctx.maxW - 8)
    for (const line of wrapped) {
      ensureRoom(ctx, 14)
      ctx.doc.text(line, ctx.margin + 4, ctx.y)
      ctx.y += 12
    }
    ctx.y += 4
  }
}

function drawSignatureBlock(ctx: PdfCtx, companyName: string, customerName?: string) {
  const blockH = 100
  ensureRoom(ctx, blockH + SP.signatureTop)
  ctx.y += SP.signatureTop
  const colW = (ctx.maxW - SP.signatureColGap) / 2
  const xL = ctx.margin
  const xR = ctx.margin + colW + SP.signatureColGap
  const y0 = ctx.y
  ctx.doc.setFont('helvetica', 'bold')
  ctx.doc.setFontSize(10)
  setTextRgb(ctx.doc, DW_TEXT)
  ctx.doc.text('Customer', xL, y0)
  ctx.doc.text(companyName, xR, y0)
  if (customerName) {
    ctx.doc.setFont('helvetica', 'normal')
    ctx.doc.setFontSize(9)
    setTextRgb(ctx.doc, DW_GRAY)
    ctx.doc.text(customerName, xL, y0 + 14)
  }
  let y = y0 + (customerName ? 32 : 18)
  setDrawRgb(ctx.doc, DW_LIGHT_GRAY)
  ctx.doc.line(xL, y, xL + colW, y)
  ctx.doc.line(xR, y, xR + colW, y)
  y += 14
  ctx.doc.setFont('helvetica', 'normal')
  ctx.doc.setFontSize(9)
  setTextRgb(ctx.doc, DW_GRAY)
  ctx.doc.text('Signature', xL, y)
  ctx.doc.text('Signature', xR, y)
  y += 20
  ctx.doc.line(xL, y, xL + colW, y)
  ctx.doc.line(xR, y, xR + colW, y)
  y += 14
  ctx.doc.text('Printed name', xL, y)
  ctx.doc.text('Printed name', xR, y)
  y += 20
  ctx.doc.line(xL, y, xL + colW, y)
  ctx.doc.line(xR, y, xR + colW, y)
  y += 14
  ctx.doc.text('Date', xL, y)
  ctx.doc.text('Date', xR, y)
  ctx.y = y + 24
}

function drawFooterAllPages(ctx: PdfCtx) {
  const total = ctx.doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    ctx.doc.setPage(i)
    ctx.doc.setFont('helvetica', 'normal')
    ctx.doc.setFontSize(8)
    setTextRgb(ctx.doc, DW_GRAY)
    ctx.doc.text(ctx.footerLabel, ctx.margin, DW_PAGE.footerY)
    ctx.doc.text(`Page ${i} of ${total}`, ctx.pageW - ctx.margin, DW_PAGE.footerY, {
      align: 'right',
    })
    setTextRgb(ctx.doc, DW_TEXT)
  }
}

function renderDrywallQuoteV3Pdf(input: QuoteV3PdfInput, logo: DrywallPdfLogo | null): Blob {
  const company = { ...DEFAULT_COMPANY, ...input.company }
  const pdfSettings = resolveQuoteV3PdfSettings(input.quote.pdf_settings)
  const documentOptions = pdfSettings.documentOptions
  const totals = computeQuoteV3Totals(input.quote, input.catalogs)
  const lineRows = buildQuoteV3PdfLineRows(
    input.quote,
    input.catalogs,
    documentOptions.showTaxesSeparately,
  )
  const tradeGroups = groupPdfRowsByTrade(lineRows)
  const quoteNumber = drywallQuoteNumberLabel(input.quote.quoteNumber) || 'DW-DRAFT'
  const validUntil =
    documentOptions.showValidityPeriod && documentOptions.quoteValidityDays > 0
      ? addDays(new Date(), documentOptions.quoteValidityDays)
      : null

  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const ctx: PdfCtx = {
    doc,
    y: DW_PAGE.marginY,
    pageW,
    pageH,
    maxW: pageW - DW_PAGE.marginX * 2,
    margin: DW_PAGE.marginX,
    marginY: DW_PAGE.marginY,
    logo,
    footerLabel: quoteNumber,
  }

  drawHeaderBand(ctx, company)
  drawMetadataBar(ctx, quoteNumber, input.project.name, validUntil)
  drawPreparedFor(ctx, input.project.client)
  if (input.project.address?.trim()) {
    ctx.doc.setFont('helvetica', 'normal')
    ctx.doc.setFontSize(10)
    setTextRgb(ctx.doc, DW_TEXT)
    const addr = ctx.doc.splitTextToSize(input.project.address.trim(), ctx.maxW)
    ctx.doc.text(addr, ctx.margin, ctx.y)
    ctx.y += addr.length * 12 + 8
  }
  drawStructuredScopeOfWork(ctx, input.quote)
  for (const group of tradeGroups) {
    drawTradeSection(ctx, group.label, group.rows, group.subtotal)
  }
  drawBaseBidTotals(ctx, totals.routine, documentOptions)
  drawAlternatesSection(ctx, input.quote, input.catalogs, totals)
  drawFooterTerms(ctx, pdfSettings, validUntil)
  if (documentOptions.includeSignatureLines) {
    drawSignatureBlock(ctx, company.name, input.project.client?.trim() || undefined)
  }
  drawFooterAllPages(ctx)
  return doc.output('blob')
}

export async function generateDrywallQuoteV3Pdf(input: QuoteV3PdfInput): Promise<Blob> {
  const logo = await loadDrywallPdfLogo()
  return renderDrywallQuoteV3Pdf(input, logo)
}

export function downloadDrywallQuoteV3PdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function buildDrywallQuoteV3PdfFilename(
  projectName: string,
  quoteNumber?: string,
): string {
  const safe = sanitizePdfFilenamePart(projectName)
  const num = drywallQuoteNumberLabel(quoteNumber) || 'Quote'
  return `${safe}_Quote_${num}.pdf`
}

export async function downloadDrywallQuoteV3Pdf(input: QuoteV3PdfInput): Promise<void> {
  const blob = await generateDrywallQuoteV3Pdf(input)
  const filename = buildDrywallQuoteV3PdfFilename(input.project.name, input.quote.quoteNumber)
  downloadDrywallQuoteV3PdfBlob(blob, filename)
}
