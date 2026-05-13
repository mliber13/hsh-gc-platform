// ============================================================================
// Client-facing quote PDF (browser / jsPDF) — preview & future send snapshot
// ============================================================================

import { addDays, format } from 'date-fns'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { ClientQuoteWithChildren } from '@/types/clientQuote'
import type { Project } from '@/types'

const BRAND = {
  red: '#D9482A',
  blue: '#2C5BC4',
  gray: '#6B7280',
  lightGray: '#E5E7EB',
  text: '#111827',
}

const PAGE = { marginX: 48, marginY: 56, width: 612, height: 792, footerY: 756, bottomReserve: 80 }

const RED_RGB = hexToRgb(BRAND.red)
const BLUE_RGB = hexToRgb(BRAND.blue)
const GRAY_RGB = hexToRgb(BRAND.gray)
const LIGHT_GRAY_RGB = hexToRgb(BRAND.lightGray)
const TEXT_RGB = hexToRgb(BRAND.text)

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)

function contentWidth(): number {
  return PAGE.width - PAGE.marginX * 2
}

interface PdfContext {
  doc: jsPDF
  y: number
  page: number
}

interface LogoBits {
  dataUrl: string
  naturalW: number
  naturalH: number
}

async function loadLogoBits(): Promise<LogoBits | null> {
  try {
    const res = await fetch('/HSH Contractor Logo - Color.png')
    if (!res.ok) return null
    const blob = await res.blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result as string)
      r.onerror = () => reject(new Error('read logo'))
      r.readAsDataURL(blob)
    })
    const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = () => reject(new Error('decode logo'))
      img.src = dataUrl
    })
    return { dataUrl, naturalW: dims.w, naturalH: dims.h }
  } catch {
    return null
  }
}

function setTextColorRgb(doc: jsPDF, rgb: [number, number, number]) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2])
}

function quoteDisplayNumber(quote: ClientQuoteWithChildren): string {
  const n = quote.quote_number
  if (n === 'Q-PREVIEW' || n === 'preview' || !n) return 'Q-DRAFT'
  return n
}

function quoteFooterLabel(quote: ClientQuoteWithChildren): string {
  const base = quoteDisplayNumber(quote)
  const rev = quote.revision > 0 ? ` R${quote.revision}` : ''
  return base + rev
}

function projectSiteLines(project: Project, quote: ClientQuoteWithChildren): string {
  if (quote.project_address_override?.trim()) return quote.project_address_override.trim()
  const a = project.address
  if (!a || typeof a === 'string') return project.name
  const parts = [a.street, [project.city, project.state].filter(Boolean).join(', '), project.zipCode]
    .filter(Boolean)
    .join('\n')
  return [project.name, parts].filter(Boolean).join('\n')
}

function ensureSpace(ctx: PdfContext, needed: number, logo: LogoBits | null) {
  if (ctx.y + needed > PAGE.height - PAGE.bottomReserve) {
    ctx.doc.addPage()
    ctx.page += 1
    ctx.y = PAGE.marginY
    drawContinuationHeader(ctx, logo)
  }
}

function drawContinuationHeader(ctx: PdfContext, logo: LogoBits | null) {
  const { doc } = ctx
  const x0 = PAGE.marginX
  let x = x0
  if (logo) {
    const w = 72
    const h = (w / logo.naturalW) * logo.naturalH
    try {
      doc.addImage(logo.dataUrl, 'PNG', x, ctx.y, w, h)
    } catch {
      /* ignore */
    }
    x += w + 12
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setTextColorRgb(doc, BLUE_RGB)
  doc.text('HSH Contractor', x, ctx.y + 10)
  setTextColorRgb(doc, TEXT_RGB)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setTextColorRgb(doc, GRAY_RGB)
  doc.text('Commercial + Home Builders', x, ctx.y + 22)
  setTextColorRgb(doc, TEXT_RGB)
  ctx.y += Math.max(logo ? (72 / logo.naturalW) * logo.naturalH : 0, 28) + 6
  doc.setDrawColor(RED_RGB[0], RED_RGB[1], RED_RGB[2])
  doc.setLineWidth(2)
  doc.line(PAGE.marginX, ctx.y, PAGE.width - PAGE.marginX, ctx.y)
  ctx.y += 14
}

function drawHeaderBand(ctx: PdfContext, logo: LogoBits | null) {
  const { doc } = ctx
  const top = ctx.y

  if (logo) {
    const w = 120
    const h = (w / logo.naturalW) * logo.naturalH
    try {
      doc.addImage(logo.dataUrl, 'PNG', PAGE.marginX, top, w, h)
    } catch {
      /* logo missing — text only */
    }
  }

  const contactX = PAGE.width - PAGE.marginX
  let ty = top + 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  setTextColorRgb(doc, BLUE_RGB)
  doc.text('HSH Contractor', contactX, ty, { align: 'right' })
  ty += 18
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setTextColorRgb(doc, GRAY_RGB)
  const contactLines = [
    'Commercial + Home Builders',
    'PO Box 102 Lisbon, OH 44432',
    'Phone: 330-614-1127 | Email: mark@hshdrywall.com',
  ]
  for (const line of contactLines) {
    doc.text(line, contactX, ty, { align: 'right' })
    ty += 12
  }
  setTextColorRgb(doc, TEXT_RGB)

  const bandBottom = Math.max(top + (logo ? (120 / logo.naturalW) * logo.naturalH : 0), ty + 4)
  ctx.y = bandBottom + 8
  doc.setDrawColor(RED_RGB[0], RED_RGB[1], RED_RGB[2])
  doc.setLineWidth(3)
  doc.line(PAGE.marginX, ctx.y, PAGE.width - PAGE.marginX, ctx.y)
  ctx.y += 16
}

function drawMetadataBar(ctx: PdfContext, quote: ClientQuoteWithChildren) {
  const { doc } = ctx
  const issue = new Date()
  const validUntil = addDays(issue, quote.validity_days ?? 60)
  const qLabel = quoteDisplayNumber(quote)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setTextColorRgb(doc, TEXT_RGB)
  doc.text(`Quote Number: ${qLabel}`, PAGE.marginX, ctx.y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const center = `Issue Date: ${format(issue, 'MMM d, yyyy')}`
  const centerW = doc.getTextWidth(center)
  doc.text(center, (PAGE.width - centerW) / 2, ctx.y)

  const right = `Valid Until: ${format(validUntil, 'MMM d, yyyy')}`
  doc.text(right, PAGE.width - PAGE.marginX, ctx.y, { align: 'right' })
  ctx.y += 22
}

function drawPreparedForAndProject(
  ctx: PdfContext,
  quote: ClientQuoteWithChildren,
  project: Project,
  logo: LogoBits | null,
) {
  const { doc } = ctx
  ensureSpace(ctx, 120, logo)
  const colGap = 24
  const colW = (contentWidth() - colGap) / 2
  const xL = PAGE.marginX
  const xR = PAGE.marginX + colW + colGap
  const yStart = ctx.y

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  setTextColorRgb(doc, BLUE_RGB)
  doc.text('PREPARED FOR', xL, ctx.y)
  doc.text('PROJECT', xR, ctx.y)
  ctx.y += 14

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  setTextColorRgb(doc, TEXT_RGB)

  const pf = quote.prepared_for
  const hasPrepared = !!(
    pf &&
    (pf.company?.trim() || pf.attn_name?.trim() || pf.mailing_address?.trim())
  )
  let leftBody: string
  if (!hasPrepared) {
    doc.setFont('helvetica', 'italic')
    setTextColorRgb(doc, GRAY_RGB)
    leftBody = '[Not yet specified]'
  } else {
    const lines: string[] = []
    if (pf!.company?.trim()) lines.push(pf!.company.trim())
    if (pf!.attn_name?.trim()) {
      const t = pf!.attn_title?.trim()
      lines.push(t ? `Attn: ${pf!.attn_name.trim()}, ${t}` : `Attn: ${pf!.attn_name.trim()}`)
    }
    if (pf!.mailing_address?.trim()) lines.push(pf!.mailing_address.trim())
    if (pf!.phone?.trim()) lines.push(`Phone: ${pf!.phone.trim()}`)
    if (pf!.email?.trim()) lines.push(`Email: ${pf!.email.trim()}`)
    leftBody = lines.join('\n')
    setTextColorRgb(doc, TEXT_RGB)
  }

  const rightBody = projectSiteLines(project, quote)
  const leftSplit = doc.splitTextToSize(leftBody, colW - 4)
  const rightSplit = doc.splitTextToSize(rightBody, colW - 4)
  doc.setFont('helvetica', hasPrepared ? 'normal' : 'italic')
  if (!hasPrepared) setTextColorRgb(doc, GRAY_RGB)
  else setTextColorRgb(doc, TEXT_RGB)
  doc.text(leftSplit, xL, ctx.y)
  doc.setFont('helvetica', 'normal')
  setTextColorRgb(doc, TEXT_RGB)
  doc.text(rightSplit, xR, ctx.y)
  ctx.y = yStart + 14 + Math.max(leftSplit.length, rightSplit.length) * 12 + 8
}

function drawScopeNarrative(ctx: PdfContext, quote: ClientQuoteWithChildren, logo: LogoBits | null) {
  const { doc } = ctx
  ensureSpace(ctx, 60, logo)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  setTextColorRgb(doc, RED_RGB)
  doc.text('SCOPE OF WORK', PAGE.marginX, ctx.y)
  ctx.y += 16
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const body = quote.scope_narrative?.trim()
  if (!body) {
    setTextColorRgb(doc, GRAY_RGB)
    doc.setFont('helvetica', 'italic')
    const t = doc.splitTextToSize('[No scope narrative provided.]', contentWidth())
    doc.text(t, PAGE.marginX, ctx.y)
    ctx.y += t.length * 12 + 8
    doc.setFont('helvetica', 'normal')
    setTextColorRgb(doc, TEXT_RGB)
  } else {
    setTextColorRgb(doc, TEXT_RGB)
    const t = doc.splitTextToSize(body, contentWidth())
    let lineIdx = 0
    const lineH = 12
    while (lineIdx < t.length) {
      ensureSpace(ctx, lineH + 4, logo)
      doc.text(t[lineIdx], PAGE.marginX, ctx.y)
      ctx.y += lineH
      lineIdx += 1
    }
    ctx.y += 8
  }
}

function drawPricingTable(ctx: PdfContext, quote: ClientQuoteWithChildren, logo: LogoBits | null) {
  const { doc } = ctx
  ensureSpace(ctx, 80, logo)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  setTextColorRgb(doc, RED_RGB)
  doc.text('PRICING', PAGE.marginX, ctx.y)
  ctx.y += 14

  const sorted = [...quote.line_items].sort((a, b) => a.sort_order - b.sort_order)
  const body =
    sorted.length > 0
      ? sorted.map((li) => [li.display_label || li.trade_category, formatCurrency(li.amount)])
      : [['—', formatCurrency(0)]]
  const subtotal = sorted.reduce((s, li) => s + (Number.isFinite(li.amount) ? li.amount : 0), 0)

  autoTable(doc, {
    startY: ctx.y,
    head: [['Trade Category', 'Amount']],
    body,
    foot: [['Subtotal', formatCurrency(subtotal)]],
    theme: 'striped',
    showHead: 'everyPage',
    headStyles: {
      fillColor: RED_RGB,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10,
    },
    footStyles: {
      fillColor: [255, 255, 255],
      textColor: BLUE_RGB,
      fontStyle: 'bold',
      fontSize: 10,
    },
    styles: {
      fontSize: 9,
      cellPadding: 6,
      lineColor: LIGHT_GRAY_RGB,
      lineWidth: 0.5,
    },
    alternateRowStyles: { fillColor: [243, 244, 246] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 100 },
    },
  })
  const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
  ctx.y = (last?.finalY ?? ctx.y) + 16
}

function drawOptionsTable(ctx: PdfContext, quote: ClientQuoteWithChildren, logo: LogoBits | null) {
  if (!quote.options?.length) return
  const { doc } = ctx
  ensureSpace(ctx, 100, logo)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  setTextColorRgb(doc, RED_RGB)
  doc.text('OPTIONS / ALTERNATES', PAGE.marginX, ctx.y)
  ctx.y += 12
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setTextColorRgb(doc, GRAY_RGB)
  const intro = doc.splitTextToSize(
    "Pricing for optional scope items — selected at Owner's discretion.",
    contentWidth(),
  )
  doc.text(intro, PAGE.marginX, ctx.y)
  ctx.y += intro.length * 11 + 8
  setTextColorRgb(doc, TEXT_RGB)

  const sorted = [...quote.options].sort((a, b) => a.sort_order - b.sort_order)
  const body = sorted.map((o) => [
    o.label,
    (o.description ?? '').trim() || '—',
    formatCurrency(o.amount),
  ])

  autoTable(doc, {
    startY: ctx.y,
    head: [['Label', 'Description', 'Amount']],
    body,
    theme: 'striped',
    showHead: 'everyPage',
    headStyles: {
      fillColor: RED_RGB,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10,
    },
    styles: { fontSize: 9, cellPadding: 5, lineColor: LIGHT_GRAY_RGB, lineWidth: 0.5 },
    alternateRowStyles: { fillColor: [243, 244, 246] },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 'auto' },
      2: { halign: 'right', cellWidth: 90 },
    },
  })
  const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
  ctx.y = (last?.finalY ?? ctx.y) + 16
}

function drawBulletSection(
  ctx: PdfContext,
  title: string,
  items: string[],
  logo: LogoBits | null,
  colorTitle: boolean,
) {
  const cleaned = (items ?? []).map((s) => s.trim()).filter(Boolean)
  if (!cleaned.length) return
  const { doc } = ctx
  ensureSpace(ctx, 40, logo)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  setTextColorRgb(doc, colorTitle ? RED_RGB : TEXT_RGB)
  doc.text(title, PAGE.marginX, ctx.y)
  ctx.y += 16
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  setTextColorRgb(doc, TEXT_RGB)
  const w = contentWidth()
  for (const item of cleaned) {
    const block = `• ${item}`
    const lines = doc.splitTextToSize(block, w - 12)
    for (const line of lines) {
      ensureSpace(ctx, 14, logo)
      doc.text(line, PAGE.marginX + 6, ctx.y)
      ctx.y += 12
    }
    ctx.y += 4
  }
}

function drawTerms(ctx: PdfContext, quote: ClientQuoteWithChildren, logo: LogoBits | null) {
  const { doc } = ctx
  ensureSpace(ctx, 100, logo)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  setTextColorRgb(doc, RED_RGB)
  doc.text('TERMS', PAGE.marginX, ctx.y)
  ctx.y += 16
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  setTextColorRgb(doc, TEXT_RGB)
  const paras = [
    `Validity: This quote is valid for ${quote.validity_days ?? 60} days from the issue date.`,
    'Warranty: HSH Contractor provides a one-year workmanship warranty from substantial completion.',
    'This quote does not constitute a contract. A separate construction contract will be executed upon acceptance.',
  ]
  for (const p of paras) {
    const lines = doc.splitTextToSize(p, contentWidth())
    for (const line of lines) {
      ensureSpace(ctx, 14, logo)
      doc.text(line, PAGE.marginX, ctx.y)
      ctx.y += 12
    }
    ctx.y += 8
  }
}

function drawSignatureBlock(ctx: PdfContext, _quote: ClientQuoteWithChildren, logo: LogoBits | null) {
  const { doc } = ctx
  ensureSpace(ctx, 100, logo)
  const gap = 32
  const colW = (contentWidth() - gap) / 2
  const xL = PAGE.marginX
  const xR = PAGE.marginX + colW + gap
  const y0 = ctx.y

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  setTextColorRgb(doc, TEXT_RGB)
  doc.text('Accepted by Owner', xL, y0)
  doc.text('HSH Contractor', xR, y0)
  let y = y0 + 18
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setTextColorRgb(doc, GRAY_RGB)
  doc.line(xL, y, xL + colW, y)
  doc.line(xR, y, xR + colW, y)
  y += 14
  doc.text('Signature', xL, y)
  doc.text('Signature', xR, y)
  y += 20
  doc.line(xL, y, xL + colW, y)
  doc.line(xR, y, xR + colW, y)
  y += 14
  doc.text('Printed name', xL, y)
  doc.text('Printed name', xR, y)
  y += 20
  doc.line(xL, y, xL + colW, y)
  doc.line(xR, y, xR + colW, y)
  y += 14
  doc.text('Date', xL, y)
  doc.text('Date', xR, y)
  ctx.y = y + 24
}

function drawFooterAllPages(doc: jsPDF, quote: ClientQuoteWithChildren) {
  const total = doc.getNumberOfPages()
  const label = quoteFooterLabel(quote)
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    setTextColorRgb(doc, GRAY_RGB)
    doc.text(label, PAGE.marginX, PAGE.footerY)
    doc.text(`Page ${i} of ${total}`, PAGE.width - PAGE.marginX, PAGE.footerY, { align: 'right' })
    setTextColorRgb(doc, TEXT_RGB)
  }
}

/**
 * Build a letter-size PDF blob for a client quote (preview or future frozen send).
 */
export async function generateClientQuotePDFBlob(
  quote: ClientQuoteWithChildren,
  project: Project,
): Promise<Blob> {
  const logo = await loadLogoBits()
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const ctx: PdfContext = { doc, y: PAGE.marginY, page: 1 }

  drawHeaderBand(ctx, logo)
  drawMetadataBar(ctx, quote)
  drawPreparedForAndProject(ctx, quote, project, logo)
  drawScopeNarrative(ctx, quote, logo)
  drawPricingTable(ctx, quote, logo)
  drawOptionsTable(ctx, quote, logo)
  drawBulletSection(ctx, 'INCLUSIONS', quote.inclusions ?? [], logo, true)
  drawBulletSection(ctx, 'EXCLUSIONS', quote.exclusions ?? [], logo, true)
  drawTerms(ctx, quote, logo)
  drawSignatureBlock(ctx, quote, logo)

  drawFooterAllPages(doc, quote)
  return doc.output('blob')
}
