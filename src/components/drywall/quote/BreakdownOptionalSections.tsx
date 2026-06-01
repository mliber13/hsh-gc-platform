import { Plus, Trash2 } from 'lucide-react'
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
import { generateQuoteId } from '@/lib/drywall/drywallQuoteHelpers'
import type { DrywallQuote, MetalStudEntry, QuoteBreakdown } from '@/types/drywall'
import { DetailsSubsection, NumField } from './quoteFormPrimitives'
import {
  METAL_STUD_GAUGES,
  METAL_STUD_SIZES,
  METAL_STUD_SPACING_OPTIONS,
  METAL_STUD_TRACKS_OPTIONS,
} from './quoteUiConstants'

function hasNum(v: unknown): boolean {
  return (parseFloat(String(v)) || 0) > 0
}

interface Props {
  quote: DrywallQuote
  breakdown: QuoteBreakdown
  readOnly: boolean
  onUpdate: (patch: Partial<QuoteBreakdown>) => void
}

export function BreakdownOptionalSections({ quote, breakdown, readOnly, onUpdate }: Props) {
  const b = breakdown

  const studEntries: MetalStudEntry[] = Array.isArray(b.metalStudEntries) ? b.metalStudEntries : []

  const updateStudEntry = (id: string, patch: Partial<MetalStudEntry>) => {
    onUpdate({
      metalStudEntries: studEntries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    })
  }

  const addStudEntry = () => {
    onUpdate({
      metalStudEntries: [
        ...studEntries,
        {
          id: generateQuoteId(),
          wallLf: '',
          wallHeight: b.metalStudWallHeight ?? '',
          spacing: b.metalStudSpacing ?? '16',
          tracksPerRun: b.metalStudTracksPerRun ?? '2',
          size: b.metalStudSize ?? '3.625',
          gauge: b.metalStudGauge ?? '20',
        },
      ],
    })
  }

  const removeStudEntry = (id: string) => {
    onUpdate({ metalStudEntries: studEntries.filter((e) => e.id !== id) })
  }

  const rcOpen =
    hasNum(b.rcChannelCeilingSqft) ||
    hasNum(b.rcChannelWallLinearFt) ||
    hasNum(b.rcChannelWallHeight)

  const gridOpen = hasNum(b.suspendedGridSqft) || hasNum(b.suspendedGridPerimeter)

  const studOpen =
    hasNum(b.metalStudWallLf) ||
    hasNum(b.metalStudWallHeight) ||
    studEntries.length > 0

  const advOpen =
    b.hangLayers != null ||
    b.finishLayers != null ||
    b.boardOnlyMaterialRate != null ||
    (b.hangSqftOverride != null && b.hangSqftOverride !== '') ||
    (b.finishSqftOverride != null && b.finishSqftOverride !== '')

  return (
    <div className="space-y-2 border-t pt-3 mt-2">
      <DetailsSubsection title="Advanced: hang / finish overrides" defaultOpen={advOpen}>
        <div className="grid gap-2 sm:grid-cols-3">
          <NumField
            label="Hang layers"
            value={b.hangLayers ?? ''}
            readOnly={readOnly}
            step="0.1"
            placeholder={String(quote.hangLayers ?? '1')}
            onChange={(v) => onUpdate({ hangLayers: v })}
          />
          <NumField
            label="Finish layers"
            value={b.finishLayers ?? ''}
            readOnly={readOnly}
            step="0.1"
            placeholder={String(quote.finishLayers ?? '1')}
            onChange={(v) => onUpdate({ finishLayers: v })}
          />
          <NumField
            label="Board-only material ($/sqft)"
            value={b.boardOnlyMaterialRate ?? ''}
            readOnly={readOnly}
            onChange={(v) => onUpdate({ boardOnlyMaterialRate: v })}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <NumField
            label="Hang sqft override (w/ waste)"
            value={b.hangSqftOverride ?? ''}
            readOnly={readOnly}
            step="1"
            onChange={(v) => onUpdate({ hangSqftOverride: v })}
          />
          <NumField
            label="Finish sqft override (w/ waste)"
            value={b.finishSqftOverride ?? ''}
            readOnly={readOnly}
            step="1"
            onChange={(v) => onUpdate({ finishSqftOverride: v })}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">Blank inherits project defaults.</p>
      </DetailsSubsection>

      {quote.includeRcChannel ? (
        <DetailsSubsection title="RC Channel (this floor)" defaultOpen={rcOpen}>
          <div className="grid gap-2 sm:grid-cols-3">
            <NumField
              label="Ceiling sqft"
              value={b.rcChannelCeilingSqft ?? ''}
              readOnly={readOnly}
              step="0.1"
              hint={`Uses project ceiling spacing: ${quote.rcChannelCeilingSpacing || '24'}" OC`}
              onChange={(v) => onUpdate({ rcChannelCeilingSqft: v })}
            />
            <NumField
              label="Wall length (LF)"
              value={b.rcChannelWallLinearFt ?? ''}
              readOnly={readOnly}
              step="0.1"
              onChange={(v) => onUpdate({ rcChannelWallLinearFt: v })}
            />
            <NumField
              label="Wall height (ft)"
              value={b.rcChannelWallHeight ?? ''}
              readOnly={readOnly}
              step="0.1"
              hint={`Uses project wall spacing: ${quote.rcChannelWallSpacing || '24'}" OC`}
              onChange={(v) => onUpdate({ rcChannelWallHeight: v })}
            />
          </div>
          {(hasNum(b.rcChannelCeilingSqft) || (hasNum(b.rcChannelWallLinearFt) && hasNum(b.rcChannelWallHeight))) && (
            <p className="text-[11px] text-muted-foreground">
              {hasNum(b.rcChannelCeilingSqft) && (
                <span>
                  Ceiling: {parseFloat(String(b.rcChannelCeilingSqft)).toLocaleString()} sqft @{' '}
                  {quote.rcChannelCeilingSpacing || '24'}&quot; OC.{' '}
                </span>
              )}
              {hasNum(b.rcChannelWallLinearFt) && hasNum(b.rcChannelWallHeight) && (
                <span>
                  Wall: {b.rcChannelWallLinearFt} LF × {b.rcChannelWallHeight} ft @{' '}
                  {quote.rcChannelWallSpacing || '24'}&quot; OC.
                </span>
              )}
            </p>
          )}
        </DetailsSubsection>
      ) : null}

      {quote.includeSuspendedGrid ? (
        <DetailsSubsection title="Suspended grid (this floor)" defaultOpen={gridOpen}>
          <div className="grid gap-2 sm:grid-cols-2">
            <NumField
              label="Grid sqft"
              value={b.suspendedGridSqft ?? ''}
              readOnly={readOnly}
              step="0.1"
              onChange={(v) => onUpdate({ suspendedGridSqft: v })}
            />
            <NumField
              label="Perimeter (LF)"
              value={b.suspendedGridPerimeter ?? ''}
              readOnly={readOnly}
              step="0.1"
              hint="Auto from sqft if blank"
              onChange={(v) => onUpdate({ suspendedGridPerimeter: v })}
            />
          </div>
        </DetailsSubsection>
      ) : null}

      {quote.includeMetalStudFraming ? (
        <DetailsSubsection title="Metal stud framing (this floor)" defaultOpen={studOpen}>
          <div className="grid gap-2 sm:grid-cols-3">
            <NumField
              label="Wall LF (total)"
              value={b.metalStudWallLf ?? ''}
              readOnly={readOnly}
              step="0.1"
              onChange={(v) => onUpdate({ metalStudWallLf: v })}
            />
            <NumField
              label="Wall height (ft)"
              value={b.metalStudWallHeight ?? ''}
              readOnly={readOnly}
              onChange={(v) => onUpdate({ metalStudWallHeight: v })}
            />
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Spacing</Label>
              <Select
                disabled={readOnly}
                value={String(b.metalStudSpacing ?? '16')}
                onValueChange={(v) => onUpdate({ metalStudSpacing: v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METAL_STUD_SPACING_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tracks / run</Label>
              <Select
                disabled={readOnly}
                value={String(b.metalStudTracksPerRun ?? '2')}
                onValueChange={(v) => onUpdate({ metalStudTracksPerRun: v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METAL_STUD_TRACKS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Stud size</Label>
              <Select
                disabled={readOnly}
                value={String(b.metalStudSize ?? '3.625')}
                onValueChange={(v) => onUpdate({ metalStudSize: v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METAL_STUD_SIZES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Gauge</Label>
              <Select
                disabled={readOnly}
                value={String(b.metalStudGauge ?? '20')}
                onValueChange={(v) => onUpdate({ metalStudGauge: v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METAL_STUD_GAUGES.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {studEntries.length > 0 || !readOnly ? (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Wall runs (import / multi-height)</span>
                {!readOnly && (
                  <Button type="button" variant="outline" size="sm" onClick={addStudEntry}>
                    <Plus className="mr-1 h-3 w-3" />
                    Add run
                  </Button>
                )}
              </div>
              {studEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end sm:grid-cols-[1fr_1fr_5rem_5rem_auto]"
                >
                  <NumField
                    label="LF"
                    value={entry.wallLf}
                    readOnly={readOnly}
                    onChange={(v) => updateStudEntry(entry.id, { wallLf: v })}
                  />
                  <NumField
                    label="Height"
                    value={entry.wallHeight}
                    readOnly={readOnly}
                    onChange={(v) => updateStudEntry(entry.id, { wallHeight: v })}
                  />
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 mb-0"
                      onClick={() => removeStudEntry(entry.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </DetailsSubsection>
      ) : null}
    </div>
  )
}
