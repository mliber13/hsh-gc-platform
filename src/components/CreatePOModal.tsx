// ============================================================================
// Create Purchase Order Modal
// ============================================================================
// Select estimate lines (with subcontractor cost) and assign to a sub. Saves draft PO.
//

import React, { useMemo, useState } from 'react'
import { Trade, SubItem, TRADE_CATEGORIES } from '@/types'
import { createPOInDB } from '@/services/supabaseService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileText, X, ChevronDown, ChevronRight } from 'lucide-react'

export interface SelectablePOLine {
  id: string
  category: string
  sourceType: 'trade' | 'sub_item'
  sourceTradeId: string
  sourceSubItemId: string | null
  description: string
  quantity: number
  unit: string
  unitPrice: number
  amount: number
}

interface CreatePOModalProps {
  projectId: string
  trades: Trade[]
  subItemsByTrade: Record<string, SubItem[]>
  availableSubcontractors: { id: string; name: string }[]
  onClose: () => void
  onSuccess?: () => void
}

function buildSelectableLines(
  trades: Trade[],
  subItemsByTrade: Record<string, SubItem[]>
): SelectablePOLine[] {
  const lines: SelectablePOLine[] = []
  const subCost = (n: number) => n != null && Number(n) > 0

  for (const trade of trades) {
    if (subCost(trade.subcontractorCost)) {
      const qty = trade.quantity ?? 0
      const rate = trade.subcontractorRate ?? (qty > 0 ? (trade.subcontractorCost ?? 0) / qty : 0)
      lines.push({
        id: `trade-${trade.id}`,
        category: trade.category || 'other',
        sourceType: 'trade',
        sourceTradeId: trade.id,
        sourceSubItemId: null,
        description: trade.name || trade.description || 'Trade',
        quantity: qty,
        unit: trade.unit || 'each',
        unitPrice: rate,
        amount: trade.subcontractorCost ?? 0,
      })
    }
    const subItems = subItemsByTrade[trade.id] || []
    for (const sub of subItems) {
      if (subCost(sub.subcontractorCost)) {
        const qty = sub.quantity ?? 0
        const rate = sub.subcontractorRate ?? (qty > 0 ? (sub.subcontractorCost ?? 0) / qty : 0)
        lines.push({
          id: `sub-${sub.id}`,
          category: trade.category || 'other',
          sourceType: 'sub_item',
          sourceTradeId: trade.id,
          sourceSubItemId: sub.id,
          description: sub.name || 'Sub-item',
          quantity: qty,
          unit: sub.unit || 'each',
          unitPrice: rate,
          amount: sub.subcontractorCost ?? 0,
        })
      }
    }
  }
  return lines
}

export function CreatePOModal({
  projectId,
  trades,
  subItemsByTrade,
  availableSubcontractors,
  onClose,
  onSuccess,
}: CreatePOModalProps) {
  const [subcontractorId, setSubcontractorId] = useState<string>('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectableLines = useMemo(
    () => buildSelectableLines(trades, subItemsByTrade),
    [trades, subItemsByTrade]
  )

  const linesByCategory = useMemo(() => {
    const map = new Map<string, SelectablePOLine[]>()
    for (const line of selectableLines) {
      const cat = line.category
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(line)
    }
    return map
  }, [selectableLines])

  const categoryOrder = useMemo(() => {
    const keys = Array.from(linesByCategory.keys())
    const order = Object.keys(TRADE_CATEGORIES) as string[]
    return keys.sort((a, b) => {
      const i = order.indexOf(a)
      const j = order.indexOf(b)
      if (i === -1 && j === -1) return a.localeCompare(b)
      if (i === -1) return 1
      if (j === -1) return -1
      return i - j
    })
  }, [linesByCategory])

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  const selectAllInCategory = (category: string) => {
    const lines = linesByCategory.get(category) || []
    const ids = new Set(lines.map((l) => l.id))
    const allSelected = lines.every((l) => selectedIds.has(l.id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  const selectedLines = useMemo(
    () => selectableLines.filter((l) => selectedIds.has(l.id)),
    [selectableLines, selectedIds]
  )
  const selectedTotal = selectedLines.reduce((sum, l) => sum + l.amount, 0)

  const toggleLine = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selectedIds.size === selectableLines.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(selectableLines.map((l) => l.id)))
    }
  }

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

  const handleCreate = async () => {
    if (!subcontractorId.trim()) {
      setError('Please select a subcontractor.')
      return
    }
    if (selectedLines.length === 0) {
      setError('Please select at least one line.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const result = await createPOInDB(projectId, subcontractorId, selectedLines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unitPrice: l.unitPrice,
        amount: l.amount,
        sourceTradeId: l.sourceTradeId,
        sourceSubItemId: l.sourceSubItemId,
      })))
      if (result) {
        onSuccess?.()
        onClose()
      } else {
        setError('Failed to create PO. You may already have a draft PO for this subcontractor on this project.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create PO')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Create Purchase Order
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 flex-1 overflow-hidden flex flex-col min-h-0">
          <p className="text-sm text-gray-600">
            Select lines from the estimate (subcontractor cost) and assign them to a subcontractor. One PO per subcontractor per project.
          </p>

          <div>
            <Label>Subcontractor *</Label>
            <Select value={subcontractorId} onValueChange={(v) => { setSubcontractorId(v); setError(null) }}>
              <SelectTrigger>
                <SelectValue placeholder="Select subcontractor..." />
              </SelectTrigger>
              <SelectContent>
                {availableSubcontractors.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectableLines.length === 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded">
              No lines with subcontractor cost in this estimate. Add subcontractor cost to trade or sub-items first.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <Label>Lines to include (expand category to select)</Label>
                <Button type="button" variant="outline" size="sm" onClick={selectAll}>
                  {selectedIds.size === selectableLines.length ? 'Deselect all' : 'Select all'}
                </Button>
              </div>
              <div className="border rounded-md overflow-auto max-h-64">
                {categoryOrder.map((category) => {
                  const lines = linesByCategory.get(category) || []
                  const isExpanded = expandedCategories.has(category)
                  const categoryLabel = TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.label ?? category
                  const categoryIcon = TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.icon ?? '📦'
                  const categoryTotal = lines.reduce((s, l) => s + l.amount, 0)
                  const allInCatSelected = lines.length > 0 && lines.every((l) => selectedIds.has(l.id))
                  return (
                    <div key={category} className="border-b last:border-b-0">
                      <button
                        type="button"
                        onClick={() => toggleCategory(category)}
                        className="w-full flex items-center justify-between gap-2 p-2.5 bg-gray-50 hover:bg-gray-100 text-left text-sm font-medium"
                      >
                        <span className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 shrink-0" />
                          )}
                          <span>{categoryIcon} {categoryLabel}</span>
                          <span className="text-gray-500 font-normal">({lines.length} line{lines.length !== 1 ? 's' : ''})</span>
                        </span>
                        <span className="text-gray-600">{formatCurrency(categoryTotal)}</span>
                      </button>
                      {isExpanded && (
                        <div className="bg-white">
                          <div className="flex justify-end px-2 py-1 border-b">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => selectAllInCategory(category)}
                            >
                              {allInCatSelected ? 'Deselect all' : 'Select all'} in {categoryLabel}
                            </Button>
                          </div>
                          <table className="w-full text-sm">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="text-left p-2 w-10"></th>
                                <th className="text-left p-2">Description</th>
                                <th className="text-right p-2">Qty</th>
                                <th className="text-right p-2">Unit</th>
                                <th className="text-right p-2">Unit $</th>
                                <th className="text-right p-2">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lines.map((line) => (
                                <tr
                                  key={line.id}
                                  className={selectedIds.has(line.id) ? 'bg-blue-50' : ''}
                                >
                                  <td className="p-2">
                                    <input
                                      type="checkbox"
                                      checked={selectedIds.has(line.id)}
                                      onChange={() => toggleLine(line.id)}
                                      className="h-4 w-4 rounded border-gray-300"
                                    />
                                  </td>
                                  <td className="p-2">{line.description}</td>
                                  <td className="p-2 text-right">{line.quantity}</td>
                                  <td className="p-2 text-right">{line.unit}</td>
                                  <td className="p-2 text-right">{formatCurrency(line.unitPrice)}</td>
                                  <td className="p-2 text-right font-medium">{formatCurrency(line.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              {selectedLines.length > 0 && (
                <p className="text-sm font-medium">
                  Selected total: {formatCurrency(selectedTotal)} ({selectedLines.length} line{selectedLines.length !== 1 ? 's' : ''})
                </p>
              )}
            </>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={submitting || selectableLines.length === 0 || selectedLines.length === 0 || !subcontractorId}
            >
              {submitting ? 'Creating...' : 'Create PO'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
