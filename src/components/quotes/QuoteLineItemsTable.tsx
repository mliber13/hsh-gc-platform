import { Plus, X } from 'lucide-react'
import { TRADE_CATEGORIES, type TradeCategory } from '@/types/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export interface LineItemFormRow {
  trade_category: string
  display_label: string
  amount: number
  sort_order: number
}

interface QuoteLineItemsTableProps {
  rows: LineItemFormRow[]
  onChange: (rows: LineItemFormRow[]) => void
  footerHint?: string
}

const CATEGORY_KEYS = Object.keys(TRADE_CATEGORIES) as TradeCategory[]

function formatMoneyInput(n: number): string {
  if (!Number.isFinite(n)) return ''
  return String(n)
}

export function QuoteLineItemsTable({ rows, onChange, footerHint }: QuoteLineItemsTableProps) {
  const setRow = (index: number, patch: Partial<LineItemFormRow>) => {
    const next = rows.map((r, i) => (i === index ? { ...r, ...patch } : r))
    onChange(next)
  }

  const removeRow = (index: number) => {
    onChange(rows.filter((_, i) => i !== index).map((r, i) => ({ ...r, sort_order: i })))
  }

  const addRow = () => {
    const cat: TradeCategory = 'other'
    onChange([
      ...rows,
      {
        trade_category: cat,
        display_label: TRADE_CATEGORIES[cat].label,
        amount: 0,
        sort_order: rows.length,
      },
    ])
  }

  const subtotal = rows.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Line items</CardTitle>
        {footerHint && <p className="text-sm text-muted-foreground">{footerHint}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Trade category</th>
                <th className="px-3 py-2 text-left font-medium">Display label</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                    No line items yet.
                  </td>
                </tr>
              )}
              {rows.map((row, index) => (
                <tr key={`${row.sort_order}-${index}`} className="border-b last:border-0">
                  <td className="px-3 py-2 align-top">
                    <Select
                      value={row.trade_category}
                      onValueChange={(v) => {
                        const label = TRADE_CATEGORIES[v as TradeCategory]?.label ?? v
                        setRow(index, { trade_category: v, display_label: label })
                      }}
                    >
                      <SelectTrigger className="h-9 w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_KEYS.map((k) => (
                          <SelectItem key={k} value={k}>
                            {TRADE_CATEGORIES[k].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Input
                      value={row.display_label}
                      onChange={(e) => setRow(index, { display_label: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex justify-end">
                      <div className="relative w-32">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                          $
                        </span>
                        <Input
                          className="pl-6 text-right tabular-nums"
                          type="number"
                          step="0.01"
                          min="0"
                          value={formatMoneyInput(row.amount)}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value)
                            setRow(index, { amount: Number.isFinite(v) ? v : 0 })
                          }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 align-top">
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(index)}>
                      <X className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="mr-2 size-4" />
            Add line item
          </Button>
          <div className="text-sm">
            <span className="text-muted-foreground">Subtotal </span>
            <span className="font-semibold tabular-nums">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(subtotal)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
