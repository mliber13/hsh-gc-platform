// ============================================================================
// Purchase Order PDF Export
// ============================================================================

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'

export interface POForPdf {
  id: string
  subcontractorName: string | null
  poNumber: string | null
  status: string
  issuedAt: Date | null
  createdAt: Date
  lines: { id: string; description: string; quantity: number; unit: string; unitPrice: number; amount: number }[]
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

/**
 * Generate and download a PDF for a purchase order.
 */
export function exportPOToPDF(po: POForPdf, projectName?: string): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 14
  let yPos = 20

  // Company / title block
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('PURCHASE ORDER', margin, yPos)
  yPos += 10

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  if (projectName) {
    doc.text(`Project: ${projectName}`, margin, yPos)
    yPos += 6
  }

  const subName = po.subcontractorName ?? 'Subcontractor'
  doc.setFont('helvetica', 'bold')
  doc.text('Vendor:', margin, yPos)
  doc.setFont('helvetica', 'normal')
  doc.text(subName, margin + 22, yPos)
  yPos += 8

  // PO number and dates (right-aligned)
  const rightX = pageWidth - margin
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  if (po.poNumber) {
    doc.text(`PO Number: ${po.poNumber}`, rightX, yPos - 8, { align: 'right' })
  } else {
    doc.setTextColor(140, 140, 140)
    doc.text('Draft', rightX, yPos - 8, { align: 'right' })
    doc.setTextColor(0, 0, 0)
  }
  doc.text(`Date: ${po.issuedAt ? format(new Date(po.issuedAt), 'MMM d, yyyy') : format(new Date(po.createdAt), 'MMM d, yyyy')}`, rightX, yPos - 2, { align: 'right' })
  if (po.status === 'draft') {
    doc.setFontSize(9)
    doc.setTextColor(180, 83, 9)
    doc.text('DRAFT — Not issued', rightX, yPos + 4, { align: 'right' })
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(10)
  }
  yPos += 14

  // Line items table
  const tableBody = po.lines.map((line) => [
    line.description,
    String(line.quantity),
    line.unit,
    formatCurrency(line.unitPrice),
    formatCurrency(line.amount),
  ])

  autoTable(doc, {
    startY: yPos,
    head: [['Description', 'Qty', 'Unit', 'Unit Price', 'Amount']],
    body: tableBody,
    theme: 'striped',
    headStyles: { fillColor: [41, 128, 185], fontSize: 10 },
    styles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 18, halign: 'right' },
      2: { cellWidth: 22, halign: 'center' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 28, halign: 'right' },
    },
  })

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  yPos = finalY + 8

  // Total
  const total = po.lines.reduce((sum, l) => sum + l.amount, 0)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(`Total: ${formatCurrency(total)}`, pageWidth - margin - 30, yPos, { align: 'right' })

  // Filename: prefer PO number, else draft identifier
  const safeSub = subName.replace(/[^a-z0-9]/gi, '_').slice(0, 20)
  const filename = po.poNumber ? `PO-${po.poNumber}.pdf` : `PO-Draft-${safeSub}.pdf`
  doc.save(filename)
}
