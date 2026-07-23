// ============================================================================
// Drywall material order PDF — independent from drywallQuotePdf / clientQuotePdf
// ============================================================================

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { orderStatusLabel } from '@/lib/drywall/orderConstants'
import { groupOrderItemsByArea } from '@/lib/drywall/orderSuggest'
import type { OrderFinancialComparison } from '@/lib/drywall/orderFinancialComparison'
import { orderPdfFilename } from '@/lib/drywall/orderPdfFilename'
import type { DrywallOrder, DrywallProject } from '@/types/drywall'

export { downloadDrywallFieldMaterialsPdf } from '@/lib/drywall/fieldMaterialsOrderPdf'

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0)

const BRAND = '#cf533e'
const COMPANY_NAME = 'HSH Drywall'

export function downloadDrywallOrderPdf(
  project: Pick<DrywallProject, 'name' | 'address' | 'client'>,
  order: DrywallOrder,
): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14
  let y = 18

  doc.setFillColor(244, 248, 252)
  doc.rect(0, 0, pageW, 22, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(18, 86, 120)
  doc.text('MATERIAL ORDER', pageW - margin, 14, { align: 'right' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(60, 60, 60)
  doc.text(COMPANY_NAME, margin, 13)

  y = 30
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(project.name || 'Project', margin, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  if (project.address) {
    doc.text(project.address, margin, y)
    y += 5
  }
  if (project.client) {
    doc.text(`Client: ${project.client}`, margin, y)
    y += 5
  }

  const metaX = pageW / 2
  let metaY = 30
  doc.setFont('helvetica', 'bold')
  doc.text('Order details', metaX, metaY)
  metaY += 5
  doc.setFont('helvetica', 'normal')
  const orderLabel = order.orderNumber?.trim() || `Order ${order.id.slice(-6)}`
  doc.text(`Order: ${orderLabel}`, metaX, metaY)
  metaY += 5
  doc.text(`Status: ${orderStatusLabel(order.status)}`, metaX, metaY)
  metaY += 5
  if (order.supplier) {
    doc.text(`Supplier: ${order.supplier}`, metaX, metaY)
    metaY += 5
  }
  if (order.supplierContact) {
    doc.text(`Contact: ${order.supplierContact}`, metaX, metaY)
    metaY += 5
  }
  if (order.deliveryDate) {
    doc.text(`Delivery: ${order.deliveryDate}`, metaX, metaY)
    metaY += 5
  }
  if (order.deliveryAddress) {
    const wrapped = doc.splitTextToSize(`Ship to: ${order.deliveryAddress}`, pageW / 2 - margin - 4)
    doc.text(wrapped, metaX, metaY)
    metaY += wrapped.length * 4
  }
  doc.text(`Generated: ${new Date().toLocaleString()}`, metaX, metaY)

  y = Math.max(y, metaY) + 8

  const groups = groupOrderItemsByArea(order.items || [])
  const showAreaHeaders = groups.length > 1
  const body: Array<Array<string | { content: string; colSpan?: number; styles?: object }>> = []
  if (!order.items || order.items.length === 0) {
    body.push(['No line items', '', '', ''])
  } else {
    for (const group of groups) {
      if (showAreaHeaders) {
        body.push([
          {
            content: group.area,
            colSpan: 4,
            styles: { fillColor: [232, 236, 244], textColor: 40, fontStyle: 'bold', fontSize: 8.5 },
          },
        ])
      }
      for (const item of group.items) {
        body.push([item.description || '—', item.quantity || '', item.unit || 'pcs', item.notes || ''])
      }
    }
  }

  autoTable(doc, {
    startY: y,
    head: [['Description', 'Qty', 'Unit', 'Notes']],
    body,
    theme: 'grid',
    headStyles: { fillColor: BRAND, textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: 40 },
    margin: { left: margin, right: margin },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 18, halign: 'right' },
      2: { cellWidth: 16, halign: 'right' },
      3: { cellWidth: 40 },
    },
  })

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20
  if (order.notes?.trim()) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('Notes', margin, finalY + 8)
    doc.setFont('helvetica', 'normal')
    const noteLines = doc.splitTextToSize(order.notes, pageW - margin * 2)
    doc.text(noteLines, margin, finalY + 13)
  }

  doc.save(orderPdfFilename(project.name || 'Project'))
}

/** Labor rate card for field crews — order-stage revised rates × measured sqft (legacy OrderStage rate card PDF). */
export function downloadDrywallLaborRateCardPdf(
  project: Pick<DrywallProject, 'name'>,
  comparison: Pick<
    OrderFinancialComparison,
    | 'revisedSqft'
    | 'revisedHangerRate'
    | 'revisedFinisherRate'
    | 'revisedPrepRate'
    | 'revisedHangerPay'
    | 'revisedFinisherPay'
    | 'revisedPrepPay'
  >,
  options?: { reviewNotes?: string },
): void {
  const projectName = project.name || 'Unnamed project'
  const effectiveSqft = comparison.revisedSqft || 0

  const rows: { role: string; rate: number; payout: number }[] = [
    { role: 'Hanger', rate: comparison.revisedHangerRate, payout: comparison.revisedHangerPay },
    { role: 'Finisher', rate: comparison.revisedFinisherRate, payout: comparison.revisedFinisherPay },
    { role: 'Prep / clean', rate: comparison.revisedPrepRate, payout: comparison.revisedPrepPay },
  ].filter((r) => r.rate > 0 || r.payout > 0)

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 14
  let y = 20

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(30, 30, 30)
  doc.text('Rate Card', margin, y)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(90, 90, 90)
  y += 7
  doc.text(`Project: ${projectName}`, margin, y)
  y += 5
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y)

  y += 10
  doc.setDrawColor(220, 220, 220)
  doc.line(margin, y, pageW - margin, y)

  y += 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(40, 40, 40)
  doc.text('Labor rate payout summary', margin, y)

  y += 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(
    `Sqft: ${effectiveSqft.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
    margin,
    y,
  )

  const tableTop = y + 6
  const colRole = margin
  const colRate = margin + 52
  const colSqft = margin + 95
  const colPayout = pageW - margin
  const rowH = 8

  doc.setFillColor(245, 247, 250)
  doc.rect(margin, tableTop, pageW - margin * 2, rowH, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(70, 70, 70)
  doc.text('Role', colRole + 1, tableTop + 5.2)
  doc.text('Rate ($/sqft)', colRate + 1, tableTop + 5.2)
  doc.text('Sqft', colSqft + 1, tableTop + 5.2)
  doc.text('Payout ($)', colPayout - 1, tableTop + 5.2, { align: 'right' })

  rows.forEach((row, idx) => {
    const rowY = tableTop + rowH + idx * rowH
    doc.setDrawColor(232, 232, 232)
    doc.line(margin, rowY + rowH, pageW - margin, rowY + rowH)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(35, 35, 35)
    doc.text(row.role, colRole + 1, rowY + 5.2)
    doc.text(fmtCurrency(row.rate), colRate + 1, rowY + 5.2)
    doc.text(
      effectiveSqft.toLocaleString(undefined, { maximumFractionDigits: 0 }),
      colSqft + 1,
      rowY + 5.2,
    )
    doc.text(fmtCurrency(row.payout), colPayout - 1, rowY + 5.2, { align: 'right' })
  })

  const totalPayout = rows.reduce((sum, r) => sum + r.payout, 0)
  const totalY = tableTop + rowH + rows.length * rowH + 7
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(25, 25, 25)
  doc.text(`Total payout: ${fmtCurrency(totalPayout)}`, colPayout, totalY, { align: 'right' })

  if (options?.reviewNotes?.trim()) {
    let notesY = totalY + 12
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Review notes', margin, notesY)
    notesY += 5
    doc.setFont('helvetica', 'normal')
    const lines = doc.splitTextToSize(options.reviewNotes.trim(), pageW - margin * 2)
    doc.text(lines, margin, notesY)
  }

  const safeName = projectName.replace(/[^a-z0-9]/gi, '-')
  doc.save(`Rate-Card-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`)
}
