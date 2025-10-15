// ============================================================================
// HSH GC Platform - Printable Report
// ============================================================================
//
// Reusable component for generating print-friendly PDF reports
//

import React from 'react'
import { Project, Trade } from '@/types'
import { TRADE_CATEGORIES } from '@/types'
import hshLogo from '/HSH Contractor Logo - Color.png'

export type ReportDepth = 'summary' | 'category' | 'full'
export type ReportType = 'estimate' | 'actuals' | 'comparison'

interface PrintableReportProps {
  project: Project
  trades: Trade[]
  reportType: ReportType
  depth: ReportDepth
  actualEntries?: any[]
  changeOrders?: any[]
  onClose: () => void
}

export function PrintableReport({ 
  project, 
  trades, 
  reportType, 
  depth,
  actualEntries = [],
  changeOrders = [],
  onClose 
}: PrintableReportProps) {
  
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const formatPercent = (percent: number) => `${percent.toFixed(1)}%`

  // Calculate totals
  const calculateEstimateTotals = () => {
    const basePriceTotal = trades.reduce((sum, trade) => sum + trade.totalCost, 0)
    const grossProfitTotal = trades.reduce((sum, trade) => {
      const markup = trade.markupPercent || 11.1
      return sum + (trade.totalCost * (markup / 100))
    }, 0)
    const contingency = basePriceTotal * 0.10
    const totalEstimated = basePriceTotal + grossProfitTotal + contingency
    
    return { basePriceTotal, grossProfitTotal, contingency, totalEstimated }
  }

  const calculateActualTotals = () => {
    const labor = actualEntries.filter(e => e.type === 'labor').reduce((sum, e) => sum + e.amount, 0)
    const material = actualEntries.filter(e => e.type === 'material').reduce((sum, e) => sum + e.amount, 0)
    const subcontractor = actualEntries.filter(e => e.type === 'subcontractor').reduce((sum, e) => sum + e.amount, 0)
    const total = labor + material + subcontractor
    
    return { labor, material, subcontractor, total }
  }

  const estimateTotals = calculateEstimateTotals()
  const actualTotals = calculateActualTotals()
  const variance = actualTotals.total - estimateTotals.totalEstimated

  // Group trades by category
  const groupedTrades = trades.reduce((acc, trade) => {
    if (!acc[trade.category]) {
      acc[trade.category] = []
    }
    acc[trade.category].push(trade)
    return acc
  }, {} as Record<string, Trade[]>)

  // Debug logging
  console.log('PrintableReport Data:', {
    totalTrades: trades.length,
    categories: Object.keys(groupedTrades),
    tradesPerCategory: Object.entries(groupedTrades).map(([cat, items]) => ({ 
      category: TRADE_CATEGORIES[cat as keyof typeof TRADE_CATEGORIES]?.label || cat,
      count: items.length 
    }))
  })
  console.log('All categories:', Object.keys(groupedTrades))

  const handlePrint = () => {
    // Get the printable content
    const printContent = document.getElementById('printable-content')
    if (!printContent) {
      console.error('Print content not found')
      return
    }

    // Open a new window
    const printWindow = window.open('', '_blank', 'width=800,height=600')
    if (!printWindow) {
      console.error('Failed to open print window')
      return
    }

    // Write the content to the new window
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${reportType === 'estimate' ? 'Estimate Report' : reportType === 'actuals' ? 'Actuals Report' : 'Comparison Report'} - ${project.name}</title>
          <style>
            @page {
              size: letter;
              margin: 0.5in;
            }
            
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              line-height: 1.5;
              color: #111;
              background: white;
            }
            
            .page-break-inside-avoid {
              page-break-inside: avoid;
              break-inside: avoid;
            }
            
            table {
              page-break-inside: auto;
            }
            
            tr {
              page-break-inside: avoid;
              break-inside: avoid;
            }
            
            @media print {
              body {
                background: white;
              }
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `)
    
    printWindow.document.close()
    
    // Wait for content to load, then print
    setTimeout(() => {
      printWindow.focus()
      printWindow.print()
      // Close window after printing (user can cancel)
      setTimeout(() => {
        printWindow.close()
      }, 100)
    }, 500)
  }

  return (
    <>
      {/* Non-printable controls */}
      <div className="no-print fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">
              {reportType === 'estimate' ? 'Estimate Report' : 
               reportType === 'actuals' ? 'Actuals Report' : 
               'Estimate vs Actuals Report'}
            </h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">×</button>
          </div>
          
          <div className="space-y-4">
            <p className="text-gray-600">
              Click "Print / Save as PDF" to generate your report.
              Use your browser's print dialog to save as PDF.
            </p>
            
            <div className="bg-blue-50 border border-blue-200 rounded p-4">
              <p className="text-sm font-semibold text-blue-900 mb-2">Report Settings:</p>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Depth: <strong>{depth === 'summary' ? 'Summary Only' : depth === 'category' ? 'Category Level' : 'Full Detail'}</strong></li>
                <li>• Project: <strong>{project.name}</strong></li>
                <li>• Date: <strong>{new Date().toLocaleDateString()}</strong></li>
                <li>• Total Line Items: <strong>{trades.length}</strong></li>
                <li>• Categories: <strong>{Object.keys(groupedTrades).length}</strong> ({Object.keys(groupedTrades).map(cat => TRADE_CATEGORIES[cat as keyof typeof TRADE_CATEGORIES]?.label || cat).join(', ')})</li>
              </ul>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded p-4 max-h-40 overflow-y-auto">
              <p className="text-sm font-semibold text-yellow-900 mb-2">Preview - Items to Print:</p>
              <div className="text-xs text-yellow-800 space-y-1">
                {Object.entries(groupedTrades).map(([category, catTrades]) => (
                  <div key={category}>
                    <strong>{TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.label || category}:</strong> {catTrades.length} items
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handlePrint}
                className="flex-1 bg-gradient-to-r from-[#E65133] to-[#C0392B] hover:from-[#D14520] hover:to-[#A93226] text-white px-6 py-3 rounded font-semibold"
              >
                🖨️ Print / Save as PDF
              </button>
              <button
                onClick={onClose}
                className="px-6 py-3 border border-gray-300 rounded hover:bg-gray-50 font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Printable content - rendered but hidden until print */}
      <div className="print-only" id="printable-content">
        <PrintableContent
          project={project}
          trades={trades}
          reportType={reportType}
          depth={depth}
          estimateTotals={estimateTotals}
          actualTotals={actualTotals}
          variance={variance}
          groupedTrades={groupedTrades}
          actualEntries={actualEntries}
          changeOrders={changeOrders}
        />
      </div>
    </>
  )
}

// ----------------------------------------------------------------------------
// Printable Content Component
// ----------------------------------------------------------------------------

interface PrintableContentProps {
  project: Project
  trades: Trade[]
  reportType: ReportType
  depth: ReportDepth
  estimateTotals: any
  actualTotals: any
  variance: number
  groupedTrades: Record<string, Trade[]>
  actualEntries: any[]
  changeOrders: any[]
}

function PrintableContent({ 
  project, 
  trades,
  reportType,
  depth,
  estimateTotals,
  actualTotals,
  variance,
  groupedTrades,
  actualEntries,
  changeOrders,
}: PrintableContentProps) {
  
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  return (
    <div className="print-container" style={{ 
      padding: '20mm 15mm', 
      background: 'white', 
      width: '100%',
      boxSizing: 'border-box'
    }}>
      {/* Header */}
      <div className="print-header page-break-inside-avoid" style={{ marginBottom: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <img src={hshLogo} alt="HSH Contractor" style={{ height: '80px' }} />
          <div style={{ textAlign: 'right' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#111', margin: 0 }}>
              {reportType === 'estimate' ? 'ESTIMATE REPORT' :
               reportType === 'actuals' ? 'PROJECT ACTUALS REPORT' :
               'ESTIMATE VS ACTUALS REPORT'}
            </h1>
            <p style={{ color: '#666', marginTop: '8px' }}>Generated: {new Date().toLocaleDateString()}</p>
          </div>
        </div>

        {/* Project Info */}
        <div style={{ borderTop: '4px solid #E65133', paddingTop: '20px', marginBottom: '32px' }} className="page-break-inside-avoid">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', fontSize: '14px', lineHeight: '1.6' }}>
            <div style={{ marginBottom: '8px' }}>
              <p style={{ fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Project Name:</p>
              <p style={{ color: '#111', lineHeight: '1.5' }}>{project.name}</p>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <p style={{ fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Project Number:</p>
              <p style={{ color: '#111', lineHeight: '1.5' }}>{project.projectNumber || 'N/A'}</p>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <p style={{ fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Address:</p>
              <p style={{ color: '#111', lineHeight: '1.5' }}>
                {project.address?.street || 'N/A'}
                {project.city && `, ${project.city}`}
                {project.state && `, ${project.state}`}
              </p>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <p style={{ fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Status:</p>
              <p style={{ color: '#111', textTransform: 'capitalize', lineHeight: '1.5' }}>{project.status.replace('-', ' ')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Section */}
      <div style={{ marginBottom: '15mm' }} className="page-break-inside-avoid print-section">
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#111', marginBottom: '20px', borderBottom: '2px solid #D1D5DB', paddingBottom: '10px' }}>Summary</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {reportType !== 'actuals' && (
            <>
              <div style={{ background: '#EFF6FF', padding: '16px', borderRadius: '4px', minHeight: '80px' }}>
                <p style={{ fontSize: '14px', color: '#374151', marginBottom: '10px', lineHeight: '1.5' }}>Base Price Total</p>
                <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#111', lineHeight: '1.3' }}>{formatCurrency(estimateTotals.basePriceTotal)}</p>
              </div>
              <div style={{ background: '#EFF6FF', padding: '16px', borderRadius: '4px', minHeight: '80px' }}>
                <p style={{ fontSize: '14px', color: '#374151', marginBottom: '10px', lineHeight: '1.5' }}>Gross Profit ({formatCurrency(estimateTotals.grossProfitTotal)})</p>
                <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#111', lineHeight: '1.3' }}>{formatCurrency(estimateTotals.totalEstimated)}</p>
                <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px', lineHeight: '1.4' }}>Total Estimated</p>
              </div>
            </>
          )}
          {reportType !== 'estimate' && (
            <>
              <div style={{ background: '#FFF7ED', padding: '16px', borderRadius: '4px', minHeight: '80px' }}>
                <p style={{ fontSize: '14px', color: '#374151', marginBottom: '10px', lineHeight: '1.5' }}>Total Actual Spent</p>
                <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#111', lineHeight: '1.3' }}>{formatCurrency(actualTotals.total)}</p>
              </div>
              <div style={{ background: variance >= 0 ? '#FEF2F2' : '#F0FDF4', padding: '16px', borderRadius: '4px', minHeight: '80px' }}>
                <p style={{ fontSize: '14px', color: '#374151', marginBottom: '10px', lineHeight: '1.5' }}>Variance</p>
                <p style={{ fontSize: '24px', fontWeight: 'bold', color: variance >= 0 ? '#DC2626' : '#16A34A', lineHeight: '1.3' }}>
                  {formatCurrency(Math.abs(variance))}
                </p>
                <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px', lineHeight: '1.4' }}>{variance >= 0 ? 'Over Budget' : 'Under Budget'}</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Detailed Breakdown */}
      {depth === 'summary' && (
        <CategorySummaryView groupedTrades={groupedTrades} reportType={reportType} actualEntries={actualEntries} />
      )}

      {depth === 'category' && (
        <CategoryDetailView groupedTrades={groupedTrades} reportType={reportType} actualEntries={actualEntries} />
      )}

      {depth === 'full' && (
        <FullDetailView groupedTrades={groupedTrades} reportType={reportType} actualEntries={actualEntries} changeOrders={changeOrders} />
      )}

      {/* Footer */}
      <div style={{ marginTop: '64px', paddingTop: '20px', borderTop: '1px solid #E5E7EB' }}>
        <p style={{ textAlign: 'center', fontSize: '14px', color: '#6B7280', lineHeight: '1.6' }}>
          © {new Date().getFullYear()} HSH Contractor. All rights reserved.
        </p>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Category Summary View (High Level)
// ----------------------------------------------------------------------------

function CategorySummaryView({ groupedTrades, reportType, actualEntries }: any) {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  return (
    <div style={{ marginBottom: '15mm' }} className="print-section">
      <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#111', marginBottom: '20px', borderBottom: '2px solid #D1D5DB', paddingBottom: '10px' }}>Category Summary</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #D1D5DB', marginTop: '16px' }} className="page-break-inside-avoid">
        <thead>
          <tr style={{ background: '#F3F4F6' }}>
            <th style={{ border: '1px solid #D1D5DB', padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', fontSize: '14px' }}>Category</th>
            <th style={{ border: '1px solid #D1D5DB', padding: '12px 10px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px' }}>Items</th>
            {reportType !== 'actuals' && <th style={{ border: '1px solid #D1D5DB', padding: '12px 10px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px' }}>Estimated</th>}
            {reportType !== 'estimate' && <th style={{ border: '1px solid #D1D5DB', padding: '12px 10px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px' }}>Actual</th>}
            {reportType === 'comparison' && <th style={{ border: '1px solid #D1D5DB', padding: '12px 10px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px' }}>Variance</th>}
          </tr>
        </thead>
        <tbody>
          {Object.entries(groupedTrades).map(([category, categoryTrades]: [string, any]) => {
            const categoryEstimate = categoryTrades.reduce((sum: number, t: any) => {
              const total = t.totalCost * (1 + (t.markupPercent || 11.1) / 100)
              return sum + total
            }, 0)
            
            const categoryActual = actualEntries
              .filter((e: any) => e.category === category)
              .reduce((sum: number, e: any) => sum + e.amount, 0)

            return (
              <tr key={category}>
                <td style={{ border: '1px solid #D1D5DB', padding: '12px 10px', lineHeight: '1.6' }}>
                  {TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.label || category}
                </td>
                <td style={{ border: '1px solid #D1D5DB', padding: '12px 10px', textAlign: 'right', lineHeight: '1.6' }}>{categoryTrades.length}</td>
                {reportType !== 'actuals' && (
                  <td style={{ border: '1px solid #D1D5DB', padding: '12px 10px', textAlign: 'right', fontWeight: '600', lineHeight: '1.6' }}>
                    {formatCurrency(categoryEstimate)}
                  </td>
                )}
                {reportType !== 'estimate' && (
                  <td style={{ border: '1px solid #D1D5DB', padding: '12px 10px', textAlign: 'right', fontWeight: '600', lineHeight: '1.6' }}>
                    {formatCurrency(categoryActual)}
                  </td>
                )}
                {reportType === 'comparison' && (
                  <td style={{ border: '1px solid #D1D5DB', padding: '12px 10px', textAlign: 'right', fontWeight: '600', color: categoryActual - categoryEstimate >= 0 ? '#DC2626' : '#16A34A', lineHeight: '1.6' }}>
                    {formatCurrency(Math.abs(categoryActual - categoryEstimate))}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Category Detail View (Category + Subtotals)
// ----------------------------------------------------------------------------

function CategoryDetailView({ groupedTrades, reportType, actualEntries }: any) {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  return (
    <div style={{ display: 'block' }}>
      {Object.entries(groupedTrades).map(([category, categoryTrades]: [string, any]) => {
        const categoryEstimate = categoryTrades.reduce((sum: number, t: any) => {
          return sum + t.totalCost * (1 + (t.markupPercent || 11.1) / 100)
        }, 0)
        
        const categoryActual = actualEntries
          .filter((e: any) => e.category === category)
          .reduce((sum: number, e: any) => sum + e.amount, 0)

        return (
          <div key={category} style={{ pageBreakInside: 'avoid', marginBottom: '10mm' }} className="page-break-inside-avoid print-section">
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#111', marginBottom: '16px', background: '#F3F4F6', padding: '12px', borderRadius: '4px' }}>
              {TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.icon || '📦'}{' '}
              {TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.label || category}
            </h3>
            <div style={{ marginLeft: '20px', marginBottom: '16px', fontSize: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
              {reportType !== 'actuals' && (
                <div>
                  <p style={{ color: '#6B7280', marginBottom: '6px', lineHeight: '1.5' }}>Estimated Total:</p>
                  <p style={{ fontWeight: 'bold', fontSize: '18px', lineHeight: '1.4' }}>{formatCurrency(categoryEstimate)}</p>
                </div>
              )}
              {reportType !== 'estimate' && (
                <div>
                  <p style={{ color: '#6B7280', marginBottom: '6px', lineHeight: '1.5' }}>Actual Total:</p>
                  <p style={{ fontWeight: 'bold', fontSize: '18px', lineHeight: '1.4' }}>{formatCurrency(categoryActual)}</p>
                </div>
              )}
              {reportType === 'comparison' && (
                <div>
                  <p style={{ color: '#6B7280', marginBottom: '6px', lineHeight: '1.5' }}>Variance:</p>
                  <p style={{ fontWeight: 'bold', fontSize: '18px', color: categoryActual - categoryEstimate >= 0 ? '#DC2626' : '#16A34A', lineHeight: '1.4' }}>
                    {formatCurrency(Math.abs(categoryActual - categoryEstimate))}
                  </p>
                </div>
              )}
            </div>
            <p style={{ marginLeft: '20px', fontSize: '14px', color: '#6B7280', lineHeight: '1.5' }}>{categoryTrades.length} line items</p>
          </div>
        )
      })}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Full Detail View (All Line Items)
// ----------------------------------------------------------------------------

function FullDetailView({ groupedTrades, reportType, actualEntries, changeOrders }: any) {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  return (
    <div style={{ display: 'block' }}>
      {Object.entries(groupedTrades).map(([category, categoryTrades]: [string, any]) => (
        <div key={category} style={{ pageBreakInside: 'avoid', marginBottom: '10mm' }} className="page-break-inside-avoid print-section">
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#111', marginBottom: '16px', background: '#F3F4F6', padding: '12px', borderRadius: '4px' }}>
            {TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.icon || '📦'}{' '}
            {TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.label || category}
          </h3>
          
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', tableLayout: 'fixed', marginTop: '12px' }}>
            <thead>
              <tr style={{ background: '#F9FAFB' }}>
                <th style={{ border: '1px solid #D1D5DB', padding: '12px 10px', textAlign: 'left', fontWeight: 'bold', fontSize: '14px' }}>Item</th>
                <th style={{ border: '1px solid #D1D5DB', padding: '12px 10px', textAlign: 'center', fontWeight: 'bold', fontSize: '14px' }}>Qty</th>
                {reportType !== 'actuals' && <th style={{ border: '1px solid #D1D5DB', padding: '12px 10px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px' }}>Estimated</th>}
                {reportType !== 'estimate' && <th style={{ border: '1px solid #D1D5DB', padding: '12px 10px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px' }}>Actual</th>}
                {reportType === 'comparison' && <th style={{ border: '1px solid #D1D5DB', padding: '12px 10px', textAlign: 'right', fontWeight: 'bold', fontSize: '14px' }}>Variance</th>}
              </tr>
            </thead>
            <tbody>
              {categoryTrades.map((trade: any) => {
                const tradeEstimate = trade.totalCost * (1 + (trade.markupPercent || 11.1) / 100)
                const tradeActual = actualEntries
                  .filter((e: any) => e.tradeId === trade.id)
                  .reduce((sum: number, e: any) => sum + e.amount, 0)
                const tradeVariance = tradeActual - tradeEstimate

                return (
                  <tr key={trade.id}>
                    <td style={{ border: '1px solid #D1D5DB', padding: '12px 10px', lineHeight: '1.6' }}>
                      {trade.name}
                      {trade.description && <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px', lineHeight: '1.5' }}>{trade.description}</div>}
                    </td>
                    <td style={{ border: '1px solid #D1D5DB', padding: '12px 10px', textAlign: 'center', lineHeight: '1.6' }}>
                      {trade.quantity} {trade.unit}
                    </td>
                    {reportType !== 'actuals' && (
                      <td style={{ border: '1px solid #D1D5DB', padding: '12px 10px', textAlign: 'right', lineHeight: '1.6' }}>
                        {formatCurrency(tradeEstimate)}
                      </td>
                    )}
                    {reportType !== 'estimate' && (
                      <td style={{ border: '1px solid #D1D5DB', padding: '12px 10px', textAlign: 'right', lineHeight: '1.6' }}>
                        {formatCurrency(tradeActual)}
                      </td>
                    )}
                    {reportType === 'comparison' && (
                      <td style={{ border: '1px solid #D1D5DB', padding: '12px 10px', textAlign: 'right', fontWeight: '600', color: tradeVariance >= 0 ? '#DC2626' : '#16A34A', lineHeight: '1.6' }}>
                        {formatCurrency(Math.abs(tradeVariance))}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

