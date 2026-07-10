import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { createQuoteAlternate } from '@/lib/drywall/createEmptyDrywallQuoteV3'
import {
  alternatePricingMode,
  computeQuoteV3Totals,
  formatAlternateDeltaLabel,
} from '@/lib/drywall/quoteV3Math'
import { cn } from '@/lib/utils'
import type { DrywallQuoteV3, QuoteAlternate } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'
import { LineItemsTable } from './LineItemsTable'

type Props = {
  quote: DrywallQuoteV3
  catalogs: OrgDrywallCatalogs
  readOnly: boolean
  onChange: (alternates: QuoteAlternate[]) => void
}

export function AlternatesSection({ quote, catalogs, readOnly, onChange }: Props) {
  const totals = computeQuoteV3Totals(quote, catalogs)

  const addAlternate = () => {
    const n = quote.alternates.length + 1
    onChange([...quote.alternates, createQuoteAlternate(`Alternate ${n}`)])
  }

  const patchAlternate = (id: string, patch: Partial<QuoteAlternate>) => {
    onChange(quote.alternates.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  const deleteAlternate = (id: string) => {
    if (!window.confirm('Delete this alternate and all its lines?')) return
    onChange(quote.alternates.filter((a) => a.id !== id))
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Customer alternates</CardTitle>
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={addAlternate}>
            <Plus className="mr-2 h-4 w-4" />
            Add alternate
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {quote.alternates.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Optional scopes priced separately — each alternate can add to or deduct from the base
            bid.
          </p>
        )}
        {quote.alternates.map((alt) => {
          const summary = totals.alternates.find((a) => a.id === alt.id)
          const totalAdd = summary?.totalAdd ?? 0
          const pricingMode = summary?.pricingMode ?? alternatePricingMode(alt)
          return (
            <AlternateCard
              key={alt.id}
              alternate={alt}
              totalAdd={totalAdd}
              pricingMode={pricingMode}
              catalogs={catalogs}
              readOnly={readOnly}
              projectHangerRate={quote.project_hanger_rate}
              projectFinisherRate={quote.project_finisher_rate}
              onPatch={(patch) => patchAlternate(alt.id, patch)}
              onLinesChange={(lineItems) => patchAlternate(alt.id, { lineItems })}
              onDelete={() => deleteAlternate(alt.id)}
            />
          )
        })}
      </CardContent>
    </Card>
  )
}

function AlternateCard({
  alternate,
  totalAdd,
  pricingMode,
  catalogs,
  readOnly,
  projectHangerRate,
  projectFinisherRate,
  onPatch,
  onLinesChange,
  onDelete,
}: {
  alternate: QuoteAlternate
  totalAdd: number
  pricingMode: 'add' | 'deduct'
  catalogs: OrgDrywallCatalogs
  readOnly: boolean
  projectHangerRate?: number
  projectFinisherRate?: number
  onPatch: (patch: Partial<QuoteAlternate>) => void
  onLinesChange: (lines: QuoteAlternate['lineItems']) => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="rounded-lg border">
      <div className="space-y-2 border-b bg-muted/30 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-1 text-sm font-medium"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Alternate
          </button>
          <Input
            className="h-8 min-w-[12rem] max-w-[280px] flex-1"
            disabled={readOnly}
            value={alternate.name}
            onChange={(e) => onPatch({ name: e.target.value })}
            placeholder="Alternate name"
          />
          <span
            className={cn(
              'ml-auto text-sm font-medium tabular-nums',
              pricingMode === 'deduct' && 'text-rose-700 dark:text-rose-300',
            )}
          >
            {formatAlternateDeltaLabel(totalAdd, pricingMode)}
          </span>
          {!readOnly && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 pl-6">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Pricing
          </span>
          <div
            className="inline-flex rounded-md border bg-background p-0.5 shadow-sm"
            role="group"
            aria-label="Alternate pricing mode"
          >
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={readOnly}
              className={cn(
                'h-8 min-w-[4.5rem] px-3 text-xs font-semibold',
                pricingMode === 'add' &&
                  'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground',
              )}
              onClick={() => onPatch({ pricingMode: 'add' })}
            >
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={readOnly}
              className={cn(
                'h-8 min-w-[4.5rem] px-3 text-xs font-semibold',
                pricingMode === 'deduct' &&
                  'bg-rose-600 text-white hover:bg-rose-600/90 hover:text-white',
              )}
              onClick={() => onPatch({ pricingMode: 'deduct' })}
            >
              Deduct
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">
            {pricingMode === 'deduct'
              ? 'Subtracts from the base bid if accepted'
              : 'Adds to the base bid if accepted'}
          </span>
        </div>
      </div>
      {open && (
        <div className="space-y-3 p-3">
          <Input
            className="h-8"
            disabled={readOnly}
            value={alternate.description}
            onChange={(e) => onPatch({ description: e.target.value })}
            placeholder="Description for customer"
          />
          <LineItemsTable
            lines={alternate.lineItems}
            catalogs={catalogs}
            readOnly={readOnly}
            compact
            projectHangerRate={projectHangerRate}
            projectFinisherRate={projectFinisherRate}
            onChange={onLinesChange}
          />
        </div>
      )}
    </div>
  )
}
