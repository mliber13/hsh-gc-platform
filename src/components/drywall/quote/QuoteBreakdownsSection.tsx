import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createEmptyBreakdown } from '@/lib/drywall/createEmptyDrywallQuote'
import type { DrywallQuote, QuoteBreakdown } from '@/types/drywall'
import { BreakdownOptionalSections } from './BreakdownOptionalSections'

interface Props {
  quote: DrywallQuote
  readOnly: boolean
  onChange: (breakdowns: QuoteBreakdown[]) => void
}

export function QuoteBreakdownsSection({ quote, readOnly, onChange }: Props) {
  const breakdowns = quote.breakdowns || []
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(breakdowns.map((b) => b.id)))

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const update = (id: string, patch: Partial<QuoteBreakdown>) => {
    onChange(
      breakdowns.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    )
  }

  const remove = (id: string) => {
    onChange(breakdowns.filter((b) => b.id !== id))
  }

  const add = () => {
    const b = createEmptyBreakdown(`Floor ${breakdowns.length + 1}`)
    setOpenIds((prev) => new Set(prev).add(b.id))
    onChange([...breakdowns, b])
  }

  if (breakdowns.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
          <p className="text-muted-foreground">Start by adding your first breakdown</p>
          {!readOnly && (
            <Button type="button" size="lg" onClick={add}>
              <Plus className="mr-2 h-5 w-5" />
              Add breakdown
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  const totalBaseSqft = breakdowns.reduce((sum, item) => sum + (parseFloat(String(item.sqft)) || 0), 0)
  const wastePct = parseFloat(String(quote.wastePercentage)) || 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Per-floor breakdowns</h3>
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={add}>
            <Plus className="mr-1 h-4 w-4" />
            Add floor
          </Button>
        )}
      </div>

      {breakdowns.map((b, index) => {
        const open = openIds.has(b.id)
        return (
          <Card key={b.id}>
            <CardHeader className="flex flex-row items-center gap-2 py-3">
              <button
                type="button"
                className="text-muted-foreground shrink-0"
                onClick={() => toggle(b.id)}
                aria-label={open ? 'Collapse' : 'Expand'}
              >
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <CardTitle className="flex-1 text-base min-w-0">
                <Input
                  disabled={readOnly}
                  value={b.description ?? ''}
                  onChange={(e) => update(b.id, { description: e.target.value })}
                  className="h-8 font-semibold"
                  placeholder="Floor name"
                />
              </CardTitle>
              <div className="flex gap-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={readOnly || index === 0}
                  title="Move up"
                  onClick={() => {
                    if (index === 0) return
                    const next = [...breakdowns]
                    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
                    onChange(next)
                  }}
                >
                  <span className="text-sm">↑</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={readOnly || index === breakdowns.length - 1}
                  title="Move down"
                  onClick={() => {
                    if (index >= breakdowns.length - 1) return
                    const next = [...breakdowns]
                    ;[next[index + 1], next[index]] = [next[index], next[index + 1]]
                    onChange(next)
                  }}
                >
                  <span className="text-sm">↓</span>
                </Button>
                {!readOnly && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(b.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </CardHeader>
            {open && (
              <CardContent className="pt-0 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Drywall sq ft (base)</Label>
                    <Input
                      type="number"
                      disabled={readOnly}
                      value={b.sqft ?? ''}
                      onChange={(e) => update(b.id, { sqft: e.target.value })}
                    />
                    {wastePct > 0 && parseFloat(String(b.sqft)) > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        + {wastePct}% waste ={' '}
                        {(
                          (parseFloat(String(b.sqft)) || 0) *
                          (1 + wastePct / 100)
                        ).toLocaleString(undefined, { maximumFractionDigits: 0 })}{' '}
                        sqft
                      </p>
                    )}
                  </div>
                </div>

                <BreakdownOptionalSections
                  quote={quote}
                  breakdown={b}
                  readOnly={readOnly}
                  onUpdate={(patch) => update(b.id, patch)}
                />
              </CardContent>
            )}
          </Card>
        )
      })}

      <p className="text-xs text-muted-foreground">
        Total breakdown base sqft: {totalBaseSqft.toLocaleString()}
        {wastePct > 0 && (
          <span>
            {' '}
            (+ {wastePct}% waste ≈ {(totalBaseSqft * (1 + wastePct / 100)).toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}{' '}
            sqft)
          </span>
        )}
      </p>
    </div>
  )
}
