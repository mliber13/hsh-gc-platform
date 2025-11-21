// ============================================================================
// Pro Forma Export Service
// ============================================================================
//
// Service for exporting Pro Forma projections to PDF and Excel
//

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { ProFormaProjection } from '@/types/proforma'
import { format } from 'date-fns'

/**
 * Export Pro Forma projection to PDF
 */
export function exportProFormaToPDF(projection: ProFormaProjection): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  let yPos = 20

  // Helper functions
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)

  const formatPercent = (value: number) => `${value.toFixed(1)}%`

  // Title
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Pro Forma Financial Projection', pageWidth / 2, yPos, { align: 'center' })
  yPos += 8

  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(projection.projectName, pageWidth / 2, yPos, { align: 'center' })
  doc.text(`Generated: ${format(new Date(), 'MMM dd, yyyy')}`, pageWidth / 2, yPos + 5, { align: 'center' })
  yPos += 15

  // Financial Summary
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Financial Summary', 14, yPos)
  yPos += 8

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  
  const summaryData = [
    ['Contract Value', formatCurrency(projection.contractValue)],
    ['Total Estimated Cost', formatCurrency(projection.totalEstimatedCost)],
    ['Projected Profit', formatCurrency(projection.projectedProfit)],
    ['Projected Margin', formatPercent(projection.projectedMargin)],
  ]

  if (projection.summary.monthlyRentalIncome > 0) {
    summaryData.push(
      ['Monthly Rental Income', formatCurrency(projection.summary.monthlyRentalIncome)],
      ['Annual Rental Income', formatCurrency(projection.summary.annualRentalIncome)],
      ['Net Operating Income (NOI)', formatCurrency(projection.summary.netOperatingIncome)],
      ['Cash Flow After Debt', formatCurrency(projection.summary.cashFlowAfterDebt)]
    )
  }

  autoTable(doc, {
    startY: yPos,
    head: [['Metric', 'Value']],
    body: summaryData,
    theme: 'striped',
    headStyles: { fillColor: [59, 130, 246] },
    styles: { fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 60, halign: 'right' },
    },
  })

  yPos = (doc as any).lastAutoTable.finalY + 10

  // Rental Summary (if applicable)
  if (projection.rentalSummary.totalUnits > 0) {
    if (yPos > pageHeight - 60) {
      doc.addPage()
      yPos = 20
    }

    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Rental Income Summary', 14, yPos)
    yPos += 8

    const rentalData = [
      ['Total Units', projection.rentalSummary.totalUnits.toString()],
      ['Total Square Footage', projection.rentalSummary.totalProjectSquareFootage.toLocaleString() + ' sqft'],
      ['Rental Units Square Footage', projection.rentalSummary.totalSquareFootage.toLocaleString() + ' sqft'],
      ['Average Rent Per Unit', formatCurrency(projection.rentalSummary.averageRentPerUnit)],
      ['Average Rent Per Sqft', formatCurrency(projection.rentalSummary.averageRentPerSqft)],
      ['Occupancy Rate', formatPercent(projection.rentalSummary.stabilizedOccupancy)],
    ]

    autoTable(doc, {
      startY: yPos,
      head: [['Metric', 'Value']],
      body: rentalData,
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] },
      styles: { fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 60, halign: 'right' },
      },
    })

    yPos = (doc as any).lastAutoTable.finalY + 10
  }

  // Monthly Cash Flow Table
  if (yPos > pageHeight - 100) {
    doc.addPage()
    yPos = 20
  }

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Monthly Cash Flow Projection', 14, yPos)
  yPos += 8

  // Prepare table data
  const tableData = projection.monthlyCashFlows.map((month) => [
    month.monthLabel,
    month.phase === 'construction' ? 'Build' : 'Rent',
    formatCurrency(month.milestonePayments),
    formatCurrency(month.rentalIncome),
    formatCurrency(month.totalInflow),
    formatCurrency(month.laborCost),
    formatCurrency(month.materialCost),
    formatCurrency(month.subcontractorCost),
    formatCurrency(month.overheadAllocation),
    formatCurrency(month.operatingExpenses),
    formatCurrency(month.debtService),
    formatCurrency(month.totalOutflow),
    formatCurrency(month.netCashFlow),
    formatCurrency(month.cumulativeBalance),
  ])

  autoTable(doc, {
    startY: yPos,
    head: [
      [
        'Month',
        'Phase',
        'Milestone',
        'Rental',
        'Total Inflow',
        'Labor',
        'Materials',
        'Subs',
        'Overhead',
        'OpEx',
        'Debt',
        'Total Outflow',
        'Net Flow',
        'Cumulative',
      ],
    ],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [59, 130, 246], fontSize: 8 },
    styles: { fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 15 },
      2: { cellWidth: 20, halign: 'right' },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 20, halign: 'right' },
      5: { cellWidth: 18, halign: 'right' },
      6: { cellWidth: 18, halign: 'right' },
      7: { cellWidth: 18, halign: 'right' },
      8: { cellWidth: 18, halign: 'right' },
      9: { cellWidth: 18, halign: 'right' },
      10: { cellWidth: 18, halign: 'right' },
      11: { cellWidth: 20, halign: 'right' },
      12: { cellWidth: 20, halign: 'right' },
      13: { cellWidth: 20, halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  })

  // Save PDF
  const fileName = `ProForma_${projection.projectName.replace(/[^a-z0-9]/gi, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`
  doc.save(fileName)
}

/**
 * Export Pro Forma projection to Excel
 */
export function exportProFormaToExcel(projection: ProFormaProjection): void {
  const workbook = XLSX.utils.book_new()

  // Helper function
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)

  const formatPercent = (value: number) => `${value.toFixed(1)}%`

  // Summary Sheet
  const summaryData = [
    ['Pro Forma Financial Projection', ''],
    [projection.projectName, ''],
    [`Generated: ${format(new Date(), 'MMM dd, yyyy')}`, ''],
    ['', ''],
    ['Financial Summary', ''],
    ['Contract Value', projection.contractValue],
    ['Total Estimated Cost', projection.totalEstimatedCost],
    ['Projected Profit', projection.projectedProfit],
    ['Projected Margin', projection.projectedMargin],
  ]

  if (projection.summary.monthlyRentalIncome > 0) {
    summaryData.push(
      ['', ''],
      ['Rental Income Summary', ''],
      ['Monthly Rental Income', projection.summary.monthlyRentalIncome],
      ['Annual Rental Income', projection.summary.annualRentalIncome],
      ['Net Operating Income (NOI)', projection.summary.netOperatingIncome],
      ['Cash Flow After Debt', projection.summary.cashFlowAfterDebt],
      ['', ''],
      ['Rental Details', ''],
      ['Total Units', projection.rentalSummary.totalUnits],
      ['Total Project Square Footage', projection.rentalSummary.totalProjectSquareFootage],
      ['Rental Units Square Footage', projection.rentalSummary.totalSquareFootage],
      ['Average Rent Per Unit', projection.rentalSummary.averageRentPerUnit],
      ['Average Rent Per Sqft', projection.rentalSummary.averageRentPerSqft],
      ['Occupancy Rate', projection.rentalSummary.stabilizedOccupancy],
    )
  }

  summaryData.push(
    ['', ''],
    ['Financial Metrics', ''],
    ['Total Inflow', projection.summary.totalInflow],
    ['Total Outflow', projection.summary.totalOutflow],
    ['Net Cash Flow', projection.summary.netCashFlow],
    ['Peak Cash Needed', projection.summary.peakCashNeeded],
    ['Months with Negative Cash Flow', projection.summary.monthsNegative]
  )

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
  
  // Format summary sheet
  summarySheet['!cols'] = [
    { wch: 30 },
    { wch: 20 },
  ]

  // Add number formatting to currency columns
  const currencyColumns = [1] // Column B
  summaryData.forEach((row, rowIndex) => {
    if (rowIndex >= 5 && rowIndex < summaryData.length && row[1] !== '' && typeof row[1] === 'number') {
      const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: 1 })
      if (!summarySheet[cellAddress]) {
        summarySheet[cellAddress] = { t: 'n', v: row[1] }
      }
      summarySheet[cellAddress].z = '$#,##0'
    }
  })

  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')

  // Cash Flow Sheet
  const cashFlowHeaders = [
    'Month',
    'Phase',
    'Milestone Payments',
    'Rental Income',
    'Total Inflow',
    'Labor Cost',
    'Material Cost',
    'Subcontractor Cost',
    'Overhead',
    'Operating Expenses',
    'Debt Service',
    'Total Outflow',
    'Net Cash Flow',
    'Cumulative Balance',
  ]

  const cashFlowData = projection.monthlyCashFlows.map((month) => [
    month.monthLabel,
    month.phase === 'construction' ? 'Build' : 'Rent',
    month.milestonePayments,
    month.rentalIncome,
    month.totalInflow,
    month.laborCost,
    month.materialCost,
    month.subcontractorCost,
    month.overheadAllocation,
    month.operatingExpenses,
    month.debtService,
    month.totalOutflow,
    month.netCashFlow,
    month.cumulativeBalance,
  ])

  const cashFlowSheet = XLSX.utils.aoa_to_sheet([cashFlowHeaders, ...cashFlowData])
  
  // Format cash flow sheet
  cashFlowSheet['!cols'] = [
    { wch: 20 }, // Month
    { wch: 12 }, // Phase
    { wch: 18 }, // Milestone
    { wch: 15 }, // Rental
    { wch: 15 }, // Total Inflow
    { wch: 15 }, // Labor
    { wch: 15 }, // Material
    { wch: 15 }, // Sub
    { wch: 15 }, // Overhead
    { wch: 18 }, // OpEx
    { wch: 15 }, // Debt
    { wch: 15 }, // Total Outflow
    { wch: 15 }, // Net Flow
    { wch: 18 }, // Cumulative
  ]

  // Format currency columns (columns 2-13, 0-indexed)
  for (let row = 1; row <= cashFlowData.length; row++) {
    for (let col = 2; col <= 13; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col })
      if (cashFlowSheet[cellAddress] && typeof cashFlowSheet[cellAddress].v === 'number') {
        cashFlowSheet[cellAddress].z = '$#,##0'
      }
    }
  }

  // Freeze first row
  cashFlowSheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' }

  XLSX.utils.book_append_sheet(workbook, cashFlowSheet, 'Cash Flow')

  // Save Excel file
  const fileName = `ProForma_${projection.projectName.replace(/[^a-z0-9]/gi, '_')}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`
  XLSX.writeFile(workbook, fileName)
}

