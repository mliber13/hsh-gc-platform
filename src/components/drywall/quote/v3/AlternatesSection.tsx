import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { createQuoteAlternate } from '@/lib/drywall/createEmptyDrywallQuoteV3'
import { formatQuoteMoney } from '@/lib/drywall/quoteV3Math'
import { computeQuoteV3Totals } from '@/lib/drywall/quoteV3Math'
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
            Optional add-on scopes priced separately — each alternate gets its own line items.
          </p>
        )}
        {quote.alternates.map((alt) => {
          const totalAdd =
            totals.alternates.find((a) => a.id === alt.id)?.totalAdd ?? 0
          return (
            <AlternateCard
              key={alt.id}
              alternate={alt}
              totalAdd={totalAdd}
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
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <button
          type="button"
          className="flex items-center gap-1 text-sm font-medium"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Alternate
        </button>
        <Input
          className="h-8 max-w-[280px] flex-1"
          disabled={readOnly}
          value={alternate.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          placeholder="Alternate name"
        />
        <span className="text-sm tabular-nums font-medium ml-auto">
          Add {formatQuoteMoney(totalAdd)}
        </span>
        {!readOnly && (
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
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
