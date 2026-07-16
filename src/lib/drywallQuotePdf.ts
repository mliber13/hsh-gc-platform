// ============================================================================
// Drywall workspace quote PDF — separate from GC clientQuotePdf (Section 0 rule)
// Layout tuned to legacy QuotePDF.jsx (@react-pdf) spacing.
// ============================================================================

import { addDays, format } from 'date-fns'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { computeDrywallDurationSummary } from '@/lib/drywall/durationService'
import { calculateQuoteTotals } from '@/lib/drywall/quoteCalculations'
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
import { getTradeCostSubLines } from '@/lib/drywall/tradePdfBreakdown'
import {
  buildQuotePdfTermsLines,
  resolveQuotePdfSettings,
} from '@/lib/drywall/quotePdfSettings'
import { drawMarkdownScope } from '@/lib/drywall/markdownToPdf'
import { quoteScopeBlocksFromV2, type ScopePdfBlock } from '@/lib/drywall/structuredScopePdf'
import type { DrywallProject, DrywallQuote, DrywallQuoteCalculations } from '@/types/drywall'

const COMPANY_NAME = 'HSH Drywall'
const COMPANY_ADDRESS = 'PO Box 102 Lisbon, OH 44432'
const COMPANY_PHONE = '330-614-1127'
const COMPANY_EMAIL = 'mark@hshdrywall.com'

const SP = {
  headerRuleGap: 15,
  headerToFirstSection: 20,
  sectionTop: 20,
  sectionBottom: 15,
  sectionTitleBelow: 10,
  sectionRuleBelow: 10,
  /** Extra gap under section rule before body (e.g. Scope of Work) */
  sectionRuleToBody: 16,
  termsLine: 16,
  termsItemGap: 6,
  specLine: 13,
  specIndent: 10,
  bulletIndent: 10,
  subsectionTop: 8,
  /** Space after Hang/Finish heading before first bullet (jsPDF baseline) */
  subsectionAfterHeading: 10,
  addonBlockTop: 12,
  addonLine: 14,
  tableTop: 10,
  tableCellPadY: 8,
  tableCellPadX: 10,
  summaryPageTop: 20,
  summaryPad: 15,
  summaryRow: 12,
  summaryCostGap: 8,
  summaryTotalGap: 10,
  summaryTotalPad: 10,
  signatureBlockTop: 24,
  signatureColGap: 28,
} as const

const SECTION_TITLE_SIZE = 12
const SUBSECTION_SIZE = 11
const BODY_SIZE = 10

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0)

const toNum = (v: unknown): number => parseFloat(String(v ?? 0)) || 0
const round2 = (n: number) => Math.round(n * 100) / 100

type TradeSummaryLine = { label: string; amount: number }

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

function drawHeaderBand(ctx: PdfCtx) {
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
  doc.text(COMPANY_NAME, contactX, ty, { align: 'right' })
  ty += 18
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setTextRgb(doc, DW_GRAY)
  for (const line of [
    COMPANY_ADDRESS,
    `Phone: ${COMPANY_PHONE} | Email: ${COMPANY_EMAIL}`,
  ]) {
    doc.text(line, contactX, ty, { align: 'right' })
    ty += 12
  }
  setTextRgb(doc, DW_TEXT)
  const bandBottom = Math.max(top + (ctx.logo ? (120 / ctx.logo.naturalW) * ctx.logo.naturalH : 0), ty + 4)
  ctx.y = bandBottom + 8
  setDrawRgb(doc, DW_RED)
  doc.setLineWidth(3)
  doc.line(ctx.margin, ctx.y, ctx.pageW - ctx.margin, ctx.y)
  ctx.y += 16
}

function truncateToWidth(doc: jsPDF, text: string, maxW: number): string {
  if (doc.getTextWidth(text) <= maxW) return text
  let s = text
  while (s.length > 1 && doc.getTextWidth(`${s}…`) > maxW) s = s.slice(0, -1)
  return `${s}…`
}

function drawMetadataBar(
  ctx: PdfCtx,
  quoteNumber: string,
  validUntil: Date | null,
) {
  const { doc } = ctx
  const issue = new Date()
  const colW = ctx.maxW / 3
  const xLeft = ctx.margin
  const xCenter = ctx.margin + colW + colW / 2
  const xRight = ctx.pageW - ctx.margin

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setTextRgb(doc, DW_TEXT)
  const left = truncateToWidth(doc, `Quote Number: ${quoteNumber}`, colW - 8)
  doc.text(left, xLeft, ctx.y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const center = `Issue Date: ${format(issue, 'MMM d, yyyy')}`
  doc.text(center, xCenter, ctx.y, { align: 'center' })

  if (validUntil) {
    const right = truncateToWidth(
      doc,
      `Valid Until: ${format(validUntil, 'MMM d, yyyy')}`,
      colW - 8,
    )
    doc.text(right, xRight, ctx.y, { align: 'right' })
  }
  ctx.y += 22
}

function drawPreparedForAndProject(
  ctx: PdfCtx,
  project: Pick<DrywallProject, 'name' | 'client' | 'address'>,
) {
  const { doc } = ctx
  ensureRoom(ctx, 100)
  const colGap = 24
  const colW = (ctx.maxW - colGap) / 2
  const xL = ctx.margin
  const xR = ctx.margin + colW + colGap
  const yStart = ctx.y
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  setTextRgb(doc, DW_BLUE)
  doc.text('PREPARED FOR', xL, ctx.y)
  doc.text('PROJECT', xR, ctx.y)
  ctx.y += 14
  const client = String(project.client ?? '').trim()
  const leftBody = client || '[Not yet specified]'
  const rightParts = [project.name || 'Project']
  if (project.address) rightParts.push(String(project.address))
  const rightBody = rightParts.join('\n')
  doc.setFont('helvetica', client ? 'normal' : 'italic')
  doc.setFontSize(10)
  setTextRgb(doc, client ? DW_TEXT : DW_GRAY)
  const leftSplit = doc.splitTextToSize(leftBody, colW - 4)
  const rightSplit = doc.splitTextToSize(rightBody, colW - 4)
  doc.text(leftSplit, xL, ctx.y)
  doc.setFont('helvetica', 'normal')
  setTextRgb(doc, DW_TEXT)
  doc.text(rightSplit, xR, ctx.y)
  ctx.y = yStart + 14 + Math.max(leftSplit.length, rightSplit.length) * 12 + 8
}

/** GC-style section title — red, no underline */
function drawSectionTitle(
  ctx: PdfCtx,
  title: string,
  opts?: { skipTopGap?: boolean; keepWithNext?: number },
) {
  if (!opts?.skipTopGap) ctx.y += SP.sectionTop
  const keepWith = opts?.keepWithNext ?? 0
  ensureRoom(ctx, 32 + keepWith)
  ctx.doc.setFont('helvetica', 'bold')
  ctx.doc.setFontSize(SECTION_TITLE_SIZE)
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

  const showBullets = !block.plain && block.bulleted !== false
  const textIndent = showBullets ? SP.specIndent + SP.bulletIndent : SP.specIndent

  for (const raw of block.lines) {
    const prefix = showBullets ? '• ' : ''
    const wrapped = ctx.doc.splitTextToSize(`${prefix}${raw}`, ctx.maxW - textIndent - 4)
    drawWrappedLines(ctx, wrapped, ctx.margin + textIndent, lineStep)
    if (block.plain) ctx.y += 4
  }
}

/** Per-trade totals for the summary box (legacy QuotePDF parity). */
function getTradeSummaryLines(
  quote: DrywallQuote,
  calculations: DrywallQuoteCalculations,
  quoteForCalc: DrywallQuote,
): TradeSummaryLine[] {
  const breakdowns = quote.breakdowns ?? []
  const lines: TradeSummaryLine[] = []

  const push = (label: string, amount: number) => {
    if (amount > 0) lines.push({ label, amount })
  }

  if (breakdowns.length === 0) {
    push('Drywall:', toNum(calculations.standardDrywallTotal))
    if (quote.includeSuspendedGrid) {
      push('Suspended Drywall Grid Ceiling:', toNum(calculations.suspendedGridTotal))
    }
    if (quote.includeRcChannel) push('RC Channel:', toNum(calculations.rcChannelTotal))
    if (quote.includeInsulation) push('Insulation:', toNum(calculations.insulationTotal))
    if (quote.includeAcousticCeiling) {
      push('Acoustic Ceiling Tile & Grid:', toNum(calculations.acousticCeilingTotal))
    }
    if (quote.includeMetalStudFraming) {
      push('Metal Stud Framing:', toNum(calculations.metalStudTotal))
    }
    if (quote.includeFRP) push('FRP:', toNum(calculations.frpTotal))
    return lines
  }

  const sums = { drywall: 0, rc: 0, suspended: 0, metalStud: 0 }
  for (const item of breakdowns) {
    const rowCalc: DrywallQuoteCalculations = {}
    const base = { ...quoteForCalc, breakdowns: [item], options: [] }
    const strip = {
      includeRcChannel: false,
      includeSuspendedGrid: false,
      includeMetalStudFraming: false,
      includeInsulation: false,
      includeAcousticCeiling: false,
      includeFRP: false,
    }
    sums.drywall += calculateQuoteTotals({ ...base, ...strip }, rowCalc).breakdownTotal ?? 0

    sums.rc +=
      calculateQuoteTotals(
        {
          ...base,
          ...strip,
          breakdowns: [
            {
              ...item,
              sqft: 0,
              suspendedGridSqft: 0,
              suspendedGridPerimeter: 0,
              metalStudWallLf: 0,
              metalStudWallHeight: 0,
              metalStudEntries: [],
            },
          ],
        },
        rowCalc,
      ).breakdownTotal ?? 0

    sums.suspended +=
      calculateQuoteTotals(
        {
          ...base,
          includeRcChannel: false,
          includeMetalStudFraming: false,
          includeInsulation: false,
          includeAcousticCeiling: false,
          includeFRP: false,
          breakdowns: [
            {
              ...item,
              sqft: 0,
              rcChannelCeilingSqft: 0,
              rcChannelWallLinearFt: 0,
              rcChannelWallHeight: 0,
              metalStudWallLf: 0,
              metalStudWallHeight: 0,
              metalStudEntries: [],
            },
          ],
        },
        rowCalc,
      ).breakdownTotal ?? 0

    sums.metalStud +=
      calculateQuoteTotals(
        {
          ...base,
          includeRcChannel: false,
          includeSuspendedGrid: false,
          includeInsulation: false,
          includeAcousticCeiling: false,
          includeFRP: false,
          breakdowns: [
            {
              ...item,
              sqft: 0,
              rcChannelCeilingSqft: 0,
              rcChannelWallLinearFt: 0,
              rcChannelWallHeight: 0,
              suspendedGridSqft: 0,
              suspendedGridPerimeter: 0,
            },
          ],
        },
        rowCalc,
      ).breakdownTotal ?? 0
  }

  push('Drywall:', sums.drywall)
  if (quote.includeSuspendedGrid) {
    const sg =
      sums.suspended > 0 ? sums.suspended : toNum(calculations.suspendedGridTotal)
    push('Suspended Drywall Grid Ceiling:', sg)
  }
  if (quote.includeRcChannel) push('RC Channel:', sums.rc)
  if (quote.includeInsulation) push('Insulation:', toNum(calculations.insulationTotal))
  if (quote.includeAcousticCeiling) {
    push('Acoustic Ceiling Tile & Grid:', toNum(calculations.acousticCeilingTotal))
  }
  if (quote.includeMetalStudFraming) {
    const ms = sums.metalStud > 0 ? sums.metalStud : toNum(calculations.metalStudTotal)
    push('Metal Stud Framing:', ms)
  }
  if (quote.includeFRP) push('FRP:', toNum(calculations.frpTotal))

  return lines
}

function textOrBlank(value: unknown): string {
  return String(value ?? '').trim()
}

function quoteScopeBlocks(quote: DrywallQuote): ScopePdfBlock[] {
  return quoteScopeBlocksFromV2(quote)
}

function durationSummaryForQuote(quote: DrywallQuote, calculations: DrywallQuoteCalculations) {
  const finishes = [
    quote.ceilingFinish,
    quote.ceilingFinishOther,
    quote.wallFinish,
    quote.wallFinishOther,
  ].map((s) => String(s ?? '').toLowerCase())
  const hasLevel5 = finishes.some((s) => s.includes('level 5'))
  const hasTexture = finishes.some((s) => {
    return (
      s.includes('texture') ||
      s.includes('knockdown') ||
      s.includes('orange peel') ||
      s.includes('stomp') ||
      s.includes('skip trowel') ||
      s.includes('roll')
    )
  })
  return computeDrywallDurationSummary({
    drywallSqft: toNum(calculations.sqft),
    beadSticks: toNum(quote.beadSticks),
    buildType: String(quote.buildType ?? 'new_build'),
    complexity: String(quote.complexity ?? 'normal'),
    hasLevel5,
    hasTexture,
    paperFloorsRequired: Boolean(quote.paperFloorsRequired),
  })
}

type TableCell = string | { content: string; styles?: Record<string, unknown> }

function subTableRow(label: string, amount: string): TableCell[] {
  return [
    { content: label, styles: { cellPadding: { top: 4, right: 6, bottom: 4, left: 20 } } },
    { content: amount, styles: { halign: 'right' } },
  ]
}

function stripeRow(label: string, amount: string): TableCell[] {
  return [
    { content: label, styles: { fontStyle: 'bold', fillColor: DW_TABLE_STRIPE, textColor: DW_TEXT } },
    {
      content: amount,
      styles: { fontStyle: 'bold', halign: 'right', fillColor: DW_TABLE_STRIPE },
    },
  ]
}

function drawPricingTable(
  ctx: PdfCtx,
  opts: {
    quote: DrywallQuote
    calculations: DrywallQuoteCalculations
    tradeLines: TradeSummaryLine[]
    showTradeBreakdown: boolean
    includeTradeCostBreakdown: boolean
    subtotalBeforeTax: number
    salesTax: number
    showTaxesSeparately: boolean
    showCostBreakdown: boolean
    materialsBlended: number
    laborBlended: number
    selectedOptionsTotal: number
    total: number
  },
) {
  ensureRoom(ctx, 80)
  drawSectionTitle(ctx, 'PRICING')
  ctx.y += 2

  const body: TableCell[][] = []
  if (opts.showTradeBreakdown) {
    for (const trade of opts.tradeLines) {
      body.push(stripeRow(trade.label, formatCurrency(trade.amount)))
      if (opts.includeTradeCostBreakdown) {
        const subs = getTradeCostSubLines(
          trade.label,
          trade.amount,
          opts.quote,
          opts.calculations,
        )
        for (const sub of subs) {
          body.push(subTableRow(sub.label, formatCurrency(sub.amount)))
        }
      }
    }
  }

  // Legacy QuotePDF: subtotal + sales tax always follow trade lines when that option is on.
  if (opts.showTaxesSeparately && opts.salesTax > 0) {
    body.push(['Subtotal (before tax):', formatCurrency(opts.subtotalBeforeTax)])
    body.push(['Sales Tax:', formatCurrency(opts.salesTax)])
  } else {
    /** Trade sell prices already include sales tax — skip combined subtotal when trades are itemized. */
    const skipCombinedSubtotal = opts.showTradeBreakdown && opts.tradeLines.length > 0
    if (!skipCombinedSubtotal) {
      body.push(['Subtotal:', formatCurrency(opts.subtotalBeforeTax + opts.salesTax)])
    }
  }

  if (opts.showCostBreakdown && !opts.includeTradeCostBreakdown) {
    body.push(stripeRow('Cost Breakdown:', ''))
    body.push([
      { content: 'Materials:', styles: { cellPadding: { top: 4, right: 6, bottom: 4, left: 20 } } },
      { content: formatCurrency(opts.materialsBlended), styles: { halign: 'right' } },
    ])
    body.push([
      { content: 'Labor:', styles: { cellPadding: { top: 4, right: 6, bottom: 4, left: 20 } } },
      { content: formatCurrency(opts.laborBlended), styles: { halign: 'right' } },
    ])
  }

  if (opts.selectedOptionsTotal !== 0) {
    body.push(['Selected Options:', formatCurrency(opts.selectedOptionsTotal)])
  }

  if (body.length === 0) {
    body.push(['—', formatCurrency(opts.total)])
  }

  autoTable(ctx.doc, {
    startY: ctx.y,
    head: [['Trade / Item', 'Amount']],
    body,
    foot: [['TOTAL QUOTE', formatCurrency(opts.total)]],
    theme: 'striped',
    showHead: 'everyPage',
    headStyles: AUTO_TABLE_HEAD,
    footStyles: AUTO_TABLE_FOOT,
    styles: AUTO_TABLE_BASE,
    alternateRowStyles: { fillColor: [255, 255, 255] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 100 },
    },
    margin: { left: ctx.margin, right: ctx.margin },
  })
  const last = (ctx.doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
  ctx.y = (last?.finalY ?? ctx.y) + 16
  setTextRgb(ctx.doc, DW_TEXT)
}

function drawSignatureBlock(ctx: PdfCtx, customerName?: string) {
  const blockH = 100
  ensureRoom(ctx, blockH + SP.signatureBlockTop)
  ctx.y += SP.signatureBlockTop

  const colW = (ctx.maxW - SP.signatureColGap) / 2
  const xL = ctx.margin
  const xR = ctx.margin + colW + SP.signatureColGap
  const y0 = ctx.y

  ctx.doc.setFont('helvetica', 'bold')
  ctx.doc.setFontSize(10)
  setTextRgb(ctx.doc, DW_TEXT)
  ctx.doc.text('Customer', xL, y0)
  ctx.doc.text(COMPANY_NAME, xR, y0)
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

function drawOptionsTable(
  ctx: PdfCtx,
  options: NonNullable<DrywallQuote['options']>,
  calculations: DrywallQuoteCalculations,
  selectedOptionsTotal: number,
) {
  ensureRoom(ctx, 80)
  drawSectionTitle(ctx, 'OPTIONS / ALTERNATES')
  ctx.doc.setFont('helvetica', 'normal')
  ctx.doc.setFontSize(9)
  setTextRgb(ctx.doc, DW_GRAY)
  const intro = ctx.doc.splitTextToSize(
    "Pricing for optional scope items — selected at customer's discretion.",
    ctx.maxW,
  )
  ctx.doc.text(intro, ctx.margin, ctx.y)
  ctx.y += intro.length * 11 + 8
  setTextRgb(ctx.doc, DW_TEXT)

  const body = options.map((opt) => {
    const optSqft = opt.useTotalSqft ? toNum(calculations.sqft) : toNum(opt.sqft)
    const optRate = toNum(opt.rate)
    const amount = optSqft > 0 && optRate > 0 ? optSqft * optRate : toNum(opt.price)
    const status = opt.selected ? '[Included] ' : ''
    return [`${status}${String(opt.description || 'Option')}`, formatCurrency(amount)]
  })

  autoTable(ctx.doc, {
    startY: ctx.y,
    head: [['Item', 'Amount']],
    body,
    foot:
      selectedOptionsTotal > 0
        ? [['Selected Options Total', formatCurrency(selectedOptionsTotal)]]
        : undefined,
    theme: 'striped',
    showHead: 'everyPage',
    headStyles: AUTO_TABLE_HEAD,
    footStyles: AUTO_TABLE_FOOT,
    styles: AUTO_TABLE_BASE,
    alternateRowStyles: { fillColor: DW_TABLE_STRIPE },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 100 },
    },
    margin: { left: ctx.margin, right: ctx.margin },
  })
  const last = (ctx.doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
  ctx.y = (last?.finalY ?? ctx.y) + 16
}

function drawBreakdownTable(
  ctx: PdfCtx,
  breakdowns: NonNullable<DrywallQuote['breakdowns']>,
  quoteForCalc: DrywallQuote,
) {
  ensureRoom(ctx, 60)
  drawSectionTitle(ctx, 'BREAKDOWN BY BUILDING/AREA')
  const body: TableCell[][] = []
  for (let idx = 0; idx < breakdowns.length; idx++) {
    const item = breakdowns[idx]
    const rowCalc: DrywallQuoteCalculations = {}
    const full = calculateQuoteTotals(
      { ...quoteForCalc, breakdowns: [item], options: [] },
      rowCalc,
    )
    const total = full.breakdownTotal || toNum(item.itemTotal)
    body.push([`${idx + 1}. ${item.description || 'Untitled'}`, formatCurrency(total)])
  }
  autoTable(ctx.doc, {
    startY: ctx.y,
    head: [['Area / Building', 'Amount']],
    body,
    theme: 'striped',
    showHead: 'everyPage',
    headStyles: AUTO_TABLE_HEAD,
    styles: AUTO_TABLE_BASE,
    alternateRowStyles: { fillColor: [255, 255, 255] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 100 },
    },
    margin: { left: ctx.margin, right: ctx.margin },
  })
  const last = (ctx.doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
  ctx.y = (last?.finalY ?? ctx.y) + 16
}

function drawBulletSection(ctx: PdfCtx, title: string, items: string[]) {
  const cleaned = items.map((s) => s.trim()).filter(Boolean)
  if (!cleaned.length) return
  drawSectionTitle(ctx, title)
  ctx.doc.setFont('helvetica', 'normal')
  ctx.doc.setFontSize(10)
  setTextRgb(ctx.doc, DW_TEXT)
  for (const item of cleaned) {
    const lines = ctx.doc.splitTextToSize(`• ${item}`, ctx.maxW - 12)
    for (const line of lines) {
      ensureRoom(ctx, 14)
      ctx.doc.text(line, ctx.margin + 6, ctx.y)
      ctx.y += 12
    }
    ctx.y += 4
  }
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

export async function downloadDrywallQuotePdf(
  project: Pick<DrywallProject, 'name' | 'client' | 'address'>,
  quote: DrywallQuote,
  calculations: DrywallQuoteCalculations,
): Promise<void> {
  const pdfSettings = resolveQuotePdfSettings(quote.pdfSettings)
  const logo = await loadDrywallPdfLogo()
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const maxW = pageW - DW_PAGE.marginX * 2
  const safeName = (project.name || 'Project').replace(/[/\\:*?"<>|]/g, '-')
  const quoteNumber = drywallQuoteNumberLabel(quote.quoteNumber) || 'DW-DRAFT'

  const ctx: PdfCtx = {
    doc,
    y: DW_PAGE.marginY,
    pageW,
    pageH,
    maxW,
    margin: DW_PAGE.marginX,
    marginY: DW_PAGE.marginY,
    logo,
    footerLabel: quoteNumber,
  }

  const quoteForCalc = { ...quote, version: undefined } as DrywallQuote
  const totals = calculateQuoteTotals(quoteForCalc, calculations)

  drawHeaderBand(ctx)
  const validUntil =
    pdfSettings.showValidityPeriod && pdfSettings.quoteValidityDays > 0
      ? addDays(new Date(), pdfSettings.quoteValidityDays)
      : null
  drawMetadataBar(ctx, quoteNumber, validUntil)
  drawPreparedForAndProject(ctx, project)

  drawSectionTitle(ctx, 'SCOPE OF WORK', { skipTopGap: true, keepWithNext: 48 })
  ctx.y += 4
  const customScopeText = String(quote.customScopeOfWork ?? '').trim()
  if (quote.useCustomScopeOfWork && customScopeText) {
    drawMarkdownScope(
      ctx,
      String(quote.customScopeOfWork ?? ''),
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
  } else {
    for (const block of quoteScopeBlocks(quote)) {
      drawScopeBlock(ctx, block)
    }
  }

  if (toNum(calculations.durationDays) > 0) {
    ensureRoom(ctx, 16)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(BODY_SIZE)
    setTextRgb(doc, DW_TEXT)
    doc.text(
      `Approximate duration: ${toNum(calculations.durationDays).toFixed(0)} days`,
      ctx.margin + SP.specIndent,
      ctx.y,
    )
    ctx.y += SP.specLine + 2
  }
  ctx.y += SP.sectionBottom

  const breakdowns = quote.breakdowns || []
  if (breakdowns.length > 0) {
    drawBreakdownTable(ctx, breakdowns, quoteForCalc)
  }

  const options = quote.options || []
  const selectedOptionsTotal = toNum(totals.selectedOptionsTotal)
  if (options.length > 0) {
    drawOptionsTable(ctx, options, calculations, selectedOptionsTotal)
  }

  const tradeLines = getTradeSummaryLines(quote, calculations, quoteForCalc)
  const includeTradeCostBreakdown = pdfSettings.includeTradeCostBreakdown

  const summaryTradeLines = [...tradeLines]
  const showTradeBreakdown =
    summaryTradeLines.length > 1 ||
    (includeTradeCostBreakdown && summaryTradeLines.length > 0)
  const subtotalBeforeTax =
    (totals.subtotal || 0) + (totals.profitAmount || 0) - (totals.totalSalesTax || 0)
  const costBase = totals.totalDirectCost || 0
  const matBase = toNum(calculations.totalMaterialCost)
  const breakdownSell = totals.breakdownTotal || 0
  const materialsBlended =
    costBase > 0 ? round2((matBase / costBase) * breakdownSell) : matBase
  const laborBlended = Math.max(0, round2(breakdownSell - materialsBlended))
  const total =
    totals.totalQuote ||
    toNum(calculations.finalTotal) ||
    toNum(calculations.subtotalAfterProfit) + selectedOptionsTotal

  drawPricingTable(ctx, {
    quote,
    calculations,
    tradeLines: summaryTradeLines,
    showTradeBreakdown,
    includeTradeCostBreakdown,
    subtotalBeforeTax,
    salesTax: totals.totalSalesTax || 0,
    showTaxesSeparately: pdfSettings.showTaxesSeparately,
    showCostBreakdown: pdfSettings.showCostBreakdown,
    materialsBlended,
    laborBlended,
    selectedOptionsTotal,
    total,
  })

  if (pdfSettings.showDurationSummary) {
    const durationSummary = durationSummaryForQuote(quote, calculations)
    const durationLines = durationSummary.lines.map(
      (line) =>
        `${line.label}: ${Number(line.days) || 0} day${Number(line.days) !== 1 ? 's' : ''}`,
    )
    durationLines.push(`Total: ${Number(durationSummary.totalDays) || 0} days`)
    drawBulletSection(ctx, 'DRYWALL DURATION SUMMARY', durationLines)
  }

  const termsLines = buildQuotePdfTermsLines(pdfSettings)
  const quoteIncludes = String(quote.quoteIncludes || 'labor_and_material')
  const includeNote =
    quoteIncludes === 'labor_only'
      ? 'This quote includes labor only. Materials are not included.'
      : 'This quote includes labor and materials.'
  drawBulletSection(ctx, 'TERMS & CONDITIONS', [...termsLines, includeNote])

  if (pdfSettings.includeSignatureLines) {
    const customerName = String(project.client ?? '').trim() || undefined
    drawSignatureBlock(ctx, customerName)
  }

  drawFooterAllPages(ctx)
  doc.save(`${safeName} - ${quoteNumber}.pdf`)
}
