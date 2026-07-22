import { format } from 'date-fns'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { acceptedChangeOrderTotal, resolveBaseContractValue } from '@/lib/drywall/contractValue'
import {
  changeOrderLineTotal,
  computeChangeOrderTotals,
  type ChangeOrderScope,
} from '@/lib/drywall/changeOrderTotals'
import {
  AUTO_TABLE_BASE,
  AUTO_TABLE_HEAD,
  DW_BLUE,
  DW_GRAY,
  DW_PAGE,
  DW_RED,
  DW_TEXT,
  loadDrywallPdfLogo,
  setDrawRgb,
  setTextRgb,
  type DrywallPdfLogo,
} from '@/lib/drywall/drywallQuotePdfTheme'
import type { DrywallChangeOrder, DrywallProject, DrywallQuote } from '@/types/drywall'

const COMPANY_NAME = 'HSH Drywall'
const COMPANY_ADDRESS = 'PO Box 102 Lisbon, OH 44432'
const COMPANY_PHONE = '330-614-1127'
const COMPANY_EMAIL = 'mark@hshdrywall.com'

export interface DrywallChangeOrderPdfInput {
  project: Pick<DrywallProject, 'name' | 'client' | 'address'>
  quote: DrywallQuote | null
  po?: unknown
  changeOrder: DrywallChangeOrder
  changeOrders: DrywallChangeOrder[]
}

export interface DrywallChangeOrderPdfModel {
  number: string
  status: 'Draft' | 'Submitted' | 'Accepted' | 'Rejected'
  documentDate: Date
  requestedAmount: number
  acceptedAmount: number | null
  documentAmount: number
  baseContractValue: number | null
  priorAcceptedChangeOrders: number
  revisedContractValue: number | null
}

function finite(value: unknown): number {
  const parsed = Number(String(value ?? '').trim())
  return Number.isFinite(parsed) ? parsed : 0
}

function statusLabel(status: DrywallChangeOrder['status']): DrywallChangeOrderPdfModel['status'] {
  if (status === 'accepted' || status === 'approved') return 'Accepted'
  if (status === 'submitted') return 'Submitted'
  if (status === 'rejected') return 'Rejected'
  return 'Draft'
}

export function buildDrywallChangeOrderPdfModel(
  input: DrywallChangeOrderPdfInput,
  documentDate = new Date(),
): DrywallChangeOrderPdfModel {
  const current = input.changeOrder
  const status = statusLabel(current.status)
  const requestedAmount = finite(current.requestedAmount)
  const acceptedAmount =
    status === 'Accepted'
      ? finite(current.acceptedAmount ?? current.requestedAmount)
      : null
  const documentAmount = acceptedAmount ?? requestedAmount
  const baseContractValue = resolveBaseContractValue({ quote: input.quote, po: input.po })
  const priorAcceptedChangeOrders = acceptedChangeOrderTotal(
    input.changeOrders.filter((changeOrder) => changeOrder.id !== current.id),
  )
  const revisedContractValue =
    baseContractValue == null
      ? null
      : baseContractValue + priorAcceptedChangeOrders + documentAmount

  return {
    number: current.changeOrderNumber?.trim() || `CO-${current.id.slice(-6).toUpperCase()}`,
    status,
    documentDate,
    requestedAmount,
    acceptedAmount,
    documentAmount,
    baseContractValue,
    priorAcceptedChangeOrders,
    revisedContractValue,
  }
}

type PdfContext = {
  doc: jsPDF
  y: number
  pageW: number
  pageH: number
  margin: number
  maxW: number
  logo: DrywallPdfLogo | null
  footerLabel: string
}

function ensureRoom(ctx: PdfContext, height: number) {
  if (ctx.y + height <= ctx.pageH - DW_PAGE.bottomReserve) return
  ctx.doc.addPage()
  ctx.y = DW_PAGE.marginY
}

function drawHeader(ctx: PdfContext) {
  const { doc } = ctx
  const top = ctx.y
  let logoBottom = top
  if (ctx.logo) {
    const width = 120
    const height = (width / ctx.logo.naturalW) * ctx.logo.naturalH
    logoBottom = top + height
    try {
      doc.addImage(ctx.logo.dataUrl, 'PNG', ctx.margin, top, width, height)
    } catch {
      // Continue without the logo when the browser cannot encode it.
    }
  }

  const right = ctx.pageW - ctx.margin
  let y = top + 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  setTextRgb(doc, DW_BLUE)
  doc.text(COMPANY_NAME, right, y, { align: 'right' })
  y += 18
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setTextRgb(doc, DW_GRAY)
  doc.text(COMPANY_ADDRESS, right, y, { align: 'right' })
  y += 12
  doc.text(`Phone: ${COMPANY_PHONE} | Email: ${COMPANY_EMAIL}`, right, y, { align: 'right' })
  ctx.y = Math.max(logoBottom, y) + 12
  setDrawRgb(doc, DW_RED)
  doc.setLineWidth(3)
  doc.line(ctx.margin, ctx.y, right, ctx.y)
  ctx.y += 16
}

function drawMetadata(ctx: PdfContext, model: DrywallChangeOrderPdfModel) {
  const { doc } = ctx
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setTextRgb(doc, DW_TEXT)
  doc.text(`Change Order: ${model.number}`, ctx.margin, ctx.y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Issue Date: ${format(model.documentDate, 'MMM d, yyyy')}`, ctx.pageW / 2, ctx.y, {
    align: 'center',
  })
  doc.text(`Status: ${model.status}`, ctx.pageW - ctx.margin, ctx.y, { align: 'right' })
  ctx.y += 22
}

function drawPreparedForAndProject(ctx: PdfContext, project: DrywallChangeOrderPdfInput['project']) {
  const { doc } = ctx
  const gap = 24
  const columnWidth = (ctx.maxW - gap) / 2
  const rightX = ctx.margin + columnWidth + gap
  const startY = ctx.y
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  setTextRgb(doc, DW_BLUE)
  doc.text('PREPARED FOR', ctx.margin, ctx.y)
  doc.text('PROJECT', rightX, ctx.y)
  ctx.y += 14

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  setTextRgb(doc, DW_TEXT)
  const client = String(project.client || '[Not yet specified]')
  const projectText = [project.name || 'Project', project.address].filter(Boolean).join('\n')
  const clientLines = doc.splitTextToSize(client, columnWidth - 4)
  const projectLines = doc.splitTextToSize(projectText, columnWidth - 4)
  doc.text(clientLines, ctx.margin, ctx.y)
  doc.text(projectLines, rightX, ctx.y)
  ctx.y = startY + 14 + Math.max(clientLines.length, projectLines.length) * 12 + 8
}

function drawSectionTitle(ctx: PdfContext, title: string) {
  ensureRoom(ctx, 44)
  ctx.y += 16
  ctx.doc.setFont('helvetica', 'bold')
  ctx.doc.setFontSize(12)
  setTextRgb(ctx.doc, DW_RED)
  ctx.doc.text(title, ctx.margin, ctx.y)
  ctx.y += 16
}

function drawLabeledText(ctx: PdfContext, label: string, value: string) {
  const text = value.trim() || '—'
  const lines = ctx.doc.splitTextToSize(text, ctx.maxW - 12)
  ensureRoom(ctx, 18 + lines.length * 13)
  ctx.doc.setFont('helvetica', 'bold')
  ctx.doc.setFontSize(10)
  setTextRgb(ctx.doc, DW_TEXT)
  ctx.doc.text(label, ctx.margin + 6, ctx.y)
  ctx.y += 14
  ctx.doc.setFont('helvetica', 'normal')
  ctx.doc.text(lines, ctx.margin + 6, ctx.y)
  ctx.y += lines.length * 13 + 8
}

function currency(value: number | null): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

function acceptedAtLabel(value?: string): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : format(date, 'MMM d, yyyy h:mm a')
}

/**
 * Itemized detail grouped by location. Overhead + profit are baked into the customer-facing line
 * amounts (so the detail ties to the total) and are NEVER printed — the margin structure stays
 * internal. Returns false if no line items.
 */
function drawChangeOrderLineItems(
  ctx: PdfContext,
  scope: ChangeOrderScope,
  title: string,
): boolean {
  const totals = computeChangeOrderTotals(scope)
  if (!totals.hasLineItems) return false
  const multiGroup = totals.groups.length > 1
  // Distribute overhead + profit proportionally across the line amounts.
  const markup = totals.subtotal > 0 ? totals.total / totals.subtotal : 1
  const sell = (raw: number) => raw * markup

  const body: Array<Array<string | { content: string; colSpan?: number; styles?: object }>> = []
  for (const group of totals.groups) {
    group.lines.forEach((line, i) => {
      body.push([
        i === 0 ? group.location : '',
        line.description || '—',
        String(finite(line.quantity)),
        line.unit || '',
        currency(sell(changeOrderLineTotal(line))),
      ])
    })
    if (multiGroup) {
      body.push([
        { content: `Subtotal — ${group.location}`, colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: currency(sell(group.subtotal)), styles: { halign: 'right' } },
      ])
    }
  }

  const foot: Array<Array<{ content: string; colSpan?: number; styles?: object }>> = [
    [
      { content: 'Total', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: currency(totals.total), styles: { halign: 'right', fontStyle: 'bold', textColor: DW_BLUE } },
    ],
  ]

  drawSectionTitle(ctx, title)
  autoTable(ctx.doc, {
    startY: ctx.y,
    head: [['Location', 'Description', 'Qty', 'Unit', 'Amount']],
    body,
    foot,
    theme: 'grid',
    headStyles: AUTO_TABLE_HEAD,
    styles: AUTO_TABLE_BASE,
    footStyles: { fontStyle: 'normal', textColor: DW_TEXT, fillColor: [245, 245, 245] },
    margin: { left: ctx.margin, right: ctx.margin },
    columnStyles: {
      2: { halign: 'right', cellWidth: 44 },
      3: { cellWidth: 52 },
      4: { halign: 'right', cellWidth: 84 },
    },
  })
  ctx.y =
    (ctx.doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
    ctx.y + 100
  return true
}

function drawChangeOrderAmount(ctx: PdfContext, model: DrywallChangeOrderPdfModel) {
  drawSectionTitle(ctx, 'CHANGE ORDER AMOUNT')
  autoTable(ctx.doc, {
    startY: ctx.y,
    head: [['Description', 'Amount']],
    body: [
      [
        model.status === 'Accepted' ? 'Accepted Change Order Amount' : 'Proposed Change Order Amount',
        currency(model.documentAmount),
      ],
    ],
    theme: 'grid',
    headStyles: AUTO_TABLE_HEAD,
    styles: AUTO_TABLE_BASE,
    margin: { left: ctx.margin, right: ctx.margin },
    columnStyles: { 1: { halign: 'right', cellWidth: 120 } },
    bodyStyles: { fontStyle: 'bold', textColor: DW_BLUE },
  })
  ctx.y =
    (ctx.doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
    ctx.y + 100
}

function drawAcceptance(ctx: PdfContext, changeOrder: DrywallChangeOrder, model: DrywallChangeOrderPdfModel) {
  drawSectionTitle(ctx, model.status === 'Accepted' ? 'ACCEPTANCE RECORD' : 'CLIENT ACCEPTANCE')
  if (model.status === 'Accepted') {
    drawLabeledText(ctx, 'Accepted Amount', currency(model.acceptedAmount))
    drawLabeledText(
      ctx,
      'Accepted By',
      `${changeOrder.acceptedByName || 'Office user'}${
        changeOrder.acceptedAt
          ? ` · ${acceptedAtLabel(changeOrder.acceptedAt)}`
          : ''
      }`,
    )
    drawLabeledText(ctx, 'Customer Acceptance Reference', changeOrder.acceptanceReference || '—')
    return
  }

  ensureRoom(ctx, 90)
  const left = ctx.margin
  const right = ctx.pageW / 2 + 12
  const lineWidth = ctx.maxW / 2 - 24
  ctx.y += 18
  setDrawRgb(ctx.doc, DW_GRAY)
  ctx.doc.setLineWidth(0.75)
  ctx.doc.line(left, ctx.y, left + lineWidth, ctx.y)
  ctx.doc.line(right, ctx.y, right + lineWidth, ctx.y)
  ctx.y += 14
  ctx.doc.setFont('helvetica', 'normal')
  ctx.doc.setFontSize(9)
  setTextRgb(ctx.doc, DW_GRAY)
  ctx.doc.text('Authorized Client Signature', left, ctx.y)
  ctx.doc.text('Date', right, ctx.y)
  ctx.y += 22
  ctx.doc.text(
    'By signing, the client authorizes the scope and contract-value adjustment shown above.',
    left,
    ctx.y,
  )
}

function drawFooter(ctx: PdfContext) {
  const total = ctx.doc.getNumberOfPages()
  for (let page = 1; page <= total; page += 1) {
    ctx.doc.setPage(page)
    ctx.doc.setFont('helvetica', 'normal')
    ctx.doc.setFontSize(8)
    setTextRgb(ctx.doc, DW_GRAY)
    ctx.doc.text(ctx.footerLabel, ctx.margin, DW_PAGE.footerY)
    ctx.doc.text(`Page ${page} of ${total}`, ctx.pageW - ctx.margin, DW_PAGE.footerY, {
      align: 'right',
    })
  }
}

export async function downloadDrywallChangeOrderPdf(
  input: DrywallChangeOrderPdfInput,
): Promise<void> {
  const model = buildDrywallChangeOrderPdfModel(input)
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const ctx: PdfContext = {
    doc,
    y: DW_PAGE.marginY,
    pageW,
    pageH,
    margin: DW_PAGE.marginX,
    maxW: pageW - DW_PAGE.marginX * 2,
    logo: await loadDrywallPdfLogo(),
    footerLabel: model.number,
  }

  drawHeader(ctx)
  drawMetadata(ctx, model)
  drawPreparedForAndProject(ctx, input.project)
  const description =
    input.changeOrder.description?.trim() ||
    [input.changeOrder.reason, input.changeOrder.scopeChanges]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join('\n\n')
  if (description) {
    drawSectionTitle(ctx, 'DESCRIPTION OF CHANGE')
    drawLabeledText(ctx, 'Scope of Work', description)
  }

  const options = input.changeOrder.options ?? []
  if (options.length > 0) {
    drawSectionTitle(ctx, 'OPTIONS — SELECT ONE')
    drawLabeledText(
      ctx,
      '',
      'This change order presents the following options. Select one; pricing is per option.',
    )
    options.forEach((option, index) => {
      const label = `OPTION ${String.fromCharCode(65 + index)}${option.name ? ` — ${option.name}` : ''}`
      drawChangeOrderLineItems(ctx, option, label)
    })
  } else {
    drawChangeOrderLineItems(ctx, input.changeOrder, 'CHANGE ORDER DETAIL')
  }

  if (input.changeOrder.notes?.trim()) {
    drawLabeledText(ctx, 'Notes', input.changeOrder.notes)
  }
  // For an options CO, the headline amount only makes sense once one is accepted.
  if (options.length === 0 || model.status === 'Accepted') {
    drawChangeOrderAmount(ctx, model)
  }
  drawAcceptance(ctx, input.changeOrder, model)
  drawFooter(ctx)

  const safeProject = (input.project.name || 'Project').replace(/[/\\:*?"<>|]/g, '-')
  const safeNumber = model.number.replace(/[/\\:*?"<>|]/g, '-')
  doc.save(`${safeProject} - ${safeNumber}.pdf`)
}
