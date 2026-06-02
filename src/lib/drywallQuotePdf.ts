// ============================================================================
// Drywall workspace quote PDF — separate from GC clientQuotePdf (Section 0 rule)
// ============================================================================

import jsPDF from 'jspdf'
import { calculateQuoteTotals } from '@/lib/drywall/quoteCalculations'
import type { DrywallProject, DrywallQuote, DrywallQuoteCalculations } from '@/types/drywall'

const BRAND = [207, 83, 62] as const
const COMPANY_NAME = 'HSH Drywall'
const COMPANY_ADDRESS = 'PO Box 102 Lisbon, OH 44432'
const COMPANY_PHONE = '330-614-1127'
const COMPANY_EMAIL = 'mark@hshdrywall.com'

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0)

const toNum = (v: unknown): number => parseFloat(String(v ?? 0)) || 0

function textOrBlank(value: unknown): string {
  const v = String(value ?? '').trim()
  return v
}

type ScopeBlock = { heading?: string; lines: string[] }

function quoteScopeBlocks(quote: DrywallQuote): ScopeBlock[] {
  if (quote.useCustomScopeOfWork && textOrBlank(quote.customScopeOfWork)) {
    return [{ lines: [String(quote.customScopeOfWork)] }]
  }

  const blocks: ScopeBlock[] = []
  const scope = String(quote.drywallScope || 'hang_and_finish')
  blocks.push({
    lines: [
      `Drywall: ${
        scope === 'hang_only'
          ? 'Hang only. Finish not included.'
          : scope === 'finish_only'
            ? 'Finish only. Hang not included.'
            : 'Hang and finish included.'
      }`,
    ],
  })

  const ceilingThickness = textOrBlank(quote.ceilingThickness)
  const wallThickness = textOrBlank(quote.wallThickness)
  const hangExceptions = textOrBlank(quote.hangExceptions)
  const ceilingFinish = textOrBlank(quote.ceilingFinishOther || quote.ceilingFinish)
  const wallFinish = textOrBlank(quote.wallFinishOther || quote.wallFinish)
  const finishExceptions = textOrBlank(quote.ceilingExceptions || quote.wallExceptions)
  const notes = textOrBlank(quote.scopeOfWork)

  const hangLines: string[] = []
  if (ceilingThickness) hangLines.push(`Ceiling Thickness: ${ceilingThickness}`)
  if (wallThickness) hangLines.push(`Wall Thickness: ${wallThickness}`)
  if (hangExceptions) hangLines.push(`Exceptions: ${hangExceptions}`)
  if (hangLines.length) blocks.push({ heading: 'Hang Specifications:', lines: hangLines })

  const finishLines: string[] = []
  if (ceilingFinish) finishLines.push(`Ceiling Finish: ${ceilingFinish}`)
  if (wallFinish) finishLines.push(`Wall Finish: ${wallFinish}`)
  if (finishExceptions) finishLines.push(`Exceptions: ${finishExceptions}`)
  if (finishLines.length) blocks.push({ heading: 'Finish Specifications:', lines: finishLines })

  const addonLines: string[] = []
  if (quote.includeSuspendedGrid) addonLines.push('Suspended Drywall Grid Ceiling: Material and labor per plans/specs')
  if (quote.includeRcChannel) addonLines.push('RC Channel: Labor and material per plans/specs')
  if (quote.includeMetalStudFraming) addonLines.push('Metal Stud Framing: Labor and material per plans/specs')
  if (quote.includeAcousticCeiling) addonLines.push('Acoustic Ceiling Tile & Grid: Labor and material per plans/specs')
  if (quote.includeFRP) addonLines.push('FRP: Labor and material per plans/specs')
  if (addonLines.length) blocks.push({ lines: addonLines })

  if (notes) blocks.push({ heading: 'Additional Notes:', lines: [notes] })

  return blocks
}

export function downloadDrywallQuotePdf(
  project: Pick<DrywallProject, 'name' | 'client' | 'address'>,
  quote: DrywallQuote,
  calculations: DrywallQuoteCalculations,
): void {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 26
  const maxW = pageW - margin * 2
  let y = margin
  const quoteForCalc = { ...quote, version: undefined } as DrywallQuote
  const totals = calculateQuoteTotals(quoteForCalc, calculations)

  const ensureRoom = (h = 28) => {
    if (y + h <= pageH - margin) return
    doc.addPage()
    y = margin
  }

  const drawSectionTitle = (title: string) => {
    ensureRoom(22)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...BRAND)
    doc.text(title, margin, y)
    y += 8
    doc.setDrawColor(229, 231, 235)
    doc.setLineWidth(0.5)
    doc.line(margin, y, pageW - margin, y)
    y += 12
  }

  const drawScopeBlock = (block: ScopeBlock) => {
    if (block.heading) {
      ensureRoom(14)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(28, 28, 28)
      doc.text(block.heading, margin + 4, y)
      y += 12
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(25, 25, 25)
    for (const raw of block.lines) {
      const wrapped = doc.splitTextToSize(`• ${raw}`, maxW - (block.heading ? 18 : 10))
      ensureRoom(wrapped.length * 11 + 3)
      doc.text(wrapped, margin + (block.heading ? 12 : 4), y)
      y += wrapped.length * 10 + 3
    }
    y += 4
  }

  const subtotalBeforeTax =
    (totals.subtotal || 0) + (totals.profitAmount || 0) - (totals.totalSalesTax || 0)
  const costBase = totals.totalDirectCost || 0
  const matBase = toNum(calculations.totalMaterialCost)
  const laborBase = toNum(calculations.totalLaborCost)
  const profit = totals.profitAmount || 0
  const materialsBlended = costBase > 0 ? matBase + (matBase / costBase) * profit : matBase
  const laborBlended = Math.max(0, (totals.breakdownTotal || 0) - materialsBlended)

  // Header
  doc.setDrawColor(...BRAND)
  doc.setLineWidth(1.2)
  doc.line(0, 0, pageW, 0)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(...BRAND)
  doc.text(COMPANY_NAME, margin, y + 10)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(90, 90, 90)
  doc.text(COMPANY_ADDRESS, margin, y + 24)
  doc.text(`Phone: ${COMPANY_PHONE} | Email: ${COMPANY_EMAIL}`, margin, y + 36)
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  doc.setTextColor(20, 20, 20)
  doc.text(`Quote # ${(project as unknown as { id?: string }).id || 'N/A'}`, margin, y + 52)
  doc.text(`Date: ${date}`, pageW - margin, y + 52, { align: 'right' })
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(`Project: ${project.name || 'Project'}`, margin, y + 72)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(90, 90, 90)
  if (project.address) doc.text(`Address: ${project.address}`, margin, y + 86)
  y += 102
  doc.setDrawColor(...BRAND)
  doc.setLineWidth(1)
  doc.line(margin, y, pageW - margin, y)
  y += 30

  // Scope
  drawSectionTitle('SCOPE OF WORK')
  for (const block of quoteScopeBlocks(quote)) {
    drawScopeBlock(block)
  }
  if (toNum(calculations.durationDays) > 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(20, 20, 20)
    doc.text(`Approximate duration: ${toNum(calculations.durationDays).toFixed(0)} Days`, margin + 4, y + 4)
    y += 16
  }
  y += 6

  // Breakdown (optional)
  const breakdowns = quote.breakdowns || []
  if (breakdowns.length > 0) {
    drawSectionTitle('BREAKDOWN BY ITEM')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(20, 20, 20)
    breakdowns.forEach((item, idx) => {
      ensureRoom(16)
      const rowCalc: DrywallQuoteCalculations = {}
      const full = calculateQuoteTotals({ ...quoteForCalc, breakdowns: [item], options: [] }, rowCalc)
      const total = full.breakdownTotal || toNum(item.itemTotal)
      doc.text(`• ${idx + 1}. ${item.description || 'Untitled'}`, margin + 4, y)
      doc.text(formatCurrency(total), pageW - margin, y, { align: 'right' })
      y += 14
    })
    y += 6
  }

  // Options (show all, include/optional tags)
  const options = quote.options || []
  if (options.length > 0) {
    drawSectionTitle('OPTIONS')
    options.forEach((opt) => {
      ensureRoom(16)
      const optSqft = opt.useTotalSqft ? toNum(calculations.sqft) : toNum(opt.sqft)
      const optRate = toNum(opt.rate)
      const amount = optSqft > 0 && optRate > 0 ? optSqft * optRate : toNum(opt.price)
      const status = opt.selected ? '[INCLUDED]' : '[OPTIONAL]'
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(opt.selected ? 20 : 105, opt.selected ? 20 : 105, opt.selected ? 20 : 105)
      doc.text(`${status} ${String(opt.description || 'Option')}`, margin + 4, y)
      doc.text(formatCurrency(amount), pageW - margin, y, { align: 'right' })
      y += 14
    })
    y += 6
    const selectedOptionsTotal =
      totals.selectedOptionsTotal || options.filter((o) => o.selected).reduce((sum, o) => sum + toNum(o.price), 0)
    if (selectedOptionsTotal > 0) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(20, 20, 20)
      doc.text('Selected Options Total:', margin, y)
      doc.text(formatCurrency(selectedOptionsTotal), pageW - margin, y, { align: 'right' })
      y += 16
    }
  }

  // Legacy-style summary box (red outline)
  ensureRoom(132)
  const total =
    totals.totalQuote ||
    toNum(calculations.finalTotal) ||
    toNum(calculations.subtotalAfterProfit) + toNum(totals.selectedOptionsTotal)
  const boxH = 124
  doc.setDrawColor(...BRAND)
  doc.setLineWidth(1)
  doc.rect(margin, y, maxW, boxH)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(20, 20, 20)
  const leftX = margin + 12
  const rightX = pageW - margin - 12
  let rowY = y + 22
  doc.text('Subtotal (before tax):', leftX, rowY)
  doc.text(formatCurrency(subtotalBeforeTax), rightX, rowY, { align: 'right' })
  rowY += 16
  doc.text('Sales Tax:', leftX, rowY)
  doc.text(formatCurrency(totals.totalSalesTax || 0), rightX, rowY, { align: 'right' })
  rowY += 18
  doc.setFont('helvetica', 'bold')
  doc.text('Cost Breakdown:', leftX, rowY)
  rowY += 16
  doc.setFont('helvetica', 'normal')
  doc.text('Materials:', leftX + 8, rowY)
  doc.text(formatCurrency(materialsBlended), rightX, rowY, { align: 'right' })
  rowY += 16
  doc.text('Labor:', leftX + 8, rowY)
  doc.text(formatCurrency(laborBlended), rightX, rowY, { align: 'right' })
  rowY += 10
  doc.setDrawColor(...BRAND)
  doc.setLineWidth(0.8)
  doc.line(leftX, rowY, rightX, rowY)
  rowY += 18
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...BRAND)
  doc.text('TOTAL QUOTE:', leftX, rowY)
  doc.text(formatCurrency(total), rightX, rowY, { align: 'right' })
  y += boxH + 14

  // Footer
  ensureRoom(48)
  doc.setDrawColor(229, 231, 235)
  doc.line(margin, y, pageW - margin, y)
  y += 13
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(90, 90, 90)
  const quoteIncludes = String(quote.quoteIncludes || 'labor_and_material')
  doc.text(
    quoteIncludes === 'labor_only'
      ? 'This quote includes labor only. Materials are not included.'
      : 'This quote includes labor and materials.',
    margin,
    y,
  )
  y += 14
  doc.text('If you have questions or would like to proceed, please contact us.', margin, y)
  y += 14
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...BRAND)
  doc.text('HSH Drywall', margin, y)

  const quoteDate = new Date().toLocaleDateString('en-US').replace(/\//g, '-')
  const safeName = (project.name || 'Project').replace(/[/\\:*?"<>|]/g, '-')
  doc.save(`${safeName} - HSH Drywall (${quoteDate}).pdf`)
}
