// Ceiling heights on a quote (Mark, 2026-10-15): a job default plus the tall spaces, kept apart
// from the line items, which are written by board type rather than by floor. Recording only for
// now — the tall-wall factors and labor line that read these come next (CEILING_HEIGHTS.md).

import { Plus, Ruler, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  HEIGHT_BAND_LABEL,
  heightBand,
  newTallAreaId,
  parseHeightFt,
  quoteTallSqftByBand,
  tallAreasFromField,
} from '@/lib/drywall/ceilingHeights'
import type { DrywallQuoteV3, FieldMeasurementArea, QuoteTallArea } from '@/types/drywall'

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 })

export function QuoteHeightsSection({
  quote,
  readOnly,
  fieldAreas,
  onChange,
}: {
  quote: DrywallQuoteV3
  readOnly: boolean
  /** The job's measured areas — their heights can fill the tall rows. */
  fieldAreas: FieldMeasurementArea[]
  onChange: (patch: Partial<DrywallQuoteV3>) => void
}) {
  const rows = quote.tall_areas ?? []
  const fromField = tallAreasFromField(fieldAreas)
  const byBand = quoteTallSqftByBand(quote)
  const tallSqft = Object.values(byBand).reduce((s, n) => s + (n ?? 0), 0)

  const setRows = (next: QuoteTallArea[]) => onChange({ tall_areas: next })
  const patchRow = (id: string, patch: Partial<QuoteTallArea>) =>
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const useField = () => {
    if (rows.length > 0 && !window.confirm('Replace the tall areas with the ones measured in the field?')) return
    setRows(fromField)
  }

  return (
    <div className="rounded-lg border border-l-4 border-l-sky-500 bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Ruler className="h-4 w-4 text-sky-600" />
          Ceiling heights
        </span>
        <span className="text-xs text-muted-foreground">
          {quote.default_height_ft ? `Default ${quote.default_height_ft}'` : 'No default set'}
          {rows.length > 0 ? ` · ${rows.length} tall area${rows.length === 1 ? '' : 's'} · ${fmt(tallSqft)} sqft 10' and up` : ''}
        </span>
      </div>

      <div className="space-y-4 border-t px-4 py-3">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label htmlFor="quote-default-height" className="text-xs text-muted-foreground">
              Most of the job
            </Label>
            <div className="relative w-28">
              <Input
                id="quote-default-height"
                type="number"
                inputMode="decimal"
                min={0}
                step={0.5}
                className="h-8 pr-8"
                placeholder="9"
                disabled={readOnly}
                value={quote.default_height_ft ?? ''}
                onChange={(e) => onChange({ default_height_ft: parseHeightFt(e.target.value) })}
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                ft
              </span>
            </div>
          </div>
          <p className="max-w-xl pb-1 text-xs text-muted-foreground">
            List the spaces 10&apos; and up — the great room, a tall garage — with roughly how much board
            is in each. They do not change the price yet; the tall-wall pricing that reads them comes next.
          </p>
        </div>

        {rows.length > 0 ? (
          <div className="space-y-2">
            <div className="hidden grid-cols-[1fr_6rem_7rem_6rem_2rem] gap-2 px-1 text-xs text-muted-foreground sm:grid">
              <span>Space</span>
              <span>Height</span>
              <span>Sqft</span>
              <span />
              <span />
            </div>
            {rows.map((r) => {
              const band = heightBand(r.height_ft)
              return (
                <div key={r.id} className="grid grid-cols-[1fr_6rem_7rem] items-center gap-2 sm:grid-cols-[1fr_6rem_7rem_6rem_2rem]">
                  <Input
                    aria-label="Space"
                    className="h-8"
                    placeholder="Great room"
                    disabled={readOnly}
                    value={r.name}
                    onChange={(e) => patchRow(r.id, { name: e.target.value })}
                  />
                  <div className="relative">
                    <Input
                      aria-label="Height in feet"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.5}
                      className="h-8 pr-7"
                      disabled={readOnly}
                      value={r.height_ft || ''}
                      onChange={(e) => patchRow(r.id, { height_ft: parseHeightFt(e.target.value) ?? 0 })}
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      ft
                    </span>
                  </div>
                  <Input
                    aria-label="Square feet"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className="h-8 tabular-nums"
                    placeholder="sqft"
                    disabled={readOnly}
                    value={r.sqft || ''}
                    onChange={(e) => patchRow(r.id, { sqft: Math.max(0, parseFloat(e.target.value) || 0) })}
                  />
                  <span className={band ? 'text-xs font-medium text-amber-700 dark:text-amber-300' : 'text-xs text-muted-foreground'}>
                    {band ? HEIGHT_BAND_LABEL[band] : r.height_ft ? 'Under 10′' : ''}
                  </span>
                  {!readOnly ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Remove ${r.name || 'tall area'}`}
                      onClick={() => setRows(rows.filter((x) => x.id !== r.id))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : (
                    <span />
                  )}
                </div>
              )
            })}
          </div>
        ) : null}

        {!readOnly ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRows([...rows, { id: newTallAreaId(), name: '', height_ft: 0, sqft: 0 }])}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add tall area
            </Button>
            {fromField.length > 0 ? (
              <Button type="button" variant="outline" size="sm" onClick={useField}>
                Use the field measurement ({fromField.length} tall area{fromField.length === 1 ? '' : 's'})
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
