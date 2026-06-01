import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { generateQuoteId } from '@/lib/drywall/drywallQuoteHelpers'
import { RC_CHANNEL_PIECE_LENGTH_FT } from '@/lib/drywall/calculations/quantityUtils'
import type { DrywallQuote, RcChannelWallEntry } from '@/types/drywall'
import { NumField, SectionDivider, SpacingSelect } from './quoteFormPrimitives'
import { RC_CHANNEL_SPACING_OPTIONS } from './quoteUiConstants'

interface Props {
  quote: DrywallQuote
  readOnly: boolean
  onChange: (patch: Partial<DrywallQuote>) => void
}

export function QuoteRcChannelPanel({ quote, readOnly, onChange }: Props) {
  const entries: RcChannelWallEntry[] = Array.isArray(quote.rcChannelWallEntries)
    ? quote.rcChannelWallEntries
    : []

  const updateEntry = (id: string, field: keyof RcChannelWallEntry, value: string) => {
    onChange({
      rcChannelWallEntries: entries.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    })
  }

  const addEntry = () => {
    onChange({
      rcChannelWallEntries: [...entries, { id: generateQuoteId(), linearFt: '', height: '' }],
    })
  }

  const removeEntry = (id: string) => {
    onChange({ rcChannelWallEntries: entries.filter((e) => e.id !== id) })
  }

  const ceilingSqft = parseFloat(String(quote.rcChannelCeilingSqft)) || 0
  const ceilingSpacing = parseFloat(String(quote.rcChannelCeilingSpacing)) || 24
  const ceilingLf =
    ceilingSqft > 0 && ceilingSpacing > 0
      ? ceilingSqft / (ceilingSpacing / 12)
      : 0

  return (
    <div className="space-y-4">
      <SectionDivider title="RC Channel — Ceiling (project default)" />
      <div className="grid gap-3 sm:grid-cols-2">
        <NumField
          label="Ceiling sqft"
          value={quote.rcChannelCeilingSqft}
          readOnly={readOnly}
          step="0.1"
          onChange={(v) => onChange({ rcChannelCeilingSqft: v })}
        />
        <SpacingSelect
          label="Ceiling spacing (OC)"
          value={String(quote.rcChannelCeilingSpacing || '24')}
          readOnly={readOnly}
          options={RC_CHANNEL_SPACING_OPTIONS}
          onChange={(v) => onChange({ rcChannelCeilingSpacing: v })}
        />
      </div>
      {ceilingSqft > 0 && (
        <p className="text-xs text-muted-foreground rounded-md bg-muted/50 px-2 py-1.5">
          Calculated linear feet: <strong>{ceilingLf.toFixed(2)} LF</strong> (
          {Math.ceil(ceilingLf / RC_CHANNEL_PIECE_LENGTH_FT)} pcs @ 12 ft)
        </p>
      )}

      <SectionDivider title="RC Channel — Wall (project default)" />
      <SpacingSelect
        label="Wall spacing (OC)"
        value={String(quote.rcChannelWallSpacing || '24')}
        readOnly={readOnly}
        options={RC_CHANNEL_SPACING_OPTIONS}
        onChange={(v) => onChange({ rcChannelWallSpacing: v })}
      />
      <div className="rounded-md border overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 bg-muted px-2 py-1.5 text-xs font-medium">
          <span>Linear ft</span>
          <span>Height (ft)</span>
          <span className="w-8" />
        </div>
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center border-t px-2 py-1.5"
          >
            <Input
              type="number"
              step="0.1"
              disabled={readOnly}
              placeholder="e.g. 571.73"
              value={entry.linearFt ?? ''}
              onChange={(e) => updateEntry(entry.id, 'linearFt', e.target.value)}
              className="h-8"
            />
            <Input
              type="number"
              step="0.1"
              disabled={readOnly}
              placeholder="e.g. 10"
              value={entry.height ?? ''}
              onChange={(e) => updateEntry(entry.id, 'height', e.target.value)}
              className="h-8"
            />
            {!readOnly && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => removeEntry(entry.id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        ))}
        {!readOnly && (
          <div className="border-t p-2">
            <Button type="button" variant="outline" size="sm" onClick={addEntry}>
              <Plus className="mr-1 h-4 w-4" />
              Add wall type
            </Button>
          </div>
        )}
      </div>
      {entries.some((e) => (parseFloat(String(e.linearFt)) || 0) > 0) && (
        <div className="text-xs text-muted-foreground space-y-1">
          {entries
            .filter((e) => (parseFloat(String(e.linearFt)) || 0) > 0)
            .map((e) => {
              const wallLength = parseFloat(String(e.linearFt)) || 0
              const wallHeight = parseFloat(String(e.height)) || 0
              const spacing = parseFloat(String(quote.rcChannelWallSpacing)) || 24
              if (wallHeight > 0 && spacing > 0) {
                const rows = Math.ceil(wallHeight / (spacing / 12))
                const totalLf = rows * wallLength
                return (
                  <p key={e.id}>
                    {wallHeight} ft ht: {rows} rows × {wallLength.toFixed(2)} LF ={' '}
                    <strong>{totalLf.toFixed(2)} LF</strong> ({spacing}&quot; OC)
                  </p>
                )
              }
              return (
                <p key={e.id}>
                  {wallLength.toFixed(2)} LF wall
                </p>
              )
            })}
        </div>
      )}

      <SectionDivider title="RC Channel — Rates" />
      <div className="grid gap-3 sm:grid-cols-3">
        <NumField
          label="Material ($/piece)"
          value={quote.rcChannelRate}
          readOnly={readOnly}
          onChange={(v) => onChange({ rcChannelRate: v })}
        />
        <NumField
          label="Labor ($/piece)"
          value={quote.rcChannelLaborRate}
          readOnly={readOnly}
          onChange={(v) => onChange({ rcChannelLaborRate: v })}
        />
        <NumField
          label="Waste %"
          value={quote.rcChannelWastePercentage}
          readOnly={readOnly}
          step="0.1"
          onChange={(v) => onChange({ rcChannelWastePercentage: v })}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Per-floor RC quantities are edited inside each breakdown card when breakdowns exist.
      </p>
    </div>
  )
}
