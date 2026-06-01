// ============================================================================
// Drywall workspace quote PDF — separate from GC clientQuotePdf (Section 0 rule)
// ============================================================================

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { calculateQuoteTotals } from '@/lib/drywall/quoteCalculations'
import type { DrywallProject } from '@/types/drywall'
import type { DrywallQuote, DrywallQuoteCalculations } from '@/types/drywall'

const BRAND = '#cf533e'
const COMPANY_NAME = 'HSH Drywall'
const COMPANY_ADDRESS = 'PO Box 102 Lisbon, OH 44432'
const COMPANY_PHONE = '330-614-1127'
const COMPANY_EMAIL = 'mark@hshdrywall.com'

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0)

const formatNum = (n: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n ?? 0)

function scopeText(quote: DrywallQuote): string {
  if (quote.useCustomScopeOfWork && quote.customScopeOfWork) {
    return String(quote.customScopeOfWork)
  }
  return String(quote.scopeOfWork || '')
}

export function downloadDrywallQuotePdf(
  project: Pick<DrywallProject, 'name' | 'client' | 'address'>,
  quote: DrywallQuote,
  calculations: DrywallQuoteCalculations,
): void {
  const quoteForCalc = { ...quote, version: undefined } as DrywallQuote
  const totals = calculateQuoteTotals(quoteForCalc, calculations)
  const breakdowns = quote.breakdowns || []
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()
  const m = 40
  let y = m

  doc.setFontSize(18)
  doc.setTextColor(BRAND)
  doc.text(COMPANY_NAME, m, y)
  y += 18
  doc.setFontSize(9)
  doc.setTextColor(100)
  doc.text(COMPANY_ADDRESS, m, y)
  y += 12
  doc.text(`${COMPANY_PHONE}  •  ${COMPANY_EMAIL}`, m, y)
  y += 8
  doc.setDrawColor(BRAND)
  doc.setLineWidth(2)
  doc.line(m, y + 6, pageW - m, y + 6)
  y += 24

  doc.setFontSize(10)
  doc.setTextColor(50)
  doc.text(`Quote Date: ${date}`, m, y)
  doc.text(`Project: ${project.name || '—'}`, pageW / 2, y)
  y += 14
  doc.text(`Client: ${project.client || '—'}`, m, y)
  if (project.address) {
    y += 14
    doc.text(`Address: ${project.address}`, m, y)
  }
  y += 22

  const scope = scopeText(quote)
  if (scope.trim()) {
    doc.setFontSize(12)
    doc.setTextColor(BRAND)
    doc.text('Scope of Work', m, y)
    y += 14
    doc.setFontSize(9)
    doc.setTextColor(40)
    const lines = doc.splitTextToSize(scope, pageW - m * 2)
    doc.text(lines, m, y)
    y += lines.length * 11 + 12
  }

  if (breakdowns.length > 0) {
    doc.setFontSize(12)
    doc.setTextColor(BRAND)
    doc.text('Floor / Area Breakdown', m, y)
    y += 8

    const body = breakdowns.map((item) => {
      const rowCalc: DrywallQuoteCalculations = {}
      const base = { ...quoteForCalc, breakdowns: [item], options: [] }
      const full = calculateQuoteTotals(base, rowCalc)
      const drywallOnly = calculateQuoteTotals(
        {
          ...base,
          includeRcChannel: false,
          includeSuspendedGrid: false,
          includeMetalStudFraming: false,
          includeInsulation: false,
          includeAcousticCeiling: false,
          includeFRP: false,
        },
        rowCalc,
      )
      const rcOnly = calculateQuoteTotals(
        {
          ...base,
          includeSuspendedGrid: false,
          includeMetalStudFraming: false,
          includeInsulation: false,
          includeAcousticCeiling: false,
          includeFRP: false,
          breakdowns: [
            {
              ...item,
              sqft: 0,
              suspendedGridSqft: 0,
              suspendedGridPerimeter: 0,
              metalStudWallLf: 0,
              metalStudEntries: [],
            },
          ],
        },
        rowCalc,
      )
      return [
        item.description || '—',
        formatNum(parseFloat(String(item.sqft)) || 0),
        formatCurrency(drywallOnly?.breakdownTotal ?? 0),
        formatCurrency(rcOnly?.breakdownTotal ?? 0),
        formatCurrency(full?.breakdownTotal ?? item.itemTotal ?? 0),
      ]
    })

    autoTable(doc, {
      startY: y,
      head: [['Description', 'Sq Ft', 'Drywall', 'RC Channel', 'Total']],
      body,
      margin: { left: m, right: m },
      styles: { fontSize: 9 },
      headStyles: { fillColor: [207, 83, 62] },
    })
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16
  } else {
    doc.setFontSize(10)
    doc.text(`Total Sq Ft (w/ waste): ${formatNum(Number(calculations.sqft) || 0)}`, m, y)
    y += 20
  }

  const totalDirect = totals.totalDirectCost ?? calculations.totalDirectCost ?? 0
  const overhead = totals.overheadAmount ?? calculations.overheadAmount ?? 0
  const profit = totals.profitAmount ?? calculations.profitAmount ?? 0
  const salesTax = totals.totalSalesTax ?? calculations.salesTax ?? 0
  const finalTotal =
    totals.totalQuote ??
    calculations.finalTotal ??
    (calculations.subtotalAfterProfit as number) + (totals.selectedOptionsTotal || 0)

  autoTable(doc, {
    startY: y,
    body: [
      ['Direct cost', formatCurrency(totalDirect)],
      ['Overhead', formatCurrency(overhead)],
      ['Profit', formatCurrency(profit)],
      ['Sales tax (material)', formatCurrency(salesTax)],
      ['Quote total', formatCurrency(finalTotal)],
    ],
    margin: { left: pageW / 2, right: m },
    theme: 'plain',
    styles: { fontSize: 10 },
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
  })

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 40
  doc.setDrawColor(180)
  doc.line(m, y, pageW - m - 120, y)
  doc.setFontSize(9)
  doc.setTextColor(80)
  doc.text('Authorized signature', m, y + 14)

  const safeName = (project.name || 'drywall-quote').replace(/[^\w\-]+/g, '_')
  doc.save(`${safeName}-quote.pdf`)
}
