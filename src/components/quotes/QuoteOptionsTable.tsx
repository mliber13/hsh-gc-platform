import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export interface OptionFormRow {
  label: string
  description: string
  amount: number
  sort_order: number
}

interface QuoteOptionsTableProps {
  rows: OptionFormRow[]
  onChange: (rows: OptionFormRow[]) => void
}

export function QuoteOptionsTable({ rows, onChange }: QuoteOptionsTableProps) {
  const setRow = (index: number, patch: Partial<OptionFormRow>) => {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const removeRow = (index: number) => {
    onChange(rows.filter((_, i) => i !== index).map((r, i) => ({ ...r, sort_order: i })))
  }

  const addRow = () => {
    onChange([
      ...rows,
      { label: '', description: '', amount: 0, sort_order: rows.length },
    ])
  }

  const optTotal = rows.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Options / alternates</CardTitle>
        <p className="text-sm text-muted-foreground">Optional add-ons or alternate scopes.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Label</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-b last:border-0">
                  <td className="px-3 py-2 align-top">
                    <Input
                      value={row.label}
                      onChange={(e) => setRow(index, { label: e.target.value })}
                      placeholder="Option name"
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Input
                      value={row.description}
                      onChange={(e) => setRow(index, { description: e.target.value })}
                      placeholder="Optional details"
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex justify-end">
                      <div className="relative w-28">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                          $
                        </span>
                        <Input
                          className="pl-6 text-right tabular-nums"
                          type="number"
                          step="0.01"
                          min="0"
                          value={Number.isFinite(row.amount) ? String(row.amount) : ''}
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
            Add option
          </Button>
          <div className="text-sm">
            <span className="text-muted-foreground">Options subtotal </span>
            <span className="font-semibold tabular-nums">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(optTotal)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
