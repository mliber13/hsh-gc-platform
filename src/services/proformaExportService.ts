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
export function exportProFormaToPDF(
  projection: ProFormaProjection,
): void {
  console.log('[FOR-SALE LOC] exportProFormaToPDF input summary', {
    engineVersion: projection.summary.forSaleEngineVersion,
    peakLoc: projection.summary.forSalePeakLocBalance,
    endingLoc: projection.summary.forSaleEndingLocBalance,
    sweepExecuted: projection.summary.forSaleSweepExecuted,
    finalLocBeforeSweep: projection.summary.forSaleFinalLocBeforeSweep,
    finalLocAfterSweep: projection.summary.forSaleFinalLocAfterSweep,
    closedUnits: projection.summary.forSaleClosedUnits,
    totalUnits: projection.summary.forSaleTotalUnits,
  })
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

  const isDealUnderwriting =
    typeof projection.projectId === 'string' && projection.projectId.startsWith('deal-')
  const underwritingMeta = projection.underwritingExportMeta
  const hasUnderwritingExportMeta =
    isDealUnderwriting &&
    !!underwritingMeta &&
    ((underwritingMeta.underwritingEstimatedConstructionCost ?? 0) > 0)
  const isForSalePhasedLoc =
    (projection.summary.forSaleLocLimit ?? 0) > 0 || (projection.forSaleLocTimeline?.length ?? 0) > 0
  if (isForSalePhasedLoc && projection.summary.proFormaModeUsed !== 'for-sale-phased-loc') {
    console.error('[FOR-SALE LOC] export guard failed (PDF)', {
      modeUsed: projection.summary.proFormaModeUsed,
      hasLocLimit: (projection.summary.forSaleLocLimit ?? 0) > 0,
      timelineRows: projection.forSaleLocTimeline?.length ?? 0,
    })
    throw new Error(
      `For-Sale LOC export guard failed: expected mode "for-sale-phased-loc", got "${projection.summary.proFormaModeUsed ?? 'undefined'}".`,
    )
  }
  if (projection.summary.proFormaModeUsed === 'for-sale-phased-loc') {
    console.log('FINAL LOC AFTER SWEEP USED IN EXPORT', projection.summary.forSaleFinalLocAfterSweep ?? projection.summary.forSaleEndingLocBalance ?? 0)
  }

  // Title
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Pro Forma Financial Projection', pageWidth / 2, yPos, { align: 'center' })
  yPos += 8

  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(projection.projectName, pageWidth / 2, yPos, { align: 'center' })
  doc.text(`Generated: ${format(new Date(), 'MMM dd, yyyy')}`, pageWidth / 2, yPos + 5, { align: 'center' })
  if (isDealUnderwriting) {
    doc.text('Deal Stage: Pipeline / Underwriting', pageWidth / 2, yPos + 10, { align: 'center' })
    yPos += 20
  } else {
    yPos += 15
  }

  // Underwriting Assumptions Summary (deal-mode exports only)
  if (hasUnderwritingExportMeta) {
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Underwriting Assumptions Summary', 14, yPos)
    yPos += 8

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')

    const assumptionsData: Array<[string, string]> = [
      ['Deal Value / Contract Value', formatCurrency(projection.contractValue)],
      [
        'Estimated Construction Cost',
        formatCurrency(underwritingMeta.underwritingEstimatedConstructionCost || 0),
      ],
    ]

    if (typeof underwritingMeta.landCost === 'number' && underwritingMeta.landCost !== 0) {
      assumptionsData.push(['Land Cost', formatCurrency(underwritingMeta.landCost)])
    }
    if (typeof underwritingMeta.softCostPercent === 'number' && underwritingMeta.softCostPercent !== 0) {
      assumptionsData.push(['Soft Cost % (of construction)', formatPercent(underwritingMeta.softCostPercent)])
    }
    if (typeof underwritingMeta.contingencyPercent === 'number' && underwritingMeta.contingencyPercent !== 0) {
      assumptionsData.push(['Contingency % (of construction)', formatPercent(underwritingMeta.contingencyPercent)])
    }
    if (typeof underwritingMeta.loanToCostPercent === 'number' && underwritingMeta.loanToCostPercent !== 0) {
      assumptionsData.push(['Loan-to-Cost %', formatPercent(underwritingMeta.loanToCostPercent)])
    }
    if (typeof underwritingMeta.exitCapRate === 'number' && underwritingMeta.exitCapRate !== 0) {
      assumptionsData.push(['Exit Cap Rate', formatPercent(underwritingMeta.exitCapRate)])
    }
    if (typeof underwritingMeta.refinanceLTVPercent === 'number' && underwritingMeta.refinanceLTVPercent !== 0) {
      assumptionsData.push(['Refinance LTV %', formatPercent(underwritingMeta.refinanceLTVPercent)])
    }

    // Display-only debt inputs for lender context
    const interestRate = (projection.summary as any).interestRate as number | undefined
    const loanTermMonths = (projection.summary as any).loanTermMonths as number | undefined
    if (typeof interestRate === 'number' && interestRate !== 0) {
      assumptionsData.push(['Interest Rate', formatPercent(interestRate)])
    }
    if (typeof loanTermMonths === 'number' && loanTermMonths > 0) {
      const years = loanTermMonths / 12
      assumptionsData.push([
        'Loan Term',
        years % 1 === 0 ? `${years.toFixed(0)} years` : `${loanTermMonths} months`,
      ])
    }
    if (underwritingMeta.valueMethod) {
      assumptionsData.push([
        'Value Method',
        underwritingMeta.valueMethod === 'stabilized' ? 'Stabilized' : 'NOI-based',
      ])
    }
    if (
      underwritingMeta.valueMethod === 'stabilized' &&
      typeof underwritingMeta.annualAppreciationPercent === 'number' &&
      underwritingMeta.annualAppreciationPercent !== 0
    ) {
      assumptionsData.push([
        'Annual Appreciation % (display-only)',
        formatPercent(underwritingMeta.annualAppreciationPercent),
      ])
    }

    autoTable(doc, {
      startY: yPos,
      head: [['Assumption', 'Value']],
      body: assumptionsData,
      theme: 'striped',
      headStyles: { fillColor: [251, 191, 36] }, // amber-ish
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 70, halign: 'right' },
      },
    })

    yPos = (doc as any).lastAutoTable.finalY + 6

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(
      'Construction cost allocation defaults used: Labor 35% / Materials 40% / Subcontractors 25% when no detailed estimate exists.',
      14,
      yPos
    )
    yPos += 4
    doc.text(
      'Construction cost is based on underwriting assumptions, not a detailed trade estimate.',
      14,
      yPos
    )
    yPos += 4
    doc.text(
      'Construction cost shown in Sources & Uses is based on the underwriting estimated construction cost input.',
      14,
      yPos
    )
    yPos += 8
  }

  // Attainable Housing Deal Summary (deal-mode exports only, if present)
  if (isDealUnderwriting && projection.dealSummary) {
    if (yPos > pageHeight - 80) {
      doc.addPage()
      yPos = 20
    }

    const s = projection.dealSummary
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Attainable Housing Deal Summary', 14, yPos)
    yPos += 7

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')

    const overviewData: Array<[string, string]> = [
      ['Total units', s.totalUnits.toString()],
      ['Average unit size (SF)', s.averageUnitSize ? s.averageUnitSize.toLocaleString() : '—'],
      ['Target sale price / unit', formatCurrency(s.targetSalePricePerUnit)],
    ]
    if (s.targetPricePerSF) {
      overviewData.push(['Target price / SF', formatCurrency(s.targetPricePerSF)])
    }
    if (s.marketPricePerSF) {
      overviewData.push(['Market price / SF', formatCurrency(s.marketPricePerSF)])
    }

    autoTable(doc, {
      startY: yPos,
      head: [['Project overview', '']],
      body: overviewData,
      theme: 'striped',
      headStyles: { fillColor: [148, 163, 184] },
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 60, halign: 'right' },
      },
    })

    yPos = (doc as any).lastAutoTable.finalY + 4

    const costData: Array<[string, string]> = [
      ['Base project cost (no incentives)', formatCurrency(s.baseProjectCost)],
      ['Base cost per unit', formatCurrency(s.baseCostPerUnit)],
      ['Gap vs. target sale price per unit', formatCurrency(Math.abs(s.gapPerUnit))],
    ]

    autoTable(doc, {
      startY: yPos,
      head: [['Base development cost & feasibility gap', '']],
      body: costData,
      theme: 'striped',
      headStyles: { fillColor: [148, 163, 184] },
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 60, halign: 'right' },
      },
    })

    yPos = (doc as any).lastAutoTable.finalY + 4

    if (s.incentives.length > 0) {
      const incRows = s.incentives.map((inc) => [
        inc.label,
        formatCurrency(inc.perUnitAmount),
        formatCurrency(inc.totalAmount),
      ])
      incRows.push([
        'Total incentives',
        formatCurrency(s.totalIncentivesPerUnit),
        formatCurrency(s.totalIncentives),
      ])

      autoTable(doc, {
        startY: yPos,
        head: [['Incentive stack', 'Per unit ($)', 'Total ($)']],
        body: incRows,
        theme: 'striped',
        headStyles: { fillColor: [148, 163, 184] },
        styles: { fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 60 },
          1: { cellWidth: 40, halign: 'right' },
          2: { cellWidth: 40, halign: 'right' },
        },
      })

      yPos = (doc as any).lastAutoTable.finalY + 4
    }

    const alignmentRows: Array<[string, string]> = [
      ['Effective cost per unit (after incentives)', formatCurrency(s.adjustedCostPerUnit)],
      ['Sale price per unit', formatCurrency(s.targetSalePricePerUnit)],
      ['Profit per unit', formatCurrency(s.profitPerUnit)],
      ['Total project profit', formatCurrency(s.totalProfit)],
    ]

    autoTable(doc, {
      startY: yPos,
      head: [['Final alignment', '']],
      body: alignmentRows,
      theme: 'striped',
      headStyles: { fillColor: [148, 163, 184] },
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 60, halign: 'right' },
      },
    })

    yPos = (doc as any).lastAutoTable.finalY + 6

    // Public Benefit (if any)
    if (Array.isArray(s.publicBenefits) && s.publicBenefits.length > 0) {
      if (yPos > pageHeight - 40) {
        doc.addPage()
        yPos = 20
      }
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('Public Benefit', 14, yPos)
      yPos += 5

      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      s.publicBenefits.forEach((b) => {
        doc.text(`• ${b}`, 16, yPos)
        yPos += 4
      })
      yPos += 4
    }

    // Summary / Conclusion (if any)
    if (s.conclusionText && s.conclusionText.trim().length > 0) {
      if (yPos > pageHeight - 30) {
        doc.addPage()
        yPos = 20
      }
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('Summary / Conclusion', 14, yPos)
      yPos += 5

      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      const appendixSentence =
        ' This structure provides a clear path for municipalities, lenders, and developers to align on attainable housing delivery.'
      const needsAppendix =
        !s.conclusionText.includes('municipal') &&
        !s.conclusionText.includes('lender') &&
        !s.conclusionText.includes('developer')

      const exportText = needsAppendix
        ? `${s.conclusionText.trim()}${appendixSentence}`
        : s.conclusionText.trim()

      const textWidth = pageWidth - 28
      const lines = doc.splitTextToSize(exportText, textWidth)
      doc.text(lines, 14, yPos)
      yPos += lines.length * 4 + 4
    }
  }

  // Financial Summary
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  if (isDealUnderwriting) {
    doc.text('Detailed Base Pro Forma Summary', 14, yPos)
  } else {
    doc.text('Financial Summary', 14, yPos)
  }
  yPos += 8

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  
  const summaryData: Array<[string, string]> = [
    ['Contract Value', formatCurrency(projection.contractValue)],
    ['Total Estimated Cost', formatCurrency(projection.totalEstimatedCost)],
  ]
  if (!isDealUnderwriting) {
    summaryData.push(
      ['Projected Profit', formatCurrency(projection.projectedProfit)],
      ['Projected Margin', formatPercent(projection.projectedMargin)],
    )
  }

  if (projection.summary.monthlyRentalIncome > 0) {
    summaryData.push(
      ['Monthly Rental Income', formatCurrency(projection.summary.monthlyRentalIncome)],
      ['Annual Rental Income', formatCurrency(projection.summary.annualRentalIncome)],
      ['Net Operating Income (NOI)', formatCurrency(projection.summary.netOperatingIncome)],
      ['Cash Flow After Debt', formatCurrency(projection.summary.cashFlowAfterDebt)]
    )
  }
  if (isForSalePhasedLoc) {
    summaryData.push(
      ['For-Sale Revenue', formatCurrency(projection.summary.forSaleTotalRevenue || 0)],
      ['Base Cost (Before Incentives)', formatCurrency(projection.summary.forSaleBaseCostBeforeIncentives || 0)],
      ['Applied Infrastructure Reduction', formatCurrency(projection.summary.forSaleAppliedInfrastructureReduction || 0)],
      ['Applied Project Cost Reduction', formatCurrency(projection.summary.forSaleAppliedProjectCostReduction || 0)],
      ['LTC Sizing Base (Gross Pre-Incentive Cost)', formatCurrency(projection.summary.forSaleLtcSizingBase || 0)],
      ['LOC Limit', formatCurrency(projection.summary.forSaleLocLimit || 0)],
      ['LOC Drawn Total (Lifetime)', formatCurrency(projection.summary.forSaleLocDrawnTotal || 0)],
      ['Peak LOC Balance', formatCurrency(projection.summary.forSalePeakLocBalance || 0)],
      ['Ending LOC Balance', formatCurrency(projection.summary.forSaleEndingLocBalance || 0)],
      ['Peak Bond Balance', formatCurrency(projection.summary.forSalePeakBondBalance || 0)],
      ['Ending Bond Balance', formatCurrency(projection.summary.forSaleEndingBondBalance || 0)],
      ['Bond Drawn Total (Lifetime)', formatCurrency(projection.summary.forSaleBondDrawnTotal || 0)],
      ['Reserve Ending Balance', formatCurrency(projection.summary.forSaleReserveEnding || 0)],
      ['Distributed Cash', formatCurrency(projection.summary.forSaleDistributionTotal || 0)],
      ['Reinvested Cash', formatCurrency(projection.summary.forSaleReinvestedTotal || 0)],
      ['Developer Equity Deployed', formatCurrency(projection.summary.forSaleEquityDeployed || 0)],
      ['Incentive Equity Used', formatCurrency(projection.summary.forSaleIncentiveEquityUsed || 0)],
      [
        'For-Sale Equity Multiple',
        projection.summary.forSaleEquityMultiple != null
          ? `${projection.summary.forSaleEquityMultiple.toFixed(2)}x`
          : '—',
      ],
      [
        'For-Sale Project IRR',
        projection.summary.forSaleProjectIrr != null
          ? formatPercent(projection.summary.forSaleProjectIrr)
          : '—',
      ],
      ['Engine Version', projection.summary.forSaleEngineVersion || '—'],
      ['Lifecycle Sweep Executed', projection.summary.forSaleSweepExecuted ? 'Yes' : 'No'],
      [
        'Final LOC Before Sweep',
        formatCurrency(projection.summary.forSaleFinalLocBeforeSweep || 0),
      ],
      [
        'Final LOC After Sweep',
        formatCurrency(projection.summary.forSaleFinalLocAfterSweep || 0),
      ],
      [
        'LOC Repayment Warning',
        projection.summary.forSaleDebtRepaymentWarning || 'None',
      ],
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

  if (isDealUnderwriting) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(
      'Note: This detailed base pro forma summary reflects the unadjusted core model. Incentive-adjusted attainable housing economics are summarized above.',
      14,
      yPos,
    )
    yPos += 6
  }

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

  if (isForSalePhasedLoc && projection.forSaleLocTimeline && projection.forSaleLocTimeline.length > 0) {
    if (yPos > pageHeight - 90) {
      doc.addPage()
      yPos = 20
    }
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('For-Sale LOC Timeline', 14, yPos)
    yPos += 8

    autoTable(doc, {
      startY: yPos,
      head: [[
        'Month',
        'Revenue',
        'Bond Draw',
        'Bond Paydown',
        'Bond Balance',
        'LOC Draw',
        'LOC Paydown',
        'LOC Balance',
        'Available Capacity',
      ]],
      body: projection.forSaleLocTimeline.map((row) => [
        row.monthLabel,
        formatCurrency(row.salesRevenue),
        formatCurrency(row.bondDraw || 0),
        formatCurrency(row.bondPaydown || 0),
        formatCurrency(row.bondBalance || 0),
        formatCurrency(row.locDraw),
        formatCurrency(row.locPaydown),
        formatCurrency(row.locBalance),
        formatCurrency(row.availableLocCapacity),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [14, 116, 144], fontSize: 8 },
      styles: { fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 22, halign: 'right' },
        2: { cellWidth: 20, halign: 'right' },
        3: { cellWidth: 22, halign: 'right' },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 20, halign: 'right' },
        6: { cellWidth: 22, halign: 'right' },
        7: { cellWidth: 22, halign: 'right' },
        8: { cellWidth: 24, halign: 'right' },
      },
      margin: { left: 14, right: 14 },
    })

    yPos = (doc as any).lastAutoTable.finalY + 8
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(
      'Assumptions: presale deposits are modeled as immediately available; phases activate from demand triggers; infra auto front-loads to Phase 1 when phase infra % is not explicitly set.',
      14,
      yPos,
    )
    yPos += 6
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
    month.phase === 'construction'
      ? 'Build'
      : isDealUnderwriting
      ? 'Exit'
      : 'Rent',
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
        'Milestone / Final Sale / Exit Proceeds',
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
  
  // Footer with project name and page numbers
  const pageCount = (doc as any).getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(projection.projectName, 14, pageHeight - 5)
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - 14,
      pageHeight - 5,
      { align: 'right' }
    )
  }

  // Save PDF
  const fileName = `ProForma_${projection.projectName.replace(/[^a-z0-9]/gi, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`
  doc.save(fileName)
}

/**
 * Export Pro Forma projection to Excel
 */
export function exportProFormaToExcel(
  projection: ProFormaProjection,
): void {
  const workbook = XLSX.utils.book_new()

  // Helper function
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)

  const formatPercent = (value: number) => `${value.toFixed(1)}%`

  const isDealUnderwriting =
    typeof projection.projectId === 'string' && projection.projectId.startsWith('deal-')
  const underwritingMeta = projection.underwritingExportMeta
  const hasUnderwritingExportMeta =
    isDealUnderwriting &&
    !!underwritingMeta &&
    ((underwritingMeta.underwritingEstimatedConstructionCost ?? 0) > 0)
  const isForSalePhasedLoc =
    (projection.summary.forSaleLocLimit ?? 0) > 0 || (projection.forSaleLocTimeline?.length ?? 0) > 0
  if (isForSalePhasedLoc && projection.summary.proFormaModeUsed !== 'for-sale-phased-loc') {
    console.error('[FOR-SALE LOC] export guard failed (Excel)', {
      modeUsed: projection.summary.proFormaModeUsed,
      hasLocLimit: (projection.summary.forSaleLocLimit ?? 0) > 0,
      timelineRows: projection.forSaleLocTimeline?.length ?? 0,
    })
    throw new Error(
      `For-Sale LOC export guard failed: expected mode "for-sale-phased-loc", got "${projection.summary.proFormaModeUsed ?? 'undefined'}".`,
    )
  }
  if (projection.summary.proFormaModeUsed === 'for-sale-phased-loc') {
    console.log('FINAL LOC AFTER SWEEP USED IN EXPORT', projection.summary.forSaleFinalLocAfterSweep ?? projection.summary.forSaleEndingLocBalance ?? 0)
  }

  // Summary Sheet
  const summaryData: any[][] = [
    ['Pro Forma Financial Projection', ''],
    [projection.projectName, ''],
    [`Generated: ${format(new Date(), 'MMM dd, yyyy')}`, ''],
    isDealUnderwriting ? ['Deal Stage: Pipeline / Underwriting', ''] : ['', ''],
    ['', ''],
  ]

  // Attainable Housing Deal Summary (deal-mode, if present)
  if (isDealUnderwriting && projection.dealSummary) {
    const s = projection.dealSummary
    summaryData.push(
      ['Attainable Housing Deal Summary', ''],
      ['Total Units', s.totalUnits],
      ['Average Unit Size (SF)', s.averageUnitSize],
      ['Target Sale Price per Unit', s.targetSalePricePerUnit],
    )
    if (s.targetPricePerSF) {
      summaryData.push(['Target Price per SF', s.targetPricePerSF])
    }
    if (s.marketPricePerSF) {
      summaryData.push(['Market Price per SF', s.marketPricePerSF])
    }
    summaryData.push(
      ['Base Project Cost (no incentives)', s.baseProjectCost],
      ['Base Cost per Unit', s.baseCostPerUnit],
      ['Gap vs Target Sale Price per Unit', s.gapPerUnit],
      ['Total Incentives per Unit', s.totalIncentivesPerUnit],
      ['Total Incentives', s.totalIncentives],
      ['Effective Cost per Unit (after incentives)', s.adjustedCostPerUnit],
      ['Profit per Unit', s.profitPerUnit],
      ['Total Project Profit', s.totalProfit],
      ['', ''],
    )

    if (Array.isArray(s.publicBenefits) && s.publicBenefits.length > 0) {
      summaryData.push(['Public Benefit', ''])
      s.publicBenefits.forEach((b) => {
        summaryData.push([`- ${b}`, ''])
      })
      summaryData.push(['', ''])
    }

    if (s.conclusionText && s.conclusionText.trim().length > 0) {
      summaryData.push(['Summary / Conclusion', ''])
      summaryData.push([s.conclusionText, ''])
      summaryData.push(['', ''])
    }
  }

  // Underwriting assumptions block (deal-mode exports only)
  if (hasUnderwritingExportMeta) {
    summaryData.push(
      ['Underwriting Assumptions Summary', ''],
      ['Deal Value / Contract Value', projection.contractValue],
      ['Estimated Construction Cost', underwritingMeta.underwritingEstimatedConstructionCost],
    )

    if (typeof underwritingMeta.landCost === 'number' && underwritingMeta.landCost !== 0) {
      summaryData.push(['Land Cost', underwritingMeta.landCost])
    }
    if (typeof underwritingMeta.softCostPercent === 'number' && underwritingMeta.softCostPercent !== 0) {
      summaryData.push(['Soft Cost % (of construction)', underwritingMeta.softCostPercent])
    }
    if (typeof underwritingMeta.contingencyPercent === 'number' && underwritingMeta.contingencyPercent !== 0) {
      summaryData.push(['Contingency % (of construction)', underwritingMeta.contingencyPercent])
    }
    if (typeof underwritingMeta.loanToCostPercent === 'number' && underwritingMeta.loanToCostPercent !== 0) {
      summaryData.push(['Loan-to-Cost %', underwritingMeta.loanToCostPercent])
    }
    if (typeof underwritingMeta.exitCapRate === 'number' && underwritingMeta.exitCapRate !== 0) {
      summaryData.push(['Exit Cap Rate', underwritingMeta.exitCapRate])
    }
    if (typeof underwritingMeta.refinanceLTVPercent === 'number' && underwritingMeta.refinanceLTVPercent !== 0) {
      summaryData.push(['Refinance LTV %', underwritingMeta.refinanceLTVPercent])
    }
    if (underwritingMeta.valueMethod) {
      summaryData.push([
        'Value Method',
        underwritingMeta.valueMethod === 'stabilized' ? 'Stabilized' : 'NOI-based',
      ])
    }
    if (
      underwritingMeta.valueMethod === 'stabilized' &&
      typeof underwritingMeta.annualAppreciationPercent === 'number' &&
      underwritingMeta.annualAppreciationPercent !== 0
    ) {
      summaryData.push([
        'Annual Appreciation % (display-only)',
        underwritingMeta.annualAppreciationPercent,
      ])
    }

    const interestRate = (projection.summary as any).interestRate as number | undefined
    const loanTermMonths = (projection.summary as any).loanTermMonths as number | undefined
    if (typeof interestRate === 'number' && interestRate !== 0) {
      summaryData.push(['Interest Rate', interestRate])
    }
    if (typeof loanTermMonths === 'number' && loanTermMonths > 0) {
      summaryData.push(['Loan Term (months)', loanTermMonths])
    }

    summaryData.push(
      ['Construction cost allocation defaults used: Labor 35% / Materials 40% / Subcontractors 25% when no detailed estimate exists.', ''],
      ['Construction cost is based on underwriting assumptions, not a detailed trade estimate.', ''],
      ['Construction cost shown in Sources & Uses is based on the underwriting estimated construction cost input.', ''],
      ['', ''],
    )
  }

  summaryData.push(
    ['Financial Summary', ''],
    ['Contract Value', projection.contractValue],
    ['Total Estimated Cost', projection.totalEstimatedCost],
    ['Projected Profit', projection.projectedProfit],
    ['Projected Margin', projection.projectedMargin],
  )

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
  if (isForSalePhasedLoc) {
    summaryData.push(
      ['', ''],
      ['For-Sale Phased LOC Summary', ''],
      ['For-Sale Revenue', projection.summary.forSaleTotalRevenue || 0],
      ['Base Cost (Before Incentives)', projection.summary.forSaleBaseCostBeforeIncentives || 0],
      ['Applied Infrastructure Reduction', projection.summary.forSaleAppliedInfrastructureReduction || 0],
      ['Applied Project Cost Reduction', projection.summary.forSaleAppliedProjectCostReduction || 0],
      ['LTC Sizing Base (Gross Pre-Incentive Cost)', projection.summary.forSaleLtcSizingBase || 0],
      ['LOC Limit', projection.summary.forSaleLocLimit || 0],
      ['LOC Drawn Total (Lifetime)', projection.summary.forSaleLocDrawnTotal || 0],
      ['Peak LOC Balance', projection.summary.forSalePeakLocBalance || 0],
      ['Ending LOC Balance', projection.summary.forSaleEndingLocBalance || 0],
      ['Peak Bond Balance', projection.summary.forSalePeakBondBalance || 0],
      ['Ending Bond Balance', projection.summary.forSaleEndingBondBalance || 0],
      ['Bond Drawn Total (Lifetime)', projection.summary.forSaleBondDrawnTotal || 0],
      ['Reserve Ending Balance', projection.summary.forSaleReserveEnding || 0],
      ['Distributed Cash', projection.summary.forSaleDistributionTotal || 0],
      ['Reinvested Cash', projection.summary.forSaleReinvestedTotal || 0],
      ['Developer Equity Deployed', projection.summary.forSaleEquityDeployed || 0],
      ['Incentive Equity Used', projection.summary.forSaleIncentiveEquityUsed || 0],
      ['For-Sale Equity Multiple', projection.summary.forSaleEquityMultiple ?? ''],
      ['For-Sale Project IRR', projection.summary.forSaleProjectIrr ?? ''],
      ['Assumptions', 'Presale deposits available immediately; unassigned infrastructure allocation falls back to proportional-by-units.'],
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
    { wch: 34 },
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

  // Add number formatting to percentage rows (leave values unchanged)
  const percentLabels = new Set<string>([
    'Soft Cost % (of construction)',
    'Contingency % (of construction)',
    'Loan-to-Cost %',
    'Exit Cap Rate',
    'Refinance LTV %',
    'Projected Margin',
    'Occupancy Rate',
  ])
  summaryData.forEach((row, rowIndex) => {
    const label = row[0]
    if (typeof label === 'string' && percentLabels.has(label) && typeof row[1] === 'number') {
      const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: 1 })
      if (!summarySheet[cellAddress]) {
        summarySheet[cellAddress] = { t: 'n', v: row[1] }
      }
      // Values are stored as whole-number percentages (e.g. 8 => 8.0%), so use 0.0% pattern
      summarySheet[cellAddress].z = '0.0"%"'
    }
  })

  // Bold section headers and underwriting headers
  const headerLabels = new Set([
    'Underwriting Assumptions Summary',
    'Financial Summary',
    'For-Sale Phased LOC Summary',
    'Rental Income Summary',
    'Rental Details',
    'Financial Metrics',
  ])
  summaryData.forEach((row, rowIndex) => {
    const label = row[0]
    if (typeof label === 'string' && headerLabels.has(label)) {
      const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: 0 })
      if (!summarySheet[cellAddress]) {
        summarySheet[cellAddress] = { t: 's', v: label }
      }
      summarySheet[cellAddress].s = {
        ...(summarySheet[cellAddress].s || {}),
        font: { ...(summarySheet[cellAddress].s?.font || {}), bold: true },
      }
    }
  })

  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')

  // Cash Flow Sheet
  const cashFlowHeaders = [
    'Month',
    'Phase',
    'Milestone / Final Sale / Exit Proceeds',
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
    month.phase === 'construction'
      ? 'Build'
      : isDealUnderwriting
      ? 'Exit'
      : 'Rent',
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

  if (isForSalePhasedLoc && projection.forSaleLocTimeline && projection.forSaleLocTimeline.length > 0) {
    const locHeaders = [
      'Month',
      'Phase',
      'Active Units',
      'Presales',
      'Closings',
      'Sales Revenue',
      'Bond Draw',
      'Bond Paydown',
      'Bond Balance',
      'LOC Draw',
      'LOC Paydown',
      'LOC Balance',
      'Available Capacity',
      'Reserve Balance',
      'Reinvest Balance',
      'Distributed Cash',
    ]
    const locData = projection.forSaleLocTimeline.map((row) => [
      row.monthLabel,
      row.phaseName,
      row.activeUnits,
      row.presalesThisMonth,
      row.closingsThisMonth,
      row.salesRevenue,
      row.bondDraw || 0,
      row.bondPaydown || 0,
      row.bondBalance || 0,
      row.locDraw,
      row.locPaydown,
      row.locBalance,
      row.availableLocCapacity,
      row.reserveBalance,
      row.reinvestBalance,
      row.distributedCash,
    ])
    const locSheet = XLSX.utils.aoa_to_sheet([locHeaders, ...locData])
    locSheet['!cols'] = [
      { wch: 20 },
      { wch: 18 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 14 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 16 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
    ]
    for (let row = 1; row <= locData.length; row++) {
      for (let col = 5; col <= 15; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col })
        if (locSheet[cellAddress] && typeof locSheet[cellAddress].v === 'number') {
          locSheet[cellAddress].z = '$#,##0'
        }
      }
    }
    locSheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' }
    XLSX.utils.book_append_sheet(workbook, locSheet, 'LOC Timeline')
  }

  // Save Excel file
  const fileName = `ProForma_${projection.projectName.replace(/[^a-z0-9]/gi, '_')}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`
  XLSX.writeFile(workbook, fileName)
}

