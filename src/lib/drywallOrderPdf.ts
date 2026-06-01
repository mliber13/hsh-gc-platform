// ============================================================================
// Drywall material order PDF — independent from drywallQuotePdf / clientQuotePdf
// ============================================================================

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { orderStatusLabel } from '@/lib/drywall/orderConstants'
import type { DrywallOrder, DrywallProject } from '@/types/drywall'

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

  const rows = (order.items || []).map((item) => [
    item.description || '—',
    item.quantity || '',
    item.unit || 'pcs',
    item.notes || '',
  ])

  autoTable(doc, {
    startY: y,
    head: [['Description', 'Qty', 'Unit', 'Notes']],
    body: rows.length ? rows : [['No line items', '', '', '']],
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

  const safeName = (project.name || 'Project').replace(/[^a-z0-9]/gi, '-')
  const orderPart = (order.orderNumber || order.id.slice(-6)).replace(/[^a-z0-9]/gi, '-')
  doc.save(`Order-${safeName}-${orderPart}.pdf`)
}

/** Field takeoff materials summary PDF (legacy “Download order PDF” on Order stage). */
export function downloadDrywallFieldMaterialsPdf(
  project: Pick<DrywallProject, 'name' | 'address' | 'client'>,
  items: { description: string; quantity: string; unit: string; notes?: string }[],
): void {
  const pseudoOrder: DrywallOrder = {
    id: 'field-summary',
    orderNumber: 'Field materials',
    status: 'draft',
    notes: 'Generated from field measurement takeoff',
    items: items.map((row, i) => ({
      id: `row-${i}`,
      description: row.description,
      quantity: row.quantity,
      unit: row.unit,
      notes: row.notes,
    })),
  }
  downloadDrywallOrderPdf(project, pseudoOrder)
}
