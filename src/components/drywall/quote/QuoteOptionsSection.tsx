import { CheckSquare, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { DrywallQuote, QuoteOption, QuoteOptionPricingMethod } from '@/types/drywall'

function newOptionId(): string {
  return crypto.randomUUID()
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

function resolvePricingMethod(opt: QuoteOption): QuoteOptionPricingMethod {
  if (opt.pricingMethod) return opt.pricingMethod
  if (opt.useTotalSqft) return 'totalSqft'
  if (num(opt.sqft) > 0 || num(opt.rate) > 0) return 'specificSqft'
  return 'fixed'
}

function optionCalculatedPrice(opt: QuoteOption, totalSqft: number): number {
  const method = resolvePricingMethod(opt)
  const rate = num(opt.rate)
  if (method === 'totalSqft') {
    return totalSqft > 0 && rate > 0 ? totalSqft * rate : num(opt.price)
  }
  if (method === 'specificSqft') {
    const sqft = num(opt.sqft)
    return sqft > 0 && rate > 0 ? sqft * rate : num(opt.price)
  }
  return num(opt.price)
}

function createEmptyOption(): QuoteOption {
  return {
    id: newOptionId(),
    description: '',
    price: '',
    sqft: '',
    rate: '',
    useTotalSqft: false,
    pricingMethod: 'fixed',
    selected: false,
  }
}

interface Props {
  quote: DrywallQuote
  readOnly: boolean
  /** Total drywall sqft with waste (from quote calculations). */
  totalSqft: number
  selectedOptionsTotal?: number
  onChange: (options: QuoteOption[]) => void
}

export function QuoteOptionsSection({
  quote,
  readOnly,
  totalSqft,
  selectedOptionsTotal = 0,
  onChange,
}: Props) {
  const options = quote.options ?? []

  const updateAt = (index: number, patch: Partial<QuoteOption>) => {
    onChange(options.map((opt, i) => (i === index ? { ...opt, ...patch } : opt)))
  }

  const setPricingMethod = (index: number, method: QuoteOptionPricingMethod) => {
    const opt = options[index]
    if (!opt) return
    if (method === 'fixed') {
      updateAt(index, {
        pricingMethod: 'fixed',
        useTotalSqft: false,
        sqft: '',
        rate: '',
      })
      return
    }
    if (method === 'totalSqft') {
      updateAt(index, {
        pricingMethod: 'totalSqft',
        useTotalSqft: true,
        sqft: '',
        price: '',
      })
      return
    }
    updateAt(index, {
      pricingMethod: 'specificSqft',
      useTotalSqft: false,
      price: '',
      sqft: opt.sqft ?? '',
      rate: opt.rate ?? '',
    })
  }

  const baseSqftDisplay =
    totalSqft > 0
      ? totalSqft.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : String(num(quote.sqft) || '0')

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <CheckSquare className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Options</CardTitle>
              <CardDescription>
                Optional add-ons like Level 5, texture, etc. Check Include to add to the quote total.
              </CardDescription>
            </div>
          </div>
          {!readOnly && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => onChange([...options, createEmptyOption()])}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add option
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {options.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No options added. Click &quot;Add option&quot; to create optional items.
          </p>
        ) : (
          options.map((option, index) => {
            const method = resolvePricingMethod(option)
            const calculatedPrice = optionCalculatedPrice(option, totalSqft)
            const optionRate = num(option.rate)

            return (
              <div
                key={option.id}
                className="space-y-3 rounded-lg border border-border/60 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Description</Label>
                      <Input
                        disabled={readOnly}
                        value={option.description ?? option.name ?? ''}
                        placeholder="e.g., Level 5 walls, Level 5 ceilings"
                        onChange={(e) => updateAt(index, { description: e.target.value })}
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      {(
                        [
                          ['fixed', 'Fixed price'],
                          ['totalSqft', 'Rate × total sqft'],
                          ['specificSqft', 'Rate × specific sqft'],
                        ] as const
                      ).map(([value, label]) => (
                        <label
                          key={value}
                          className="flex cursor-pointer items-center gap-2 text-xs"
                        >
                          <input
                            type="radio"
                            name={`pricing-${option.id}`}
                            disabled={readOnly}
                            checked={method === value}
                            onChange={() => setPricingMethod(index, value)}
                            className="h-4 w-4"
                          />
                          <span className="text-muted-foreground">{label}</span>
                        </label>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                      {method === 'fixed' && (
                        <div className="md:col-span-3 space-y-1">
                          <Label className="text-xs">Price ($)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            disabled={readOnly}
                            value={option.price ?? ''}
                            placeholder="0.00"
                            onChange={(e) => updateAt(index, { price: e.target.value })}
                          />
                        </div>
                      )}

                      {method === 'totalSqft' && (
                        <>
                          <div className="md:col-span-2 space-y-1">
                            <Label className="text-xs">Rate per sqft ($)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min={0}
                              disabled={readOnly}
                              value={option.rate ?? ''}
                              placeholder="0.00"
                              onChange={(e) => updateAt(index, { rate: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Total sqft</Label>
                            <Input type="number" disabled value={baseSqftDisplay} />
                          </div>
                        </>
                      )}

                      {method === 'specificSqft' && (
                        <>
                          <div className="space-y-1">
                            <Label className="text-xs">Square footage</Label>
                            <Input
                              type="number"
                              min={0}
                              disabled={readOnly}
                              value={option.sqft ?? ''}
                              placeholder="0"
                              onChange={(e) => updateAt(index, { sqft: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Rate per sqft ($)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min={0}
                              disabled={readOnly}
                              value={option.rate ?? ''}
                              placeholder="0.00"
                              onChange={(e) => updateAt(index, { rate: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Calculated</Label>
                            <Input
                              disabled
                              value={new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: 'USD',
                              }).format(calculatedPrice)}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-center gap-2">
                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        disabled={readOnly}
                        checked={Boolean(option.selected)}
                        onChange={(e) => updateAt(index, { selected: e.target.checked })}
                        className="h-4 w-4 rounded border-input"
                      />
                      <span className="text-muted-foreground">Include</span>
                    </label>
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => onChange(options.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {(method === 'totalSqft' || method === 'specificSqft') && (
                  <p className="border-t border-border/50 pt-2 text-xs text-muted-foreground">
                    {method === 'totalSqft' ? (
                      <>
                        Price: {baseSqftDisplay} sqft × ${optionRate.toFixed(2)}/sqft = $
                        {calculatedPrice.toFixed(2)}
                      </>
                    ) : (
                      <>
                        Price: {num(option.sqft).toLocaleString()} sqft × $
                        {optionRate.toFixed(2)}/sqft = ${calculatedPrice.toFixed(2)}
                      </>
                    )}
                  </p>
                )}
              </div>
            )
          })
        )}

        {options.some((o) => o.selected) && selectedOptionsTotal > 0 && (
          <p className="text-xs text-muted-foreground">
            Selected options total:{' '}
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
              selectedOptionsTotal,
            )}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
